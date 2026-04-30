const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const cors = require("cors");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRETKEY);
const admin = require("firebase-admin");
const port = process.env.PORT || 3000;


const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.dppmf5f.mongodb.net/?appName=Cluster0`;

app.use(cors());
app.use(express.json());

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// ✅ verifyToken — strips Bearer prefix correctly
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

async function run() {
  try {
    await client.connect();
    const DB = client.db("decorServiceDB");
    const serviceCollections = DB.collection("services");
    const UsersCollections = DB.collection("user");
    const BookedPackageCollections = DB.collection("bookedpackages");
    const paymentCollection = DB.collection("payments");
    const decoratorPaymentCollection = DB.collection("decorPayments");

    // ==========================================
    // SERVICES ROUTES
    // ==========================================
    app.post("/services", async (req, res) => {
      const newServices = req.body;
      const result = await serviceCollections.insertOne(newServices);
      res.send(result);
    });

    app.patch("/services/:id", async (req, res) => {
      const id = req.params.id;
      const updatedPackage = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedDocs = { $set: updatedPackage };
      const result = await serviceCollections.updateOne(query, updatedDocs);
      res.send(result);
    });

    app.delete("/services/:id", async (req, res) => {
      const id = req.params.id;
      const result = await serviceCollections.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // ⚠️ NOTE: /services/category-summary MUST stay above /services/:id
    // otherwise Express matches "category-summary" as the :id param
    app.get("/services/category-summary", verifyToken, async (req, res) => {
      const result = await serviceCollections
        .aggregate([
          { $group: { _id: "$category", totalServices: { $sum: 1 } } },
          { $project: { _id: 0, category: "$_id", totalServices: 1 } },
        ])
        .toArray();
      res.send(result);
    });

    // ✅ verifyToken added — call via AxiosInstance on frontend
    // ⚠️ If /services is used on a PUBLIC page (before login), remove verifyToken here
    app.get("/services", verifyToken, async (req, res) => {
      const { email } = req.query;
      const query = {};
      if (email) {
        query.createdByEmail = email;
      }
      const result = await serviceCollections.find(query).toArray();
      res.send(result);
    });

    // ✅ verifyToken added — call via AxiosInstance on frontend
    // ⚠️ If /services/:id is used on a PUBLIC page (before login), remove verifyToken here
    app.get("/services/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const service = { _id: new ObjectId(id) };
        const result = await serviceCollections.findOne(service);
        res.send(result);
      } catch (error) {
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
      const id = req.params.id;
      const newUserDetails = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedDocs = { $set: newUserDetails };
      const result = await UsersCollections.updateOne(query, updatedDocs);
      res.send(result);
    });

    app.delete("/user/:id", async (req, res) => {
      const id = req.params.id;
      const deleteUser = { _id: new ObjectId(id) };
      const result = await UsersCollections.deleteOne(deleteUser);
      res.send(result);
    });

    // ✅ verifyToken added
    app.get("/user", verifyToken, async (req, res) => {
      const { email, status } = req.query;
      const query = {};
      if (email) query.userEmail = email;
      if (status) query.status = status;
      const result = await UsersCollections.find(query).toArray();
      res.send(result);
    });

    // ✅ verifyToken added
    app.get("/user/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const userId = { _id: new ObjectId(id) };
        const result = await UsersCollections.findOne(userId);
        res.send(result);
      } catch (error) {
        res.status(400).send({ error: "Invalid User ID" });
      }
    });

    // ==========================================
    // BOOKED SERVICES ROUTES
    // ==========================================
    app.post("/bookedservice", async (req, res) => {
      const bookingData = req.body;
      const result = await BookedPackageCollections.insertOne(bookingData);
      res.send(result);
    });

    // ✅ verifyToken added
    app.get("/bookedservice", verifyToken, async (req, res) => {
      const { email } = req.query;
      const query = {};
      if (email) query.userEmail = email;
      const result = await BookedPackageCollections.find(query).toArray();
      res.send(result);
    });

    // ✅ verifyToken added
    app.get("/bookedservice/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const result = await BookedPackageCollections.findOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        res.status(400).send({ error: "Invalid Booking ID" });
      }
    });

    app.delete("/bookedservice/:id", async (req, res) => {
      const id = req.params.id;
      const bookingQuery = { _id: new ObjectId(id) };
      const result = await BookedPackageCollections.deleteOne(bookingQuery);
      res.send(result);
    });

    // ==========================================
    // DECORATOR WORKFLOW ROUTES
    // ==========================================

    // ✅ verifyToken added
    app.get("/decorators", verifyToken, async (req, res) => {
      const query = { role: { $regex: /decorator/i }, status: "approved" };
      const result = await UsersCollections.find(query).toArray();
      res.send(result);
    });

    app.patch("/bookedservice/assign/:id", async (req, res) => {
      const id = req.params.id;
      const { decoratorEmail, decoratorName } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "assigned",
          decoratorEmail,
          decoratorName,
          assignedAt: new Date(),
        },
      };
      const result = await BookedPackageCollections.updateOne(filter, updateDoc);
      res.send(result);
    });

    // ✅ verifyToken added
    app.get("/decorator/assignments", verifyToken, async (req, res) => {
      const { email } = req.query;
      if (!email) return res.send([]);
      const query = { decoratorEmail: email };
      const result = await BookedPackageCollections.find(query).toArray();
      res.send(result);
    });

    // ✅ verifyToken added
    app.get("/decorator/assignments/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await BookedPackageCollections.findOne(query);
      res.send(result);
    });

    app.patch("/decorator/assignments/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { workStatus } = req.body;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            workStatus,
            lastUpdated: new Date(),
            ...(workStatus === "complete" && { completedAt: new Date() }),
          },
        };
        const result = await BookedPackageCollections.findOneAndUpdate(
          filter,
          updateDoc,
          { returnDocument: "after" }
        );
        res.send(result);
      } catch (error) {
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
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch payments" });
      }
    });

    app.post("/decoratorpayment", async (req, res) => {
      const paymentInfo = req.body;
      const result = await decoratorPaymentCollection.insertOne(paymentInfo);
      res.send(result);
    });

    // ✅ verifyToken added
    app.get("/decoratorpayment", verifyToken, async (req, res) => {
      const cursor = decoratorPaymentCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.patch("/decoratorpayment/:id", async (req, res) => {
      const { id } = req.params;
      const update = req.body;
      const result = await decoratorPaymentCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: update }
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

    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Keep connection alive
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Style Decor Server is running smoothly");
});

// app.listen(port, () => {
//   console.log(`Style Decor app listening on port ${port}`);
// });