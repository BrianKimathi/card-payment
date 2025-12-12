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
  console.log('[CARD_PAYMENT] ========== Starting Standard Card Payment ==========');
  console.log(`[CARD_PAYMENT] Reference Code: ${referenceCode || 'PAY_' + Date.now().toString()}`);
  console.log(`[CARD_PAYMENT] Amount: ${amount} ${currency}`);
  console.log(`[CARD_PAYMENT] Card: ****${card.number.slice(-4)} (Exp: ${card.expirationMonth}/${card.expirationYear})`);
  console.log(`[CARD_PAYMENT] Capture: ${capture ? 'YES (authorize + capture)' : 'NO (authorize only)'}`);
  console.log(`[CARD_PAYMENT] 3D Secure: Not used (standard flow)`);
  
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
  console.log(`[CARD_PAYMENT] Processing Information: capture=${capture}`);

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

  console.log('[CARD_PAYMENT] Sending payment request to CyberSource...');
  
  // Log raw request being sent (sanitize sensitive data)
  console.log('[CARD_PAYMENT] 📋 RAW REQUEST TO CYBERSOURCE:');
  try {
    const requestLog = {
      clientReferenceInformation: {
        code: requestObj.clientReferenceInformation?.code || 'N/A'
      },
      processingInformation: {
        capture: requestObj.processingInformation?.capture !== false
      },
      paymentInformation: {
        card: {
          number: requestObj.paymentInformation?.card?.number ? `****${requestObj.paymentInformation.card.number.slice(-4)}` : 'N/A',
          expirationMonth: requestObj.paymentInformation?.card?.expirationMonth || 'N/A',
          expirationYear: requestObj.paymentInformation?.card?.expirationYear || 'N/A'
        }
      },
      orderInformation: {
        amountDetails: {
          currency: requestObj.orderInformation?.amountDetails?.currency || 'N/A',
          totalAmount: requestObj.orderInformation?.amountDetails?.totalAmount || 'N/A'
        },
        billTo: {
          firstName: requestObj.orderInformation?.billTo?.firstName || 'N/A',
          lastName: requestObj.orderInformation?.billTo?.lastName || 'N/A',
          email: requestObj.orderInformation?.billTo?.email || 'N/A',
          country: requestObj.orderInformation?.billTo?.country || 'N/A'
        }
      }
    };
    console.log(JSON.stringify(requestLog, null, 2));
  } catch (e) {
    console.log('[CARD_PAYMENT] ⚠️ Could not log request details');
  }
  
  const instance = new cybersourceRestApi.PaymentsApi(configObject, apiClient);
  
  try {
    const result = await promisify(instance.createPayment.bind(instance), requestObj);
    
    console.log('[CARD_PAYMENT] ✅ Payment response received');
    console.log(`[CARD_PAYMENT] HTTP Status: ${result.response?.status || 'N/A'}`);
    console.log(`[CARD_PAYMENT] Transaction ID: ${result.data?.id || 'N/A'}`);
    console.log(`[CARD_PAYMENT] Status: ${result.data?.status || 'N/A'}`);
    
    // Log raw response from CyberSource
    console.log('[CARD_PAYMENT] 📋 RAW CYBERSOURCE RESPONSE:');
    try {
      console.log(JSON.stringify(result.data, null, 2));
    } catch (e) {
      console.log('[CARD_PAYMENT] ⚠️ Could not stringify response:', result.data);
    }
    
    // Log raw HTTP response if available
    if (result.response) {
      console.log('[CARD_PAYMENT] 📋 RAW HTTP RESPONSE HEADERS:');
      try {
        console.log(JSON.stringify(result.response.headers || {}, null, 2));
      } catch (e) {
        console.log('[CARD_PAYMENT] ⚠️ Could not stringify headers');
      }
    }
    
    const procInfo = result.data?.processorInformation || {};
    console.log(`[CARD_PAYMENT] Processor Response Code: ${procInfo.responseCode || 'N/A'}`);
    console.log(`[CARD_PAYMENT] Processor Approval Code: ${procInfo.approvalCode || 'N/A'}`);
    
    const orderInfo = result.data?.orderInformation?.amountDetails || {};
    console.log(`[CARD_PAYMENT] Amount Details:`);
    console.log(`[CARD_PAYMENT]   - Authorized: ${orderInfo.authorizedAmount || 'N/A'} ${orderInfo.currency || currency}`);
    console.log(`[CARD_PAYMENT]   - Total: ${orderInfo.totalAmount || amount} ${orderInfo.currency || currency}`);
    
    if (result.data?.status === 'AUTHORIZED' && capture) {
      console.log('[CARD_PAYMENT] ✅ Payment AUTHORIZED and CAPTURED (capture=true means authorize+capture in one step)');
      console.log('[CARD_PAYMENT] ℹ️  No separate capture call needed - payment is complete');
    } else if (result.data?.status === 'AUTHORIZED' && !capture) {
      console.log('[CARD_PAYMENT] ✅ Payment AUTHORIZED (separate capture call needed)');
      console.log('[CARD_PAYMENT] ⚠️  Use Capture API to complete the payment');
    } else if (result.data?.status === 'CAPTURED') {
      console.log('[CARD_PAYMENT] ✅ Payment CAPTURED');
    }
    
    console.log('[CARD_PAYMENT] ========== Payment Complete ==========');
    
    return result;
  } catch (error) {
    console.log('[CARD_PAYMENT] ❌ Payment failed');
    console.log(`[CARD_PAYMENT] Error: ${error.error || error.message || 'Unknown error'}`);
    
    // Log raw error response
    if (error.response) {
      console.log('[CARD_PAYMENT] 📋 RAW ERROR RESPONSE:');
      console.log(`[CARD_PAYMENT] HTTP Status: ${error.response.status || 'N/A'}`);
      console.log(`[CARD_PAYMENT] Response Body: ${error.response.text || 'N/A'}`);
      if (error.response.headers) {
        console.log('[CARD_PAYMENT] Response Headers:');
        try {
          console.log(JSON.stringify(error.response.headers, null, 2));
        } catch (e) {
          console.log('[CARD_PAYMENT] ⚠️ Could not stringify error headers');
        }
      }
    }
    
    throw error;
  }
}

