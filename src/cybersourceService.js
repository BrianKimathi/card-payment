'use strict';

const cybersourceRestApi = require('cybersource-rest-client');
const path = require('path');
const configuration = require(path.resolve('Configuration.js'));

function createApiClients() {
  const configObject = new configuration();
  const apiClient = new cybersourceRestApi.ApiClient();
  return { configObject, apiClient };
}

function promisify(fn, ...args) {
  return new Promise((resolve, reject) => {
    fn(...args, (error, data, response) => {
      if (error) {
        return reject({ error, response });
      }
      resolve({ data, response });
    });
  });
}

async function createCardPayment({
  amount,
  currency,
  card,
  billingInfo,
  referenceCode,
  capture = true,
}) {
  const { configObject, apiClient } = createApiClients();

  const requestObj = new cybersourceRestApi.CreatePaymentRequest();

  const clientReferenceInformation =
    new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
  clientReferenceInformation.code =
    referenceCode || 'PAY_' + Date.now().toString();
  requestObj.clientReferenceInformation = clientReferenceInformation;

  const processingInformation =
    new cybersourceRestApi.Ptsv2paymentsProcessingInformation();
  processingInformation.capture = capture;
  requestObj.processingInformation = processingInformation;

  const paymentInformation = new cybersourceRestApi.Ptsv2paymentsPaymentInformation();
  const paymentInformationCard =
    new cybersourceRestApi.Ptsv2paymentsPaymentInformationCard();
  paymentInformationCard.number = card.number;
  paymentInformationCard.expirationMonth = card.expirationMonth;
  paymentInformationCard.expirationYear = card.expirationYear;
  if (card.securityCode) {
    paymentInformationCard.securityCode = card.securityCode;
  }
  paymentInformation.card = paymentInformationCard;
  requestObj.paymentInformation = paymentInformation;

  const orderInformation =
    new cybersourceRestApi.Ptsv2paymentsOrderInformation();
  const orderInformationAmountDetails =
    new cybersourceRestApi.Ptsv2paymentsOrderInformationAmountDetails();
  orderInformationAmountDetails.totalAmount = parseFloat(amount)
    .toFixed(2)
    .toString();
  orderInformationAmountDetails.currency = currency;
  orderInformation.amountDetails = orderInformationAmountDetails;

  const orderInformationBillTo =
    new cybersourceRestApi.Ptsv2paymentsOrderInformationBillTo();
  Object.assign(orderInformationBillTo, billingInfo);
  orderInformation.billTo = orderInformationBillTo;

  requestObj.orderInformation = orderInformation;

  const instance = new cybersourceRestApi.PaymentsApi(configObject, apiClient);
  return promisify(instance.createPayment.bind(instance), requestObj);
}

async function generateCaptureContext(options = {}) {
  const {
    targetOrigins = ['https://localhost'],
    allowedCardNetworks = ['VISA', 'MASTERCARD'],
    allowedPaymentTypes = ['GOOGLEPAY'],
    country = 'KE',
    locale = 'en_KE',
    amount = '1.00',
    currency = 'USD',
    clientVersion = '0.31',
  } = options;

  const { configObject, apiClient } = createApiClients();

  const requestObj =
    new cybersourceRestApi.GenerateUnifiedCheckoutCaptureContextRequest();
  requestObj.clientVersion = clientVersion;
  requestObj.targetOrigins = targetOrigins;
  requestObj.allowedCardNetworks = allowedCardNetworks;
  requestObj.allowedPaymentTypes = allowedPaymentTypes;
  requestObj.country = country;
  requestObj.locale = locale;

  const amountDetails =
    new cybersourceRestApi.Upv1capturecontextsOrderInformationAmountDetails();
  amountDetails.totalAmount = parseFloat(amount).toFixed(2).toString();
  amountDetails.currency = currency;

  const orderInformation =
    new cybersourceRestApi.Upv1capturecontextsOrderInformation();
  orderInformation.amountDetails = amountDetails;
  requestObj.orderInformation = orderInformation;

  const captureMandate =
    new cybersourceRestApi.Upv1capturecontextsCaptureMandate();
  captureMandate.billingType = 'FULL';
  captureMandate.requestEmail = true;
  captureMandate.requestPhone = true;
  captureMandate.requestShipping = false;
  captureMandate.showAcceptedNetworkIcons = true;
  requestObj.captureMandate = captureMandate;

  const instance = new cybersourceRestApi.UnifiedCheckoutCaptureContextApi(
    configObject,
    apiClient,
  );

  const { response } = await promisify(
    instance.generateUnifiedCheckoutCaptureContext.bind(instance),
    requestObj,
  );

  const rawContext = (response.text || '').trim();
  const normalizedContext =
    rawContext.startsWith('"') && rawContext.endsWith('"')
      ? rawContext.slice(1, -1)
      : rawContext;

  return {
    captureContext: normalizedContext,
  };
}

