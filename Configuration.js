'use strict';

/*
 * CyberSource Sandbox Configuration
 * Update these values with your sandbox credentials
 */

// Authentication Type: 'http_signature' or 'jwt'
const AuthenticationType = 'http_signature';

// Environment: 'apitest.cybersource.com' for sandbox, 'api.cybersource.com' for production
const RunEnvironment = 'apitest.cybersource.com';

// Merchant ID (from CyberSource Business Center)
const MerchantId = 'tiankainvestmentsltd_qr';

// HTTP Signature Authentication Parameters
const MerchantKeyId = '5a772269-8dbd-4c7b-bd51-8cbd3528af37';
const MerchantSecretKey = '//eTiqiS7R9muxShFuEm+p2Buw9W6nD0RKXj2s0URNQ=';

// JWT Authentication Parameters (not used if AuthenticationType is 'http_signature')
const KeysDirectory = 'Resource';
const KeyFileName = '';
const KeyAlias = '';
const KeyPass = '';

// Meta Key Parameters (for portfolio management)
const UseMetaKey = false;
const PortfolioID = '';

// Logging Configuration
const EnableLog = false;
const LogFileName = 'cybs';
const LogDirectory = 'log';
const LogfileMaxSize = '5242880'; // 10 MB in bytes
const LoggingLevel = 'debug';
const EnableMasking = true; // Mask sensitive data in logs

// PEM Key file path for JWE Response decoding (optional)
const PemFileDirectory = '';

// Default Developer ID (optional, for overriding default in request body)
const DefaultDeveloperId = '';

// Constructor for Configuration
function Configuration() {
    var configObj = {
        'authenticationType': AuthenticationType,
        'runEnvironment': RunEnvironment,
        
        'merchantID': MerchantId,
        'merchantKeyId': MerchantKeyId,
        'merchantsecretKey': MerchantSecretKey,
        
        'keyAlias': KeyAlias,
        'keyPass': KeyPass,
        'keyFileName': KeyFileName,
        'keysDirectory': KeysDirectory,
        
        'useMetaKey': UseMetaKey,
        'portfolioID': PortfolioID,
        'pemFileDirectory': PemFileDirectory,
        'defaultDeveloperId': DefaultDeveloperId,
        
        'logConfiguration': {
            'enableLog': EnableLog,
            'logFileName': LogFileName,
            'logDirectory': LogDirectory,
            'logFileMaxSize': LogfileMaxSize,
            'loggingLevel': LoggingLevel,
            'enableMasking': EnableMasking
        }
    };
    return configObj;
}

module.exports = Configuration;

