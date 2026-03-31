import { Router } from "express";
import { getMerchant, createPaymentSession, getSessionByOrder } from "../db/store.js";
import { getOrder } from "../lib/shopify-api.js";
import { createCheckoutIntent, getIntentStatus } from "../lib/allscale-api.js";

const router = Router();

// Initiate payment: merchant or checkout flow redirects here
// GET /payment/start?shop=xxx&order_id=123
router.get("/payment/start", async (req, res) => {
  const { shop, order_id } = req.query;
  if (!shop || !order_id) return res.status(400).send("Missing shop or order_id");

  const merchant = getMerchant(shop);
  if (!merchant) return res.status(404).send("Shop not installed");
  if (!merchant.allscale_api_key || !merchant.allscale_api_secret) {
    return res.status(400).send("AllScale credentials not configured. Visit /settings to set up.");
  }

  try {
    // Check if we already have a session for this order
    const existing = getSessionByOrder(shop, order_id);
    if (existing && existing.status === "pending") {
      // Redirect to existing AllScale checkout
      const status = await getIntentStatus({
        apiKey: merchant.allscale_api_key,
        apiSecret: merchant.allscale_api_secret,
        environment: merchant.allscale_environment,
        intentId: existing.allscale_intent_id,
      });
      if (status.status >= 0 && status.status < 20) {
        // Still active, re-fetch checkout URL by creating new intent
        // (AllScale doesn't expose checkout_url on status endpoint)
      }
    }

    // Fetch order details from Shopify
    const order = await getOrder({
      shop,
      accessToken: merchant.access_token,
      orderId: order_id,
    });

    const amountCents = Math.round(parseFloat(order.total_price) * 100);
    const currency = order.currency;
    const returnUrl = `${process.env.APP_URL}/payment/complete?shop=${shop}&order_id=${order_id}`;

    // Create AllScale checkout intent
    const intent = await createCheckoutIntent({
      apiKey: merchant.allscale_api_key,
      apiSecret: merchant.allscale_api_secret,
      environment: merchant.allscale_environment,
      amountCents,
      currency,
      orderId: `${shop}:${order_id}`,
      orderDescription: `Order #${order.order_number} from ${shop}`,
      extra: {
        shop,
        shopify_order_id: order_id,
        return_url: returnUrl,
      },
    });

    // Save payment session
    createPaymentSession({
      shop,
      shopifyOrderId: order_id,
      allscaleIntentId: intent.allscale_checkout_intent_id,
      amountCents,
      currency,
    });

    // Redirect customer to AllScale hosted checkout
    res.redirect(intent.checkout_url);
  } catch (err) {
    console.error("Payment start error:", err);
    res.status(500).send(`Payment initiation failed: ${err.message}`);
  }
});

// Return URL — customer comes back after paying
router.get("/payment/complete", async (req, res) => {
  const { shop, order_id } = req.query;
  if (!shop || !order_id) return res.status(400).send("Missing parameters");

  const merchant = getMerchant(shop);
  if (!merchant) return res.status(404).send("Shop not found");

  const session = getSessionByOrder(shop, order_id);
  if (!session) return res.status(404).send("Payment session not found");

  try {
    // Poll AllScale for status (fallback confirmation)
    const status = await getIntentStatus({
      apiKey: merchant.allscale_api_key,
      apiSecret: merchant.allscale_api_secret,
      environment: merchant.allscale_environment,
      intentId: session.allscale_intent_id,
    });

    const statusCode = status.status || status.payload?.status;
    let message, heading;

    if (statusCode === 20) {
      // Confirmed — webhook should have already handled this, but mark just in case
      const { markOrderPaidIfNeeded } = await import("./webhook-allscale.js");
      await markOrderPaidIfNeeded(session.allscale_intent_id);
      heading = "Payment Confirmed!";
      message = "Your crypto payment has been received. You can close this page and return to the store.";
    } else if (statusCode === 10) {
      heading = "Payment Detected";
      message = "Your transaction has been detected on-chain and is awaiting confirmation. The store will be notified automatically.";
    } else if (statusCode < 0) {
      heading = "Payment Issue";
      const reasons = { "-1": "failed", "-2": "rejected", "-3": "underpaid", "-4": "cancelled" };
      message = `Your payment was ${reasons[statusCode] || "not completed"}. Please contact the store for assistance.`;
    } else {
      heading = "Awaiting Payment";
      message = "We haven't detected your payment yet. If you've already paid, please wait a few minutes for blockchain confirmation.";
    }

    res.send(`<!DOCTYPE html>
<html><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Payment Status — AllScale Checkout</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f6f6f7; }
    .card { background: #fff; border-radius: 16px; padding: 48px; max-width: 480px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    h1 { font-size: 1.5rem; margin-bottom: 12px; }
    p { color: #616161; line-height: 1.6; }
    .btn { display: inline-block; margin-top: 24px; padding: 12px 32px; background: #5c6ac4; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; }
  </style>
</head><body>
  <div class="card">
    <h1>${heading}</h1>
    <p>${message}</p>
    <a href="https://${shop}" class="btn">Return to Store</a>
  </div>
</body></html>`);
  } catch (err) {
    console.error("Payment complete error:", err);
    res.status(500).send("Failed to check payment status");
  }
});

export default router;
