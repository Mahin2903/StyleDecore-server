const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const cors = require("cors");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRETKEY);

const port = process.env.PORT || 3000;

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.dppmf5f.mongodb.net/?appName=Cluster0`;

app.use(cors());
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const generateTrackingId = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "SD-"; // SD for StyleDecor
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

    app.get("/services", async (req, res) => {
      const { email } = req.query;
      const query = {};
      if (email) {
        query.createdByEmail = email;
      }
      const result = await serviceCollections.find(query).toArray();
      res.send(result);
    });

    app.get("/services/category-summary", async (req, res) => {
      const result = await serviceCollections
        .aggregate([
          { $group: { _id: "$category", totalServices: { $sum: 1 } } },
          { $project: { _id: 0, category: "$_id", totalServices: 1 } },
        ])
        .toArray();
      res.send(result);
    });

    app.get("/services/:id", async (req, res) => {
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

    app.get("/user", async (req, res) => {
      const { email, status } = req.query;
      const query = {};
      if (email) query.createdByEmail = email;
      if (status) query.status = status;
      const result = await UsersCollections.find(query).toArray();
      res.send(result);
    });

    app.get("/user/:id", async (req, res) => {
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
      const package = req.body;
      const result = await BookedPackageCollections.insertOne(package);
      res.send(result);
    });

    app.get("/bookedservice", async (req, res) => {
      const { email } = req.query;
      const query = {};
      if (email) query.userEmail = email;
      const result = await BookedPackageCollections.find(query).toArray();
      res.send(result);
    });

    app.get("/bookedservice/:id", async (req, res) => {
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
      const package = { _id: new ObjectId(id) };
      const result = await BookedPackageCollections.deleteOne(package);
      res.send(result);
    });

    // ==========================================
    // 🆕 DECORATOR WORKFLOW ROUTES
    // ==========================================
    app.get("/decorators", async (req, res) => {
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
          decoratorEmail: decoratorEmail,
          decoratorName: decoratorName,
          assignedAt: new Date(),
        },
      };
      const result = await BookedPackageCollections.updateOne(
        filter,
        updateDoc,
      );
      res.send(result);
    });

    app.get("/decorator/assignments", async (req, res) => {
      const { email } = req.query;
      if (!email) return res.send([]);
      const query = { decoratorEmail: email };
      const result = await BookedPackageCollections.find(query).toArray();
      res.send(result);
    });
    app.get("/decorator/assignments/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await BookedPackageCollections.findOne(query);
      res.send(result);
    });
    // ==========================================
    // ADD THIS ROUTE inside your run() function
    // after the existing /decorator/assignments/:id GET route
    // ==========================================

    app.patch("/decorator/assignments/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { workStatus } = req.body;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            workStatus: workStatus,
            lastUpdated: new Date(),
            ...(workStatus === "complete" && { completedAt: new Date() }),
          },
        };

        // ✅ Use findOneAndUpdate to get the actual document back
        const result = await BookedPackageCollections.findOneAndUpdate(
          filter,
          updateDoc,
          { returnDocument: "after" },
        );

        res.send(result); // This now sends the full updated project object
      } catch (error) {
        res.status(500).send({ error: "Failed to update" });
      }
    });

    // ==========================================
    // PAYMENT ROUTES
    // ==========================================
    app.get("/payments", async (req, res) => {
      try {
        const { email } = req.query;
        let query = {}; // 🛠️ FIXED: Added 'let' to prevent global variable leak
        if (email) {
          query.customer_email = email;
        }
        const result = await paymentCollection
          .find(query)
          .sort({ paidAt: -1 })
          .toArray(); // 🛠️ FIXED: Added sorting by newest first
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
    app.get("/decoratorpayment", async (req, res) => {
      const cursor = decoratorPaymentCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });
    app.patch("/decoratorpayment/:id", async (req, res) => {
      const { id } = req.params;
      const update = req.body;
      const result = await decoratorPaymentCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: update },
      );
      res.send(result);
    });

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

    // 🛠️ FIXED: Safe Payment Success Route
    app.patch("/payment-success", async (req, res) => {
      try {
        const sessionId = req.query.session_id;
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const transactionId = session.payment_intent;

        // 1. Check if already processed
        const paymentExist = await paymentCollection.findOne({ transactionId });
        if (paymentExist) {
          return res.send({
            message: "already exists",
            transactionId,
            trackingId: paymentExist.trackingId,
          });
        }

        // 2. Process if Paid
        if (session.payment_status === "paid") {
          const trackingId = generateTrackingId();
          const id = session.metadata.packageId;

          // Update Booking Status
          const updateResult = await BookedPackageCollections.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status: "paid", trackingId: trackingId } },
          );

          // Save Payment Info
          const payment = {
            amount: session.amount_total / 100,
            currency: session.currency,
            customer_email: session.customer_email,
            bookingId: id,
            serviceName: session.metadata.service_name,
            transactionId: transactionId,
            paymentStatus: "paid",
            paidAt: new Date(),
            trackingId: trackingId,
          };

          const resultPayment = await paymentCollection.insertOne(payment);

          return res.send({
            success: true,
            modifyService: updateResult,
            trackingId: trackingId,
            paymentInfo: resultPayment,
            transactionId: transactionId,
          });
        }

        // 3. Fallback for unpaid
        return res.send({ success: false, message: "Payment not completed" });
      } catch (error) {
        console.error("Payment Error:", error);
        res
          .status(500)
          .send({ success: false, message: "Internal Server Error" });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Style Decor Server is running smoothly");
});

app.listen(port, () => {
  console.log(`Style Decor app listening on port ${port}`);
});
