"use strict";

const express = require("express");
const router = express.Router();
const { db } = require("../src/firebaseService");
const { FCMV1Service } = require("../src/fcmService");
const config = require("../src/config");

// Initialize FCM service
const fcmService = new FCMV1Service(config.FIREBASE_PROJECT_ID);

/**
 * POST /api/notifications/register-token
 * Register FCM token for a user
 */
router.post("/register-token", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: "Firebase not available" });
    }

    const { user_id, token } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }
    if (!token) {
      return res.status(400).json({ error: "token is required" });
    }

    await db.ref(`fcm_tokens/${user_id}`).set(token);

    return res.json({
      message: "Token registered successfully",
      user_id: user_id,
    });
  } catch (error) {
    console.error(`[register_token] ERROR: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/notifications/send
 * Send notification to a user
 */
router.post("/send", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: "Firebase not available" });
    }

    const { user_id, title, body, data } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }
    if (!title || !body) {
      return res.status(400).json({ error: "title and body are required" });
    }

    // Get FCM token
    const tokenSnapshot = await db.ref(`fcm_tokens/${user_id}`).once("value");
    const fcmToken = tokenSnapshot.val();

    if (!fcmToken) {
      return res.status(404).json({ error: "FCM token not found for user" });
    }

    const success = await fcmService.sendNotification(fcmToken, title, body, data);

    if (success) {
      return res.json({ message: "Notification sent successfully" });
    } else {
      return res.status(500).json({ error: "Failed to send notification" });
    }
  } catch (error) {
    console.error(`[send_notification] ERROR: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;