async function chargeGooglePayToken({
  transientToken,
  amount,
  currency,
  referenceCode,
  billingInfo,
}) {
  if (!transientToken) {
    throw new Error('transientToken is required');
  }

  const { configObject, apiClient } = createApiClients();

  const requestObj = new cybersourceRestApi.CreatePaymentRequest();

  const clientReferenceInformation =
    new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
  clientReferenceInformation.code =
    referenceCode || 'GPAY_' + Date.now().toString();
  requestObj.clientReferenceInformation = clientReferenceInformation;

  const processingInformation =
    new cybersourceRestApi.Ptsv2paymentsProcessingInformation();
  processingInformation.capture = true;
  // Per CyberSource Google Pay samples (cybersource-rest-samples-node),
  // paymentSolution "012" identifies the payload as a Google Pay token
  // so the platform does not expect a raw card number.
  processingInformation.paymentSolution = '012';
  requestObj.processingInformation = processingInformation;

  const orderInformation =
    new cybersourceRestApi.Ptsv2paymentsOrderInformation();
  const amountDetails =
    new cybersourceRestApi.Ptsv2paymentsOrderInformationAmountDetails();
  amountDetails.totalAmount = parseFloat(amount)
    .toFixed(2)
    .toString();
  amountDetails.currency = currency;
  orderInformation.amountDetails = amountDetails;
  if (billingInfo && Object.keys(billingInfo).length > 0) {
    const orderInformationBillTo =
      new cybersourceRestApi.Ptsv2paymentsOrderInformationBillTo();
    Object.assign(orderInformationBillTo, billingInfo);
    orderInformation.billTo = orderInformationBillTo;
  }
  requestObj.orderInformation = orderInformation;

  const tokenInformation = new cybersourceRestApi.Ptsv2paymentsTokenInformation();
  tokenInformation.transientToken = transientToken;
  requestObj.tokenInformation = tokenInformation;

  const instance = new cybersourceRestApi.PaymentsApi(configObject, apiClient);
  return promisify(instance.createPayment.bind(instance), requestObj);
}

// Google Pay via Base64-encoded payment blob (paymentInformation.fluidData.value)
// with paymentSolution "012" (Barclays decryption option).
async function createGooglePayPaymentFromBlob({
  googlePayBlob,
  amount,
  currency,
  referenceCode,
  billingInfo,
}) {
  if (!googlePayBlob) {
    throw new Error('googlePayBlob is required');
  }

  const { configObject, apiClient } = createApiClients();

  const requestObj = new cybersourceRestApi.CreatePaymentRequest();

  const clientReferenceInformation =
    new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
  clientReferenceInformation.code =
    referenceCode || 'GPAY_BLOB_' + Date.now().toString();
  requestObj.clientReferenceInformation = clientReferenceInformation;

  const processingInformation =
    new cybersourceRestApi.Ptsv2paymentsProcessingInformation();
  processingInformation.capture = true;
  // Payment solution 012 = Google Pay via Barclays decryption
  processingInformation.paymentSolution = '012';
  requestObj.paymentInformation = requestObj.paymentInformation || new cybersourceRestApi.Ptsv2paymentsPaymentInformation();
  requestObj.processingInformation = processingInformation;

  const orderInformation =
    new cybersourceRestApi.Ptsv2paymentsOrderInformation();
  const amountDetails =
    new cybersourceRestApi.Ptsv2paymentsOrderInformationAmountDetails();
  amountDetails.totalAmount = parseFloat(amount)
    .toFixed(2)
    .toString();
  amountDetails.currency = currency;
  orderInformation.amountDetails = amountDetails;

  if (billingInfo && Object.keys(billingInfo).length > 0) {
    const orderInformationBillTo =
      new cybersourceRestApi.Ptsv2paymentsOrderInformationBillTo();
    Object.assign(orderInformationBillTo, billingInfo);
    orderInformation.billTo = orderInformationBillTo;
  }

  const paymentInformation =
    new cybersourceRestApi.Ptsv2paymentsPaymentInformation();
  const fluidData =
    new cybersourceRestApi.Ptsv2paymentsPaymentInformationFluidData();
  fluidData.value = googlePayBlob;
  paymentInformation.fluidData = fluidData;
  requestObj.paymentInformation = paymentInformation;

  const instance = new cybersourceRestApi.PaymentsApi(configObject, apiClient);
  return promisify(instance.createPayment.bind(instance), requestObj);
}

module.exports = {
  createCardPayment,
  generateCaptureContext,
  chargeGooglePayToken,
  createGooglePayPaymentFromBlob,
};

