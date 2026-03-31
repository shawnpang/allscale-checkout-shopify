import { Router } from "express";
import { buildInstallUrl, verifyHmac, exchangeToken } from "../lib/shopify-api.js";
import { saveMerchant } from "../db/store.js";

const router = Router();

// Step 1: Start OAuth — merchant clicks "Install" from Shopify
router.get("/auth", (req, res) => {
  const { shop } = req.query;
  if (!shop || !/^[a-zA-Z0-9-]+\.myshopify\.com$/.test(shop)) {
    return res.status(400).send("Invalid shop parameter");
  }

  const { url, nonce } = buildInstallUrl({
    shop,
    apiKey: process.env.SHOPIFY_API_KEY,
    scopes: process.env.SHOPIFY_SCOPES,
    redirectUri: `${process.env.APP_URL}/auth/callback`,
  });

  res.cookie("oauth_nonce", nonce, { httpOnly: true, sameSite: "lax", maxAge: 600000 });
  res.redirect(url);
});

// Step 2: OAuth callback — exchange code for access token
router.get("/auth/callback", async (req, res) => {
  const { shop, code, state, hmac } = req.query;

  // Verify HMAC
  if (!verifyHmac({ query: req.query, apiSecret: process.env.SHOPIFY_API_SECRET })) {
    return res.status(403).send("HMAC verification failed");
  }

  // Verify nonce
  if (state !== req.cookies.oauth_nonce) {
    return res.status(403).send("Invalid OAuth state");
  }
  res.clearCookie("oauth_nonce");

  try {
    const { access_token } = await exchangeToken({
      shop,
      apiKey: process.env.SHOPIFY_API_KEY,
      apiSecret: process.env.SHOPIFY_API_SECRET,
      code,
    });

    saveMerchant({ shop, accessToken: access_token });
    res.redirect(`/settings?shop=${shop}`);
  } catch (err) {
    console.error("OAuth error:", err);
    res.status(500).send("Failed to complete installation");
  }
});

export default router;
