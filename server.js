"use strict";

const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const {
  createCardPayment,
  createCardPaymentWithAuth,
  generateCaptureContext,
  chargeGooglePayToken,
  createGooglePayPaymentFromBlob,
  checkPayerAuthEnrollment,
  payerAuthSetup,
  validateAuthenticationResults,
  searchTransactionsByReference,
  chargeUnifiedCheckoutToken,
  checkPayerAuthEnrollmentWithToken,
  validateAuthenticationResultsWithToken,
} = require("./src/cybersourceService");
const { db } = require("./src/firebaseService");
const config = require("./src/config");
const { requireAuth } = require("./src/authMiddleware");

const app = express();
const PORT = process.env.PORT || 5000;

// Run startup checks
const { checkEnvironment } = require("./src/startupCheck");
checkEnvironment();

// CORS configuration - Allow requests from Render.com and other origins
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    // List of allowed origins
    const allowedOrigins = [
      "https://cybersource.onrender.com",
      "https://unified-checkout-test.onrender.com",
      /^https:\/\/.*\.onrender\.com$/, // Allow all Render.com subdomains
      /^https:\/\/.*\.ngrok-free\.app$/, // Allow ngrok URLs for testing
      /^https:\/\/.*\.ngrok\.io$/, // Allow ngrok.io URLs
      "http://localhost:3000",
      "http://localhost:8000",
      "http://localhost:4000",
    ];

    // Check if origin matches any allowed pattern
    const isAllowed = allowedOrigins.some((allowed) => {
      if (typeof allowed === "string") {
        return origin === allowed;
      } else if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return false;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked origin: ${origin}`);
      callback(null, true); // Allow all for now, but log blocked origins
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

function logJson(label, payload) {
  try {
    console.log(
      `[${label}]`,
      JSON.stringify(payload, (key, value) => {
        if (
          typeof value === "string" &&
          key.toLowerCase().includes("token") &&
          value.length > 12
        ) {
          return `${value.slice(0, 6)}***${value.slice(-4)}`;
        }
        return value;
      })
    );
  } catch (err) {
    console.log(`[${label}]`, payload);
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "KileKitabu Backend (Node.js)" });
});

// Import routes
const mpesaRoutes = require("./routes/mpesa");
const subscriptionRoutes = require("./routes/subscription");
const notificationRoutes = require("./routes/notifications");
const cronRoutes = require("./routes/cron");

app.use("/api/mpesa", mpesaRoutes);
app.use("/api", subscriptionRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/cron", cronRoutes);

app.post("/api/cards/pay", async (req, res) => {
  const startTime = Date.now();
  console.log("[API] POST /api/cards/pay - Card payment request received");

  try {
    const {
      amount,
      currency,
      card,
      billingInfo,
      referenceCode,
      capture,
      authenticationTransactionId,
      authenticationResult,
    } = req.body || {};

    console.log("[API] Request validation...");
    if (
      !amount ||
      !currency ||
      !card?.number ||
      !card?.expirationMonth ||
      !card?.expirationYear
    ) {
      console.log(
        "[API] ❌ Validation failed: Missing required card payment fields"
      );
      return res
        .status(400)
        .json({ error: "Missing required card payment fields" });
    }
    console.log("[API] ✅ Request validated");
    console.log(`[API] Amount: ${amount} ${currency}`);
    console.log(
      `[API] Capture: ${
        capture !== false ? "YES (authorize+capture)" : "NO (authorize only)"
      }`
    );
    console.log(
      `[API] 3D Secure Auth Transaction ID: ${
        authenticationTransactionId || "Not provided"
      }`
    );
    console.log(
      `[API] 3D Secure Auth Result: ${authenticationResult || "Not provided"}`
    );

    // Use authenticated payment flow if authentication data is provided
    if (authenticationTransactionId || authenticationResult) {
      console.log("[API] 🔐 Using 3D Secure authenticated payment flow");
      const result = await createCardPaymentWithAuth({
        amount,
        currency,
        card,
        billingInfo,
        referenceCode,
        capture,
        authenticationTransactionId,
        authenticationResult,
      });

      const duration = Date.now() - startTime;
      console.log(`[API] ✅ Payment completed in ${duration}ms`);
      console.log(`[API] Response Status: ${result.response?.status || 200}`);

      res.status(result.response?.status || 200).json(result.data);
    } else {
      console.log("[API] 💳 Using standard payment flow (no 3D Secure)");
      const result = await createCardPayment({
        amount,
        currency,
        card,
        billingInfo,
        referenceCode,
        capture,
      });

      const duration = Date.now() - startTime;
      console.log(`[API] ✅ Payment completed in ${duration}ms`);
      console.log(`[API] Response Status: ${result.response?.status || 200}`);

      res.status(result.response?.status || 200).json(result.data);
    }
  } catch (err) {
    const duration = Date.now() - startTime;
    const status = err.response?.status || 500;
    console.log(`[API] ❌ Payment failed after ${duration}ms`);
    console.log(`[API] Error Status: ${status}`);
    console.log(
      `[API] Error Message: ${err.error || err.message || "Unknown error"}`
    );
    if (err.response?.text) {
      console.log(
        `[API] Error Response Body: ${err.response.text.substring(0, 500)}`
      );
    }

    res.status(status).json({
      error: err.error || err.message || "Card payment failed",
      responseBody: err.response?.text,
    });
  }
});

// Unified Checkout Capture Context (supports both CARD and GOOGLEPAY)
app.post("/api/unified-checkout/capture-context", async (req, res) => {
  try {
    logJson("UNIFIED_CHECKOUT_CAPTURE_CONTEXT_REQUEST", req.body || {});
    // Default to both PANENTRY (card) and GOOGLEPAY if not specified
    // Note: CyberSource Unified Checkout uses "PANENTRY" for card payments, not "CARD"
    const requestBody = req.body || {};

    // Normalize targetOrigins - trim whitespace from each URL
    if (requestBody.targetOrigins && Array.isArray(requestBody.targetOrigins)) {
      requestBody.targetOrigins = requestBody.targetOrigins
        .map((origin) => (typeof origin === "string" ? origin.trim() : origin))
        .filter((origin) => origin && origin.length > 0); // Remove empty strings
    }

    if (!requestBody.allowedPaymentTypes) {
      requestBody.allowedPaymentTypes = ["PANENTRY", "GOOGLEPAY"];
    }
    // Default completeMandate to OFF. In our environment it has been producing $0.00 auth/settlement
    // and duplicate records (payer-auth validation + UC_* payment).
    // You can explicitly enable it by passing useCompleteMandate=true from the client, or via env.
    if (typeof requestBody.useCompleteMandate === "undefined") {
      requestBody.useCompleteMandate =
        String(process.env.UC_USE_COMPLETE_MANDATE || "").toLowerCase() ===
        "true";
    }
    if (typeof requestBody.completeMandateType === "undefined") {
      // CAPTURE: authorize+capture in one step (matches our processingInformation.capture=true)
      requestBody.completeMandateType = "CAPTURE";
    }
    if (typeof requestBody.enableConsumerAuthentication === "undefined") {
      requestBody.enableConsumerAuthentication = true;
    }
    if (typeof requestBody.enableDecisionManager === "undefined") {
      requestBody.enableDecisionManager = true;
    }

    const captureContext = await generateCaptureContext(requestBody);
    logJson("UNIFIED_CHECKOUT_CAPTURE_CONTEXT_RESPONSE", captureContext);
    res.json(captureContext);
  } catch (err) {
    const status = err.response?.status || 500;
    logJson("UNIFIED_CHECKOUT_CAPTURE_CONTEXT_ERROR", {
      status,
      message: err.error || err.message,
      responseBody: err.response?.text,
    });
    res.status(status).json({
      error: err.error || err.message || "Capture context generation failed",
      responseBody: err.response?.text,
    });
  }
});

// Google Pay Capture Context (legacy - kept for backward compatibility)
app.post("/api/googlepay/capture-context", async (req, res) => {
  try {
    logJson("GPAY_CAPTURE_CONTEXT_REQUEST", req.body || {});
    // Ensure GOOGLEPAY is included
    const requestBody = req.body || {};
    if (!requestBody.allowedPaymentTypes) {
      requestBody.allowedPaymentTypes = ["GOOGLEPAY"];
    } else if (!requestBody.allowedPaymentTypes.includes("GOOGLEPAY")) {
      requestBody.allowedPaymentTypes.push("GOOGLEPAY");
    }
    const captureContext = await generateCaptureContext(requestBody);
    logJson("GPAY_CAPTURE_CONTEXT_RESPONSE", captureContext);
    res.json(captureContext);
  } catch (err) {
    const status = err.response?.status || 500;
    logJson("GPAY_CAPTURE_CONTEXT_ERROR", {
      status,
      message: err.error || err.message,
      responseBody: err.response?.text,
    });
    res.status(status).json({
      error: err.error || err.message || "Capture context generation failed",
      responseBody: err.response?.text,
    });
  }
});

// Payer Authentication (3D Secure) Endpoints

/**
 * Check if payer authentication (3D Secure) is required for a card payment.
 * Call this before processing payment to determine if 3D Secure is needed.
 */
app.post("/api/payer-auth/enroll", async (req, res) => {
  const startTime = Date.now();
  console.log(
    "[API] POST /api/payer-auth/enroll - Enrollment check request received"
  );

  try {
    const { amount, currency, card, billingInfo, referenceCode } =
      req.body || {};

    console.log("[API] Request validation...");
    if (
      !amount ||
      !currency ||
      !card?.number ||
      !card?.expirationMonth ||
      !card?.expirationYear
    ) {
      console.log("[API] ❌ Validation failed: Missing required fields");
      return res.status(400).json({
        error: "Missing required fields: amount, currency, card details",
      });
    }
    console.log("[API] ✅ Request validated");

    logJson("PA_ENROLL_REQUEST", {
      amount,
      currency,
      cardLast4: card.number.slice(-4),
      referenceCode,
    });

    console.log("[API] Calling checkPayerAuthEnrollment...");
    const result = await checkPayerAuthEnrollment({
      amount,
      currency,
      card,
      billingInfo,
      referenceCode,
    });

    const duration = Date.now() - startTime;
    console.log(`[API] ✅ Enrollment check completed in ${duration}ms`);
    console.log(`[API] Response Status: ${result.response?.status || 200}`);

    logJson("PA_ENROLL_RESPONSE", result?.data || {});
    res.status(result.response?.status || 200).json(result.data);
  } catch (err) {
    const duration = Date.now() - startTime;
    const status = err.response?.status || 500;
    console.log(`[API] ❌ Enrollment check failed after ${duration}ms`);
    console.log(`[API] Error Status: ${status}`);
    console.log(
      `[API] Error Message: ${err.error || err.message || "Unknown error"}`
    );

    logJson("PA_ENROLL_ERROR", {
      status,
      message: err.error || err.message,
      responseBody: err.response?.text,
    });
    res.status(status).json({
      error: err.error || err.message || "Payer auth enrollment check failed",
      responseBody: err.response?.text,
    });
  }
});

/**
 * Setup payer authentication (optional, for setup flows).
 * Used when you want to set up authentication without processing a payment.
 */
app.post("/api/payer-auth/setup", async (req, res) => {
  const startTime = Date.now();
  console.log(
    "[API] POST /api/payer-auth/setup - Payer authentication setup request received"
  );

  try {
    const { card, transientToken, referenceCode, billingInfo } = req.body || {};

    console.log("[API] Request validation...");
    if (!card && !transientToken) {
      console.log("[API] ❌ Validation failed: Either card or transientToken is required");
      return res.status(400).json({
        error: "Either card or transientToken is required",
      });
    }
    console.log("[API] ✅ Request validated");

    logJson("PA_SETUP_REQUEST", {
      hasCard: !!card,
      hasTransientToken: !!transientToken,
      referenceCode,
      cardLast4: card?.number ? card.number.slice(-4) : "N/A",
      transientTokenLength: transientToken?.length || 0,
    });

    console.log("[API] Calling payerAuthSetup...");
    console.log(`[API]   - Has card: ${!!card}`);
    console.log(`[API]   - Has transient token: ${!!transientToken}`);
    console.log(`[API]   - Reference code: ${referenceCode || "N/A"}`);

    const result = await payerAuthSetup({
      card,
      transientToken,
      referenceCode,
      billingInfo,
    });

    const duration = Date.now() - startTime;
    console.log(`[API] ✅ Setup completed in ${duration}ms`);
    console.log(`[API] Response Status: ${result.response?.status || 200}`);
    
    if (result?.data?.status) {
      console.log(`[API]   - Status: ${result.data.status}`);
    }
    if (result?.data?.consumerAuthenticationInformation?.authenticationTransactionId) {
      console.log(`[API]   - Auth Transaction ID: ${result.data.consumerAuthenticationInformation.authenticationTransactionId}`);
    }

    logJson("PA_SETUP_RESPONSE", result?.data || {});
    res.status(result.response?.status || 200).json(result.data);
  } catch (err) {
    const duration = Date.now() - startTime;
    const status = err.response?.status || 500;
    console.log(`[API] ❌ Setup failed after ${duration}ms`);
    console.log(`[API] Error Status: ${status}`);
    console.log(
      `[API] Error Message: ${err.error || err.message || "Unknown error"}`
    );

    logJson("PA_SETUP_ERROR", {
      status,
      message: err.error || err.message,
      responseBody: err.response?.text,
    });
    res.status(status).json({
      error: err.error || err.message || "Payer auth setup failed",
      responseBody: err.response?.text,
    });
  }
});

/**
 * Validate authentication results after 3D Secure challenge completion.
 * Call this after the user completes the 3D Secure challenge.
 */
app.post("/api/payer-auth/validate", async (req, res) => {
  const startTime = Date.now();
  console.log(
    "[API] POST /api/payer-auth/validate - Authentication validation request received"
  );

  try {
    const {
      authenticationTransactionId,
      amount,
      currency,
      card,
      billingInfo,
      referenceCode,
    } = req.body || {};

    console.log("[API] Request validation...");
    if (!authenticationTransactionId) {
      console.log("[API] ❌ Validation failed: authenticationTransactionId is required");
      return res.status(400).json({
        error: "authenticationTransactionId is required",
      });
    }

    if (
      !amount ||
      !currency ||
      !card?.number ||
      !card?.expirationMonth ||
      !card?.expirationYear
    ) {
      console.log("[API] ❌ Validation failed: Missing required fields");
      return res.status(400).json({
        error: "Missing required fields: amount, currency, card details",
      });
    }
    console.log("[API] ✅ Request validated");

    logJson("PA_VALIDATE_REQUEST", {
      authenticationTransactionId,
      amount,
      currency,
      cardLast4: card.number.slice(-4),
      referenceCode,
    });

    console.log("[API] Calling validateAuthenticationResults...");
    console.log(`[API]   - Auth Transaction ID: ${authenticationTransactionId}`);
    console.log(`[API]   - Amount: ${amount} ${currency}`);
    console.log(`[API]   - Card: ****${card.number.slice(-4)}`);
    console.log(`[API]   - Reference code: ${referenceCode || "N/A"}`);

    const result = await validateAuthenticationResults({
      authenticationTransactionId,
      amount,
      currency,
      card,
      billingInfo,
      referenceCode,
    });

    const duration = Date.now() - startTime;
    console.log(`[API] ✅ Validation completed in ${duration}ms`);
    console.log(`[API] Response Status: ${result.response?.status || 200}`);
    
    if (result?.data?.status) {
      console.log(`[API]   - Status: ${result.data.status}`);
    }
    if (result?.data?.consumerAuthenticationInformation?.authenticationResult) {
      const authResult = result.data.consumerAuthenticationInformation.authenticationResult;
      console.log(`[API]   - Authentication Result: ${authResult} (Y=authenticated, N=not authenticated, U=unavailable)`);
    }
    if (result?.data?.consumerAuthenticationInformation?.ecommerceIndicator) {
      console.log(`[API]   - ECI: ${result.data.consumerAuthenticationInformation.ecommerceIndicator}`);
    }

    logJson("PA_VALIDATE_RESPONSE", result?.data || {});
    res.status(result.response?.status || 200).json(result.data);
  } catch (err) {
    const duration = Date.now() - startTime;
    const status = err.response?.status || 500;
    console.log(`[API] ❌ Validation failed after ${duration}ms`);
    console.log(`[API] Error Status: ${status}`);
    console.log(
      `[API] Error Message: ${err.error || err.message || "Unknown error"}`
    );

    logJson("PA_VALIDATE_ERROR", {
      status,
      message: err.error || err.message,
      responseBody: err.response?.text,
    });
    res.status(status).json({
      error: err.error || err.message || "Authentication validation failed",
      responseBody: err.response?.text,
    });
  }
});

/**
 * Unified Checkout Payer Authentication (3DS) with transient token (JTI)
 * This matches the Java sample Risk API 3DS flow but uses the UC token.
 */
app.post("/api/unified-checkout/payer-auth/enroll", async (req, res) => {
  const startTime = Date.now();
  console.log(
    "[API] POST /api/unified-checkout/payer-auth/enroll - Unified Checkout enrollment check request received"
  );

  try {
    const { transientToken, amount, currency, billingInfo, referenceCode } =
      req.body || {};

    console.log("[API] Request validation...");
    if (!transientToken || !amount || !currency) {
      console.log("[API] ❌ Validation failed: Missing required fields");
      return res.status(400).json({
        error: "transientToken, amount, and currency are required",
      });
    }
    console.log("[API] ✅ Request validated");

    logJson("UC_PA_ENROLL_REQUEST", {
      amount,
      currency,
      referenceCode,
      hasBillingInfo: !!billingInfo,
      transientTokenLength: transientToken.length,
    });

    console.log("[API] Calling checkPayerAuthEnrollmentWithToken...");
    console.log(`[API]   - Amount: ${amount} ${currency}`);
    console.log(`[API]   - Transient token length: ${transientToken.length}`);
    console.log(`[API]   - Reference code: ${referenceCode || "N/A"}`);
    console.log(`[API]   - Has billing info: ${!!billingInfo}`);

    const result = await checkPayerAuthEnrollmentWithToken({
      transientTokenJwt: transientToken,
      amount,
      currency,
      billingInfo,
      referenceCode,
    });

    const duration = Date.now() - startTime;
    console.log(`[API] ✅ Unified Checkout enrollment check completed in ${duration}ms`);
    console.log(`[API] Response Status: ${result.response?.status || 200}`);
    
    if (result?.data?.status) {
      console.log(`[API]   - Status: ${result.data.status}`);
    }
    if (result?.data?.consumerAuthenticationInformation?.veresEnrolled) {
      console.log(`[API]   - Veres Enrolled: ${result.data.consumerAuthenticationInformation.veresEnrolled}`);
    }
    if (result?.data?.consumerAuthenticationInformation?.authenticationTransactionId) {
      console.log(`[API]   - Auth Transaction ID: ${result.data.consumerAuthenticationInformation.authenticationTransactionId}`);
    }

    logJson("UC_PA_ENROLL_RESPONSE", result?.data || {});
    res.status(result.response?.status || 200).json(result.data);
  } catch (err) {
    const duration = Date.now() - startTime;
    const status = err.response?.status || 500;
    console.log(`[API] ❌ Unified Checkout enrollment check failed after ${duration}ms`);
    console.log(`[API] Error Status: ${status}`);
    console.log(
      `[API] Error Message: ${err.error || err.message || "Unknown error"}`
    );

    logJson("UC_PA_ENROLL_ERROR", {
      status,
      message: err.error || err.message,
      responseBody: err.response?.text,
    });
    res.status(status).json({
      error:
        err.error ||
        err.message ||
        "Unified Checkout payer-auth enrollment check failed",
      responseBody: err.response?.text,
    });
  }
});

app.post("/api/unified-checkout/payer-auth/validate", async (req, res) => {
  const startTime = Date.now();
  console.log(
    "[API] POST /api/unified-checkout/payer-auth/validate - Unified Checkout validation request received"
  );

  try {
    const { transientToken, authenticationTransactionId } = req.body || {};

    console.log("[API] Request validation...");
    if (!transientToken || !authenticationTransactionId) {
      console.log("[API] ❌ Validation failed: Missing required fields");
      return res.status(400).json({
        error: "transientToken and authenticationTransactionId are required",
      });
    }
    console.log("[API] ✅ Request validated");

    logJson("UC_PA_VALIDATE_REQUEST", {
      authenticationTransactionId,
      transientTokenLength: transientToken.length,
    });

    console.log("[API] Calling validateAuthenticationResultsWithToken...");
    console.log(`[API]   - Auth Transaction ID: ${authenticationTransactionId}`);
    console.log(`[API]   - Transient token length: ${transientToken.length}`);

    const result = await validateAuthenticationResultsWithToken({
      transientTokenJwt: transientToken,
      authenticationTransactionId,
    });

    const duration = Date.now() - startTime;
    console.log(`[API] ✅ Unified Checkout validation completed in ${duration}ms`);
    console.log(`[API] Response Status: ${result.response?.status || 200}`);
    
    if (result?.data?.status) {
      console.log(`[API]   - Status: ${result.data.status}`);
    }
    if (result?.data?.consumerAuthenticationInformation?.authenticationResult) {
      const authResult = result.data.consumerAuthenticationInformation.authenticationResult;
      console.log(`[API]   - Authentication Result: ${authResult} (Y=authenticated, N=not authenticated, U=unavailable)`);
    }
    if (result?.data?.consumerAuthenticationInformation?.ecommerceIndicator) {
      console.log(`[API]   - ECI: ${result.data.consumerAuthenticationInformation.ecommerceIndicator}`);
    }

    logJson("UC_PA_VALIDATE_RESPONSE", result?.data || {});
    res.status(result.response?.status || 200).json(result.data);
  } catch (err) {
    const duration = Date.now() - startTime;
    const status = err.response?.status || 500;
    console.log(`[API] ❌ Unified Checkout validation failed after ${duration}ms`);
    console.log(`[API] Error Status: ${status}`);
    console.log(
      `[API] Error Message: ${err.error || err.message || "Unknown error"}`
    );

    logJson("UC_PA_VALIDATE_ERROR", {
      status,
      message: err.error || err.message,
      responseBody: err.response?.text,
    });
    res.status(status).json({
      error:
        err.error ||
        err.message ||
        "Unified Checkout authentication validation failed",
      responseBody: err.response?.text,
    });
  }
});

/**
 * Validate 3D Secure authentication and complete payment in one call.
 * This endpoint validates authentication results and then processes payment.
 * Used after user completes 3D Secure challenge.
 */
app.post("/api/payer-auth/validate-and-complete", async (req, res) => {
  const startTime = Date.now();
  console.log(
    "[API] POST /api/payer-auth/validate-and-complete - Validate and complete payment request received"
  );

  try {
    const {
      authenticationTransactionId,
      amount,
      currency,
      card,
      billingInfo,
      referenceCode,
      capture = true,
    } = req.body || {};

    console.log("[API] Request validation...");
    if (!authenticationTransactionId) {
      console.log("[API] ❌ Validation failed: authenticationTransactionId is required");
      return res.status(400).json({
        error: "authenticationTransactionId is required",
      });
    }

    if (
      !amount ||
      !currency ||
      !card?.number ||
      !card?.expirationMonth ||
      !card?.expirationYear
    ) {
      console.log("[API] ❌ Validation failed: Missing required fields");
      return res.status(400).json({
        error: "Missing required fields: amount, currency, card details",
      });
    }
    console.log("[API] ✅ Request validated");

    logJson("PA_VALIDATE_COMPLETE_REQUEST", {
      authenticationTransactionId,
      amount,
      currency,
      cardLast4: card.number.slice(-4),
      referenceCode,
      capture,
    });

    // Step 1: Validate authentication results
    console.log("[API] 🔍 Step 1: Validating authentication results...");
    console.log(`[API]   - Auth Transaction ID: ${authenticationTransactionId}`);
    console.log(`[API]   - Amount: ${amount} ${currency}`);
    console.log(`[API]   - Card: ****${card.number.slice(-4)}`);

    let validationResult;
    try {
      validationResult = await validateAuthenticationResults({
        authenticationTransactionId,
        amount,
        currency,
        card,
        billingInfo,
        referenceCode,
      });

      const validationStatus = validationResult?.data?.status?.toUpperCase();
      const authResult = validationResult?.data?.consumerAuthenticationInformation?.authenticationResult?.toUpperCase();
      
      console.log(`[API] ✅ Authentication validation completed`);
      console.log(`[API]   - Validation Status: ${validationStatus}`);
      console.log(`[API]   - Authentication Result: ${authResult} (Y=authenticated, N=not authenticated, U=unavailable)`);

      if (validationStatus !== 'AUTHENTICATION_SUCCESSFUL' || authResult !== 'Y') {
        console.log(`[API] ❌ Authentication validation failed or not authenticated`);
        return res.status(400).json({
          error: "3D Secure authentication failed or was not completed",
          validation_status: validationStatus,
          authentication_result: authResult,
        });
      }

      console.log(`[API] ✅ Authentication validated successfully`);
    } catch (validateErr) {
      console.log(`[API] ❌ Authentication validation failed: ${validateErr.message}`);
      return res.status(validateErr.response?.status || 400).json({
        error: `Authentication validation failed: ${validateErr.message || validateErr.error}`,
        responseBody: validateErr.response?.text,
      });
    }

    // Step 2: Process payment with validated authentication
    console.log("[API] 🚀 Step 2: Processing payment with validated authentication...");
    
    const authResult = validationResult?.data?.consumerAuthenticationInformation?.authenticationResult || 'Y';
    
    const paymentResult = await createCardPaymentWithAuth({
      amount,
      currency,
      card,
      billingInfo,
      referenceCode,
      capture,
      authenticationTransactionId,
      authenticationResult: authResult,
    });

    const duration = Date.now() - startTime;
    console.log(`[API] ✅ Validate and complete finished in ${duration}ms`);
    console.log(`[API] Response Status: ${paymentResult.response?.status || 200}`);
    
    if (paymentResult?.data?.id) {
      console.log(`[API]   - Transaction ID: ${paymentResult.data.id}`);
    }
    if (paymentResult?.data?.status) {
      console.log(`[API]   - Payment Status: ${paymentResult.data.status}`);
    }

    logJson("PA_VALIDATE_COMPLETE_RESPONSE", paymentResult?.data || {});
    res.status(paymentResult.response?.status || 200).json(paymentResult.data);
  } catch (err) {
    const duration = Date.now() - startTime;
    const status = err.response?.status || 500;
    console.log(`[API] ❌ Validate and complete failed after ${duration}ms`);
    console.log(`[API] Error Status: ${status}`);
    console.log(
      `[API] Error Message: ${err.error || err.message || "Unknown error"}`
    );

    logJson("PA_VALIDATE_COMPLETE_ERROR", {
      status,
      message: err.error || err.message,
      responseBody: err.response?.text,
    });
    res.status(status).json({
      error: err.error || err.message || "Validate and complete payment failed",
      responseBody: err.response?.text,
    });
  }
});

// Unified Checkout Charge (supports both CARD and GOOGLEPAY from Unified Checkout)
app.post("/api/unified-checkout/charge", requireAuth, async (req, res) => {
  try {
    const {
      transientToken,
      amount,
      currency,
      referenceCode,
      billingInfo,
      paymentType = "CARD", // 'CARD' or 'GOOGLEPAY'
      authenticationTransactionId, // Optional: 3DS authentication transaction ID
      authenticationResult, // Optional: 3DS authentication result ('Y', 'N', 'U')
      completeResponse, // Optional: complete() response to check if payment was already processed
    } = req.body || {};
    logJson("UNIFIED_CHECKOUT_CHARGE_REQUEST", {
      transientToken,
      amount,
      currency,
      referenceCode,
      paymentType,
      billingInfo,
      authenticationTransactionId:
        authenticationTransactionId || "Not provided",
      authenticationResult: authenticationResult || "Not provided",
      hasCompleteResponse: !!completeResponse,
    });
    if (!amount || !currency || !transientToken) {
      logJson("UNIFIED_CHECKOUT_CHARGE_ERROR", {
        status: 400,
        error: "Missing required fields: transientToken, amount, currency",
      });
      return res.status(400).json({
        error: "transientToken, amount, and currency are required",
      });
    }

    const result = await chargeUnifiedCheckoutToken({
      transientToken,
      amount,
      currency,
      referenceCode,
      billingInfo,
      paymentType,
      authenticationTransactionId,
      authenticationResult,
      completeResponse,
    });

    logJson("UNIFIED_CHECKOUT_CHARGE_RESPONSE", result?.data || {});

    // Add credits to user account if payment was successful
    const status = result?.data?.status;
    const transactionId = result?.data?.id;
    const userId = req.userId; // Set by requireAuth middleware

    if (
      (status === "AUTHORIZED" || status === "CAPTURED") &&
      userId &&
      transactionId
    ) {
      try {
        console.log(
          `[UNIFIED_CHECKOUT_CHARGE] ✅ Payment successful, adding credits for user: ${userId}`
        );

        // Get user ID from auth token
        const userRef = db.ref(`registeredUser/${userId}`);
        const userSnapshot = await userRef.once("value");
        const userData = userSnapshot.val() || {};

        // Calculate credit days
        const dailyRate = config.DAILY_RATE || 5; // Default to 5 KES/day if not configured
        const amountNum = parseFloat(amount) || 0;

        // Convert USD to KES if needed
        const usdToKesRate = config.USD_TO_KES_RATE || 130.0;
        const amountInKes =
          currency === "USD" ? amountNum * usdToKesRate : amountNum;
        const creditDays = Math.floor(amountInKes / dailyRate) || 1; // At least 1 day

        const currentCredit = parseInt(userData.credit_balance || 0);
        const newCredit = currentCredit + creditDays;

        const now = new Date().toISOString();
        const monthKey = now.substring(0, 7);
        const monthly = userData.monthly_paid || {};
        const monthSpend = parseFloat(monthly[monthKey] || 0) + amountInKes;
        monthly[monthKey] = monthSpend;

        await userRef.update({
          credit_balance: newCredit,
          total_payments:
            parseFloat(userData.total_payments || 0) + amountInKes,
          monthly_paid: monthly,
          last_payment_date: now,
          updated_at: now,
        });

        // Update payment record
        const paymentId = referenceCode || `UC_${Date.now()}`;
        await db.ref(`payments/${userId}/${paymentId}`).update({
          status: "completed",
          transaction_id: transactionId,
          credit_days_added: creditDays,
          completed_at: now,
          updated_at: now,
        });

        console.log(
          `[UNIFIED_CHECKOUT_CHARGE] ✅ Credits added: user_id=${userId}, amount=${amountInKes} KES, credit_days=${creditDays}, new_credit=${newCredit}`
        );

        // Add credit_days to response
        if (result.data) {
          result.data.credit_days = creditDays;
        }
      } catch (creditError) {
        console.error(
          `[UNIFIED_CHECKOUT_CHARGE] ⚠️ Failed to add credits: ${creditError.message}`
        );
        // Don't fail the request if credit addition fails - payment was successful
      }
    }

    res.status(result.response?.status || 200).json(result.data);
  } catch (err) {
    const status = err.response?.status || 500;
    logJson("UNIFIED_CHECKOUT_CHARGE_ERROR", {
      status,
      message: err.error || err.message,
      responseBody: err.response?.text,
    });
    res.status(status).json({
      error: err.error || err.message || "Unified Checkout charge failed",
      responseBody: err.response?.text,
    });
  }
});

// Add credits endpoint for payments already processed by complete()
app.post("/api/unified-checkout/add-credits", requireAuth, async (req, res) => {
  try {
    const {
      amount,
      currency,
      transactionId,
      referenceCode,
      completeResponse, // The complete() response JWT
    } = req.body || {};

    logJson("UNIFIED_CHECKOUT_ADD_CREDITS_REQUEST", {
      amount,
      currency,
      transactionId,
      referenceCode,
      hasCompleteResponse: !!completeResponse,
    });

    if (!amount || !currency || !transactionId) {
      return res.status(400).json({
        error: "amount, currency, and transactionId are required",
      });
    }

    const userId = req.userId; // Set by requireAuth middleware

    try {
      console.log(
        `[UNIFIED_CHECKOUT_ADD_CREDITS] ✅ Adding credits for payment already processed by complete() - user: ${userId}, transactionId: ${transactionId}`
      );

      const userRef = db.ref(`registeredUser/${userId}`);
      const userSnapshot = await userRef.once("value");
      const userData = userSnapshot.val() || {};

      // Calculate credit days
      const dailyRate = config.DAILY_RATE || 5;
      const amountNum = parseFloat(amount) || 0;
      const usdToKesRate = config.USD_TO_KES_RATE || 130.0;
      const amountInKes =
        currency === "USD" ? amountNum * usdToKesRate : amountNum;
      const creditDays = Math.floor(amountInKes / dailyRate) || 1;

      const currentCredit = parseInt(userData.credit_balance || 0);
      const newCredit = currentCredit + creditDays;

      const now = new Date().toISOString();
      const monthKey = now.substring(0, 7);
      const monthly = userData.monthly_paid || {};
      const monthSpend = parseFloat(monthly[monthKey] || 0) + amountInKes;
      monthly[monthKey] = monthSpend;

      await userRef.update({
        credit_balance: newCredit,
        total_payments: parseFloat(userData.total_payments || 0) + amountInKes,
        monthly_paid: monthly,
        last_payment_date: now,
        updated_at: now,
      });

      // Update payment record
      const paymentId = referenceCode || `UC_${Date.now()}`;
      await db.ref(`payments/${userId}/${paymentId}`).update({
        status: "completed",
        transaction_id: transactionId,
        credit_days_added: creditDays,
        completed_at: now,
        updated_at: now,
        payment_method: "unified_checkout_complete",
      });

      console.log(
        `[UNIFIED_CHECKOUT_ADD_CREDITS] ✅ Credits added: user_id=${userId}, amount=${amountInKes} KES, credit_days=${creditDays}, new_credit=${newCredit}`
      );

      res.status(200).json({
        success: true,
        credit_days: creditDays,
        new_credit_balance: newCredit,
        transaction_id: transactionId,
      });
    } catch (creditError) {
      console.error(
        `[UNIFIED_CHECKOUT_ADD_CREDITS] ⚠️ Failed to add credits: ${creditError.message}`
      );
      res.status(500).json({
        error: "Failed to add credits",
        message: creditError.message,
      });
    }
  } catch (err) {
    const status = err.response?.status || 500;
    logJson("UNIFIED_CHECKOUT_ADD_CREDITS_ERROR", {
      status,
      message: err.error || err.message,
    });
    res.status(status).json({
      error: err.error || err.message || "Failed to add credits",
    });
  }
});

app.post("/api/googlepay/charge", requireAuth, async (req, res) => {
  try {
    const {
      transientToken,
      googlePayBlob,
      amount,
      currency,
      referenceCode,
      billingInfo,
    } = req.body || {};
    logJson("GPAY_CHARGE_REQUEST", {
      transientToken,
      googlePayBlobLen: googlePayBlob ? String(googlePayBlob).length : 0,
      amount,
      currency,
      referenceCode,
      billingInfo,
    });
    if (!amount || !currency || (!transientToken && !googlePayBlob)) {
      logJson("GPAY_CHARGE_ERROR", {
        status: 400,
        error:
          "Missing required google pay charge fields (googlePayBlob or transientToken)",
      });
      return res.status(400).json({
        error:
          "googlePayBlob or transientToken, plus amount and currency, are required",
      });
    }

    let result;
    if (googlePayBlob) {
      logJson("GPAY_CHARGE_MODE", {
        mode: "blob",
        googlePayBlobLen: String(googlePayBlob).length,
      });
      result = await createGooglePayPaymentFromBlob({
        googlePayBlob,
        amount,
        currency,
        referenceCode,
        billingInfo,
      });
    } else {
      logJson("GPAY_CHARGE_MODE", { mode: "transientToken" });
      result = await chargeGooglePayToken({
        transientToken,
        amount,
        currency,
        referenceCode,
        billingInfo,
      });
    }

    logJson("GPAY_CHARGE_RESPONSE", result?.data || {});

    // Add credits to user account if payment was successful
    const status = result?.data?.status;
    const transactionId = result?.data?.id;
    const userId = req.userId; // Set by requireAuth middleware

    if (
      (status === "AUTHORIZED" || status === "CAPTURED") &&
      userId &&
      transactionId
    ) {
      try {
        console.log(
          `[GPAY_CHARGE] ✅ Payment successful, adding credits for user: ${userId}`
        );

        const userRef = db.ref(`registeredUser/${userId}`);
        const userSnapshot = await userRef.once("value");
        const userData = userSnapshot.val() || {};

        // Calculate credit days
        const dailyRate = config.DAILY_RATE || 5;
        const amountNum = parseFloat(amount) || 0;
        const usdToKesRate = config.USD_TO_KES_RATE || 130.0;
        const amountInKes =
          currency === "USD" ? amountNum * usdToKesRate : amountNum;
        const creditDays = Math.floor(amountInKes / dailyRate) || 1;

        const currentCredit = parseInt(userData.credit_balance || 0);
        const newCredit = currentCredit + creditDays;

        const now = new Date().toISOString();
        const monthKey = now.substring(0, 7);
        const monthly = userData.monthly_paid || {};
        const monthSpend = parseFloat(monthly[monthKey] || 0) + amountInKes;
        monthly[monthKey] = monthSpend;

        await userRef.update({
          credit_balance: newCredit,
          total_payments:
            parseFloat(userData.total_payments || 0) + amountInKes,
          monthly_paid: monthly,
          last_payment_date: now,
          updated_at: now,
        });

        const paymentId = referenceCode || `GPay_${Date.now()}`;
        await db.ref(`payments/${userId}/${paymentId}`).update({
          status: "completed",
          transaction_id: transactionId,
          credit_days_added: creditDays,
          completed_at: now,
          updated_at: now,
        });

        console.log(
          `[GPAY_CHARGE] ✅ Credits added: user_id=${userId}, amount=${amountInKes} KES, credit_days=${creditDays}, new_credit=${newCredit}`
        );

        if (result.data) {
          result.data.credit_days = creditDays;
        }
      } catch (creditError) {
        console.error(
          `[GPAY_CHARGE] ⚠️ Failed to add credits: ${creditError.message}`
        );
      }
    }

    res.status(result.response?.status || 200).json(result.data);
  } catch (err) {
    const status = err.response?.status || 500;
    logJson("GPAY_CHARGE_ERROR", {
      status,
      message: err.error || err.message,
      responseBody: err.response?.text,
    });

    // Parse error message for better user feedback
    let errorMessage = err.error || err.message || "Google Pay charge failed";
    if (err.response?.text) {
      try {
        const errorJson = JSON.parse(err.response.text);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch (e) {
        // If parsing fails, try to extract error from text
        const invalidAccountMatch =
          err.response.text.match(/invalid.*account/i);
        if (invalidAccountMatch) {
          errorMessage =
            "Invalid account number. Please check your payment method.";
        }
      }
    }

    res.status(status).json({
      error: errorMessage,
      responseBody: err.response?.text,
    });
  }
});

/**
 * Search for transactions by reference code.
 * POST /api/transactions/search
 */
app.post("/api/transactions/search", async (req, res) => {
  const startTime = Date.now();
  console.log(
    "[API] POST /api/transactions/search - Transaction search request received"
  );

  try {
    const { referenceCode, limit } = req.body || {};

    console.log("[API] Request validation...");
    if (!referenceCode) {
      console.log("[API] ❌ Request validation failed: Missing referenceCode");
      return res.status(400).json({
        error: "referenceCode is required",
      });
    }
    console.log("[API] ✅ Request validated");

    logJson("TX_SEARCH_REQUEST", {
      referenceCode,
      limit: limit || 10,
    });

    console.log("[API] Calling searchTransactionsByReference...");
    const result = await searchTransactionsByReference({
      referenceCode,
      limit: limit || 10,
    });

    const duration = Date.now() - startTime;
    console.log(`[API] ✅ Search completed in ${duration}ms`);
    console.log(`[API] Found ${result.count || 0} transaction(s)`);

    logJson("TX_SEARCH_RESPONSE", {
      count: result.count || 0,
      transactions: result.transactions || [],
    });

    res.status(200).json(result);
  } catch (err) {
    const duration = Date.now() - startTime;
    const status = err.response?.status || 500;
    console.log(`[API] ❌ Search failed after ${duration}ms`);
    console.log(`[API] Error Status: ${status}`);
    console.log(
      `[API] Error Message: ${err.error || err.message || "Unknown error"}`
    );

    logJson("TX_SEARCH_ERROR", {
      status,
      message: err.error || err.message,
      responseBody: err.response?.text,
    });

    res.status(status).json({
      error: err.error || err.message || "Transaction search failed",
      responseBody: err.response?.text,
    });
  }
});

app.use((err, _req, res, _next) => {
  console.error("Unexpected error", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(
    `KileKitabu Backend (Node.js) running on http://localhost:${PORT}`
  );
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});
