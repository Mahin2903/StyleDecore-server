const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const cors = require("cors");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRETKEY);
const admin = require("firebase-admin");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString("utf8");
const serviceAccount = JSON.parse(decoded);

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.dppmf5f.mongodb.net/?appName=Cluster0`;

app.use(cors());
app.use(express.json());

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const idToken = authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : authHeader;
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.decoded_email = decoded.email;
  } catch (err) {
    console.error("Token verification failed:", err.message);
    return res.status(401).send({ message: "Unauthorized Access" });
  }
  next();
};

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const generateTrackingId = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "SD-";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// ✅ FIX 1: Cache DB connection for serverless
let dbReady = false;
let serviceCollections,
  UsersCollections,
  BookedPackageCollections,
  paymentCollection,
  decoratorPaymentCollection;

async function connectDB() {
  if (!dbReady) {
    await client.connect();
    const DB = client.db("decorServiceDB");
    serviceCollections = DB.collection("services");
    UsersCollections = DB.collection("user");
    BookedPackageCollections = DB.collection("bookedpackages");
    paymentCollection = DB.collection("payments");
    decoratorPaymentCollection = DB.collection("decorPayments");
    dbReady = true;
    console.log("MongoDB connected.");
  }
}

// ✅ FIX 2: Ensure DB is ready before every request
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("DB connection error:", err);
    res.status(500).send({ error: "Database connection failed" });
  }
});

// ==========================================
// ROOT
// ==========================================
app.get("/", (req, res) => {
  res.send("Style Decor Server is running smoothly");
});

// ==========================================
// SERVICES ROUTES
// ==========================================
app.post("/services", async (req, res) => {
  const result = await serviceCollections.insertOne(req.body);
  res.send(result);
});

app.patch("/services/:id", async (req, res) => {
  const result = await serviceCollections.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: req.body }
  );
  res.send(result);
});

app.delete("/services/:id", async (req, res) => {
  const result = await serviceCollections.deleteOne({
    _id: new ObjectId(req.params.id),
  });
  res.send(result);
});

// ⚠️ Must stay above /services/:id
app.get("/services/category-summary", verifyToken, async (req, res) => {
  const result = await serviceCollections
    .aggregate([
      { $group: { _id: "$category", totalServices: { $sum: 1 } } },
      { $project: { _id: 0, category: "$_id", totalServices: 1 } },
    ])
    .toArray();
  res.send(result);
});

app.get("/services", async (req, res) => {
  const { email } = req.query;
  const query = email ? { createdByEmail: email } : {};
  const result = await serviceCollections.find(query).toArray();
  res.send(result);
});

app.get("/services/:id", verifyToken, async (req, res) => {
  try {
    const result = await serviceCollections.findOne({
      _id: new ObjectId(req.params.id),
    });
    res.send(result);
  } catch {
    res.status(400).send({ error: "Invalid Service ID" });
  }
});

// ==========================================
// USER ROUTES
// ==========================================
app.post("/user", async (req, res) => {
  const userDetails = req.body;
  userDetails.role = "user";
  const result = await UsersCollections.insertOne(userDetails);
  res.send(result);
});

app.patch("/user/:id", async (req, res) => {
  const result = await UsersCollections.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: req.body }
  );
  res.send(result);
});

app.delete("/user/:id", async (req, res) => {
  const result = await UsersCollections.deleteOne({
    _id: new ObjectId(req.params.id),
  });
  res.send(result);
});

app.get("/user", verifyToken, async (req, res) => {
  const { email, status } = req.query;
  const query = {};
  if (email) query.userEmail = email;
  if (status) query.status = status;
  const result = await UsersCollections.find(query).toArray();
  res.send(result);
});

app.get("/user/:id", verifyToken, async (req, res) => {
  try {
    const result = await UsersCollections.findOne({
      _id: new ObjectId(req.params.id),
    });
    res.send(result);
  } catch {
    res.status(400).send({ error: "Invalid User ID" });
  }
});

// ==========================================
// BOOKED SERVICES ROUTES
// ==========================================
app.post("/bookedservice", async (req, res) => {
  const result = await BookedPackageCollections.insertOne(req.body);
  res.send(result);
});

app.get("/bookedservice", verifyToken, async (req, res) => {
  const { email } = req.query;
  const query = email ? { userEmail: email } : {};
  const result = await BookedPackageCollections.find(query).toArray();
  res.send(result);
});

app.get("/bookedservice/:id", verifyToken, async (req, res) => {
  try {
    const result = await BookedPackageCollections.findOne({
      _id: new ObjectId(req.params.id),
    });
    res.send(result);
  } catch {
    res.status(400).send({ error: "Invalid Booking ID" });
  }
});

app.delete("/bookedservice/:id", async (req, res) => {
  const result = await BookedPackageCollections.deleteOne({
    _id: new ObjectId(req.params.id),
  });
  res.send(result);
});

// ==========================================
// DECORATOR WORKFLOW ROUTES
// ==========================================
app.get("/decorators", verifyToken, async (req, res) => {
  const result = await UsersCollections.find({
    role: { $regex: /decorator/i },
    status: "approved",
  }).toArray();
  res.send(result);
});

app.patch("/bookedservice/assign/:id", async (req, res) => {
  const { decoratorEmail, decoratorName } = req.body;
  const result = await BookedPackageCollections.updateOne(
    { _id: new ObjectId(req.params.id) },
    {
      $set: {
        status: "assigned",
        decoratorEmail,
        decoratorName,
        assignedAt: new Date(),
      },
    }
  );
  res.send(result);
});

app.get("/decorator/assignments", verifyToken, async (req, res) => {
  const { email } = req.query;
  if (!email) return res.send([]);
  const result = await BookedPackageCollections.find({
    decoratorEmail: email,
  }).toArray();
  res.send(result);
});

app.get("/decorator/assignments/:id", verifyToken, async (req, res) => {
  const result = await BookedPackageCollections.findOne({
    _id: new ObjectId(req.params.id),
  });
  res.send(result);
});

app.patch("/decorator/assignments/:id", async (req, res) => {
  try {
    const { workStatus } = req.body;
    const result = await BookedPackageCollections.findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      {
        $set: {
          workStatus,
          lastUpdated: new Date(),
          ...(workStatus === "complete" && { completedAt: new Date() }),
        },
      },
      { returnDocument: "after" }
    );
    res.send(result);
  } catch {
    res.status(500).send({ error: "Failed to update" });
  }
});

// ==========================================
// PAYMENT ROUTES
// ==========================================
app.get("/payments", verifyToken, async (req, res) => {
  try {
    const { email } = req.query;
    const query = {};
    if (email) {
      if (email !== req.decoded_email) {
        return res.status(403).send({ message: "Forbidden" });
      }
      query.customer_email = email;
    }
    const result = await paymentCollection
      .find(query)
      .sort({ paidAt: -1 })
      .toArray();
    res.send(result);
  } catch {
    res.status(500).send({ error: "Failed to fetch payments" });
  }
});

app.post("/decoratorpayment", async (req, res) => {
  const result = await decoratorPaymentCollection.insertOne(req.body);
  res.send(result);
});

app.get("/decoratorpayment", verifyToken, async (req, res) => {
  const result = await decoratorPaymentCollection.find().toArray();
  res.send(result);
});

app.patch("/decoratorpayment/:id", async (req, res) => {
  const result = await decoratorPaymentCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: req.body }
  );
  res.send(result);
});

// ==========================================
// STRIPE ROUTES
// ==========================================
app.post("/create-checkout-session", async (req, res) => {
  try {
    const info = req.body;
    const amount = Math.round((info.cost / 125) * 100);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: amount,
            product_data: { name: info.service_name },
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      customer_email: info.userEmail,
      metadata: {
        packageId: info.packageId,
        service_name: info.service_name,
      },
      success_url: `${process.env.MY_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.MY_DOMAIN}/payment-cancel`,
    });
    res.send({ url: session.url });
  } catch (error) {
    console.error("Stripe Session Error:", error);
    res.status(500).send({ error: "Could not create checkout session" });
  }
});

app.patch("/payment-success", async (req, res) => {
  try {
    const sessionId = req.query.session_id;
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const transactionId = session.payment_intent;

    const paymentExist = await paymentCollection.findOne({ transactionId });
    if (paymentExist) {
      return res.send({
        message: "already exists",
        transactionId,
        trackingId: paymentExist.trackingId,
      });
    }

    if (session.payment_status === "paid") {
      const trackingId = generateTrackingId();
      const id = session.metadata.packageId;

      const updateResult = await BookedPackageCollections.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "paid", trackingId } }
      );

      const payment = {
        amount: session.amount_total / 100,
        currency: session.currency,
        customer_email: session.customer_email,
        bookingId: id,
        serviceName: session.metadata.service_name,
        transactionId,
        paymentStatus: "paid",
        paidAt: new Date(),
        trackingId,
      };

      const resultPayment = await paymentCollection.insertOne(payment);

      return res.send({
        success: true,
        modifyService: updateResult,
        trackingId,
        paymentInfo: resultPayment,
        transactionId,
      });
    }

    return res.send({ success: false, message: "Payment not completed" });
  } catch (error) {
    console.error("Payment Error:", error);
    res.status(500).send({ success: false, message: "Internal Server Error" });
  }
});

// ✅ FIX 3: Export for Vercel — no app.listen()
module.exports = app;