"use strict";

const express = require("express");
const router = express.Router();
const { requireAuth } = require("../src/authMiddleware");
const MpesaClient = require("../src/mpesaService");
const { db } = require("../src/firebaseService");
const config = require("../src/config");
const { v4: uuidv4 } = require("uuid");

// Initialize M-Pesa client
let mpesaClient = null;
if (
  config.MPESA_CONSUMER_KEY &&
  config.MPESA_CONSUMER_SECRET &&
  config.MPESA_SHORT_CODE &&
  config.MPESA_PASSKEY
) {
  mpesaClient = new MpesaClient({
    consumerKey: config.MPESA_CONSUMER_KEY,
    consumerSecret: config.MPESA_CONSUMER_SECRET,
    shortCode: config.MPESA_SHORT_CODE,
    tillNumber: config.MPESA_TILL_NUMBER || config.MPESA_SHORT_CODE,
    passkey: config.MPESA_PASSKEY,
    callbackUrl: config.MPESA_CALLBACK_URL,
    env: config.MPESA_ENV,
  });
  console.log("✅ M-Pesa client initialized");
} else {
  console.log("❌ M-Pesa not configured - missing credentials");
}

/**
 * Format phone number to E.164 format
 */
function formatPhoneNumber(phone) {
  if (!phone) return null;

  const cleaned = phone.trim().replace(/[\s\-+]/g, "");

  if (cleaned.startsWith("+2547") && cleaned.length === 13) {
    return cleaned.substring(1);
  }
  if (cleaned.startsWith("+2541") && cleaned.length === 13) {
    return cleaned.substring(1);
  }
  if (cleaned.startsWith("2547") && cleaned.length === 12) {
    return cleaned;
  }
  if (cleaned.startsWith("2541") && cleaned.length === 12) {
    return cleaned;
  }
  if (cleaned.startsWith("07") && cleaned.length === 10) {
    return `254${cleaned.substring(1)}`;
  }
  if (cleaned.startsWith("01") && cleaned.length === 10) {
    return `254${cleaned.substring(1)}`;
  }

  return null;
}

/**
 * POST /api/mpesa/initiate
 * Initiate M-Pesa STK Push payment
 */
