"use strict";

const admin = require("firebase-admin");

class FCMV1Service {
  constructor(projectId) {
    this.projectId = projectId || process.env.FIREBASE_PROJECT_ID || "kile-kitabu";
    console.log(`[FCMV1Service] Initialized for project: ${this.projectId}`);
  }

  /**
   * Send notification using FCM v1 API
   */
  async sendNotification(fcmToken, title, body, data = null) {
    try {
      if (!admin.apps.length) {
        console.error("[FCMV1Service] ❌ Firebase Admin not initialized");
        return false;
      }

      const message = {
        token: fcmToken,
        notification: {
          title: title,
          body: body,
        },
        data: data || {},
        android: {
          priority: "high",
          notification: {
            icon: "ic_notification",
            color: "#0C57A6",
            sound: "default",
          },
        },
      };

      console.log(
        `[FCMV1Service] 📤 Sending notification to: ${fcmToken.substring(0, 20)}...`
      );
      console.log(`[FCMV1Service] Message: ${JSON.stringify(message, null, 2)}`);

      const response = await admin.messaging().send(message);

      console.log(`[FCMV1Service] ✅ Notification sent successfully: ${response}`);
      return true;
    } catch (error) {
      console.error(`[FCMV1Service] ❌ Error sending notification: ${error.message}`);
      if (error.code) {
        console.error(`[FCMV1Service] Error code: ${error.code}`);
      }
      return false;
    }
  }
}

// Mock service for when Firebase is not available
class MockFCMV1Service {
  async sendNotification(fcmToken, title, body, data = null) {
    console.log(`[MockFCMV1Service] 🔧 Mock: Would send notification to ${fcmToken.substring(0, 20)}...`);
    console.log(`[MockFCMV1Service] Title: ${title}`);
    console.log(`[MockFCMV1Service] Body: ${body}`);
    console.log(`[MockFCMV1Service] Data: ${JSON.stringify(data)}`);
    return true;
  }
}

module.exports = { FCMV1Service, MockFCMV1Service };

