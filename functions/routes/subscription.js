"use strict";

const express = require("express");
const router = express.Router();
const { requireAuth } = require("../src/authMiddleware");
const { db, auth } = require("../src/firebaseService");
const config = require("../src/config");

/**
 * GET /api/user/credit
 * Get user credit information
 */
router.get("/user/credit", requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    console.log(`[get_credit_info] User ID: ${userId}`);

    if (!db) {
      return res.status(503).json({ error: "Database unavailable" });
    }

    const userRef = db.ref(`registeredUser/${userId}`);
    const userSnapshot = await userRef.once("value");
    let userData = userSnapshot.val();

    const currentTime = new Date();

    // Auto-register new user
    if (!userData) {
      try {
        if (!auth) {
          throw new Error("Firebase auth not initialized");
        }
        const userInfo = await auth.getUser(userId);
        userData = {
          user_id: userId,
          email: userInfo.email,
          registration_date: currentTime.toISOString(),
          credit_balance: 0,
          total_payments: 0,
          created_at: currentTime.toISOString(),
          updated_at: currentTime.toISOString(),
        };
        await userRef.set(userData);
        console.log(
          `[get_credit_info] New user ${userId} registered with fresh trial`
        );
      } catch (error) {
        return res.status(500).json({ error: `Failed to create user: ${error.message}` });
      }
    }

    // Check if user needs reset
    const registrationDateStr = userData.registration_date;
    let shouldReset = false;

    if (!registrationDateStr) {
      shouldReset = true;
      console.log(`[get_credit_info] User ${userId} missing registration_date - resetting`);
    } else if (config.RESET_USERS_ON_LOGIN) {
      const trialResetDateStr = userData.trial_reset_date;
      if (!trialResetDateStr) {
        shouldReset = true;
        console.log(`[get_credit_info] User ${userId} needs reset (RESET_USERS_ON_LOGIN enabled)`);
      } else {
        const resetDate = new Date(trialResetDateStr);
        const daysSinceReset = Math.floor((currentTime - resetDate) / (1000 * 60 * 60 * 24));
        if (daysSinceReset >= config.FREE_TRIAL_DAYS) {
          shouldReset = true;
          console.log(
            `[get_credit_info] User ${userId} trial expired (${daysSinceReset} days ago) - resetting`
          );
        }
      }
    }

    // Reset user if needed
    if (shouldReset) {
      console.log(`[get_credit_info] 🔄 Resetting user ${userId} for fresh trial`);
      const resetTime = new Date();
      const updateData = {
        registration_date: resetTime.toISOString(),
        trial_reset_date: resetTime.toISOString(),
        credit_balance: 0,
        last_usage_date: null,
        updated_at: resetTime.toISOString(),
      };
      await userRef.update(updateData);
      userData = { ...userData, ...updateData };
      console.log(`[get_credit_info] ✅ User ${userId} reset successfully`);
    }

    // Calculate trial status
    let isInTrial = false;
    let trialDaysRemaining = 0;
    if (userData.registration_date) {
      const registrationDate = new Date(userData.registration_date);
      const trialEnd = new Date(registrationDate);
      trialEnd.setDate(trialEnd.getDate() + config.FREE_TRIAL_DAYS);
      isInTrial = currentTime < trialEnd;
      trialDaysRemaining = Math.max(0, Math.floor((trialEnd - currentTime) / (1000 * 60 * 60 * 24)));
    }

    const creditBalance = userData.credit_balance || 0;

    return res.json({
      credit_balance: creditBalance,
      is_in_trial: isInTrial,
      trial_days_remaining: trialDaysRemaining,
      last_usage_date: userData.last_usage_date || null,
      total_payments: userData.total_payments || 0,
      billing_config: {
        daily_rate_kes: config.DAILY_RATE,
        monthly_cap_kes: config.MONTHLY_CAP_KES,
        max_prepay_months: config.MAX_PREPAY_MONTHS,
        max_top_up_kes: config.MONTHLY_CAP_KES * config.MAX_PREPAY_MONTHS,
      },
    });
  } catch (error) {
    console.error(`[get_credit_info] ERROR: ${error.message}`);
    return res.status(500).json({ error: "Internal server error", message: error.message });
  }
});

/**
 * POST /api/usage/record
 * Record app usage and deduct credit
 */
router.post("/usage/record", requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const { action_type } = req.body;

    if (!db) {
      return res.status(503).json({ error: "Database unavailable" });
    }

    const userRef = db.ref(`registeredUser/${userId}`);
    const userSnapshot = await userRef.once("value");
    const userData = userSnapshot.val() || {};

    const currentDate = new Date();
    const lastUsageDateStr = userData.last_usage_date;
    const lastPaymentDateStr = userData.last_payment_date;

    // Check if this is a new day of usage
    let shouldDeductCredit = false;
    if (!lastUsageDateStr) {
      shouldDeductCredit = true;
    } else {
      const lastUsageDate = new Date(lastUsageDateStr);
      const lastUsageDateOnly = new Date(lastUsageDate.getFullYear(), lastUsageDate.getMonth(), lastUsageDate.getDate());
      const currentDateOnly = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
      if (currentDateOnly > lastUsageDateOnly) {
        shouldDeductCredit = true;
      }
    }

    // Prevent credit deduction if payment was made today
    if (lastPaymentDateStr) {
      const lastPaymentDate = new Date(lastPaymentDateStr);
      const lastPaymentDateOnly = new Date(lastPaymentDate.getFullYear(), lastPaymentDate.getMonth(), lastPaymentDate.getDate());
      const currentDateOnly = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
      if (currentDateOnly.getTime() === lastPaymentDateOnly.getTime()) {
        shouldDeductCredit = false;
      }
    }

    // Enforce monthly cap
    const chargedDaysCap = Math.floor(config.MONTHLY_CAP_KES / config.DAILY_RATE);
    const monthKey = currentDate.toISOString().substring(0, 7);
    const monthlyCharged = userData.monthly_charged_days?.[monthKey] || 0;

    if (shouldDeductCredit && monthlyCharged >= chargedDaysCap) {
      shouldDeductCredit = false;
    }

    if (shouldDeductCredit) {
      const currentCredit = userData.credit_balance || 0;
      const newCredit = currentCredit - 1;

      await userRef.update({
        credit_balance: newCredit,
        last_usage_date: currentDate.toISOString(),
      });

      // Record usage
      const { v4: uuidv4 } = require("uuid");
      const usageId = uuidv4();
      const usageInfo = {
        usage_id: usageId,
        user_id: userId,
        action_type: action_type,
        credit_deducted: 1,
        remaining_credit: newCredit,
        timestamp: currentDate.toISOString(),
      };

      await db.ref(`usage_logs/${usageId}`).set(usageInfo);

      // Track charged day for monthly cap
      const monthly = userData.monthly_charged_days || {};
      monthly[monthKey] = monthlyCharged + 1;
      await userRef.update({ monthly_charged_days: monthly });
    }

    return res.json({
      message: "Usage recorded",
      credit_deducted: shouldDeductCredit ? 1 : 0,
      remaining_credit: (userData.credit_balance || 0) - (shouldDeductCredit ? 1 : 0),
    });
  } catch (error) {
    console.error(`[record_usage] ERROR: ${error.message}`);
    return res.status(500).json({ error: "Internal server error", message: error.message });
  }
});

module.exports = router;