async function generateCaptureContext(options = {}) {
  const {
    targetOrigins = ['https://localhost'],
    allowedCardNetworks = ['VISA', 'MASTERCARD'],
    // Default to both PANENTRY (card) and GOOGLEPAY for unified checkout
    allowedPaymentTypes = ['PANENTRY', 'GOOGLEPAY'],
    country = 'KE',
    locale = 'en_KE',
    amount = '1.00',
    currency = 'USD',
    clientVersion = '0.31',
    // Complete Mandate options
    useCompleteMandate = false, // Set to true to enable service orchestration
    completeMandateType = 'CAPTURE', // 'CAPTURE', 'AUTH', or 'PREFER_AUTH'
    enableDecisionManager = true,
    enableConsumerAuthentication = true,
    enableTmsTokenCreate = false,
    tmsTokenTypes = [],
    // Billing info for pre-fill
    billingInfo = null,
  } = options;

  const { configObject, apiClient } = createApiClients();

  // Map "CARD" to "PANENTRY" for Unified Checkout (CyberSource requirement)
  const normalizedPaymentTypes = allowedPaymentTypes.map(type => 
    type === 'CARD' ? 'PANENTRY' : type
  );

  const requestObj =
    new cybersourceRestApi.GenerateUnifiedCheckoutCaptureContextRequest();
  requestObj.clientVersion = clientVersion;
  requestObj.targetOrigins = targetOrigins;
  requestObj.allowedCardNetworks = allowedCardNetworks;
  requestObj.allowedPaymentTypes = normalizedPaymentTypes;
  requestObj.country = country;
  requestObj.locale = locale;

  const amountDetails =
    new cybersourceRestApi.Upv1capturecontextsOrderInformationAmountDetails();
  amountDetails.totalAmount = parseFloat(amount).toFixed(2).toString();
  amountDetails.currency = currency;

  const orderInformation =
    new cybersourceRestApi.Upv1capturecontextsOrderInformation();
  orderInformation.amountDetails = amountDetails;
  
  // Add billing information pre-fill if provided
  if (billingInfo && Object.keys(billingInfo).length > 0) {
    const billTo =
      new cybersourceRestApi.Upv1capturecontextsOrderInformationBillTo();
    // Map billing info fields
    if (billingInfo.firstName) billTo.firstName = billingInfo.firstName;
    if (billingInfo.lastName) billTo.lastName = billingInfo.lastName;
    if (billingInfo.email) billTo.email = billingInfo.email;
    if (billingInfo.phoneNumber) billTo.phoneNumber = billingInfo.phoneNumber;
    if (billingInfo.address1) billTo.address1 = billingInfo.address1;
    if (billingInfo.locality) billTo.locality = billingInfo.locality;
    if (billingInfo.administrativeArea) billTo.administrativeArea = billingInfo.administrativeArea;
    if (billingInfo.postalCode) billTo.postalCode = billingInfo.postalCode;
    if (billingInfo.country) billTo.country = billingInfo.country;
    orderInformation.billTo = billTo;
  }
  
  requestObj.orderInformation = orderInformation;

  // Complete Mandate - enables service orchestration (Decision Manager, 3D Secure, etc.)
  if (useCompleteMandate) {
    try {
      const completeMandate =
        new cybersourceRestApi.Upv1capturecontextsCompleteMandate();
      completeMandate.type = completeMandateType; // 'CAPTURE', 'AUTH', or 'PREFER_AUTH'
      completeMandate.decisionManager = enableDecisionManager;
      completeMandate.consumerAuthentication = enableConsumerAuthentication;
      
      // TMS Token creation (optional)
      if (enableTmsTokenCreate && tmsTokenTypes.length > 0) {
        const tms = new cybersourceRestApi.Upv1capturecontextsCompleteMandateTms();
        tms.tokenCreate = true;
        tms.tokenTypes = tmsTokenTypes;
        completeMandate.tms = tms;
      }
      
      requestObj.completeMandate = completeMandate;
      console.log('[CAPTURE_CONTEXT] Complete Mandate enabled:', {
        type: completeMandateType,
        decisionManager: enableDecisionManager,
        consumerAuthentication: enableConsumerAuthentication,
      });
    } catch (err) {
      console.warn('[CAPTURE_CONTEXT] Failed to create CompleteMandate object:', err.message);
      // Continue without complete mandate if SDK doesn't support it
    }
  }

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

  // Log the full request object for debugging
  console.log('[CAPTURE_CONTEXT] 📋 Full request object:', JSON.stringify(requestObj, null, 2));
  console.log('[CAPTURE_CONTEXT] Request details:');
  console.log('[CAPTURE_CONTEXT]   - clientVersion:', requestObj.clientVersion);
  console.log('[CAPTURE_CONTEXT]   - targetOrigins:', requestObj.targetOrigins);
  console.log('[CAPTURE_CONTEXT]   - allowedCardNetworks:', requestObj.allowedCardNetworks);
  console.log('[CAPTURE_CONTEXT]   - allowedPaymentTypes:', requestObj.allowedPaymentTypes);
  console.log('[CAPTURE_CONTEXT]   - country:', requestObj.country);
  console.log('[CAPTURE_CONTEXT]   - locale:', requestObj.locale);
  console.log('[CAPTURE_CONTEXT]   - orderInformation:', requestObj.orderInformation ? 'present' : 'missing');
  console.log('[CAPTURE_CONTEXT]   - captureMandate:', requestObj.captureMandate ? 'present' : 'missing');
  console.log('[CAPTURE_CONTEXT]   - completeMandate:', requestObj.completeMandate ? 'present' : 'missing');

  let response;
  try {
    const result = await promisify(
      instance.generateUnifiedCheckoutCaptureContext.bind(instance),
      requestObj,
    );
    response = result.response;
    console.log('[CAPTURE_CONTEXT] ✅ Response received, status:', response.statusCode);
    console.log('[CAPTURE_CONTEXT] Response text length:', response.text ? response.text.length : 0);
    if (response.text && response.text.length > 0) {
      console.log('[CAPTURE_CONTEXT] Response preview (first 200 chars):', response.text.substring(0, 200));
    }
  } catch (error) {
    console.error('[CAPTURE_CONTEXT] ❌ Error generating capture context:');
    console.error('[CAPTURE_CONTEXT] Error type:', typeof error);
    console.error('[CAPTURE_CONTEXT] Error message:', error.message || error.error || 'Unknown error');
    if (error.response) {
      console.error('[CAPTURE_CONTEXT] Error response status:', error.response.statusCode);
      console.error('[CAPTURE_CONTEXT] Error response text:', error.response.text);
      console.error('[CAPTURE_CONTEXT] Error response headers:', error.response.header);
    }
    if (error.error) {
      console.error('[CAPTURE_CONTEXT] Error details:', JSON.stringify(error.error, null, 2));
    }
    throw error;
  }

  const rawContext = (response.text || '').trim();
  const normalizedContext =
    rawContext.startsWith('"') && rawContext.endsWith('"')
      ? rawContext.slice(1, -1)
      : rawContext;

  // Extract clientLibraryIntegrity from the capture context JWT for SRI checking
  let clientLibraryIntegrity = null;
  try {
    const parts = normalizedContext.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
      if (payload.ctx && payload.ctx[0] && payload.ctx[0].data && payload.ctx[0].data.clientLibraryIntegrity) {
        clientLibraryIntegrity = payload.ctx[0].data.clientLibraryIntegrity;
        console.log('[CAPTURE_CONTEXT] Extracted clientLibraryIntegrity for SRI checking');
      }
    }
  } catch (err) {
    console.warn('[CAPTURE_CONTEXT] Could not extract clientLibraryIntegrity:', err.message);
  }

  const result = {
    captureContext: normalizedContext,
  };
  
  if (clientLibraryIntegrity) {
    result.clientLibraryIntegrity = clientLibraryIntegrity;
  }

  return result;
}

