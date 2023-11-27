const express = require('express');
const app = express();
require('dotenv').config();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const stripe = require('stripe').Stripe(process.env.PAYMENT_SECRET_KEY);
const port = process.env.port || 5000;

app.use(cors());

app.use(express.json());

const uri = `mongodb+srv://${process.env.EMPLOYEE_DB}:${process.env.EMPLOYEE_PASS}@cluster0.hybcmzi.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const employeeCollection = client.db('employeeDB').collection('employees');
const paymentCollection = client.db('employeeDB').collection('payment');
const workCollection = client.db('employeeDB').collection('worksheet');
const serviceCollection = client.db('employeeDB').collection('service');
const reviewCollection = client.db('employeeDB').collection('userReviews');

// middleware
const verifyToken = (req, res, next) => {
  console.log('verify token', req.headers.authorization);
  if (!req.headers.authorization) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  // console.log('ghhghghghghg', req.headers.authorization);
  const token = req.headers.authorization.split(' ')[1];
  // console.log('tttttttt', token);
  jwt.verify(token, process.env.SECRET_ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'unauthorized access' });
    }
    req.decoded = decoded;
    console.log('checked', req.decoded);
    next();
  });
};

const verifyAdmin = async (req, res, next) => {
  const email = req?.decoded?.email;
  console.log('email', email);
  const query = { email: email };
  const user = await employeeCollection.findOne(query);
  const isAdmin = user?.role === 'admin';
  if (!isAdmin) {
    return res.status(403).send({ message: 'forbidden access' });
  }
  next();
};
const verifyHR = async (req, res, next) => {
  const email = req?.decoded?.email;
  console.log('email', email);
  const query = { email: email };
  const result = await employeeCollection.findOne(query);
  const isHr = user?.role === 'hr';
  if (!isHr) {
    return res.status(403).send({ message: 'forbidden access' });
  }
  next();
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    // get service related api
    app.get('/service', async (req, res) => {
      const result = await serviceCollection.find().toArray();
      res.send(result);
    });
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.SECRET_ACCESS_TOKEN, {
        expiresIn: '1hr',
      });
      res.send({ token });
    });
    // user related api
    app.post('/employees', async (req, res) => {
      const employeeInfo = req.body;
      const query = { email: employeeInfo.email };
      const existingEmployee = await employeeCollection.findOne(query);
      if (existingEmployee) {
        return res.send({
          message: 'employee is already exist',
          insertedId: null,
        });
      }
      const result = await employeeCollection.insertOne(employeeInfo);
      res.send(result);
    });

    // get all employee

    // get all employee for Admin

    app.get('/employee/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      console.log('email', email);

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }

      const query = { email: email };
      const user = await employeeCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    });
    app.get('/employee/hr/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      console.log('email', email);

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }

      const query = { email: email };
      const user = await employeeCollection.findOne(query);
      let hr = false;
      if (user) {
        hr = user?.role === 'hr';
      }
      res.send({ hr });
    });

    app.get(
      '/employees/employeeFind/:email',
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        if (email !== req.decoded.email) {
          return res.status(403).send({ message: 'forbidden access' });
        }
        const verified = req.body;
        console.log(verified);
        const query = { verified: true };
        const result = await employeeCollection.find(query).toArray();
        res.send(result);
      }
    );
    // get employee for hr
    app.get('/employees/hr', async (req, res) => {
      // const email = req.params.email;
      // console.log('email', email);

      // if (email !== req.decoded.email) {
      //   return res.status(403).send({ message: 'forbidden access' });
      // }
      const role = req.body;
      const query = { role: 'employee' };
      const result = await employeeCollection.find(query).toArray();
      res.send(result);
    });
    // make employee verified
    app.patch('/employees/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          verified: true,
        },
      };
      const result = await employeeCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    // single employee get
    app.get('/employees/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await employeeCollection.findOne(query);
      res.send(result);
    });
    // make hr related api
    app.patch('/employees/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          role: 'hr',
        },
      };
      const result = await employeeCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    // fired related api
    app.patch('/employees/fired/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          status: 'fired',
        },
      };
      const result = await employeeCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // payment related api
    // payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const { salary } = req.body;
      const amount = parseInt(salary * 100);
      if (!salary || amount < 1) return;
      const { client_secret } = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card'],
      });
      res.send({ clientSecret: client_secret });
    });
    // post payment in the database
    app.post('/payment', async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);
      // for delete the payment completed menu
      console.log('payment info', payment);
      res.send(paymentResult);
    });
    // all payment data get
    app.get('/payment', async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result);
    });
    // payment get by email   1st ta eita
    app.get('/payment/:email', async (req, res) => {
      const email = req.params.email;
      //
      // const query = req.query;
      // const page = query.page;
      // const pageNumber = parseInt(page);
      // const perPage = 5;
      // const skip = pageNumber * perPage;
      // const payment = paymentCollection
      //   .find({ email })
      //   .skip(skip)
      //   .limit(perPage);
      // const result = await payment.toArray();
      // const paymentCount = await paymentCollection.countDocuments();
      // res.send({ result, paymentCount });
      // const page = parseInt(req.query.page);
      // const limit = parseInt(req.query.limit);
      // const skip = (page - 1) * limit;

      // const cursor = paymentCollection.find().skip(skip).limit(limit);

      // if (email !== req.decoded.email) {
      //   return res.status(403).send({ message: 'forbidden access' });
      // }
      //
      const result = await paymentCollection.find({ email }).toArray();
      res.send(result);
    });

    // worksheet post by employee
    app.post('/worksheet', async (req, res) => {
      const work = req.body;
      const result = await workCollection.insertOne(work);
      res.send(result);
    });

    app.get('/worksheet', async (req, res) => {
      // const email = req.params.email;
      const result = await workCollection.find().toArray();
      res.send(result);
    });
    app.get('/worksheet/:email', async (req, res) => {
      const email = req.params.email;
      const result = await workCollection.find({ email }).toArray();
      res.send(result);
    });
    // get user reviews
    app.get('/userReviews', async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });
    // Send a ping to confirm a successful connection
    // await client.db('admin').command({ ping: 1 });
    // console.log(
    //   'Pinged your deployment. You successfully connected to MongoDB!'
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('employee server is running now');
});

app.listen(port, () => {
  console.log(`employee server is running port ${port}`);
});
