'use strict';

/**
 * Google Pay Transient Token Charge
 *
 * Usage:
 *   node googlepay-charge-transient.js <TRANSIENT_TOKEN>
 *
 * After the WebView Unified Checkout flow returns a transient token,
 * pass it to this script (or, in production, POST it to your backend).
 */

const cybersourceRestApi = require('cybersource-rest-client');
const path = require('path');
const configuration = require(path.resolve('Configuration.js'));

async function chargeWithTransientToken(transientToken) {
  if (!transientToken) {
    console.error('❌ Missing transient token argument.');
    console.error(
      'Usage: node googlepay-charge-transient.js <TRANSIENT_TOKEN>',
    );
    process.exit(1);
  }

  console.log('========================================');
  console.log('Google Pay Transient Token Charge');
  console.log('========================================\n');

  const configObject = new configuration();
  const apiClient = new cybersourceRestApi.ApiClient();
  const requestObj = new cybersourceRestApi.CreatePaymentRequest();

  const clientReferenceInformation =
    new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
  clientReferenceInformation.code = 'GPay_' + Date.now();
  requestObj.clientReferenceInformation = clientReferenceInformation;

  const processingInformation =
    new cybersourceRestApi.Ptsv2paymentsProcessingInformation();
  processingInformation.capture = true;
  requestObj.processingInformation = processingInformation;

  const orderInformation =
    new cybersourceRestApi.Ptsv2paymentsOrderInformation();
  const amountDetails =
    new cybersourceRestApi.Ptsv2paymentsOrderInformationAmountDetails();
  amountDetails.totalAmount = '5.00';
  amountDetails.currency = 'USD';
  orderInformation.amountDetails = amountDetails;
  requestObj.orderInformation = orderInformation;

  const tokenInformation = new cybersourceRestApi.Ptsv2paymentsTokenInformation();
  tokenInformation.transientToken = transientToken;
  requestObj.tokenInformation = tokenInformation;

  console.log('Attempting to charge transient token...');
  console.log('Amount: ' + amountDetails.totalAmount + ' ' + amountDetails.currency);
  console.log('Reference: ' + clientReferenceInformation.code);
  console.log('');

  try {
    const instance = new cybersourceRestApi.PaymentsApi(configObject, apiClient);
    const response = await new Promise((resolve, reject) => {
      instance.createPayment(requestObj, (error, data, rawResponse) => {
        if (error) {
          return reject({ error, rawResponse });
        }
        resolve({ data, rawResponse });
      });
    });

    console.log('✅ Payment Success!');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (err) {
    console.error('❌ Payment failed');
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
  const transientToken = process.argv[2];
  chargeWithTransientToken(transientToken);
}

module.exports = chargeWithTransientToken;