async function chargeGooglePayToken({
  transientToken,
  amount,
  currency,
  referenceCode,
  billingInfo,
}) {
  console.log('[GOOGLE_PAY] ========== Starting Google Pay Payment from Transient Token ==========');
  console.log(`[GOOGLE_PAY] Reference Code: ${referenceCode || 'GPAY_' + Date.now().toString()}`);
  console.log(`[GOOGLE_PAY] Amount: ${amount} ${currency}`);
  console.log(`[GOOGLE_PAY] Transient Token Length: ${transientToken ? String(transientToken).length : 0} characters`);
  console.log(`[GOOGLE_PAY] Billing Info: ${billingInfo ? JSON.stringify(billingInfo) : 'Not provided'}`);
  
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
  console.log('[GOOGLE_PAY] Payment Solution: 012 (Google Pay token)');
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

  console.log('[GOOGLE_PAY] Sending payment request to CyberSource...');
  console.log('📋 RAW REQUEST TO CYBERSOURCE (chargeGooglePayToken):', JSON.stringify(requestObj, (key, value) => {
    if (key === 'transientToken' && typeof value === 'string') {
      return `[TRANSIENT_TOKEN_${value.length}_chars]`;
    }
    return value;
  }, 2));

  const instance = new cybersourceRestApi.PaymentsApi(configObject, apiClient);
  const result = await promisify(instance.createPayment.bind(instance), requestObj);

  console.log('[GOOGLE_PAY] ✅ Payment response received');
  console.log('📋 RAW CYBERSOURCE RESPONSE (chargeGooglePayToken):', JSON.stringify(result.data, null, 2));
  console.log('📋 RAW HTTP RESPONSE HEADERS (chargeGooglePayToken):', result.response.header);

  const processorInfo = result.data?.processorInformation || {};
  const responseAmountDetails = result.data?.orderInformation?.amountDetails || {};
  const errorInfo = result.data?.errorInformation || {};

  console.log(`[GOOGLE_PAY] Transaction ID: ${result.data?.id}`);
  console.log(`[GOOGLE_PAY] Status: ${result.data?.status}`);
  console.log(`[GOOGLE_PAY] HTTP Status: ${result.response?.status}`);
  
  if (errorInfo.reason) {
    console.log(`[GOOGLE_PAY] ⚠️ Error Reason: ${errorInfo.reason}`);
    console.log(`[GOOGLE_PAY] ⚠️ Error Message: ${errorInfo.message}`);
    if (errorInfo.reason === 'INVALID_ACCOUNT') {
      console.log('[GOOGLE_PAY] ⚠️ NOTE: "INVALID_ACCOUNT" in sandbox/test environment usually means:');
      console.log('[GOOGLE_PAY]   - Google Pay is using a REAL card from your Google account');
      console.log('[GOOGLE_PAY]   - CyberSource sandbox only accepts TEST card numbers');
      console.log('[GOOGLE_PAY]   - Solution: Use card payments directly for testing, or add test cards to Google Pay');
    }
  }
  
  if (processorInfo.responseCode) {
    console.log(`[GOOGLE_PAY] Processor Response Code: ${processorInfo.responseCode}`);
  }
  if (processorInfo.approvalCode) {
    console.log(`[GOOGLE_PAY] Processor Approval Code: ${processorInfo.approvalCode}`);
  }
  if (responseAmountDetails.authorizedAmount && responseAmountDetails.currency) {
    console.log(`[GOOGLE_PAY] Amount Details:`);
    console.log(`[GOOGLE_PAY]   - Authorized: ${responseAmountDetails.authorizedAmount} ${responseAmountDetails.currency}`);
    console.log(`[GOOGLE_PAY]   - Total: ${responseAmountDetails.totalAmount} ${responseAmountDetails.currency}`);
  }
  
  console.log('[GOOGLE_PAY] ========== Payment Complete ==========');
  return result;
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
  console.log('[GOOGLE_PAY] ========== Starting Google Pay Payment from Blob ==========');
  console.log(`[GOOGLE_PAY] Reference Code: ${referenceCode || 'GPAY_BLOB_' + Date.now().toString()}`);
  console.log(`[GOOGLE_PAY] Amount: ${amount} ${currency}`);
  console.log(`[GOOGLE_PAY] Blob Length: ${googlePayBlob ? String(googlePayBlob).length : 0} characters`);
  console.log(`[GOOGLE_PAY] Billing Info: ${billingInfo ? JSON.stringify(billingInfo) : 'Not provided'}`);
  
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
  console.log('[GOOGLE_PAY] Payment Solution: 012 (Google Pay via Barclays decryption)');
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

  console.log('[GOOGLE_PAY] Sending payment request to CyberSource...');
  console.log('📋 RAW REQUEST TO CYBERSOURCE (createGooglePayPaymentFromBlob):', JSON.stringify(requestObj, (key, value) => {
    if (key === 'value' && typeof value === 'string') {
      // Mask the blob value (it's encrypted anyway, but don't log the full thing)
      return `[ENCRYPTED_BLOB_${value.length}_chars]`;
    }
    return value;
  }, 2));

  const instance = new cybersourceRestApi.PaymentsApi(configObject, apiClient);
  const result = await promisify(instance.createPayment.bind(instance), requestObj);

  console.log('[GOOGLE_PAY] ✅ Payment response received');
  console.log('📋 RAW CYBERSOURCE RESPONSE (createGooglePayPaymentFromBlob):', JSON.stringify(result.data, null, 2));
  console.log('📋 RAW HTTP RESPONSE HEADERS (createGooglePayPaymentFromBlob):', result.response.header);

  const processorInfo = result.data?.processorInformation || {};
  const responseAmountDetails = result.data?.orderInformation?.amountDetails || {};
  const errorInfo = result.data?.errorInformation || {};

  console.log(`[GOOGLE_PAY] Transaction ID: ${result.data?.id}`);
  console.log(`[GOOGLE_PAY] Status: ${result.data?.status}`);
  console.log(`[GOOGLE_PAY] HTTP Status: ${result.response?.status}`);
  
  if (errorInfo.reason) {
    console.log(`[GOOGLE_PAY] ⚠️ Error Reason: ${errorInfo.reason}`);
    console.log(`[GOOGLE_PAY] ⚠️ Error Message: ${errorInfo.message}`);
    if (errorInfo.reason === 'INVALID_ACCOUNT') {
      console.log('[GOOGLE_PAY] ⚠️ NOTE: "INVALID_ACCOUNT" in sandbox/test environment usually means:');
      console.log('[GOOGLE_PAY]   - Google Pay is using a REAL card from your Google account');
      console.log('[GOOGLE_PAY]   - CyberSource sandbox only accepts TEST card numbers');
      console.log('[GOOGLE_PAY]   - Solution: Use card payments directly for testing, or add test cards to Google Pay');
    }
  }
  
  if (processorInfo.responseCode) {
    console.log(`[GOOGLE_PAY] Processor Response Code: ${processorInfo.responseCode}`);
  }
  if (processorInfo.approvalCode) {
    console.log(`[GOOGLE_PAY] Processor Approval Code: ${processorInfo.approvalCode}`);
  }
  if (responseAmountDetails.authorizedAmount && responseAmountDetails.currency) {
    console.log(`[GOOGLE_PAY] Amount Details:`);
    console.log(`[GOOGLE_PAY]   - Authorized: ${responseAmountDetails.authorizedAmount} ${responseAmountDetails.currency}`);
    console.log(`[GOOGLE_PAY]   - Total: ${responseAmountDetails.totalAmount} ${responseAmountDetails.currency}`);
  }
  
  console.log('[GOOGLE_PAY] ========== Payment Complete ==========');
  return result;
}

