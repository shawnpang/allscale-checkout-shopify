import crypto from "crypto";

const BASE_URLS = {
  sandbox: "https://openapi-sandbox.allscale.io",
  production: "https://openapi.allscale.io",
};

const CURRENCY_MAP = {
  USD: 1, AUD: 9, CAD: 27, CNY: 31, EUR: 44,
  GBP: 48, HKD: 57, JPY: 72, SGD: 126,
};

function signRequest(method, path, query, body, apiSecret) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();
  const bodyHash = body
    ? crypto.createHash("sha256").update(body).digest("hex")
    : crypto.createHash("sha256").update("").digest("hex");

  const canonical = [method, path, query || "", timestamp, nonce, bodyHash].join("\n");
  const signature = crypto.createHmac("sha256", apiSecret).update(canonical).digest("base64");

  return {
    "X-Timestamp": timestamp,
    "X-Nonce": nonce,
    "X-Signature": `v1=${signature}`,
  };
}

export async function createCheckoutIntent({ apiKey, apiSecret, environment, amountCents, currency, orderId, orderDescription, extra }) {
  const baseUrl = BASE_URLS[environment] || BASE_URLS.sandbox;
  const path = "/v1/checkout_intents/";
  const currencyCode = CURRENCY_MAP[currency] || CURRENCY_MAP.USD;

  const bodyObj = {
    currency: currencyCode,
    amount_cents: amountCents,
    order_id: orderId || null,
    order_description: orderDescription || null,
    extra: extra || null,
  };
  const bodyStr = JSON.stringify(bodyObj);
  const sigHeaders = signRequest("POST", path, "", bodyStr, apiSecret);

  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      ...sigHeaders,
    },
    body: bodyStr,
  });

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`AllScale API error: ${JSON.stringify(data)}`);
  }
  return data.payload;
}

export async function getIntentStatus({ apiKey, apiSecret, environment, intentId }) {
  const baseUrl = BASE_URLS[environment] || BASE_URLS.sandbox;
  const path = `/v1/checkout_intents/${intentId}/status`;
  const sigHeaders = signRequest("GET", path, "", "", apiSecret);

  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      "X-API-Key": apiKey,
      ...sigHeaders,
    },
  });

  return res.json();
}

export function verifyWebhookSignature({ apiSecret, method, path, queryString, webhookId, timestamp, nonce, body, signature }) {
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (Math.abs(now - ts) > 300) return false;

  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  const canonical = [
    "allscale:webhook:v1",
    method,
    path,
    queryString || "",
    webhookId,
    timestamp,
    nonce,
    bodyHash,
  ].join("\n");

  const expected = crypto.createHmac("sha256", apiSecret).update(canonical).digest("base64");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export { CURRENCY_MAP };
