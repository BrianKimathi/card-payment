"use strict";

const { verifyIdToken } = require("./firebaseService");

/**
 * Middleware to require Firebase authentication
 */
async function requireAuth(req, res, next) {
  try {
    console.log("[Auth] ========== Authentication Check ==========");
    console.log(`[Auth] Endpoint: ${req.path}`);
    console.log(`[Auth] Method: ${req.method}`);

    const authHeader = req.headers.authorization;
    console.log(
      `[Auth] Authorization header: ${authHeader ? authHeader.substring(0, 30) + "..." : "NOT PRESENT"}`
    );

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // Allow unauth testing when enabled
      const allowTest = process.env.ALLOW_UNAUTH_TEST === "true";
      if (allowTest) {
        const testUserId =
          req.query.user_id || (req.body && req.body.user_id);
        if (testUserId) {
          console.log(`[Auth] ✅ Test mode: Using user_id=${testUserId}`);
          req.userId = testUserId;
          return next();
        }
      }
      console.log("[Auth] ❌ No Bearer token provided");
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split("Bearer ")[1];
    console.log(
      `[Auth] Token extracted (length: ${token.length}, preview: ${token.substring(0, 20)}...)`
    );

    try {
      console.log("[Auth] Verifying Firebase token...");
      const decodedToken = await verifyIdToken(token);
      req.userId = decodedToken.uid;
      console.log(`[Auth] ✅ Token verified successfully`);
      console.log(`[Auth] User ID: ${req.userId}`);
      return next();
    } catch (error) {
      console.error(
        `[Auth] ❌ Token verification failed: ${error.constructor.name}: ${error.message}`
      );
      return res
        .status(401)
        .json({ error: "Invalid Firebase token", details: error.message });
    }
  } catch (error) {
    console.error(`[Auth] ❌ Authentication service error: ${error.message}`);
    return res.status(500).json({ error: "Authentication service error" });
  }
}

module.exports = { requireAuth };

