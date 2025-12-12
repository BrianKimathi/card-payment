"use strict";

/*
 * CyberSource Configuration
 * Loads configuration from environment variables (.env file)
 */

// Load environment variables
require("dotenv").config();

// Authentication Type: 'http_signature' or 'jwt'
const AuthenticationType =
  process.env.CYBERSOURCE_AUTH_TYPE || "http_signature";

// Environment: 'apitest.cybersource.com' for sandbox, 'api.cybersource.com' for production
const RunEnvironment =
  process.env.CYBERSOURCE_RUN_ENVIRONMENT || "apitest.cybersource.com";

// Merchant ID (from CyberSource Business Center)
const MerchantId = process.env.CYBERSOURCE_MERCHANT_ID || "";

// HTTP Signature Authentication Parameters
const MerchantKeyId = process.env.CYBERSOURCE_MERCHANT_KEY_ID || "";
const MerchantSecretKey = process.env.CYBERSOURCE_MERCHANT_SECRET_KEY || "";

// JWT Authentication Parameters (not used if AuthenticationType is 'http_signature')
const KeysDirectory = process.env.CYBERSOURCE_KEYS_DIRECTORY || "Resource";
const KeyFileName = process.env.CYBERSOURCE_KEY_FILE_NAME || "";
const KeyAlias = process.env.CYBERSOURCE_KEY_ALIAS || "";
const KeyPass = process.env.CYBERSOURCE_KEY_PASS || "";

// Meta Key Parameters (for portfolio management)
const UseMetaKey = process.env.CYBERSOURCE_USE_META_KEY === "true" || false;
const PortfolioID = process.env.CYBERSOURCE_PORTFOLIO_ID || "";

// Logging Configuration
const EnableLog = process.env.CYBERSOURCE_ENABLE_LOG === "true" || false;
const LogFileName = process.env.CYBERSOURCE_LOG_FILE_NAME || "cybs";
const LogDirectory = process.env.CYBERSOURCE_LOG_DIRECTORY || "log";
const LogfileMaxSize = process.env.CYBERSOURCE_LOG_FILE_MAX_SIZE || "5242880"; // 10 MB in bytes
const LoggingLevel = process.env.CYBERSOURCE_LOGGING_LEVEL || "debug";
const EnableMasking = process.env.CYBERSOURCE_ENABLE_MASKING !== "false"; // Default to true

// PEM Key file path for JWE Response decoding (optional)
const PemFileDirectory = process.env.CYBERSOURCE_PEM_FILE_DIRECTORY || "";

// Default Developer ID (optional, for overriding default in request body)
const DefaultDeveloperId = process.env.CYBERSOURCE_DEFAULT_DEVELOPER_ID || "";

// Constructor for Configuration
function Configuration() {
  var configObj = {
    authenticationType: AuthenticationType,
    runEnvironment: RunEnvironment,

    merchantID: MerchantId,
    merchantKeyId: MerchantKeyId,
    merchantsecretKey: MerchantSecretKey,

    keyAlias: KeyAlias,
    keyPass: KeyPass,
    keyFileName: KeyFileName,
    keysDirectory: KeysDirectory,

    useMetaKey: UseMetaKey,
    portfolioID: PortfolioID,
    pemFileDirectory: PemFileDirectory,
    defaultDeveloperId: DefaultDeveloperId,

    logConfiguration: {
      enableLog: EnableLog,
      logFileName: LogFileName,
      logDirectory: LogDirectory,
      logFileMaxSize: LogfileMaxSize,
      loggingLevel: LoggingLevel,
      enableMasking: EnableMasking,
    },
  };
  return configObj;
}

module.exports = Configuration;
