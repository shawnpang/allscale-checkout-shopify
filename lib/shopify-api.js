import crypto from "crypto";

export function buildInstallUrl({ shop, apiKey, scopes, redirectUri }) {
  const nonce = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: apiKey,
    scope: scopes,
    redirect_uri: redirectUri,
    state: nonce,
  });
  return { url: `https://${shop}/admin/oauth/authorize?${params}`, nonce };
}

export async function exchangeToken({ shop, apiKey, apiSecret, code }) {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: apiKey,
      client_secret: apiSecret,
      code,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  return res.json();
}

export function verifyHmac({ query, apiSecret }) {
  const { hmac, ...params } = query;
  if (!hmac) return false;
  const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("&");
  const computed = crypto.createHmac("sha256", apiSecret).update(sorted).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(hmac, "hex"));
}

export async function getOrder({ shop, accessToken, orderId }) {
  const res = await fetch(`https://${shop}/admin/api/2024-10/orders/${orderId}.json`, {
    headers: { "X-Shopify-Access-Token": accessToken },
  });
  if (!res.ok) throw new Error(`Failed to fetch order: ${res.status}`);
  const data = await res.json();
  return data.order;
}

export async function createTransaction({ shop, accessToken, orderId, amount, currency, kind, gateway }) {
  const res = await fetch(`https://${shop}/admin/api/2024-10/orders/${orderId}/transactions.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({
      transaction: { amount, currency, kind, gateway, source: "external" },
    }),
  });
  if (!res.ok) throw new Error(`Failed to create transaction: ${res.status}`);
  return res.json();
}

export async function markOrderPaid({ shop, accessToken, orderId }) {
  const order = await getOrder({ shop, accessToken, orderId });
  if (order.financial_status === "paid") return order;

  // For pending orders, we close them by creating a capture transaction
  const res = await fetch(`https://${shop}/admin/api/2024-10/orders/${orderId}/transactions.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({
      transaction: {
        kind: "capture",
        amount: order.total_price,
        currency: order.currency,
        gateway: "allscale-checkout",
        source: "external",
      },
    }),
  });
  return res.json();
}

export function verifyWebhook({ body, hmacHeader, apiSecret }) {
  const computed = crypto.createHmac("sha256", apiSecret).update(body, "utf8").digest("base64");
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmacHeader));
}
