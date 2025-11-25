'use strict';

/**
 * Google Pay (Unified Checkout) Capture Context Generator
 *
 * Usage:
 *   node googlepay-capture-context.js
 *
 * This calls CyberSource UnifiedCheckoutCaptureContextApi to obtain the
 * captureContext JWT that must be injected into the Unified Checkout
 * JavaScript snippet (WebView) before launching Google Pay.
 */

const cybersourceRestApi = require('cybersource-rest-client');
const path = require('path');
const configuration = require(path.resolve('Configuration.js'));

async function generateCaptureContext() {
  console.log('========================================');
  console.log('Generate Google Pay Capture Context');
  console.log('========================================\n');

  const configObject = new configuration();
  const apiClient = new cybersourceRestApi.ApiClient();

  const requestObj =
    new cybersourceRestApi.GenerateUnifiedCheckoutCaptureContextRequest();

  // Minimum required fields
  requestObj.clientVersion = '0.31';
  requestObj.targetOrigins = [
    'https://5259d30a1588.ngrok-free.app', // Replace with your backend origin
  ];

  requestObj.allowedCardNetworks = ['VISA', 'MASTERCARD', 'AMEX'];
  requestObj.allowedPaymentTypes = ['GOOGLEPAY'];
  requestObj.country = 'KE';
  requestObj.locale = 'en_KE';

  // Google recommends passing the order amount/currency, even if placeholder
  const amountDetails =
    new cybersourceRestApi.Upv1capturecontextsOrderInformationAmountDetails();
  amountDetails.totalAmount = '10.00';
  amountDetails.currency = 'USD';

  const orderInformation =
    new cybersourceRestApi.Upv1capturecontextsOrderInformation();
  orderInformation.amountDetails = amountDetails;
  requestObj.orderInformation = orderInformation;

  // Optional capture mandate (ask for billing/shipping/phone/email)
  const captureMandate =
    new cybersourceRestApi.Upv1capturecontextsCaptureMandate();
  captureMandate.billingType = 'FULL';
  captureMandate.requestEmail = true;
  captureMandate.requestPhone = true;
  captureMandate.requestShipping = false;
  captureMandate.showAcceptedNetworkIcons = true;
  requestObj.captureMandate = captureMandate;

  try {
    const instance = new cybersourceRestApi.UnifiedCheckoutCaptureContextApi(
      configObject,
      apiClient,
    );

    const response = await new Promise((resolve, reject) => {
      instance.generateUnifiedCheckoutCaptureContext(
        requestObj,
        (error, data, rawResponse) => {
          if (error) {
            return reject({ error, rawResponse });
          }
          resolve({ data, rawResponse });
        },
      );
    });

    console.log('✅ Capture context generated successfully!\n');
    console.log('Capture Context JWT:\n');
    console.log(response.rawResponse.text.trim());
    console.log('\nCopy this JWT into the Android Unified Checkout dialog.');
  } catch (err) {
    console.error('❌ Failed to generate capture context\n');
    if (err.error) {
      console.error(JSON.stringify(err.error, null, 2));
    }
    if (err.rawResponse) {
      console.error('\nResponse Status:', err.rawResponse.status);
      console.error('Response Body:', err.rawResponse.text);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  generateCaptureContext();
}

module.exports = generateCaptureContext;

