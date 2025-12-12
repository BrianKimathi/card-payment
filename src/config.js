"use strict";

require("dotenv").config();

const config = {
  // Application
  BASE_URL: process.env.BASE_URL || "https://kilekitabu-backend.onrender.com",
  PORT: process.env.PORT || 4000,
  DEBUG: process.env.DEBUG === "true",
  SECRET_KEY: process.env.SECRET_KEY || "your-secret-key-here",
  CRON_SECRET_KEY: process.env.CRON_SECRET_KEY || process.env.SECRET_KEY || "your-secret-key-here",

  // Firebase
  FIREBASE_CREDENTIALS_PATH:
    process.env.FIREBASE_CREDENTIALS_PATH ||
    "kile-kitabu-firebase-adminsdk-pjk21-887b32b1fc.json",
  FIREBASE_CREDENTIALS_JSON: process.env.FIREBASE_CREDENTIALS_JSON,
  FIREBASE_DATABASE_URL:
    process.env.FIREBASE_DATABASE_URL ||
    "https://kile-kitabu-default-rtdb.firebaseio.com",
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || "kile-kitabu",

  // M-Pesa
  MPESA_ENV: process.env.MPESA_ENV || "production",
  MPESA_CONSUMER_KEY: process.env.MPESA_CONSUMER_KEY || "",
  MPESA_CONSUMER_SECRET: process.env.MPESA_CONSUMER_SECRET || "",
  MPESA_SHORT_CODE: process.env.MPESA_SHORT_CODE || "",
  MPESA_TILL_NUMBER: process.env.MPESA_TILL_NUMBER || "",
  MPESA_PASSKEY: process.env.MPESA_PASSKEY || "",
  MPESA_CALLBACK_URL:
    process.env.MPESA_CALLBACK_URL ||
    `${process.env.BASE_URL || "https://kilekitabu-backend.onrender.com"}/api/mpesa/callback`,

  // Subscription
  DAILY_RATE: parseFloat(process.env.DAILY_RATE || "5.0"),
  FREE_TRIAL_DAYS: parseInt(process.env.FREE_TRIAL_DAYS || "14"),
  MONTHLY_CAP_KES: parseFloat(process.env.MONTHLY_CAP_KES || "150"),
  MAX_PREPAY_MONTHS: parseInt(process.env.MAX_PREPAY_MONTHS || "12"),
  USD_TO_KES_RATE: parseFloat(process.env.USD_TO_KES_RATE || "130.0"),

  // Test flags
  ALLOW_UNAUTH_TEST: process.env.ALLOW_UNAUTH_TEST === "true",
  FORCE_TRIAL_END: process.env.FORCE_TRIAL_END === "true",
  RESET_USERS_ON_LOGIN: process.env.RESET_USERS_ON_LOGIN !== "false", // Default true

  // Validation Rules
  VALIDATION_RULES: {
    min_amount: 10.0,
    max_amount: 1000000.0,
    phone_regex: /^\+?254\d{9}$/,
    email_regex: /^[\w\.-]+@[\w\.-]+\.\w+$/,
  },
};

module.exports = config;