/**
 * Search for transactions by reference code using CyberSource Transaction Search API.
 * 
 * @param {string} referenceCode - The client reference code used in the payment
 * @param {number} limit - Maximum number of results to return (default: 10)
 * @returns {Promise<Object>} Search results with transactions
 */
async function searchTransactionsByReference({
  referenceCode,
  limit = 10,
}) {
  console.log('[TRANSACTION_SEARCH] ========== Starting Transaction Search ==========');
  console.log(`[TRANSACTION_SEARCH] Reference Code: ${referenceCode}`);
  console.log(`[TRANSACTION_SEARCH] Limit: ${limit}`);
  
  if (!referenceCode) {
    throw new Error('referenceCode is required');
  }
  
  const { configObject, apiClient } = createApiClients();
  
  // Step 1: Create search request
  const searchQuery = `clientReferenceInformation.code:${referenceCode}`;
  console.log(`[TRANSACTION_SEARCH] Query: ${searchQuery}`);
  
  const createSearchRequest = new cybersourceRestApi.CreateSearchRequest();
  createSearchRequest.save = false; // Don't save the search
  createSearchRequest.name = `Search_${referenceCode}`;
  createSearchRequest.timezone = 'UTC';
  createSearchRequest.query = searchQuery;
  createSearchRequest.offset = 0;
  createSearchRequest.limit = limit;
  createSearchRequest.sort = 'id:desc,submitTimeUtc:desc'; // Most recent first
  
  console.log('[TRANSACTION_SEARCH] Creating search request...');
  console.log('📋 RAW REQUEST TO CYBERSOURCE (createSearch):', JSON.stringify(createSearchRequest, null, 2));
  
  const searchApi = new cybersourceRestApi.SearchTransactionsApi(configObject, apiClient);
  
  try {
    // Create search
    const createResult = await promisify(
      searchApi.createSearch.bind(searchApi),
      createSearchRequest
    );
    
    console.log('[TRANSACTION_SEARCH] ✅ Search created');
    console.log('📋 RAW CYBERSOURCE RESPONSE (createSearch):', JSON.stringify(createResult.data, null, 2));
    
    const searchId = createResult.data?.searchId;
    if (!searchId) {
      throw new Error('No searchId returned from search creation');
    }
    
    console.log(`[TRANSACTION_SEARCH] Search ID: ${searchId}`);
    
    // Step 2: Get search results (wait a moment for CyberSource to process)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('[TRANSACTION_SEARCH] Retrieving search results...');
    
    const getResult = await promisify(
      searchApi.getSearch.bind(searchApi),
      searchId
    );
    
    console.log('[TRANSACTION_SEARCH] ✅ Search results retrieved');
    console.log('📋 RAW CYBERSOURCE RESPONSE (getSearch):', JSON.stringify(getResult.data, null, 2));
    console.log('📋 RAW HTTP RESPONSE HEADERS (getSearch):', getResult.response.header);
    
    // Extract transactions from _embedded.transactionSummaries
    const transactionSummaries = getResult.data?._embedded?.transactionSummaries || [];
    const totalCount = getResult.data?.totalCount || 0;
    const returnedCount = getResult.data?.count || 0;
    
    // Map transaction summaries to a consistent format
    const transactions = transactionSummaries.map(tx => {
      // Determine status from applicationInformation or other fields
      const status = tx.applicationInformation?.applications?.[0]?.name === 'ics_pa_enroll' 
        ? 'ENROLLMENT' 
        : (tx.status || 'UNKNOWN');
      
      return {
        id: tx.id,
        status: status,
        submitTimeUtc: tx.submitTimeUtc,
        merchantId: tx.merchantId,
        clientReferenceInformation: tx.clientReferenceInformation,
        orderInformation: tx.orderInformation,
        paymentInformation: tx.paymentInformation,
        applicationInformation: tx.applicationInformation,
        consumerAuthenticationInformation: tx.consumerAuthenticationInformation,
        // Include full transaction summary for detailed access
        ...tx
      };
    });
    
    const count = transactions.length;
    
    console.log(`[TRANSACTION_SEARCH] Found ${count} transaction(s) (Total matching: ${totalCount})`);
    
    if (transactions.length > 0) {
      transactions.forEach((tx, idx) => {
        const txId = tx.id || 'N/A';
        const txStatus = tx.status || 'UNKNOWN';
        const txRef = tx.clientReferenceInformation?.code || 'N/A';
        const txType = tx.applicationInformation?.applications?.[0]?.name || 'PAYMENT';
        console.log(`[TRANSACTION_SEARCH]   [${idx + 1}] ID: ${txId}, Status: ${txStatus}, Type: ${txType}, Ref: ${txRef}`);
      });
    } else {
      console.log('[TRANSACTION_SEARCH] ⚠️ No transactions found (may need time to index)');
    }
    
    console.log('[TRANSACTION_SEARCH] ========== Search Complete ==========');
    
    return {
      ...getResult.data,
      transactions,
      count,
    };
  } catch (err) {
    console.log('[TRANSACTION_SEARCH] ❌ Search failed');
    console.log(`[TRANSACTION_SEARCH] Error: ${err.error || err.message || err}`);
    if (err.response) {
      console.log(`[TRANSACTION_SEARCH] Response status: ${err.response.status}`);
      console.log(`[TRANSACTION_SEARCH] Response body: ${err.response.text || JSON.stringify(err.response.data)}`);
    }
    throw err;
  }
}

/**
 * Check if payer authentication (3D Secure) is required for a card payment.
 * This should be called before processing the payment to determine if 3D Secure is needed.
 */
