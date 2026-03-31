import { Router } from "express";
import { getMerchant, updateMerchantAllscale } from "../db/store.js";

const router = Router();

router.get("/settings", (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).send("Missing shop parameter");

  const merchant = getMerchant(shop);
  if (!merchant) return res.redirect(`/auth?shop=${shop}`);

  res.send(renderSettings(merchant));
});

router.post("/settings", (req, res) => {
  const { shop, allscale_api_key, allscale_api_secret, allscale_environment } = req.body;
  if (!shop) return res.status(400).send("Missing shop parameter");

  const merchant = getMerchant(shop);
  if (!merchant) return res.status(404).send("Shop not found");

  updateMerchantAllscale({
    shop,
    apiKey: allscale_api_key || merchant.allscale_api_key,
    apiSecret: allscale_api_secret || merchant.allscale_api_secret,
    environment: allscale_environment || merchant.allscale_environment,
  });

  const updated = getMerchant(shop);
  res.send(renderSettings(updated, "Settings saved successfully!"));
});

function renderSettings(merchant, message = "") {
  const masked = merchant.allscale_api_secret
    ? merchant.allscale_api_secret.substring(0, 6) + "••••••••"
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AllScale Checkout — Settings</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f6f6f7; color: #1a1a1a; }
    .container { max-width: 640px; margin: 40px auto; padding: 0 20px; }
    h1 { font-size: 1.5rem; margin-bottom: 8px; }
    .subtitle { color: #616161; margin-bottom: 32px; }
    .card { background: #fff; border: 1px solid #e1e3e5; border-radius: 12px; padding: 24px; margin-bottom: 24px; }
    .card h2 { font-size: 1.1rem; margin-bottom: 16px; }
    label { display: block; font-size: 0.875rem; font-weight: 600; margin-bottom: 4px; color: #303030; }
    input, select { width: 100%; padding: 10px 12px; border: 1px solid #c9cccf; border-radius: 8px; font-size: 0.95rem; margin-bottom: 16px; }
    input:focus, select:focus { outline: none; border-color: #5c6ac4; box-shadow: 0 0 0 2px rgba(92,106,196,0.2); }
    .btn { background: #5c6ac4; color: #fff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 0.95rem; font-weight: 600; cursor: pointer; }
    .btn:hover { background: #4959bd; }
    .success { background: #e3f1df; border: 1px solid #bbe5b3; color: #108043; padding: 12px 16px; border-radius: 8px; margin-bottom: 24px; }
    .info { background: #f4f5fa; border: 1px solid #dfe3e8; padding: 16px; border-radius: 8px; margin-top: 16px; }
    .info p { font-size: 0.85rem; color: #616161; line-height: 1.5; }
    .info code { background: #e4e5e7; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; }
    .shop-badge { display: inline-block; background: #f4f5fa; padding: 4px 12px; border-radius: 100px; font-size: 0.8rem; color: #5c6ac4; font-weight: 600; margin-bottom: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>AllScale Checkout</h1>
    <p class="subtitle">Accept crypto payments, receive USDT instantly.</p>
    <div class="shop-badge">${merchant.shop}</div>

    ${message ? `<div class="success">${message}</div>` : ""}

    <form method="POST" action="/settings">
      <input type="hidden" name="shop" value="${merchant.shop}">

      <div class="card">
        <h2>AllScale API Credentials</h2>
        <label for="allscale_api_key">API Key</label>
        <input type="text" id="allscale_api_key" name="allscale_api_key" value="${merchant.allscale_api_key}" placeholder="st_your_api_key">

        <label for="allscale_api_secret">API Secret ${masked ? `(current: ${masked})` : ""}</label>
        <input type="password" id="allscale_api_secret" name="allscale_api_secret" placeholder="${masked ? 'Leave blank to keep current' : 'st_your_api_secret'}">

        <label for="allscale_environment">Environment</label>
        <select id="allscale_environment" name="allscale_environment">
          <option value="sandbox" ${merchant.allscale_environment === "sandbox" ? "selected" : ""}>Sandbox (testing)</option>
          <option value="production" ${merchant.allscale_environment === "production" ? "selected" : ""}>Production (live)</option>
        </select>
      </div>

      <div class="card">
        <h2>Webhook Setup</h2>
        <div class="info">
          <p>Add this webhook URL in your AllScale dashboard under Commerce &rarr; Webhook endpoint:</p>
          <p style="margin-top:8px;"><code>${process.env.APP_URL}/webhook/allscale</code></p>
          <p style="margin-top:12px;">This ensures payment confirmations are received even if the customer closes their browser.</p>
        </div>
      </div>

      <div class="card">
        <h2>Shopify Setup</h2>
        <div class="info">
          <p>Add AllScale as a manual payment method in your Shopify admin:</p>
          <p style="margin-top:8px;">Settings &rarr; Payments &rarr; Manual payment methods &rarr; Create custom payment method</p>
          <p style="margin-top:8px;">Name: <code>Pay with Crypto (AllScale)</code></p>
          <p style="margin-top:4px;">Additional details: <code>Pay with any crypto wallet. Powered by AllScale.</code></p>
          <p style="margin-top:4px;">Payment instructions: <code>You will be redirected to complete your crypto payment.</code></p>
        </div>
      </div>

      <button type="submit" class="btn">Save Settings</button>
    </form>
  </div>
</body>
</html>`;
}

export default router;
