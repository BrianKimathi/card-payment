"use strict";

const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const { db } = require("./src/firebaseService");
const config = require("./src/config");
const { requireAuth } = require("./src/authMiddleware");
const PaystackService = require("./src/paystackService");

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
      /^https:\/\/.*\.tiankainvestmentsltd\.com$/, // Allow custom domain and subdomains
      "https://tiankainvestmentsltd.com",
      "https://www.tiankainvestmentsltd.com",
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

// Initialize payment services
const paystackService = new PaystackService(config);

app.use("/api/mpesa", mpesaRoutes);
app.use("/api", subscriptionRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/cron", cronRoutes);

// Paystack Card Payment Endpoint
app.post("/api/cards/pay", requireAuth, async (req, res) => {
  const startTime = Date.now();
  console.log("[API] POST /api/cards/pay - Paystack card payment request received");

  try {
    const {
      amount,
      currency = "NGN", // Paystack defaults to NGN, but can handle other currencies
      card,
      email,
      referenceCode,
      metadata,
    } = req.body || {};

    console.log("[API] Request validation...");
    if (
      !amount ||
      !card?.number ||
      !card?.cvv ||
      !card?.expirationMonth ||
      !card?.expirationYear ||
      !email
    ) {
      console.log("[API] ❌ Validation failed: Missing required fields");
      return res.status(400).json({
        error: "Missing required fields: amount, card details (number, cvv, expiry), email"
      });
    }

    // Validate currency (Paystack supports NGN, USD, GHS, ZAR, KES)
    const supportedCurrencies = ["NGN", "USD", "GHS", "ZAR", "KES"];
    if (!supportedCurrencies.includes(currency.toUpperCase())) {
      console.log(`[API] ❌ Unsupported currency: ${currency}`);
      return res.status(400).json({
        error: `Unsupported currency: ${currency}. Paystack supports: ${supportedCurrencies.join(", ")}`
      });
    }

    console.log("[API] ✅ Request validated");
    console.log(`[API] Amount: ${amount} ${currency}`);
    console.log(`[API] Email: ${email}`);
    console.log(`[API] Card: ****${card.number.slice(-4)}`);

    // Generate reference if not provided
    const reference = referenceCode || `CARD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Prepare metadata
    const paymentMetadata = {
      userId: req.userId,
      paymentType: "card",
      ...metadata,
    };

    console.log("[API] 💳 Processing card payment with Paystack...");

    const result = await paystackService.chargeCard({
      amount: parseFloat(amount),
      currency: currency.toUpperCase(),
      email,
      card,
      reference,
      metadata: paymentMetadata,
    });

    const duration = Date.now() - startTime;

    if (result.success) {
      console.log(`[API] ✅ Card charge initiated in ${duration}ms`);
      console.log(`[API] Reference: ${result.data.reference}`);
      console.log(`[API] Status: ${result.data.status}`);

      // Check if payment requires additional action
      if (result.data.status === "send_pin") {
        console.log("[API] 📌 PIN required for card verification");
        return res.json({
          success: true,
          status: "pin_required",
          reference: result.data.reference,
          message: "Please provide your card PIN to complete the transaction",
        });
      }

      if (result.data.status === "send_otp") {
        console.log("[API] 📌 OTP required for card verification");
        return res.json({
          success: true,
          status: "otp_required",
          reference: result.data.reference,
          message: "Please provide the OTP sent to your phone to complete the transaction",
        });
      }

      if (result.data.status === "send_phone") {
        console.log("[API] 📌 Phone number required for card verification");
        return res.json({
          success: true,
          status: "phone_required",
          reference: result.data.reference,
          message: "Please provide your phone number to complete the transaction",
        });
      }

      // Payment completed successfully
      if (result.data.status === "success") {
        console.log("[API] ✅ Payment completed successfully");

        // Add credits to user account if payment was successful
        if (req.userId && result.data.amount) {
          try {
            const userRef = db.ref(`registeredUser/${req.userId}`);
            const userSnapshot = await userRef.once("value");
            const userData = userSnapshot.val() || {};

            // Calculate credit days (assuming 100 NGN = 1 day, adjust as needed)
            const dailyRate = config.DAILY_RATE || 5; // KES per day
            const usdToKesRate = config.USD_TO_KES_RATE || 130.0;

            // Convert Paystack amount (kobo) back to base currency amount
            const amountInBaseCurrency = result.data.amount / 100;
            let amountInKes;

            if (currency.toUpperCase() === "KES") {
              amountInKes = amountInBaseCurrency;
            } else if (currency.toUpperCase() === "USD") {
              amountInKes = amountInBaseCurrency * usdToKesRate;
            } else {
              // For other currencies, approximate conversion (this should be improved)
              amountInKes = amountInBaseCurrency * 0.15; // Rough approximation
            }

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
            await db.ref(`payments/${req.userId}/${reference}`).set({
              status: "completed",
              transaction_id: result.data.id,
              reference: result.data.reference,
              amount: amountInBaseCurrency,
              currency: currency.toUpperCase(),
              credit_days_added: creditDays,
              payment_method: "paystack_card",
              completed_at: now,
              updated_at: now,
            });

            console.log(`[API] ✅ Credits added: user=${req.userId}, days=${creditDays}, new_balance=${newCredit}`);

            return res.json({
              success: true,
              status: "completed",
              reference: result.data.reference,
              transaction_id: result.data.id,
              credit_days_added: creditDays,
              new_credit_balance: newCredit,
            });
          } catch (creditError) {
            console.error("[API] ⚠️ Failed to add credits:", creditError.message);
            // Still return success for the payment, but log the credit addition failure
          }
        }

        return res.json({
          success: true,
          status: "completed",
          reference: result.data.reference,
          transaction_id: result.data.id,
        });
      }

      // Payment is still processing
      return res.json({
        success: true,
        status: result.data.status,
        reference: result.data.reference,
        message: "Payment is being processed",
      });

    } else {
      console.log(`[API] ❌ Card charge failed in ${duration}ms`);
      console.log(`[API] Error: ${result.error}`);

      return res.status(400).json({
        error: result.error || "Card payment failed",
      });
    }

  } catch (err) {
    const duration = Date.now() - startTime;
    const status = err.response?.status || 500;
    console.log(`[API] ❌ Payment failed after ${duration}ms`);
    console.log(`[API] Error Status: ${status}`);
    console.log(`[API] Error: ${err.message || "Unknown error"}`);

    res.status(status).json({
      error: err.message || "Card payment failed",
      responseBody: err.response?.data,
    });
  }
});

// Paystack Transaction Initialization Endpoint
app.post("/api/paystack/initialize", requireAuth, async (req, res) => {
  const startTime = Date.now();
  console.log("[API] POST /api/paystack/initialize - Paystack transaction initialization request");

  if (!paystackService) {
    return res.status(500).json({ 
      success: false,
      error: "Paystack service not configured" 
    });
  }

  try {
    const {
      amount,
      email,
      currency = "USD",
      reference,
      metadata,
    } = req.body || {};

    console.log("[API] Request validation...");
    if (!amount || !email) {
      console.log("[API] ❌ Validation failed: Missing required fields");
      return res.status(400).json({
        success: false,
        error: "Missing required fields: amount, email"
      });
    }

    // Validate currency
    const supportedCurrencies = ["NGN", "USD", "GHS", "ZAR", "KES"];
    if (!supportedCurrencies.includes(currency.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: `Unsupported currency: ${currency}. Paystack supports: ${supportedCurrencies.join(", ")}`
      });
    }

    console.log("[API] ✅ Request validated");
    console.log(`[API] Amount: ${amount} ${currency}`);
    console.log(`[API] Email: ${email}`);

    // Generate reference if not provided
    const transactionReference = reference || `PAYSTACK_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Prepare metadata
    const paymentMetadata = {
      userId: req.userId,
      paymentType: "paystack_card",
      ...metadata,
    };

    console.log("[API] 💳 Initializing Paystack transaction...");

    const result = await paystackService.initializeTransaction({
      amount: parseFloat(amount),
      email,
      currency: currency.toUpperCase(),
      reference: transactionReference,
      metadata: paymentMetadata,
    });

    const duration = Date.now() - startTime;

    if (result.success && result.data) {
      console.log(`[API] ✅ Transaction initialized in ${duration}ms`);
      console.log(`[API] Access Code: ${result.data.access_code}`);
      console.log(`[API] Reference: ${result.data.reference}`);

      res.status(200).json({
        success: true,
        access_code: result.data.access_code,
        reference: result.data.reference,
        authorization_url: result.data.authorization_url,
      });
    } else {
      console.log(`[API] ❌ Transaction initialization failed after ${duration}ms`);
      console.log(`[API] Error: ${result.error}`);

      res.status(400).json({
        success: false,
        error: result.error || "Transaction initialization failed",
        message: result.message || "Failed to initialize Paystack transaction",
      });
    }
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[API] ❌ Exception after ${duration}ms:`, err);
    res.status(500).json({
      success: false,
      error: err.message || "Internal server error",
    });
  }
});

// Paystack PIN Submission Endpoint
app.post("/api/cards/submit-pin", requireAuth, async (req, res) => {
  const startTime = Date.now();
  console.log("[API] POST /api/cards/submit-pin - PIN submission request received");

  try {
    const { pin, reference } = req.body || {};

    if (!pin || !reference) {
      return res.status(400).json({
        error: "PIN and reference are required"
      });
    }

    console.log(`[API] Submitting PIN for reference: ${reference}`);

    const result = await paystackService.submitPin({ pin, reference });

    const duration = Date.now() - startTime;

    if (result.success) {
      console.log(`[API] ✅ PIN submitted successfully in ${duration}ms`);

      // Check if further action is needed
      if (result.data.status === "send_otp") {
        return res.json({
          success: true,
          status: "otp_required",
          reference: result.data.reference,
          message: "PIN accepted. Please provide the OTP sent to your phone.",
        });
      }

      if (result.data.status === "success") {
        return res.json({
          success: true,
          status: "completed",
          reference: result.data.reference,
          transaction_id: result.data.id,
        });
      }

      return res.json({
        success: true,
        status: result.data.status,
        reference: result.data.reference,
      });
    } else {
      console.log(`[API] ❌ PIN submission failed in ${duration}ms: ${result.error}`);
      return res.status(400).json({
        error: result.error || "PIN submission failed",
      });
    }
  } catch (err) {
    const duration = Date.now() - startTime;
    console.log(`[API] ❌ PIN submission error after ${duration}ms: ${err.message}`);
    res.status(500).json({
      error: err.message || "PIN submission failed",
    });
  }
});

// Paystack OTP Submission Endpoint
app.post("/api/cards/submit-otp", requireAuth, async (req, res) => {
  const startTime = Date.now();
  console.log("[API] POST /api/cards/submit-otp - OTP submission request received");

  try {
    const { otp, reference } = req.body || {};

    if (!otp || !reference) {
      return res.status(400).json({
        error: "OTP and reference are required"
      });
    }

    console.log(`[API] Submitting OTP for reference: ${reference}`);

    const result = await paystackService.submitOtp({ otp, reference });

    const duration = Date.now() - startTime;

    if (result.success && result.data.status === "success") {
      console.log(`[API] ✅ OTP submitted successfully in ${duration}ms`);

      return res.json({
        success: true,
        status: "completed",
        reference: result.data.reference,
        transaction_id: result.data.id,
      });
    } else {
      console.log(`[API] ❌ OTP submission failed in ${duration}ms: ${result.error}`);
      return res.status(400).json({
        error: result.error || "OTP submission failed",
      });
    }
  } catch (err) {
    const duration = Date.now() - startTime;
    console.log(`[API] ❌ OTP submission error after ${duration}ms: ${err.message}`);
    res.status(500).json({
      error: err.message || "OTP submission failed",
    });
  }
});

// Paystack Phone Submission Endpoint
app.post("/api/cards/submit-phone", requireAuth, async (req, res) => {
  const startTime = Date.now();
  console.log("[API] POST /api/cards/submit-phone - Phone submission request received");

  try {
    const { phone, reference } = req.body || {};

    if (!phone || !reference) {
      return res.status(400).json({
        error: "Phone number and reference are required"
      });
    }

    console.log(`[API] Submitting phone for reference: ${reference}`);

    const result = await paystackService.submitPhone({ phone, reference });

    const duration = Date.now() - startTime;

    if (result.success) {
      console.log(`[API] ✅ Phone submitted successfully in ${duration}ms`);

      // Check if further action is needed
      if (result.data.status === "send_otp") {
        return res.json({
          success: true,
          status: "otp_required",
          reference: result.data.reference,
          message: "Phone number accepted. Please provide the OTP sent to your phone.",
        });
      }

      if (result.data.status === "success") {
        return res.json({
          success: true,
          status: "completed",
          reference: result.data.reference,
          transaction_id: result.data.id,
        });
      }

      return res.json({
        success: true,
        status: result.data.status,
        reference: result.data.reference,
      });
    } else {
      console.log(`[API] ❌ Phone submission failed in ${duration}ms: ${result.error}`);
      return res.status(400).json({
        error: result.error || "Phone submission failed",
      });
    }
  } catch (err) {
    const duration = Date.now() - startTime;
    console.log(`[API] ❌ Phone submission error after ${duration}ms: ${err.message}`);
    res.status(500).json({
      error: err.message || "Phone submission failed",
    });
  }
});

// Paystack Webhook Endpoint (no auth required for webhooks)
// According to Paystack docs: https://paystack.com/docs/payments/webhooks/
app.post("/api/paystack/webhook", async (req, res) => {
  // Return 200 OK immediately to acknowledge receipt (prevents retries)
  // Process long-running tasks asynchronously after responding
  res.status(200).send('Webhook received');

  try {
    const signature = req.headers['x-paystack-signature'];
    const payload = JSON.stringify(req.body);

    // Verify webhook signature
    // Use PAYSTACK_WEBHOOK_SECRET if set, otherwise fall back to PAYSTACK_SECRET_KEY
    const secretKey = config.PAYSTACK_WEBHOOK_SECRET || config.PAYSTACK_SECRET_KEY;

    if (secretKey && signature) {
      const expectedSignature = require('crypto')
        .createHmac('sha512', secretKey)
        .update(payload)
        .digest('hex');

      if (signature !== expectedSignature) {
        console.log('[WEBHOOK] ❌ Invalid signature - potential security threat');
        return; // Already sent 200, just log and exit
      }
      console.log('[WEBHOOK] ✅ Signature verified');
    } else if (!signature) {
      console.log('[WEBHOOK] ⚠️ No signature header - webhook may not be from Paystack');
    }

    const { event, data } = req.body;

    console.log(`[WEBHOOK] Received event: ${event}`);
    console.log(`[WEBHOOK] Event data:`, JSON.stringify(data, null, 2));

    // Process events asynchronously (after 200 OK response)
    setImmediate(async () => {
      try {
        switch (event) {
          case 'charge.success':
            console.log(`[WEBHOOK] ✅ Charge successful: ${data.reference}`);
            console.log(`[WEBHOOK] Amount: ${data.amount / 100} ${data.currency}`);
            console.log(`[WEBHOOK] Customer: ${data.customer?.email || 'N/A'}`);
            
            // Extract userId from metadata
            const userId = data.metadata?.userId;
            if (!userId) {
              console.log(`[WEBHOOK] ⚠️ No userId in metadata, skipping credit addition`);
              break;
            }

            try {
              // Check if payment was already processed (idempotency check)
              const paymentRef = db.ref(`payments/${userId}/${data.reference}`);
              const paymentSnapshot = await paymentRef.once("value");
              const existingPayment = paymentSnapshot.val();
              
              if (existingPayment && existingPayment.status === "completed") {
                console.log(`[WEBHOOK] ℹ️ Payment ${data.reference} already processed, skipping credit addition`);
                break;
              }

              const userRef = db.ref(`registeredUser/${userId}`);
              const userSnapshot = await userRef.once("value");
              const userData = userSnapshot.val() || {};

              // Calculate credit days
              const dailyRate = config.DAILY_RATE || 5;
              const usdToKesRate = config.USD_TO_KES_RATE || 130.0;

              // Amount is in kobo/cents, convert to base currency
              const amountInBaseCurrency = data.amount / 100;
              let amountInKes;

              if (data.currency.toUpperCase() === "KES") {
                amountInKes = amountInBaseCurrency;
              } else if (data.currency.toUpperCase() === "USD") {
                amountInKes = amountInBaseCurrency * usdToKesRate;
              } else {
                // Default conversion for other currencies (approximate)
                amountInKes = amountInBaseCurrency * 0.15;
              }

              const creditDays = Math.floor(amountInKes / dailyRate) || 1;
              const currentCredit = parseInt(userData.credit_balance || 0);
              const newCredit = currentCredit + creditDays;

              const now = new Date().toISOString();
              const monthKey = now.substring(0, 7);
              const monthly = userData.monthly_paid || {};
              const monthSpend = parseFloat(monthly[monthKey] || 0) + amountInKes;
              monthly[monthKey] = monthSpend;

              // Update user credits
              await userRef.update({
                credit_balance: newCredit,
                total_payments: parseFloat(userData.total_payments || 0) + amountInKes,
                monthly_paid: monthly,
                last_payment_date: now,
                updated_at: now,
              });

              // Update payment record
              await db.ref(`payments/${userId}/${data.reference}`).set({
                status: "completed",
                transaction_id: data.id,
                reference: data.reference,
                amount: amountInBaseCurrency,
                currency: data.currency.toUpperCase(),
                credit_days_added: creditDays,
                payment_method: "paystack_card",
                completed_at: now,
                updated_at: now,
                source: "webhook",
              });

              console.log(`[WEBHOOK] ✅ Credits added: user=${userId}, amount=${amountInKes} KES, credit_days=${creditDays}, new_balance=${newCredit}`);
            } catch (creditError) {
              console.error(`[WEBHOOK] ❌ Failed to add credits:`, creditError.message);
              console.error(`[WEBHOOK] Stack trace:`, creditError.stack);
            }
            break;

          case 'charge.dispute.create':
            console.log(`[WEBHOOK] ⚠️ Dispute created: ${data.reference}`);
            // Handle dispute creation
            break;

          case 'refund.processed':
            console.log(`[WEBHOOK] 💰 Refund processed: ${data.reference}`);
            
            // Extract userId from metadata
            const refundUserId = data.metadata?.userId;
            if (!refundUserId) {
              console.log(`[WEBHOOK] ⚠️ No userId in refund metadata, skipping credit reversal`);
              break;
            }

            try {
              const userRef = db.ref(`registeredUser/${refundUserId}`);
              const userSnapshot = await userRef.once("value");
              const userData = userSnapshot.val() || {};

              // Calculate credit days to reverse
              const dailyRate = config.DAILY_RATE || 5;
              const usdToKesRate = config.USD_TO_KES_RATE || 130.0;

              // Amount is in kobo/cents, convert to base currency
              const refundAmountInBaseCurrency = data.amount / 100;
              let refundAmountInKes;

              if (data.currency.toUpperCase() === "KES") {
                refundAmountInKes = refundAmountInBaseCurrency;
              } else if (data.currency.toUpperCase() === "USD") {
                refundAmountInKes = refundAmountInBaseCurrency * usdToKesRate;
              } else {
                refundAmountInKes = refundAmountInBaseCurrency * 0.15;
              }

              const creditDaysToReverse = Math.floor(refundAmountInKes / dailyRate) || 1;
              const currentCredit = parseInt(userData.credit_balance || 0);
              const newCredit = Math.max(0, currentCredit - creditDaysToReverse); // Don't go below 0

              const now = new Date().toISOString();

              // Update user credits (reverse)
              await userRef.update({
                credit_balance: newCredit,
                updated_at: now,
              });

              // Update payment record
              await db.ref(`payments/${refundUserId}/${data.reference}`).update({
                status: "refunded",
                refunded_at: now,
                credit_days_reversed: creditDaysToReverse,
                updated_at: now,
              });

              console.log(`[WEBHOOK] ✅ Credits reversed: user=${refundUserId}, amount=${refundAmountInKes} KES, credit_days_reversed=${creditDaysToReverse}, new_balance=${newCredit}`);
            } catch (refundError) {
              console.error(`[WEBHOOK] ❌ Failed to reverse credits:`, refundError.message);
            }
            break;

          case 'transfer.success':
            console.log(`[WEBHOOK] ✅ Transfer successful: ${data.reference}`);
            break;

          case 'transfer.failed':
            console.log(`[WEBHOOK] ❌ Transfer failed: ${data.reference}`);
            break;

          default:
            console.log(`[WEBHOOK] ℹ️ Unhandled event type: ${event}`);
        }
      } catch (processingError) {
        console.error('[WEBHOOK] Error processing event:', processingError.message);
      }
    });
  } catch (err) {
    console.error('[WEBHOOK] Error processing webhook:', err.message);
    // Already sent 200 OK, so just log the error
  }
});

// Paystack Transaction Verification Endpoint
app.get("/api/cards/verify/:reference", requireAuth, async (req, res) => {
  const startTime = Date.now();
  const { reference } = req.params;

  console.log(`[API] GET /api/cards/verify/${reference} - Transaction verification request received`);

  try {
    const result = await paystackService.verifyTransaction(reference);

    const duration = Date.now() - startTime;

    if (result.success) {
      console.log(`[API] ✅ Transaction verified in ${duration}ms`);
      console.log(`[API] Status: ${result.data.status}`);

      return res.json({
        success: true,
        transaction: result.data,
      });
    } else {
      console.log(`[API] ❌ Transaction verification failed in ${duration}ms: ${result.error}`);
      return res.status(400).json({
        error: result.error || "Transaction verification failed",
      });
    }
  } catch (err) {
    const duration = Date.now() - startTime;
    console.log(`[API] ❌ Verification error after ${duration}ms: ${err.message}`);
    res.status(500).json({
      error: err.message || "Transaction verification failed",
    });
  }
});



// Error handling middleware
app.use((err, _req, res, _next) => {
  console.error("Unexpected error", err);
  res.status(500).json({ error: "Internal server error" });
});

// Only start server if not running in Cloud Functions/Cloud Run
// Cloud Functions/Cloud Run will handle the server automatically
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(
      `KileKitabu Backend (Node.js) running on http://localhost:${PORT}`
    );
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  });
}

// Export app for Cloud Functions/Cloud Run
module.exports = app;