async function checkPayerAuthEnrollment({
  amount,
  currency,
  card,
  billingInfo,
  referenceCode,
}) {
  console.log('[PAYER_AUTH] ========== Starting 3D Secure Enrollment Check ==========');
  console.log(`[PAYER_AUTH] Reference Code: ${referenceCode || 'ENROLL_' + Date.now().toString()}`);
  console.log(`[PAYER_AUTH] Amount: ${amount} ${currency}`);
  console.log(`[PAYER_AUTH] Card: ****${card.number.slice(-4)} (Exp: ${card.expirationMonth}/${card.expirationYear})`);
  console.log(`[PAYER_AUTH] Billing: ${billingInfo?.firstName || ''} ${billingInfo?.lastName || ''}, ${billingInfo?.email || ''}`);
  
  const { configObject, apiClient } = createApiClients();

  const requestObj = new cybersourceRestApi.CheckPayerAuthEnrollmentRequest();

  const clientReferenceInformation =
    new cybersourceRestApi.Riskv1authenticationsetupsClientReferenceInformation();
  clientReferenceInformation.code =
    referenceCode || 'ENROLL_' + Date.now().toString();
  requestObj.clientReferenceInformation = clientReferenceInformation;

  const orderInformation =
    new cybersourceRestApi.Riskv1authenticationsOrderInformation();
  const orderInformationAmountDetails =
    new cybersourceRestApi.Riskv1authenticationsOrderInformationAmountDetails();
  orderInformationAmountDetails.currency = currency;
  orderInformationAmountDetails.totalAmount = parseFloat(amount)
    .toFixed(2)
    .toString();
  orderInformation.amountDetails = orderInformationAmountDetails;

  const orderInformationBillTo =
    new cybersourceRestApi.Riskv1authenticationsOrderInformationBillTo();
  Object.assign(orderInformationBillTo, billingInfo);
  orderInformation.billTo = orderInformationBillTo;

  requestObj.orderInformation = orderInformation;

  const paymentInformation =
    new cybersourceRestApi.Riskv1authenticationsPaymentInformation();
  const paymentInformationCard =
    new cybersourceRestApi.Riskv1authenticationsetupsPaymentInformationCard();
  paymentInformationCard.number = card.number;
  paymentInformationCard.expirationMonth = card.expirationMonth;
  paymentInformationCard.expirationYear = card.expirationYear;
  if (card.type) {
    paymentInformationCard.type = card.type; // '001' = Visa, '002' = Mastercard, etc.
  }
  paymentInformation.card = paymentInformationCard;
  requestObj.paymentInformation = paymentInformation;

  console.log('[PAYER_AUTH] Sending enrollment check request to CyberSource...');
  
  // Log raw request being sent (sanitize sensitive data)
  console.log('[PAYER_AUTH] 📋 RAW REQUEST TO CYBERSOURCE:');
  try {
    const requestLog = {
      clientReferenceInformation: {
        code: requestObj.clientReferenceInformation?.code || 'N/A'
      },
      orderInformation: {
        amountDetails: {
          currency: requestObj.orderInformation?.amountDetails?.currency || 'N/A',
          totalAmount: requestObj.orderInformation?.amountDetails?.totalAmount || 'N/A'
        },
        billTo: {
          firstName: requestObj.orderInformation?.billTo?.firstName || 'N/A',
          lastName: requestObj.orderInformation?.billTo?.lastName || 'N/A',
          email: requestObj.orderInformation?.billTo?.email || 'N/A',
          country: requestObj.orderInformation?.billTo?.country || 'N/A'
        }
      },
      paymentInformation: {
        card: {
          number: requestObj.paymentInformation?.card?.number ? `****${requestObj.paymentInformation.card.number.slice(-4)}` : 'N/A',
          expirationMonth: requestObj.paymentInformation?.card?.expirationMonth || 'N/A',
          expirationYear: requestObj.paymentInformation?.card?.expirationYear || 'N/A',
          type: requestObj.paymentInformation?.card?.type || 'N/A'
        }
      }
    };
    console.log(JSON.stringify(requestLog, null, 2));
  } catch (e) {
    console.log('[PAYER_AUTH] ⚠️ Could not log request details');
  }
  
  const instance = new cybersourceRestApi.PayerAuthenticationApi(
    configObject,
    apiClient,
  );
  
  try {
    const result = await promisify(
      instance.checkPayerAuthEnrollment.bind(instance),
      requestObj,
    );
    
    console.log('[PAYER_AUTH] ✅ Enrollment check response received');
    console.log(`[PAYER_AUTH] HTTP Status: ${result.response?.status || 'N/A'}`);
    console.log(`[PAYER_AUTH] Status: ${result.data?.status || 'N/A'}`);
    
    // Log raw response from CyberSource
    console.log('[PAYER_AUTH] 📋 RAW CYBERSOURCE RESPONSE:');
    try {
      console.log(JSON.stringify(result.data, null, 2));
    } catch (e) {
      console.log('[PAYER_AUTH] ⚠️ Could not stringify response:', result.data);
    }
    
    const authInfo = result.data?.consumerAuthenticationInformation || {};
    console.log(`[PAYER_AUTH] Veres Enrolled: ${authInfo.veresEnrolled || 'N/A'} (Y=enrolled, N=not enrolled, U=unavailable)`);
    console.log(`[PAYER_AUTH] Authentication Transaction ID: ${authInfo.authenticationTransactionId || 'N/A'}`);
    console.log(`[PAYER_AUTH] Step-up URL: ${authInfo.stepUpUrl ? 'Present' : 'Not present'}`);
    console.log(`[PAYER_AUTH] E-commerce Indicator: ${authInfo.ecommerceIndicator || 'N/A'}`);
    console.log(`[PAYER_AUTH] Specification Version: ${authInfo.specificationVersion || 'N/A'}`);
    
    if (authInfo.directoryServerErrorCode) {
      console.log(`[PAYER_AUTH] ⚠️ Directory Server Error Code: ${authInfo.directoryServerErrorCode}`);
      console.log(`[PAYER_AUTH] ⚠️ Directory Server Error Description: ${authInfo.directoryServerErrorDescription || 'N/A'}`);
    }
    
    console.log('[PAYER_AUTH] ========== Enrollment Check Complete ==========');
    
    return result;
  } catch (error) {
    console.log('[PAYER_AUTH] ❌ Enrollment check failed');
    console.log(`[PAYER_AUTH] Error: ${error.error || error.message || 'Unknown error'}`);
    
    // Log raw error response
    if (error.response) {
      console.log('[PAYER_AUTH] 📋 RAW ERROR RESPONSE:');
      console.log(`[PAYER_AUTH] HTTP Status: ${error.response.status || 'N/A'}`);
      console.log(`[PAYER_AUTH] Response Body: ${error.response.text || 'N/A'}`);
      if (error.response.headers) {
        console.log('[PAYER_AUTH] Response Headers:');
        try {
          console.log(JSON.stringify(error.response.headers, null, 2));
        } catch (e) {
          console.log('[PAYER_AUTH] ⚠️ Could not stringify error headers');
        }
      }
    }
    
    throw error;
  }
}

/**
 * Setup payer authentication (optional, for setup flows).
 * Used when you want to set up authentication without processing a payment.
 */
async function payerAuthSetup({
  card,
  transientToken,
  referenceCode,
  billingInfo,
}) {
  const { configObject, apiClient } = createApiClients();

  const requestObj = new cybersourceRestApi.PayerAuthSetupRequest();

  const clientReferenceInformation =
    new cybersourceRestApi.Riskv1authenticationsetupsClientReferenceInformation();
  clientReferenceInformation.code =
    referenceCode || 'SETUP_' + Date.now().toString();
  requestObj.clientReferenceInformation = clientReferenceInformation;

  const paymentInformation =
    new cybersourceRestApi.Riskv1authenticationsetupsPaymentInformation();

  if (transientToken) {
    const tokenInformation =
      new cybersourceRestApi.Riskv1authenticationsetupsTokenInformation();
    tokenInformation.transientToken = transientToken;
    requestObj.tokenInformation = tokenInformation;
  } else if (card) {
    const paymentInformationCard =
      new cybersourceRestApi.Riskv1authenticationsetupsPaymentInformationCard();
    paymentInformationCard.number = card.number;
    paymentInformationCard.expirationMonth = card.expirationMonth;
    paymentInformationCard.expirationYear = card.expirationYear;
    if (card.type) {
      paymentInformationCard.type = card.type;
    }
    paymentInformation.card = paymentInformationCard;
    requestObj.paymentInformation = paymentInformation;
  } else {
    throw new Error('Either card or transientToken is required');
  }

  const instance = new cybersourceRestApi.PayerAuthenticationApi(
    configObject,
    apiClient,
  );
  return promisify(instance.payerAuthSetup.bind(instance), requestObj);
}

/**
 * Validate authentication results after 3D Secure challenge completion.
 * Call this after the user completes the 3D Secure challenge.
 */
