"use strict";

const express = require("express");
const router = express.Router();
const config = require("../src/config");
const { FCMV1Service } = require("../src/fcmService");
const DebtReminderScheduler = require("../src/debtReminderScheduler");
const LowCreditScheduler = require("../src/lowCreditScheduler");

/**
 * Check if cron request is authenticated
 */
function checkCronAuth(req) {
  const cronSecret =
    config.CRON_SECRET_KEY || config.SECRET_KEY || "your-secret-key-here";
  const providedSecret =
    req.query.key || req.headers["x-cron-auth"] || req.headers["X-Cron-Auth"];

  // If secret is set and not default, require auth
  if (cronSecret && cronSecret !== "your-secret-key-here") {
    if (!providedSecret || providedSecret !== cronSecret) {
      return false;
    }
  }
  return true;
}

/**
 * GET /api/cron/notifications/debt-reminders
 * Cron endpoint to trigger debt reminder notifications
 *
 * Usage with cron-jobs.org:
 * GET https://your-app.onrender.com/api/cron/notifications/debt-reminders?key=YOUR_SECRET_KEY
 *
 * Schedule: Daily at 9:00 AM
 */
router.get("/notifications/debt-reminders", async (req, res) => {
  try {
    if (!checkCronAuth(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const fcmService = new FCMV1Service(config.FIREBASE_PROJECT_ID);
    const scheduler = new DebtReminderScheduler(fcmService);
    await scheduler.checkUpcomingDebts();

    console.log("[CRON] ✅ Debt reminder notifications triggered via cron");
    return res.status(200).json({
      status: "success",
      message: "Debt reminder check triggered",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[CRON] ❌ Error in cron debt reminders: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/cron/notifications/low-credit
 * Cron endpoint to trigger low credit notifications
 *
 * Usage with cron-jobs.org:
 * GET https://your-app.onrender.com/api/cron/notifications/low-credit?key=YOUR_SECRET_KEY
 *
 * Schedule: Daily at 8:00 AM
 */
router.get("/notifications/low-credit", async (req, res) => {
  try {
    if (!checkCronAuth(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const fcmService = new FCMV1Service(config.FIREBASE_PROJECT_ID);
    const scheduler = new LowCreditScheduler(fcmService);
    await scheduler.checkLowCredits();

    console.log("[CRON] ✅ Low credit notifications triggered via cron");
    return res.status(200).json({
      status: "success",
      message: "Low credit check triggered",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[CRON] ❌ Error in cron low credit: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/cron/notifications/all
 * Cron endpoint to trigger all notification checks
 *
 * Usage with cron-jobs.org:
 * GET https://your-app.onrender.com/api/cron/notifications/all?key=YOUR_SECRET_KEY
 *
 * This triggers:
 * - Low credit notifications
 * - Debt reminder notifications
 */
router.get("/notifications/all", async (req, res) => {
  try {
    if (!checkCronAuth(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const results = {};
    const fcmService = new FCMV1Service(config.FIREBASE_PROJECT_ID);

    // Trigger debt reminder notifications
    try {
      const debtReminderScheduler = new DebtReminderScheduler(fcmService);
      await debtReminderScheduler.checkUpcomingDebts();
      results.debt_reminders = "success";
    } catch (error) {
      results.debt_reminders = `error: ${error.message}`;
    }

    // Trigger low credit notifications
    try {
      const lowCreditScheduler = new LowCreditScheduler(fcmService);
      await lowCreditScheduler.checkLowCredits();
      results.low_credit = "success";
    } catch (error) {
      results.low_credit = `error: ${error.message}`;
    }

    console.log("[CRON] ✅ All notifications triggered via cron");
    return res.status(200).json({
      status: "success",
      message: "All notification checks triggered",
      results: results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      `[CRON] ❌ Error in cron all notifications: ${error.message}`
    );
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
