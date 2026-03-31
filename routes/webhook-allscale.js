import { Router } from "express";
import { verifyWebhookSignature } from "../lib/allscale-api.js";
import { getSessionByIntent, updateSessionStatus, getMerchant } from "../db/store.js";
import { markOrderPaid } from "../lib/shopify-api.js";

const router = Router();

// Track processed nonces to prevent replay (in-memory, cleared on restart)
const processedNonces = new Map();

// POST /webhook/allscale — AllScale payment confirmation
router.post("/webhook/allscale", async (req, res) => {
  const rawBody = req.rawBody;
  if (!rawBody) return res.status(400).send("Missing body");

  const webhookId = req.headers["x-webhook-id"];
  const timestamp = req.headers["x-webhook-timestamp"];
  const nonce = req.headers["x-webhook-nonce"];
  const signature = req.headers["x-webhook-signature"]?.replace("v1=", "");

  if (!webhookId || !timestamp || !nonce || !signature) {
    return res.status(400).send("Missing webhook headers");
  }

  // Check nonce replay
  if (processedNonces.has(nonce)) return res.status(200).send("Already processed");

  // Parse body to find the intent ID, then look up merchant credentials
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return res.status(400).send("Invalid JSON");
  }

  const intentId = payload.all_scale_checkout_intent_id;
  if (!intentId) return res.status(400).send("Missing intent ID");

  const session = getSessionByIntent(intentId);
  if (!session) return res.status(404).send("Session not found");

  const merchant = getMerchant(session.shop);
  if (!merchant) return res.status(404).send("Merchant not found");

  // Verify signature
  const valid = verifyWebhookSignature({
    apiSecret: merchant.allscale_api_secret,
    method: "POST",
    path: "/webhook/allscale",
    queryString: "",
    webhookId,
    timestamp,
    nonce,
    body: rawBody,
    signature,
  });

  if (!valid) return res.status(403).send("Invalid signature");

  // Mark nonce as processed (10 min TTL)
  processedNonces.set(nonce, Date.now());
  setTimeout(() => processedNonces.delete(nonce), 600000);

  // Process payment confirmation
  try {
    await markOrderPaidIfNeeded(intentId);
    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook processing error:", err);
    res.status(500).send("Processing failed");
  }
});

export async function markOrderPaidIfNeeded(intentId) {
  const session = getSessionByIntent(intentId);
  if (!session || session.status === "confirmed") return;

  const merchant = getMerchant(session.shop);
  if (!merchant) return;

  // Verify amount by checking intent status
  const { getIntentStatus } = await import("../lib/allscale-api.js");
  const status = await getIntentStatus({
    apiKey: merchant.allscale_api_key,
    apiSecret: merchant.allscale_api_secret,
    environment: merchant.allscale_environment,
    intentId,
  });

  const statusCode = status.status || status.payload?.status;
  const txHash = status.tx_hash || status.payload?.tx_hash || "";

  if (statusCode === 20) {
    // Payment confirmed — mark order as paid in Shopify
    await markOrderPaid({
      shop: session.shop,
      accessToken: merchant.access_token,
      orderId: session.shopify_order_id,
    });
    updateSessionStatus({ allscaleIntentId: intentId, status: "confirmed", txHash });
    console.log(`Payment confirmed: shop=${session.shop} order=${session.shopify_order_id} tx=${txHash}`);
  } else if (statusCode === 10) {
    updateSessionStatus({ allscaleIntentId: intentId, status: "on_chain", txHash });
  } else if (statusCode < 0) {
    const reasons = { "-1": "failed", "-2": "rejected", "-3": "underpaid", "-4": "cancelled" };
    updateSessionStatus({ allscaleIntentId: intentId, status: reasons[statusCode] || "failed", txHash });
  }
}

export default router;