async function validateAuthenticationResults({
  authenticationTransactionId,
  amount,
  currency,
  card,
  billingInfo,
  referenceCode,
}) {
  if (!authenticationTransactionId) {
    throw new Error('authenticationTransactionId is required');
  }

  const { configObject, apiClient } = createApiClients();

  const requestObj = new cybersourceRestApi.ValidateRequest();

  const clientReferenceInformation =
    new cybersourceRestApi.Riskv1authenticationsetupsClientReferenceInformation();
  clientReferenceInformation.code =
    referenceCode || 'VALIDATE_' + Date.now().toString();
  requestObj.clientReferenceInformation = clientReferenceInformation;

  const orderInformation =
    new cybersourceRestApi.Riskv1authenticationresultsOrderInformation();
  const orderInformationAmountDetails =
    new cybersourceRestApi.Riskv1authenticationresultsOrderInformationAmountDetails();
  orderInformationAmountDetails.currency = currency;
  orderInformationAmountDetails.totalAmount = parseFloat(amount)
    .toFixed(2)
    .toString();
  orderInformation.amountDetails = orderInformationAmountDetails;
  requestObj.orderInformation = orderInformation;

  const paymentInformation =
    new cybersourceRestApi.Riskv1authenticationresultsPaymentInformation();
  const paymentInformationCard =
    new cybersourceRestApi.Riskv1authenticationresultsPaymentInformationCard();
  paymentInformationCard.number = card.number;
  paymentInformationCard.expirationMonth = card.expirationMonth;
  paymentInformationCard.expirationYear = card.expirationYear;
  if (card.type) {
    paymentInformationCard.type = card.type;
  }
  paymentInformation.card = paymentInformationCard;
  requestObj.paymentInformation = paymentInformation;

  const consumerAuthenticationInformation =
    new cybersourceRestApi.Riskv1authenticationresultsConsumerAuthenticationInformation();
  consumerAuthenticationInformation.authenticationTransactionId =
    authenticationTransactionId;
  requestObj.consumerAuthenticationInformation = consumerAuthenticationInformation;

  const instance = new cybersourceRestApi.PayerAuthenticationApi(
    configObject,
    apiClient,
  );
  return promisify(
    instance.validateAuthenticationResults.bind(instance),
    requestObj,
  );
}

/**
 * Create card payment with optional 3D Secure authentication transaction ID.
 * If authenticationTransactionId is provided, it will be included in the payment request.
 */
async function createCardPaymentWithAuth({
  amount,
  currency,
  card,
  billingInfo,
  referenceCode,
  capture = true,
  authenticationTransactionId,
  authenticationResult,
}) {
  console.log('[CARD_PAYMENT] ========== Starting Card Payment with 3D Secure ==========');
  console.log(`[CARD_PAYMENT] Reference Code: ${referenceCode || 'PAY_' + Date.now().toString()}`);
  console.log(`[CARD_PAYMENT] Amount: ${amount} ${currency}`);
  console.log(`[CARD_PAYMENT] Card: ****${card.number.slice(-4)} (Exp: ${card.expirationMonth}/${card.expirationYear})`);
  console.log(`[CARD_PAYMENT] Capture: ${capture ? 'YES (authorize + capture)' : 'NO (authorize only)'}`);
  
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
  console.log(`[CARD_PAYMENT] Processing Information: capture=${capture}`);

  // Include 3D Secure authentication data if provided
  if (authenticationTransactionId || authenticationResult) {
    console.log('[CARD_PAYMENT] 🔐 Including 3D Secure authentication data');
    const consumerAuthenticationInformation =
      new cybersourceRestApi.Ptsv2paymentsConsumerAuthenticationInformation();
    if (authenticationTransactionId) {
      consumerAuthenticationInformation.authenticationTransactionId =
        authenticationTransactionId;
      console.log(`[CARD_PAYMENT]   - Authentication Transaction ID: ${authenticationTransactionId}`);
    }
    if (authenticationResult) {
      consumerAuthenticationInformation.authenticationResult =
        authenticationResult; // 'Y' = authenticated, 'N' = not authenticated, 'U' = unavailable
      console.log(`[CARD_PAYMENT]   - Authentication Result: ${authenticationResult} (Y=authenticated, N=not authenticated, U=unavailable)`);
    }
    requestObj.consumerAuthenticationInformation =
      consumerAuthenticationInformation;
  } else {
    console.log('[CARD_PAYMENT] ⚠️ No 3D Secure authentication data provided');
  }

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

  console.log('[CARD_PAYMENT] Sending payment request to CyberSource...');
  
  // Log raw request being sent (sanitize sensitive data)
  console.log('[CARD_PAYMENT] 📋 RAW REQUEST TO CYBERSOURCE:');
  try {
    const requestLog = {
      clientReferenceInformation: {
        code: requestObj.clientReferenceInformation?.code || 'N/A'
      },
      processingInformation: {
        capture: requestObj.processingInformation?.capture !== false
      },
      paymentInformation: {
        card: {
          number: requestObj.paymentInformation?.card?.number ? `****${requestObj.paymentInformation.card.number.slice(-4)}` : 'N/A',
          expirationMonth: requestObj.paymentInformation?.card?.expirationMonth || 'N/A',
          expirationYear: requestObj.paymentInformation?.card?.expirationYear || 'N/A'
        }
      },
      orderInformation: {
        amountDetails: {
          currency: requestObj.orderInformation?.amountDetails?.currency || 'N/A',
          totalAmount: requestObj.orderInformation?.amountDetails?.totalAmount || 'N/A'
        },
        billTo: {
          firstName: requestObj.orderInformation?.billTo?.firstName || 'N/A',
          lastName: requestObj.orderInformation?.billTo?.lastName || 'N/A',
          email: requestObj.orderInformation?.billTo?.email || 'N/A',
          country: requestObj.orderInformation?.billTo?.country || 'N/A'
        }
      },
      consumerAuthenticationInformation: requestObj.consumerAuthenticationInformation ? {
        authenticationTransactionId: requestObj.consumerAuthenticationInformation.authenticationTransactionId || 'N/A',
        authenticationResult: requestObj.consumerAuthenticationInformation.authenticationResult || 'N/A'
      } : null
    };
    console.log(JSON.stringify(requestLog, null, 2));
  } catch (e) {
    console.log('[CARD_PAYMENT] ⚠️ Could not log request details');
  }
  
  const instance = new cybersourceRestApi.PaymentsApi(configObject, apiClient);
  
  try {
    const result = await promisify(instance.createPayment.bind(instance), requestObj);
    
    console.log('[CARD_PAYMENT] ✅ Payment response received');
    console.log(`[CARD_PAYMENT] HTTP Status: ${result.response?.status || 'N/A'}`);
    console.log(`[CARD_PAYMENT] Transaction ID: ${result.data?.id || 'N/A'}`);
    console.log(`[CARD_PAYMENT] Status: ${result.data?.status || 'N/A'}`);
    
    // Log raw response from CyberSource
    console.log('[CARD_PAYMENT] 📋 RAW CYBERSOURCE RESPONSE:');
    try {
      console.log(JSON.stringify(result.data, null, 2));
    } catch (e) {
      console.log('[CARD_PAYMENT] ⚠️ Could not stringify response:', result.data);
    }
    
    // Log raw HTTP response if available
    if (result.response) {
      console.log('[CARD_PAYMENT] 📋 RAW HTTP RESPONSE HEADERS:');
      try {
        console.log(JSON.stringify(result.response.headers || {}, null, 2));
      } catch (e) {
        console.log('[CARD_PAYMENT] ⚠️ Could not stringify headers');
      }
    }
    
    const procInfo = result.data?.processorInformation || {};
    console.log(`[CARD_PAYMENT] Processor Response Code: ${procInfo.responseCode || 'N/A'}`);
    console.log(`[CARD_PAYMENT] Processor Approval Code: ${procInfo.approvalCode || 'N/A'}`);
    console.log(`[CARD_PAYMENT] Processor AVS Code: ${procInfo.avs?.code || 'N/A'}`);
    console.log(`[CARD_PAYMENT] Processor CVV Code: ${procInfo.cardVerification?.resultCode || 'N/A'}`);
    
    const authInfo = result.data?.consumerAuthenticationInformation || {};
    if (authInfo.authenticationTransactionId || authInfo.authenticationResult) {
      console.log('[CARD_PAYMENT] 🔐 3D Secure Authentication Info:');
      console.log(`[CARD_PAYMENT]   - Authentication Transaction ID: ${authInfo.authenticationTransactionId || 'N/A'}`);
      console.log(`[CARD_PAYMENT]   - Authentication Result: ${authInfo.authenticationResult || 'N/A'}`);
      console.log(`[CARD_PAYMENT]   - ECI: ${authInfo.eci || 'N/A'}`);
      console.log(`[CARD_PAYMENT]   - CAVV: ${authInfo.cavv ? 'Present' : 'Not present'}`);
    }
    
    const orderInfo = result.data?.orderInformation?.amountDetails || {};
    console.log(`[CARD_PAYMENT] Amount Details:`);
    console.log(`[CARD_PAYMENT]   - Authorized: ${orderInfo.authorizedAmount || 'N/A'} ${orderInfo.currency || currency}`);
    console.log(`[CARD_PAYMENT]   - Total: ${orderInfo.totalAmount || amount} ${orderInfo.currency || currency}`);
    
    if (result.data?.status === 'AUTHORIZED' && capture) {
      console.log('[CARD_PAYMENT] ✅ Payment AUTHORIZED and CAPTURED (capture=true means authorize+capture in one step)');
      console.log('[CARD_PAYMENT] ℹ️  No separate capture call needed - payment is complete');
    } else if (result.data?.status === 'AUTHORIZED' && !capture) {
      console.log('[CARD_PAYMENT] ✅ Payment AUTHORIZED (separate capture call needed)');
      console.log('[CARD_PAYMENT] ⚠️  Use Capture API to complete the payment');
    } else if (result.data?.status === 'CAPTURED') {
      console.log('[CARD_PAYMENT] ✅ Payment CAPTURED');
    }
    
    console.log('[CARD_PAYMENT] ========== Payment Complete ==========');
    
    return result;
  } catch (error) {
    console.log('[CARD_PAYMENT] ❌ Payment failed');
    console.log(`[CARD_PAYMENT] Error: ${error.error || error.message || 'Unknown error'}`);
    
    // Log raw error response
    if (error.response) {
      console.log('[CARD_PAYMENT] 📋 RAW ERROR RESPONSE:');
      console.log(`[CARD_PAYMENT] HTTP Status: ${error.response.status || 'N/A'}`);
      console.log(`[CARD_PAYMENT] Response Body: ${error.response.text || 'N/A'}`);
      if (error.response.headers) {
        console.log('[CARD_PAYMENT] Response Headers:');
        try {
          console.log(JSON.stringify(error.response.headers, null, 2));
        } catch (e) {
          console.log('[CARD_PAYMENT] ⚠️ Could not stringify error headers');
        }
      }
    }
    
    throw error;
  }
}

