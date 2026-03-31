import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "..", "allscale-shopify.db"));

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS merchants (
    shop TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    allscale_api_key TEXT DEFAULT '',
    allscale_api_secret TEXT DEFAULT '',
    allscale_environment TEXT DEFAULT 'sandbox',
    installed_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS payment_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop TEXT NOT NULL,
    shopify_order_id TEXT NOT NULL,
    allscale_intent_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    tx_hash TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_intent ON payment_sessions(allscale_intent_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_order ON payment_sessions(shop, shopify_order_id);
`);

export function saveMerchant({ shop, accessToken }) {
  db.prepare(`
    INSERT INTO merchants (shop, access_token) VALUES (?, ?)
    ON CONFLICT(shop) DO UPDATE SET access_token = excluded.access_token
  `).run(shop, accessToken);
}

export function getMerchant(shop) {
  return db.prepare("SELECT * FROM merchants WHERE shop = ?").get(shop);
}

export function updateMerchantAllscale({ shop, apiKey, apiSecret, environment }) {
  db.prepare(`
    UPDATE merchants SET allscale_api_key = ?, allscale_api_secret = ?, allscale_environment = ?
    WHERE shop = ?
  `).run(apiKey, apiSecret, environment, shop);
}

export function createPaymentSession({ shop, shopifyOrderId, allscaleIntentId, amountCents, currency }) {
  return db.prepare(`
    INSERT INTO payment_sessions (shop, shopify_order_id, allscale_intent_id, amount_cents, currency)
    VALUES (?, ?, ?, ?, ?)
  `).run(shop, shopifyOrderId, allscaleIntentId, amountCents, currency);
}

export function getSessionByIntent(allscaleIntentId) {
  return db.prepare("SELECT * FROM payment_sessions WHERE allscale_intent_id = ?").get(allscaleIntentId);
}

export function getSessionByOrder(shop, shopifyOrderId) {
  return db.prepare("SELECT * FROM payment_sessions WHERE shop = ? AND shopify_order_id = ?").get(shop, shopifyOrderId);
}

export function updateSessionStatus({ allscaleIntentId, status, txHash }) {
  db.prepare(`
    UPDATE payment_sessions SET status = ?, tx_hash = ?, updated_at = datetime('now')
    WHERE allscale_intent_id = ?
  `).run(status, txHash || "", allscaleIntentId);
}

export default db;
