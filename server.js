import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import installRoutes from "./routes/install.js";
import settingsRoutes from "./routes/settings.js";
import paymentRoutes from "./routes/payment.js";
import webhookRoutes from "./routes/webhook-allscale.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Capture raw body for webhook signature verification
app.use((req, res, next) => {
  if (req.path === "/webhook/allscale") {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      req.rawBody = data;
      try { req.body = JSON.parse(data); } catch { req.body = {}; }
      next();
    });
  } else {
    next();
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health check
app.get("/", (req, res) => {
  res.json({
    app: "allscale-checkout-shopify",
    status: "running",
    version: "1.0.0",
  });
});

// Routes
app.use(installRoutes);
app.use(settingsRoutes);
app.use(paymentRoutes);
app.use(webhookRoutes);

app.listen(PORT, () => {
  console.log(`AllScale Checkout Shopify app running on port ${PORT}`);
});

export default app;