/**
 * Charge a payment using a Unified Checkout transient token.
 * Works for both card payments and Google Pay from Unified Checkout.
 */
async function chargeUnifiedCheckoutToken({
  transientToken,
  amount,
  currency,
  referenceCode,
  billingInfo,
  paymentType = 'CARD', // 'CARD' or 'GOOGLEPAY'
}) {
  console.log('[UNIFIED_CHECKOUT] ========== Starting Unified Checkout Payment from Transient Token ==========');
  console.log(`[UNIFIED_CHECKOUT] Reference Code: ${referenceCode || 'UC_' + Date.now().toString()}`);
  console.log(`[UNIFIED_CHECKOUT] Amount: ${amount} ${currency}`);
  console.log(`[UNIFIED_CHECKOUT] Payment Type: ${paymentType}`);
  console.log(`[UNIFIED_CHECKOUT] Transient Token Length: ${transientToken ? String(transientToken).length : 0} characters`);
  console.log(`[UNIFIED_CHECKOUT] Billing Info: ${billingInfo ? JSON.stringify(billingInfo) : 'Not provided'}`);
  
  if (!transientToken) {
    throw new Error('transientToken is required');
  }

  const { configObject, apiClient } = createApiClients();

  const requestObj = new cybersourceRestApi.CreatePaymentRequest();

  const clientReferenceInformation =
    new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
  clientReferenceInformation.code =
    referenceCode || 'UC_' + Date.now().toString();
  requestObj.clientReferenceInformation = clientReferenceInformation;

  const processingInformation =
    new cybersourceRestApi.Ptsv2paymentsProcessingInformation();
  processingInformation.capture = true;
  // Only set paymentSolution for Google Pay tokens
  // For Unified Checkout card payments, don't set paymentSolution
  if (paymentType === 'GOOGLEPAY') {
    processingInformation.paymentSolution = '012';
    console.log('[UNIFIED_CHECKOUT] Payment Solution: 012 (Google Pay token)');
  } else {
    console.log('[UNIFIED_CHECKOUT] Payment Solution: Not set (Card payment via Unified Checkout)');
  }
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

  // For Unified Checkout card payments, CyberSource requires transientTokenJwt (not transientToken)
  // See: Unified Checkout PDF documentation page 58 - "To send the transient token with a request, use the tokenInformation.transientTokenJwt field"
  const tokenInformation = new cybersourceRestApi.Ptsv2paymentsTokenInformation();
  
  // Try to set transientTokenJwt first (the correct field name for Unified Checkout)
  // The SDK might not expose this property, so we'll set it directly on the object
  try {
    // Method 1: Try setting as a property (if SDK supports it)
    if ('transientTokenJwt' in tokenInformation || tokenInformation.transientTokenJwt !== undefined) {
      tokenInformation.transientTokenJwt = transientToken;
      console.log('[UNIFIED_CHECKOUT] ✅ Set transientTokenJwt as property');
    } else {
      // Method 2: Set via bracket notation (works even if property doesn't exist)
      tokenInformation['transientTokenJwt'] = transientToken;
      console.log('[UNIFIED_CHECKOUT] ✅ Set transientTokenJwt via bracket notation');
    }
    
    // Also set transientToken as fallback (some SDK versions might need both)
    tokenInformation.transientToken = transientToken;
    console.log('[UNIFIED_CHECKOUT] ✅ Also set transientToken as fallback');
  } catch (e) {
    console.log('[UNIFIED_CHECKOUT] ⚠️ Error setting transientTokenJwt:', e.message);
    // Fallback to transientToken only
    tokenInformation.transientToken = transientToken;
    console.log('[UNIFIED_CHECKOUT] ⚠️ Using transientToken only (fallback)');
  }
  
  requestObj.tokenInformation = tokenInformation;
  
  // Ensure transientTokenJwt is set on the final requestObj (override SDK serialization if needed)
  // This ensures the correct field name is sent to CyberSource
  if (!requestObj.tokenInformation.transientTokenJwt && !requestObj.tokenInformation['transientTokenJwt']) {
    console.log('[UNIFIED_CHECKOUT] ⚠️ transientTokenJwt missing on requestObj, setting directly...');
    // Create a new object with transientTokenJwt
    const tokenInfoObj = {};
    if (requestObj.tokenInformation.transientToken) {
      tokenInfoObj.transientToken = requestObj.tokenInformation.transientToken;
    }
    tokenInfoObj.transientTokenJwt = transientToken;
    requestObj.tokenInformation = tokenInfoObj;
    console.log('[UNIFIED_CHECKOUT] ✅ Set transientTokenJwt directly on requestObj.tokenInformation');
  }
  
  console.log('[UNIFIED_CHECKOUT] 🔍 Final tokenInformation structure:');
  console.log('[UNIFIED_CHECKOUT]   - Keys:', Object.keys(requestObj.tokenInformation || {}));
  console.log('[UNIFIED_CHECKOUT]   - Has transientToken:', !!requestObj.tokenInformation?.transientToken);
  console.log('[UNIFIED_CHECKOUT]   - Has transientTokenJwt:', !!(requestObj.tokenInformation?.transientTokenJwt || requestObj.tokenInformation?.['transientTokenJwt']));

  console.log('[UNIFIED_CHECKOUT] Sending payment request to CyberSource...');
  console.log('[UNIFIED_CHECKOUT] TokenInformation keys:', Object.keys(tokenInformation));
  console.log('📋 RAW REQUEST TO CYBERSOURCE (chargeUnifiedCheckoutToken):', JSON.stringify(requestObj, (key, value) => {
    if ((key === 'transientToken' || key === 'transientTokenJwt') && typeof value === 'string') {
      return `[TRANSIENT_TOKEN_${value.length}_chars]`;
    }
    return value;
  }, 2));

  const instance = new cybersourceRestApi.PaymentsApi(configObject, apiClient);
  const result = await promisify(instance.createPayment.bind(instance), requestObj);

  console.log('[UNIFIED_CHECKOUT] ✅ Payment response received');
  console.log('📋 RAW CYBERSOURCE RESPONSE (chargeUnifiedCheckoutToken):', JSON.stringify(result.data, null, 2));
  console.log('📋 RAW HTTP RESPONSE HEADERS (chargeUnifiedCheckoutToken):', result.response.header);

  const processorInfo = result.data?.processorInformation || {};
  const responseAmountDetails = result.data?.orderInformation?.amountDetails || {};
  const errorInfo = result.data?.errorInformation || {};

  console.log(`[UNIFIED_CHECKOUT] Transaction ID: ${result.data?.id}`);
  console.log(`[UNIFIED_CHECKOUT] HTTP Status: ${result.response?.status}`);
  
  // Infer status from HTTP status code and processor response code
  // HTTP 201 = Created/Authorized, responseCode "00" = Approved
  const httpStatus = result.response?.status;
  const responseCode = processorInfo.responseCode;
  let inferredStatus = result.data?.status;
  
  if (!inferredStatus) {
    if (httpStatus === 201 && responseCode === '00') {
      inferredStatus = 'AUTHORIZED'; // Payment authorized and captured (since capture=true)
      console.log(`[UNIFIED_CHECKOUT] ✅ Status inferred: AUTHORIZED (HTTP ${httpStatus}, ResponseCode ${responseCode})`);
    } else if (httpStatus === 201) {
      inferredStatus = 'AUTHORIZED';
      console.log(`[UNIFIED_CHECKOUT] ✅ Status inferred: AUTHORIZED (HTTP ${httpStatus})`);
    } else if (errorInfo.reason) {
      inferredStatus = 'FAILED';
      console.log(`[UNIFIED_CHECKOUT] ❌ Status inferred: FAILED (Error: ${errorInfo.reason})`);
    } else {
      inferredStatus = 'PENDING';
      console.log(`[UNIFIED_CHECKOUT] ⚠️ Status inferred: PENDING (HTTP ${httpStatus}, ResponseCode ${responseCode})`);
    }
  } else {
    console.log(`[UNIFIED_CHECKOUT] Status: ${inferredStatus}`);
  }
  
  if (errorInfo.reason) {
    console.log(`[UNIFIED_CHECKOUT] ⚠️ Error Reason: ${errorInfo.reason}`);
    console.log(`[UNIFIED_CHECKOUT] ⚠️ Error Message: ${errorInfo.message}`);
  }
  
  if (processorInfo.responseCode) {
    console.log(`[UNIFIED_CHECKOUT] Processor Response Code: ${processorInfo.responseCode}`);
  }
  if (processorInfo.approvalCode) {
    console.log(`[UNIFIED_CHECKOUT] Processor Approval Code: ${processorInfo.approvalCode}`);
  }
  
  // Use requested amount if authorizedAmount is 0.00 (some CyberSource responses don't include amount)
  const authorizedAmount = responseAmountDetails.authorizedAmount && parseFloat(responseAmountDetails.authorizedAmount) > 0
    ? responseAmountDetails.authorizedAmount
    : amount; // Fallback to requested amount
  
  if (responseAmountDetails.currency) {
    console.log(`[UNIFIED_CHECKOUT] Amount Details:`);
    console.log(`[UNIFIED_CHECKOUT]   - Authorized: ${authorizedAmount} ${responseAmountDetails.currency}`);
    console.log(`[UNIFIED_CHECKOUT]   - Total: ${responseAmountDetails.totalAmount || authorizedAmount} ${responseAmountDetails.currency}`);
  }

  if (inferredStatus === 'AUTHORIZED' || inferredStatus === 'CAPTURED') {
    console.log(`[UNIFIED_CHECKOUT] ✅ Payment AUTHORIZED and CAPTURED`);
    console.log(`[UNIFIED_CHECKOUT] ℹ️  No separate capture call needed - payment is complete`);
  } else if (errorInfo.reason) {
    console.log(`[UNIFIED_CHECKOUT] ❌ Payment failed: ${errorInfo.reason} - ${errorInfo.message}`);
    throw new Error(`${errorInfo.reason}: ${errorInfo.message || 'Payment failed'}`);
  }
  
  // Add inferred status to result data for easier access
  if (!result.data.status) {
    result.data.status = inferredStatus;
  }

  console.log('[UNIFIED_CHECKOUT] ========== Payment Complete ==========');

  return {
    ok: true,
    data: result.data,
    response: result.response,
  };
}

module.exports = {
  createCardPayment,
  createCardPaymentWithAuth,
  generateCaptureContext,
  chargeGooglePayToken,
  createGooglePayPaymentFromBlob,
  checkPayerAuthEnrollment,
  payerAuthSetup,
  validateAuthenticationResults,
  searchTransactionsByReference,
  chargeUnifiedCheckoutToken,
};

