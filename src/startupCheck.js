"use strict";

/**
 * Startup check to verify all required environment variables are set
 */
function checkEnvironment() {
  const errors = [];
  const warnings = [];

  console.log("\n==========================================");
  console.log("🔍 Environment Variables Check");
  console.log("==========================================\n");

  // Firebase
  if (!process.env.FIREBASE_CREDENTIALS_JSON && !process.env.FIREBASE_CREDENTIALS_PATH) {
    warnings.push("⚠️  FIREBASE_CREDENTIALS_JSON or FIREBASE_CREDENTIALS_PATH not set");
  } else {
    console.log("✅ Firebase credentials configured");
  }

  // M-Pesa
  const mpesaRequired = [
    "MPESA_CONSUMER_KEY",
    "MPESA_CONSUMER_SECRET",
    "MPESA_SHORT_CODE",
    "MPESA_PASSKEY",
  ];
  const missingMpesa = mpesaRequired.filter((key) => !process.env[key]);
  if (missingMpesa.length > 0) {
    errors.push(`❌ Missing M-Pesa variables: ${missingMpesa.join(", ")}`);
  } else {
    console.log("✅ M-Pesa configured");
  }

  // CyberSource
  const cybersourceRequired = [
    "CYBERSOURCE_MERCHANT_ID",
    "CYBERSOURCE_MERCHANT_KEY_ID",
    "CYBERSOURCE_MERCHANT_SECRET_KEY",
  ];
  const missingCyberSource = cybersourceRequired.filter((key) => !process.env[key]);
  if (missingCyberSource.length > 0) {
    errors.push(`❌ Missing CyberSource variables: ${missingCyberSource.join(", ")}`);
  } else {
    console.log("✅ CyberSource configured");
  }

  // Check for wrong variable names
  if (process.env.CYBERSOURCE_API_KEY_ID) {
    warnings.push(
      "⚠️  CYBERSOURCE_API_KEY_ID found - should be CYBERSOURCE_MERCHANT_KEY_ID"
    );
  }
  if (process.env.CYBERSOURCE_SECRET_KEY) {
    warnings.push(
      "⚠️  CYBERSOURCE_SECRET_KEY found - should be CYBERSOURCE_MERCHANT_SECRET_KEY"
    );
  }

  // Application
  if (!process.env.BASE_URL) {
    warnings.push("⚠️  BASE_URL not set (using default)");
  } else {
    console.log(`✅ BASE_URL: ${process.env.BASE_URL}`);
  }

  // Print warnings
  if (warnings.length > 0) {
    console.log("\n⚠️  Warnings:");
    warnings.forEach((w) => console.log(`   ${w}`));
  }

  // Print errors
  if (errors.length > 0) {
    console.log("\n❌ Errors:");
    errors.forEach((e) => console.log(`   ${e}`));
    console.log("\n⚠️  Some features may not work correctly!");
  }

  console.log("\n==========================================\n");

  return { errors, warnings };
}

module.exports = { checkEnvironment };

