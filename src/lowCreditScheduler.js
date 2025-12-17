"use strict";

const { db } = require("./firebaseService");
const { FCMV1Service } = require("./fcmService");

class LowCreditScheduler {
  constructor(fcmService) {
    this.fcmService = fcmService;
  }

  /**
   * Check for users with credits <= 2 and send notifications
   */
  async checkLowCredits() {
    console.log("[LOW_CREDIT] 🔍 Checking for users with low credits (<= 2)...");

    try {
      if (!db) {
        console.error("[LOW_CREDIT] ❌ Firebase database not initialized");
        return;
      }

      // Get all users with FCM tokens
      const fcmTokensRef = db.ref("fcm_tokens");
      const fcmTokensSnapshot = await fcmTokensRef.once("value");
      const fcmTokens = fcmTokensSnapshot.val();

      if (!fcmTokens) {
        console.log("[LOW_CREDIT] No FCM tokens found");
        return;
      }

      // Get all registered users
      const usersRef = db.ref("registeredUser");
      const usersSnapshot = await usersRef.once("value");
      const users = usersSnapshot.val();

      if (!users) {
        console.log("[LOW_CREDIT] No registered users found");
        return;
      }

      let notificationsSent = 0;
      const usersNotified = [];

      for (const [userId, fcmToken] of Object.entries(fcmTokens)) {
        if (!fcmToken) {
          continue;
        }

        // Get user's credit balance
        const userData = users[userId];
        if (!userData) {
          continue;
        }

        let creditBalance = userData.credit_balance || 0;

        // Check if credits are <= 2
        try {
          creditBalance = parseFloat(creditBalance) || 0.0;
        } catch (e) {
          creditBalance = 0.0;
        }

        if (creditBalance <= 2) {
          // Send low credit notification
          const success = await this._sendLowCreditNotification(
            fcmToken,
            userId,
            creditBalance
          );
          if (success) {
            notificationsSent++;
            usersNotified.push(userId);
            console.log(
              `[LOW_CREDIT] ✅ Sent low credit notification to user ${userId} (credits: ${creditBalance})`
            );
          }
        }
      }

      console.log(
        `[LOW_CREDIT] 📤 Sent ${notificationsSent} low credit notifications to users: ${usersNotified.join(", ")}`
      );
    } catch (error) {
      console.error(`[LOW_CREDIT] ❌ Error checking low credits: ${error.message}`);
      console.error(error.stack);
    }
  }

  /**
   * Send low credit notification to a user
   */
  async _sendLowCreditNotification(fcmToken, userId, creditBalance) {
    try {
      // Determine message based on credit balance
      let title, body;
      if (creditBalance === 0) {
        title = "⚠️ No Credits Remaining";
        body =
          "Your account has no credits. Please add credits to continue using KileKitabu.";
      } else if (creditBalance === 1) {
        title = "⚠️ Low Credits: 1 Day Remaining";
        body =
          "You have only 1 credit remaining. Add credits now to avoid service interruption.";
      } else {
        title = "⚠️ Low Credits: 2 Days Remaining";
        body =
          "You have only 2 credits remaining. Add credits now to continue using KileKitabu.";
      }

      // Prepare notification data
      const notificationData = {
        type: "low_credit",
        user_id: userId,
        credit_balance: String(creditBalance),
        timestamp: String(Math.floor(Date.now() / 1000)),
        notification_type: "low_credit_alert",
        click_action: "com.jeff.kilekitabu.PAYMENT",
      };

      // Send notification using FCM service
      const success = await this.fcmService.sendNotification(
        fcmToken,
        title,
        body,
        notificationData
      );

      return success;
    } catch (error) {
      console.error(
        `[LOW_CREDIT] ❌ Error sending low credit notification to user ${userId}: ${error.message}`
      );
      return false;
    }
  }
}

module.exports = LowCreditScheduler;