router.post("/initiate", requireAuth, async (req, res) => {
  try {
    console.log("[mpesa_initiate] ========== M-Pesa Payment Initiation ==========");
    console.log(`[mpesa_initiate] Timestamp: ${new Date().toISOString()}`);
    console.log(`[mpesa_initiate] Request method: ${req.method}`);
    console.log(`[mpesa_initiate] Request URL: ${req.url}`);

    if (!mpesaClient) {
      console.log("[mpesa_initiate] ❌ M-Pesa not configured");
      return res.status(503).json({ error: "M-Pesa not configured" });
    }

    if (!db) {
      console.log("[mpesa_initiate] ❌ Database not available");
      return res.status(503).json({ error: "Database unavailable" });
    }

    const { amount, phone: phoneRaw } = req.body;
    const userId = req.userId;

    console.log(`[mpesa_initiate] User ID: ${userId}`);
    console.log(`[mpesa_initiate] Amount (raw): ${amount}`);
    console.log(`[mpesa_initiate] Phone (raw): ${phoneRaw}`);

    const amountFloat = parseFloat(amount);
    if (isNaN(amountFloat) || amountFloat < config.VALIDATION_RULES.min_amount) {
      return res.status(400).json({
        error: `Minimum amount is KES ${config.VALIDATION_RULES.min_amount}`,
      });
    }

    const phone = formatPhoneNumber(phoneRaw);
    if (!phone) {
      return res.status(400).json({
        error: "Invalid phone number. Must start with +254, 254, 07, or 01",
      });
    }

    console.log(`[mpesa_initiate] Formatted phone: ${phone}`);

    // Create payment record
    const paymentId = uuidv4();
    const creditDays = Math.floor(amountFloat / config.DAILY_RATE);
    const now = new Date().toISOString();
    const monthKey = new Date().toISOString().substring(0, 7); // YYYY-MM

    const paymentInfo = {
      payment_id: paymentId,
      user_id: userId,
      amount: amountFloat,
      credit_days: creditDays,
      status: "pending",
      provider: "mpesa",
      created_at: now,
      phone_e164: phone,
      month_key: monthKey,
    };

    await db.ref(`payments/${paymentId}`).set(paymentInfo);
    console.log(
      `[mpesa_initiate] Payment created: id=${paymentId}, credit_days=${creditDays}`
    );

    // Fire STK push
    const description = "KileKitabu Credits";
    console.log("[mpesa_initiate] ========== Calling M-Pesa STK Push ==========");
    const result = await mpesaClient.initiateStkPush(
      amountFloat,
      phone,
      paymentId,
      description
    );

    console.log("[mpesa_initiate] ========== M-Pesa STK Push Response ==========");
    console.log(`[mpesa_initiate] Result ok: ${result.ok}`);

    if (!result.ok) {
      console.log(`[mpesa_initiate] ❌ STK Push failed: ${result.error}`);
      return res.status(500).json({
        error: "Failed to initiate M-Pesa",
        details: result,
      });
    }

    // Store CheckoutRequestID for callback matching
    const checkoutRequestId = result.response?.CheckoutRequestID;
    if (checkoutRequestId) {
      console.log(`[mpesa_initiate] ✅ CheckoutRequestID: ${checkoutRequestId}`);
      await db.ref(`payments/${paymentId}`).update({
        checkout_request_id: checkoutRequestId,
      });
    }

    return res.json({
      payment_id: paymentId,
      status: "pending",
      credit_days: creditDays,
      mpesa: result.response,
    });
  } catch (error) {
    console.error(`[mpesa_initiate] ERROR: ${error.message}`);
    console.error(error.stack);
    return res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * POST /api/mpesa/callback
 * Handle M-Pesa STK push callback
 */
router.post("/callback", async (req, res) => {
  try {
    console.log("[mpesa_callback] ========== M-Pesa Callback Received ==========");
    console.log(`[mpesa_callback] Timestamp: ${new Date().toISOString()}`);

    if (!db) {
      console.log("[mpesa_callback] ❌ Database not available");
      return res.status(503).json({ error: "Database unavailable" });
    }

    const payload = req.body || {};
    const body = payload.Body || {};
    const stk = body.stkCallback || {};

    const resultCode = stk.ResultCode;
    const resultDesc = stk.ResultDesc;
    const checkoutRequestId = stk.CheckoutRequestID;
    const callbackMetadata = stk.CallbackMetadata || {};
    const metadataItems = callbackMetadata.Item || [];

    console.log(`[mpesa_callback] ResultCode: ${resultCode}`);
    console.log(`[mpesa_callback] CheckoutRequestID: ${checkoutRequestId}`);

    // Extract metadata
    let amount = null;
    let paymentIdFromRef = null;
    let receiptNumber = null;

    for (const item of metadataItems) {
      if (item.Name === "Amount") {
        amount = parseFloat(item.Value) || 0;
      } else if (item.Name === "AccountReference") {
        paymentIdFromRef = item.Value;
      } else if (item.Name === "MpesaReceiptNumber") {
        receiptNumber = item.Value;
      }
    }

    // Find payment by CheckoutRequestID
    let payment = null;
    let paymentId = null;

    if (checkoutRequestId) {
      const paymentsSnapshot = await db.ref("payments").once("value");
      const allPayments = paymentsSnapshot.val() || {};
      for (const [pid, pdata] of Object.entries(allPayments)) {
        if (pdata.checkout_request_id === checkoutRequestId) {
          payment = pdata;
          paymentId = pid;
          break;
        }
      }
    }

    // Fallback: try AccountReference
    if (!payment && paymentIdFromRef) {
      const paymentRef = db.ref(`payments/${paymentIdFromRef}`);
      const snapshot = await paymentRef.once("value");
      payment = snapshot.val();
      paymentId = paymentIdFromRef;
    }

    if (!payment) {
      console.log(
        `[mpesa_callback] ❌ Payment not found - CheckoutRequestID: ${checkoutRequestId}, AccountReference: ${paymentIdFromRef}`
      );
      return res.json({ status: "ignored", reason: "payment_not_found" });
    }

    const userId = payment.user_id;

    // Check if already processed
    if (payment.status === "completed") {
      console.log(
        `[mpesa_callback] ⚠️ Payment already processed (status: ${payment.status})`
      );
      return res.json({ status: "ok", message: "already_processed" });
    }

    if (resultCode === 0 || resultCode === "0") {
      console.log(`[mpesa_callback] ✅ Payment successful`);

      const creditDays = payment.credit_days || Math.floor(payment.amount / config.DAILY_RATE);
      const paymentAmount = parseFloat(payment.amount || 0);

      // Update user credit
      const userRef = db.ref(`registeredUser/${userId}`);
      const userSnapshot = await userRef.once("value");
      const userData = userSnapshot.val() || {};

      const currentCredit = parseInt(userData.credit_balance || 0);
      const newCredit = currentCredit + creditDays;

      const now = new Date().toISOString();
      const monthKey = now.substring(0, 7);
      const monthly = userData.monthly_paid || {};
      const monthSpend = parseFloat(monthly[monthKey] || 0) + paymentAmount;
      monthly[monthKey] = monthSpend;

      await userRef.update({
        credit_balance: newCredit,
        total_payments: parseFloat(userData.total_payments || 0) + paymentAmount,
        monthly_paid: monthly,
        last_payment_date: now,
        updated_at: now,
      });

      // Mark payment complete
      await db.ref(`payments/${paymentId}`).update({
        status: "completed",
        provider_data: stk,
        completed_at: now,
        credit_days_added: creditDays,
      });

      console.log(
        `[mpesa_callback] ✅ Payment completed: user_id=${userId}, amount=${paymentAmount}, credit_days=${creditDays}, new_credit=${newCredit}`
      );

      return res.json({ status: "ok" });
    } else {
      console.log(`[mpesa_callback] ❌ Payment failed (ResultCode: ${resultCode})`);
      await db.ref(`payments/${paymentId}`).update({
        status: "failed",
        provider_data: stk,
        completed_at: new Date().toISOString(),
        failure_reason: resultDesc,
      });
      return res.json({
        status: "failed",
        result_code: resultCode,
        result_desc: resultDesc,
      });
    }
  } catch (error) {
    console.error(`[mpesa_callback] ❌ Exception: ${error.message}`);
    console.error(error.stack);
    return res.json({ status: "error", message: error.message });
  }
});

module.exports = router;

