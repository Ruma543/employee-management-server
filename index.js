const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require('stripe').Stripe(process.env.PAYMENT_SECRET_KEY);
const port = process.env.port || 5000;

app.use(cors());

app.use(express.json());

// middleware
const verifyToken = (req, res, next) => {
  console.log('verify token', req.headers.authorization);
  if (!req.headers.authorization) {
    return res.status(401).send({ message: 'unauthorized access' });
  }

  const token = req.headers.authorization.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'unauthorized access' });
    }
    req.decoded = decoded;
    console.log('checked', req.decoded);
    next();
  });
};

const verifyAdmin = async (req, res, next) => {
  const user = req.user;
  const query = { email: user?.email };
  const result = await userCollection.findOne(query);
  if (!result || result?.role !== 'admin') {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  next();
};
const verifyHR = async (req, res, next) => {
  const user = req.user;
  const query = { email: user?.email };
  const result = await userCollection.findOne(query);
  if (!result || result?.role !== 'hr') {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  next();
};

const uri = `mongodb+srv://${process.env.EMPLOYEE_DB}:${process.env.EMPLOYEE_PASS}@cluster0.hybcmzi.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const employeeCollection = client.db('employeeDB').collection('employees');
    const paymentCollection = client.db('employeeDB').collection('payment');

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
    // app.get('/employees', async (req, res) => {
    //   const result
    // })
    // get all employee for Admin
    app.get('/employees/admin', async (req, res) => {
      const verified = req.body;
      const query = { verified: true };
      const result = await employeeCollection.find(query).toArray();
      res.send(result);
    });
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
    // payment get by email
    app.get('/payment/:email', async (req, res) => {
      const email = req.params.email;
      // if (email !== req.decoded.email) {
      //   return res.status(403).send({ message: 'forbidden access' });
      // }
      const result = await paymentCollection.find({ email }).toArray();
      res.send(result);
    });
    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );
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
