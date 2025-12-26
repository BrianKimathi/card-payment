"use strict";

const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

let db = null;
let auth = null;

/**
 * Initialize Firebase Admin SDK
 */
function initializeFirebase() {
  try {
    // Check if already initialized
    if (admin.apps.length > 0) {
      console.log("[Firebase] Already initialized");
      db = admin.database();
      auth = admin.auth();
      return { db, auth };
    }

    // Try to load credentials from file
    const credentialsPath =
      process.env.FIREBASE_CREDENTIALS_PATH ||
      path.join(__dirname, "../kile-kitabu-firebase-adminsdk-pjk21-887b32b1fc.json");

    // Also support JSON string from environment (Render-friendly)
    const credentialsJson = process.env.FIREBASE_CREDENTIALS_JSON;

    let credential;
    if (credentialsJson) {
      // Use JSON string from environment
      try {
        // Try parsing as JSON string first
        let creds;
        if (typeof credentialsJson === 'string' && credentialsJson.trim().startsWith('{')) {
          creds = JSON.parse(credentialsJson);
        } else {
          // Might be base64 encoded
          const decoded = Buffer.from(credentialsJson, 'base64').toString('utf-8');
          creds = JSON.parse(decoded);
        }
        credential = admin.credential.cert(creds);
        console.log("[Firebase] ✅ Initialized from FIREBASE_CREDENTIALS_JSON env var");
      } catch (parseError) {
        console.error("[Firebase] ❌ Failed to parse FIREBASE_CREDENTIALS_JSON:", parseError.message);
        console.error("[Firebase] First 100 chars:", credentialsJson.substring(0, 100));
        return { db: null, auth: null };
      }
    } else if (fs.existsSync(credentialsPath)) {
      // Use credentials file
      credential = admin.credential.cert(credentialsPath);
      console.log(`[Firebase] Initialized from file: ${credentialsPath}`);
    } else {
      console.warn(
        "[Firebase] ⚠️ No credentials found. Firebase features will be disabled."
      );
      return { db: null, auth: null };
    }

    const databaseURL =
      process.env.FIREBASE_DATABASE_URL ||
      "https://kile-kitabu-default-rtdb.firebaseio.com";

    admin.initializeApp({
      credential: credential,
      databaseURL: databaseURL,
    });

    db = admin.database();
    auth = admin.auth();

    console.log("[Firebase] ✅ Initialized successfully");
    console.log(`[Firebase] Database URL: ${databaseURL}`);

    return { db, auth };
  } catch (error) {
    console.error("[Firebase] ❌ Initialization error:", error);
    return { db: null, auth: null };
  }
}

/**
 * Verify Firebase ID token
 */
async function verifyIdToken(token) {
  try {
    if (!auth) {
      throw new Error("Firebase auth not initialized");
    }
    const decodedToken = await auth.verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    // Handle clock skew errors
    if (
      error.message &&
      (error.message.includes("clock") ||
        error.message.includes("too early") ||
        error.message.includes("too late"))
    ) {
      console.log("[Firebase] ⚠️ Clock skew detected, waiting and retrying...");
      const timeMatch = error.message.match(/(\d+) < (\d+)/);
      if (timeMatch) {
        const diff = Math.abs(parseInt(timeMatch[2]) - parseInt(timeMatch[1]));
        if (diff <= 5) {
          // Wait for the time difference + 1 second buffer
          await new Promise((resolve) => setTimeout(resolve, (diff + 1) * 1000));
          return await auth.verifyIdToken(token);
        }
      } else {
        // Wait 2 seconds and retry
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return await auth.verifyIdToken(token);
      }
    }
    throw error;
  }
}

// Initialize on module load
const { db: initializedDb, auth: initializedAuth } = initializeFirebase();

module.exports = {
  db: initializedDb,
  auth: initializedAuth,
  verifyIdToken,
  initializeFirebase,
};

