# AllScale Checkout — Shopify Plugin

Accept crypto payments on your Shopify store. Customers pay with any crypto wallet, you receive USDT stablecoin instantly.

**Non-custodial** — funds go directly to your wallet. 0.5% transaction fee vs 3-5% traditional processors.

## How It Works

```
Customer at Shopify checkout
    ↓
Selects "Pay with Crypto (AllScale)"
    ↓
Redirected to AllScale hosted checkout
    ↓
Pays with any crypto wallet
    ↓
AllScale confirms payment on-chain
    ↓
Shopify order marked as paid ✓
```

## Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  Shopify     │───▶│  This App    │───▶│  AllScale    │
│  Storefront  │    │  (Node.js)   │    │  Checkout    │
│              │◀───│              │◀───│  API         │
└─────────────┘    └──────────────┘    └─────────────┘
```

- **Shopify** sends order data to this app
- **This app** creates an AllScale checkout intent and redirects the customer
- **AllScale** handles the crypto payment and notifies this app via webhook
- **This app** marks the Shopify order as paid

## Setup

### Prerequisites

1. **AllScale Account** — Sign up at [allscale.io](https://allscale.io)
   - Enable "AllScale Commerce"
   - Create a Store
   - Configure your USDT receiving wallet address
   - Generate API Key and API Secret

2. **Shopify Partner Account** — Create an app in the [Shopify Partners dashboard](https://partners.shopify.com)
   - App URL: `https://your-deployed-app.com`
   - Allowed redirection URL: `https://your-deployed-app.com/auth/callback`
   - Copy the API Key and API Secret

### Installation

```bash
git clone https://github.com/allscale-io/allscale-checkout-shopify.git
cd allscale-checkout-shopify
npm install
```

### Configuration

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

```env
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_SCOPES=read_orders,write_orders,read_products
APP_URL=https://your-app.com
SESSION_SECRET=random_secret_string
DEFAULT_ALLSCALE_ENV=sandbox
```

### Run

```bash
# Development
npm run dev

# Production
npm start
```

### Install on a Shopify Store

1. Visit `https://your-app.com/auth?shop=your-store.myshopify.com`
2. Authorize the app
3. On the settings page, enter your AllScale API Key and Secret
4. Set environment to Sandbox (testing) or Production (live)
5. Copy the webhook URL and add it to your AllScale dashboard
6. In Shopify Admin → Settings → Payments → Manual payment methods:
   - Add a custom payment method named **"Pay with Crypto (AllScale)"**

### Webhook Setup

Add this URL in your AllScale dashboard under Commerce → Webhook endpoint:

```
https://your-app.com/webhook/allscale
```

## Payment Flow

| Step | What Happens |
|------|-------------|
| 1 | Customer selects "Pay with Crypto" at Shopify checkout |
| 2 | Merchant (or automation) triggers `GET /payment/start?shop=xxx&order_id=123` |
| 3 | App creates AllScale checkout intent via API |
| 4 | Customer redirected to AllScale hosted checkout page |
| 5 | Customer pays with their crypto wallet |
| 6 | AllScale webhook notifies app of on-chain confirmation |
| 7 | App marks Shopify order as paid via Admin API |
| 8 | Customer redirected back to store |

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/auth` | Start Shopify OAuth install |
| GET | `/auth/callback` | OAuth callback |
| GET | `/settings` | Merchant configuration page |
| POST | `/settings` | Save AllScale credentials |
| GET | `/payment/start` | Initiate payment for an order |
| GET | `/payment/complete` | Return URL after payment |
| POST | `/webhook/allscale` | AllScale payment confirmation |

## Security

- **HMAC-SHA256** signature verification on all AllScale webhooks
- **Shopify HMAC** verification on OAuth callbacks
- **Nonce deduplication** prevents webhook replay attacks
- **Timestamp validation** (±5 minute window)
- API secrets stored server-side only, never exposed to frontend

## Supported Currencies

| Currency | Code |
|----------|------|
| USD | 1 |
| AUD | 9 |
| CAD | 27 |
| CNY | 31 |
| EUR | 44 |
| GBP | 48 |
| HKD | 57 |
| JPY | 72 |
| SGD | 126 |

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: SQLite (via better-sqlite3)
- **Auth**: Shopify OAuth2
- **Payments**: AllScale Checkout API

## Related

- [AllScale Checkout WooCommerce Plugin](https://github.com/allscale-io/allscale-checkout-woocommerce)
- [AllScale Checkout Integration Skill](https://github.com/allscale-io/allscale-checkout-skill)
- [AllScale](https://allscale.io)

## License

MIT
