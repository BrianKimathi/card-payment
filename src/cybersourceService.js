"use strict";

const cybersourceRestApi = require("cybersource-rest-client");
const path = require("path");
const configuration = require(path.resolve("Configuration.js"));

function createApiClients() {
  const configObject = new configuration();
  const apiClient = new cybersourceRestApi.ApiClient();
  
  // Explicitly set the base path based on runEnvironment
  // This ensures we use the correct environment (sandbox vs production)
  const runEnvironment = configObject.runEnvironment || "apitest.cybersource.com";
  const basePath = `https://${runEnvironment}`;
  apiClient.basePath = basePath;
  
  // Log the configuration for debugging (only log first 20 chars of key ID for security)
  console.log(`[API_CLIENT] Using environment: ${runEnvironment}`);
  console.log(`[API_CLIENT] Base path: ${basePath}`);
  console.log(`[API_CLIENT] Merchant ID: ${configObject.merchantID || "NOT SET"}`);
  console.log(`[API_CLIENT] Merchant Key ID: ${configObject.merchantKeyId ? configObject.merchantKeyId.substring(0, 20) + "..." : "NOT SET"}`);
  console.log(`[API_CLIENT] Auth Type: ${configObject.authenticationType || "NOT SET"}`);
  
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

/**
 * TEMPORARY WORKAROUND: Convert 2.00 to 2.01 to bypass CyberSource discount rule.
 * TODO: Remove this once the $2.00 discount rule is disabled in CyberSource Business Center.
 * 
 * @param {string|number} amount - The payment amount
 * @returns {string} - The adjusted amount as a string
 */
function applyAmountWorkaround(amount) {
  const numAmount = parseFloat(amount);
  // Check if amount is exactly 2.00 (with tolerance for floating point precision)
  if (Math.abs(numAmount - 2.0) < 0.001) {
    console.warn(
      "[WORKAROUND] ⚠️ Converting 2.00 to 2.01 to bypass CyberSource discount rule"
    );
    return "2.01";
  }
  return parseFloat(amount).toFixed(2).toString();
}

async function createCardPayment({
  amount,
  currency,
  card,
  billingInfo,
  referenceCode,
  capture = true,
}) {
  console.log(
    "[CARD_PAYMENT] ========== Starting Standard Card Payment =========="
  );
  console.log(
    `[CARD_PAYMENT] Reference Code: ${
      referenceCode || "PAY_" + Date.now().toString()
    }`
  );
  console.log(`[CARD_PAYMENT] Amount: ${amount} ${currency}`);
  console.log(
    `[CARD_PAYMENT] Card: ****${card.number.slice(-4)} (Exp: ${
      card.expirationMonth
    }/${card.expirationYear})`
  );
  console.log(
    `[CARD_PAYMENT] Capture: ${
      capture ? "YES (authorize + capture)" : "NO (authorize only)"
    }`
  );
  console.log(`[CARD_PAYMENT] 3D Secure: Not used (standard flow)`);

  const { configObject, apiClient } = createApiClients();

  const requestObj = new cybersourceRestApi.CreatePaymentRequest();

  const clientReferenceInformation =
    new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
  clientReferenceInformation.code =
    referenceCode || "PAY_" + Date.now().toString();
  requestObj.clientReferenceInformation = clientReferenceInformation;

  const processingInformation =
    new cybersourceRestApi.Ptsv2paymentsProcessingInformation();
  processingInformation.capture = capture;
  requestObj.processingInformation = processingInformation;
  console.log(`[CARD_PAYMENT] Processing Information: capture=${capture}`);

  const paymentInformation =
    new cybersourceRestApi.Ptsv2paymentsPaymentInformation();
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

  console.log("[CARD_PAYMENT] Sending payment request to CyberSource...");

  // Log raw request being sent (sanitize sensitive data)
  console.log("[CARD_PAYMENT] 📋 RAW REQUEST TO CYBERSOURCE:");
  try {
    const requestLog = {
      clientReferenceInformation: {
        code: requestObj.clientReferenceInformation?.code || "N/A",
      },
      processingInformation: {
        capture: requestObj.processingInformation?.capture !== false,
      },
      paymentInformation: {
        card: {
          number: requestObj.paymentInformation?.card?.number
            ? `****${requestObj.paymentInformation.card.number.slice(-4)}`
            : "N/A",
          expirationMonth:
            requestObj.paymentInformation?.card?.expirationMonth || "N/A",
          expirationYear:
            requestObj.paymentInformation?.card?.expirationYear || "N/A",
        },
      },
      orderInformation: {
        amountDetails: {
          currency:
            requestObj.orderInformation?.amountDetails?.currency || "N/A",
          totalAmount:
            requestObj.orderInformation?.amountDetails?.totalAmount || "N/A",
        },
        billTo: {
          firstName: requestObj.orderInformation?.billTo?.firstName || "N/A",
          lastName: requestObj.orderInformation?.billTo?.lastName || "N/A",
          email: requestObj.orderInformation?.billTo?.email || "N/A",
          country: requestObj.orderInformation?.billTo?.country || "N/A",
        },
      },
    };
    console.log(JSON.stringify(requestLog, null, 2));
  } catch (e) {
    console.log("[CARD_PAYMENT] ⚠️ Could not log request details");
  }

  const instance = new cybersourceRestApi.PaymentsApi(configObject, apiClient);

  try {
    const result = await promisify(
      instance.createPayment.bind(instance),
      requestObj
    );

    console.log("[CARD_PAYMENT] ✅ Payment response received");
    console.log(
      `[CARD_PAYMENT] HTTP Status: ${result.response?.status || "N/A"}`
    );
    console.log(`[CARD_PAYMENT] Transaction ID: ${result.data?.id || "N/A"}`);
    console.log(`[CARD_PAYMENT] Status: ${result.data?.status || "N/A"}`);

    // Log raw response from CyberSource
    console.log("[CARD_PAYMENT] 📋 RAW CYBERSOURCE RESPONSE:");
    try {
      console.log(JSON.stringify(result.data, null, 2));
    } catch (e) {
      console.log(
        "[CARD_PAYMENT] ⚠️ Could not stringify response:",
        result.data
      );
    }

    // Log raw HTTP response if available
    if (result.response) {
      console.log("[CARD_PAYMENT] 📋 RAW HTTP RESPONSE HEADERS:");
      try {
        console.log(JSON.stringify(result.response.headers || {}, null, 2));
      } catch (e) {
        console.log("[CARD_PAYMENT] ⚠️ Could not stringify headers");
      }
    }

    const procInfo = result.data?.processorInformation || {};
    console.log(
      `[CARD_PAYMENT] Processor Response Code: ${
        procInfo.responseCode || "N/A"
      }`
    );
    console.log(
      `[CARD_PAYMENT] Processor Approval Code: ${
        procInfo.approvalCode || "N/A"
      }`
    );

    const orderInfo = result.data?.orderInformation?.amountDetails || {};
    console.log(`[CARD_PAYMENT] Amount Details:`);
    console.log(
      `[CARD_PAYMENT]   - Authorized: ${orderInfo.authorizedAmount || "N/A"} ${
        orderInfo.currency || currency
      }`
    );
    console.log(
      `[CARD_PAYMENT]   - Total: ${orderInfo.totalAmount || amount} ${
        orderInfo.currency || currency
      }`
    );

    if (result.data?.status === "AUTHORIZED" && capture) {
      console.log(
        "[CARD_PAYMENT] ✅ Payment AUTHORIZED and CAPTURED (capture=true means authorize+capture in one step)"
      );
      console.log(
        "[CARD_PAYMENT] ℹ️  No separate capture call needed - payment is complete"
      );
    } else if (result.data?.status === "AUTHORIZED" && !capture) {
      console.log(
        "[CARD_PAYMENT] ✅ Payment AUTHORIZED (separate capture call needed)"
      );
      console.log("[CARD_PAYMENT] ⚠️  Use Capture API to complete the payment");
    } else if (result.data?.status === "CAPTURED") {
      console.log("[CARD_PAYMENT] ✅ Payment CAPTURED");
    }

    console.log("[CARD_PAYMENT] ========== Payment Complete ==========");

    return result;
  } catch (error) {
    console.log("[CARD_PAYMENT] ❌ Payment failed");
    console.log(
      `[CARD_PAYMENT] Error: ${error.error || error.message || "Unknown error"}`
    );

    // Log raw error response
    if (error.response) {
      console.log("[CARD_PAYMENT] 📋 RAW ERROR RESPONSE:");
      console.log(
        `[CARD_PAYMENT] HTTP Status: ${error.response.status || "N/A"}`
      );
      console.log(
        `[CARD_PAYMENT] Response Body: ${error.response.text || "N/A"}`
      );
      if (error.response.headers) {
        console.log("[CARD_PAYMENT] Response Headers:");
        try {
          console.log(JSON.stringify(error.response.headers, null, 2));
        } catch (e) {
          console.log("[CARD_PAYMENT] ⚠️ Could not stringify error headers");
        }
      }
    }

    throw error;
  }
}

async function generateCaptureContext(options = {}) {
  const {
    targetOrigins = ["https://localhost"],
    allowedCardNetworks = ["VISA", "MASTERCARD"],
    // Default to both PANENTRY (card) and GOOGLEPAY for unified checkout
    allowedPaymentTypes = ["PANENTRY", "GOOGLEPAY"],
    country = "KE",
    locale = "en_KE",
    amount = "1.00",
    currency = "USD",
    clientVersion = "0.31",
    // Optional client reference code (helps correlate capture-context -> token -> payment)
    referenceCode = null,
    // Complete Mandate options
    useCompleteMandate = false, // Set to true to enable service orchestration
    completeMandateType = "CAPTURE", // 'CAPTURE', 'AUTH', or 'PREFER_AUTH'
    enableDecisionManager = true,
    enableConsumerAuthentication = true,
    enableTmsTokenCreate = false,
    tmsTokenTypes = [],
    // Billing info for pre-fill
    billingInfo = null,
  } = options;

  const { configObject, apiClient } = createApiClients();

  // Map "CARD" to "PANENTRY" for Unified Checkout (CyberSource requirement)
  const normalizedPaymentTypes = allowedPaymentTypes.map((type) =>
    type === "CARD" ? "PANENTRY" : type
  );

  const requestObj =
    new cybersourceRestApi.GenerateUnifiedCheckoutCaptureContextRequest();
  requestObj.clientVersion = clientVersion;
  // Normalize targetOrigins - ensure all URLs are trimmed and valid
  requestObj.targetOrigins = Array.isArray(targetOrigins)
    ? targetOrigins
        .map((origin) => (typeof origin === "string" ? origin.trim() : origin))
        .filter((origin) => origin && origin.length > 0)
    : typeof targetOrigins === "string"
    ? [targetOrigins.trim()]
    : targetOrigins;
  requestObj.allowedCardNetworks = allowedCardNetworks;
  requestObj.allowedPaymentTypes = normalizedPaymentTypes;
  requestObj.country = country;
  requestObj.locale = locale;

  const amountDetails =
    new cybersourceRestApi.Upv1capturecontextsOrderInformationAmountDetails();
  // TEMPORARY WORKAROUND: Convert 2.00 to 2.01 to bypass CyberSource discount rule
  amountDetails.totalAmount = applyAmountWorkaround(amount);
  amountDetails.currency = currency;

  // #region agent log
  // Instrumentation: Log capture context amount
  fetch("http://127.0.0.1:7244/ingest/927f92d7-6e46-4215-ba8b-2c4152d16b3b", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "cybersourceService.js:298",
      message: "Capture context amount details",
      data: {
        totalAmount: amountDetails.totalAmount,
        currency: amountDetails.currency,
        inputAmount: amount,
        useCompleteMandate: useCompleteMandate,
        completeMandateType: completeMandateType,
      },
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "post-fix",
      hypothesisId: "O",
    }),
  }).catch(() => {});
  // #endregion

  const orderInformation =
    new cybersourceRestApi.Upv1capturecontextsOrderInformation();
  orderInformation.amountDetails = amountDetails;

  // Prefill billing info ONLY when we actually have user data.
  // If we send placeholder values here, Unified Checkout will show them in the UI which is confusing.
  // Also, billTo is not required for capture-context generation (amountDetails is the important part).
  const setIfNonEmpty = (obj, key, val) => {
    if (val === undefined || val === null) return;
    if (typeof val === "string" && val.trim() === "") return;
    obj[key] = typeof val === "string" ? val.trim() : val;
  };

  // Create billTo as plain object (SDK may not have separate class for capture context billTo)
  const billTo = {};

  console.log(
    "[CAPTURE_CONTEXT] 📋 Processing billingInfo:",
    billingInfo ? JSON.stringify(billingInfo) : "null"
  );

  if (billingInfo) {
    setIfNonEmpty(billTo, "firstName", billingInfo.firstName);
    setIfNonEmpty(billTo, "lastName", billingInfo.lastName);
    setIfNonEmpty(billTo, "email", billingInfo.email);
    setIfNonEmpty(billTo, "phoneNumber", billingInfo.phoneNumber);
    setIfNonEmpty(billTo, "address1", billingInfo.address1);
    setIfNonEmpty(billTo, "locality", billingInfo.locality);
    setIfNonEmpty(billTo, "administrativeArea", billingInfo.administrativeArea);
    setIfNonEmpty(billTo, "postalCode", billingInfo.postalCode);
    setIfNonEmpty(billTo, "country", billingInfo.country);
    setIfNonEmpty(billTo, "buildingNumber", billingInfo.buildingNumber);

    // Normalize country to upper-case (if provided)
    if (typeof billTo.country === "string") {
      billTo.country = billTo.country.toUpperCase();
    }
  }

  if (Object.keys(billTo).length > 0) {
    // Include billTo with available fields, using safe defaults for missing required fields.
    // This helps Decision Manager evaluate transactions properly.
    // Minimum required: firstName, lastName, email, country
    const hasMinimumFields = 
      billTo.firstName && billTo.firstName.trim() &&
      billTo.lastName && billTo.lastName.trim() &&
      billTo.email && billTo.email.trim() &&
      billTo.country && billTo.country.trim();

    if (hasMinimumFields) {
      // Use safe defaults for missing required fields
      const ensureValue = (val, fallback) => {
        if (val === undefined || val === null) return fallback;
        if (typeof val === "string" && val.trim() === "") return fallback;
        return val;
      };

      const completeBillTo = {
        firstName: billTo.firstName.trim(),
        lastName: billTo.lastName.trim(),
        email: billTo.email.trim(),
        phoneNumber: ensureValue(billTo.phoneNumber, "0000000"),
        address1: ensureValue(billTo.address1, "123 Main Street"),
        locality: ensureValue(billTo.locality, "Nairobi"),
        postalCode: ensureValue(billTo.postalCode, "00000"),
        country: billTo.country.trim().toUpperCase(),
        buildingNumber: ensureValue(billTo.buildingNumber, "1"),
        // administrativeArea is REQUIRED when billTo is included (per CyberSource validation)
        administrativeArea: ensureValue(billTo.administrativeArea, "Nairobi"),
      };

      orderInformation.billTo = completeBillTo;
      console.log(
        "[CAPTURE_CONTEXT] ✅ Added orderInformation.billTo to capture context (with safe defaults for missing fields)"
      );
    } else {
      console.warn(
        "[CAPTURE_CONTEXT] ⚠️ Insufficient billingInfo (missing firstName, lastName, email, or country); omitting billTo"
      );
    }
  } else {
    console.log(
      "[CAPTURE_CONTEXT] ℹ️ No billingInfo provided (or empty) — not setting orderInformation.billTo (no prefill)"
    );
  }

  // IMPORTANT (per Unified Checkout docs): orderInformation must be nested under "data"
  // (data.orderInformation.amountDetails.currency/totalAmount are required fields).
  // If we attach orderInformation at the top-level, UC may ignore it, leading to tokens
  // with empty amountDetails ({}), and $0.00 payments.
  const dataObj = {
    orderInformation: orderInformation,
    clientReferenceInformation: {
      code: referenceCode || `UC_CTX_${Date.now()}`,
    },
  };
  requestObj.data = dataObj;

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
        const tms =
          new cybersourceRestApi.Upv1capturecontextsCompleteMandateTms();
        tms.tokenCreate = true;
        tms.tokenTypes = tmsTokenTypes;
        completeMandate.tms = tms;
      }

      requestObj.completeMandate = completeMandate;
      console.log("[CAPTURE_CONTEXT] Complete Mandate enabled:", {
        type: completeMandateType,
        decisionManager: enableDecisionManager,
        consumerAuthentication: enableConsumerAuthentication,
      });
    } catch (err) {
      console.warn(
        "[CAPTURE_CONTEXT] Failed to create CompleteMandate object:",
        err.message
      );
      // Continue without complete mandate if SDK doesn't support it
    }
  }

  const captureMandate =
    new cybersourceRestApi.Upv1capturecontextsCaptureMandate();
  captureMandate.billingType = "FULL";
  captureMandate.requestEmail = true;
  captureMandate.requestPhone = true;
  captureMandate.requestShipping = false;
  captureMandate.showAcceptedNetworkIcons = true;
  requestObj.captureMandate = captureMandate;

  const instance = new cybersourceRestApi.UnifiedCheckoutCaptureContextApi(
    configObject,
    apiClient
  );

  // Log the full request object for debugging
  console.log(
    "[CAPTURE_CONTEXT] 📋 Full request object:",
    JSON.stringify(requestObj, null, 2)
  );
  console.log("[CAPTURE_CONTEXT] Request details:");
  console.log("[CAPTURE_CONTEXT]   - clientVersion:", requestObj.clientVersion);
  console.log("[CAPTURE_CONTEXT]   - targetOrigins:", requestObj.targetOrigins);
  console.log(
    "[CAPTURE_CONTEXT]   - allowedCardNetworks:",
    requestObj.allowedCardNetworks
  );
  console.log(
    "[CAPTURE_CONTEXT]   - allowedPaymentTypes:",
    requestObj.allowedPaymentTypes
  );
  console.log("[CAPTURE_CONTEXT]   - country:", requestObj.country);
  console.log("[CAPTURE_CONTEXT]   - locale:", requestObj.locale);
  console.log(
    "[CAPTURE_CONTEXT]   - data.orderInformation:",
    requestObj.data?.orderInformation ? "present" : "missing"
  );
  console.log(
    "[CAPTURE_CONTEXT]   - data.clientReferenceInformation:",
    requestObj.data?.clientReferenceInformation ? "present" : "missing"
  );
  console.log(
    "[CAPTURE_CONTEXT]   - captureMandate:",
    requestObj.captureMandate ? "present" : "missing"
  );
  console.log(
    "[CAPTURE_CONTEXT]   - completeMandate:",
    requestObj.completeMandate ? "present" : "missing"
  );

  // CRITICAL: Log billTo details to verify they're being set correctly
  if (requestObj.data?.orderInformation?.billTo) {
    console.log("[CAPTURE_CONTEXT] 📋 billTo details:");
    console.log(
      "[CAPTURE_CONTEXT]   - address1:",
      requestObj.data.orderInformation.billTo.address1 || "MISSING"
    );
    console.log(
      "[CAPTURE_CONTEXT]   - locality:",
      requestObj.data.orderInformation.billTo.locality || "MISSING"
    );
    console.log(
      "[CAPTURE_CONTEXT]   - country:",
      requestObj.data.orderInformation.billTo.country || "MISSING"
    );
    console.log(
      "[CAPTURE_CONTEXT]   - firstName:",
      requestObj.data.orderInformation.billTo.firstName || "MISSING"
    );
    console.log(
      "[CAPTURE_CONTEXT]   - lastName:",
      requestObj.data.orderInformation.billTo.lastName || "MISSING"
    );
    console.log(
      "[CAPTURE_CONTEXT]   - email:",
      requestObj.data.orderInformation.billTo.email || "MISSING"
    );
    console.log(
      "[CAPTURE_CONTEXT]   - phoneNumber:",
      requestObj.data.orderInformation.billTo.phoneNumber || "MISSING"
    );
    console.log(
      "[CAPTURE_CONTEXT]   - postalCode:",
      requestObj.data.orderInformation.billTo.postalCode || "MISSING"
    );
    console.log(
      "[CAPTURE_CONTEXT]   - buildingNumber:",
      requestObj.data.orderInformation.billTo.buildingNumber || "MISSING"
    );
    console.log(
      "[CAPTURE_CONTEXT]   - administrativeArea:",
      requestObj.data.orderInformation.billTo.administrativeArea || "MISSING"
    );

    // Log the actual billTo object structure
    fetch("http://127.0.0.1:7244/ingest/927f92d7-6e46-4215-ba8b-2c4152d16b3b", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "cybersourceService.js:436",
        message: "Capture context billTo structure",
        data: { billTo: requestObj.data.orderInformation.billTo },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "capture-context-debug",
        hypothesisId: "M",
      }),
    }).catch(() => {});
  } else {
    console.error("[CAPTURE_CONTEXT] ❌ data.orderInformation.billTo is MISSING!");
    fetch("http://127.0.0.1:7244/ingest/927f92d7-6e46-4215-ba8b-2c4152d16b3b", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "cybersourceService.js:448",
        message: "ERROR: billTo missing from capture context",
        data: {
          hasOrderInfo: !!requestObj.data?.orderInformation,
          hasBillTo: !!(
            requestObj.data?.orderInformation && requestObj.data.orderInformation.billTo
          ),
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "capture-context-debug",
        hypothesisId: "M",
      }),
    }).catch(() => {});
  }

  let response;
  try {
    const result = await promisify(
      instance.generateUnifiedCheckoutCaptureContext.bind(instance),
      requestObj
    );
    response = result.response;
    console.log(
      "[CAPTURE_CONTEXT] ✅ Response received, status:",
      response.statusCode
    );
    console.log(
      "[CAPTURE_CONTEXT] Response text length:",
      response.text ? response.text.length : 0
    );
    if (response.text && response.text.length > 0) {
      console.log(
        "[CAPTURE_CONTEXT] Response preview (first 200 chars):",
        response.text.substring(0, 200)
      );
    }
  } catch (error) {
    console.error("[CAPTURE_CONTEXT] ❌ Error generating capture context:");
    console.error("[CAPTURE_CONTEXT] Error type:", typeof error);
    console.error(
      "[CAPTURE_CONTEXT] Error message:",
      error.message || error.error || "Unknown error"
    );
    if (error.response) {
      console.error(
        "[CAPTURE_CONTEXT] Error response status:",
        error.response.statusCode
      );
      console.error(
        "[CAPTURE_CONTEXT] Error response text:",
        error.response.text
      );
      console.error(
        "[CAPTURE_CONTEXT] Error response headers:",
        error.response.header
      );
    }
    if (error.error) {
      console.error(
        "[CAPTURE_CONTEXT] Error details:",
        JSON.stringify(error.error, null, 2)
      );
    }
    throw error;
  }

  const rawContext = (response.text || "").trim();
  const normalizedContext =
    rawContext.startsWith('"') && rawContext.endsWith('"')
      ? rawContext.slice(1, -1)
      : rawContext;

  // Extract clientLibraryIntegrity from the capture context JWT for SRI checking
  let clientLibraryIntegrity = null;
  try {
    const parts = normalizedContext.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(
        Buffer.from(
          parts[1].replace(/-/g, "+").replace(/_/g, "/"),
          "base64"
        ).toString()
      );
      if (
        payload.ctx &&
        payload.ctx[0] &&
        payload.ctx[0].data &&
        payload.ctx[0].data.clientLibraryIntegrity
      ) {
        clientLibraryIntegrity = payload.ctx[0].data.clientLibraryIntegrity;
        console.log(
          "[CAPTURE_CONTEXT] Extracted clientLibraryIntegrity for SRI checking"
        );
      }
    }
  } catch (err) {
    console.warn(
      "[CAPTURE_CONTEXT] Could not extract clientLibraryIntegrity:",
      err.message
    );
  }

  const result = {
    captureContext: normalizedContext,
  };

  if (clientLibraryIntegrity) {
    result.clientLibraryIntegrity = clientLibraryIntegrity;
  }

  return result;
}

/**
 * Helper: extract JTI from a Unified Checkout transient token JWT.
 * Used for Risk API 3DS flow with tokens (like the Java sample).
 */
function getJtiFromTransientToken(transientTokenJwt) {
  if (!transientTokenJwt || typeof transientTokenJwt !== "string") {
    throw new Error("transientTokenJwt is required");
  }
  const parts = transientTokenJwt.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid transient token format");
  }
  const payloadJson = Buffer.from(
    parts[1].replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  ).toString("utf8");
  const payload = JSON.parse(payloadJson);
  if (!payload.jti) {
    throw new Error("Transient token payload does not contain jti");
  }
  return payload.jti;
}

/**
 * Check payer authentication enrollment using Unified Checkout transient token (JTI),
 * matching the Java sample Risk API 3DS flow.
 */
async function checkPayerAuthEnrollmentWithToken({
  transientTokenJwt,
  amount,
  currency,
  billingInfo,
  referenceCode,
}) {
  console.log(
    "[PAYER_AUTH_TOKEN] ========== Enrollment Check (token) =========="
  );
  console.log(
    `[PAYER_AUTH_TOKEN] Reference Code: ${
      referenceCode || "ENROLL_" + Date.now().toString()
    }`
  );
  console.log(`[PAYER_AUTH_TOKEN] Amount: ${amount} ${currency}`);

  if (!transientTokenJwt) {
    throw new Error("transientTokenJwt is required");
  }

  const { configObject, apiClient } = createApiClients();

  const requestObj = new cybersourceRestApi.CheckPayerAuthEnrollmentRequest();

  const clientReferenceInformation =
    new cybersourceRestApi.Riskv1authenticationsetupsClientReferenceInformation();
  clientReferenceInformation.code =
    referenceCode || "ENROLL_" + Date.now().toString();
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
  if (billingInfo) {
    Object.assign(orderInformationBillTo, billingInfo);
  }
  orderInformation.billTo = orderInformationBillTo;
  requestObj.orderInformation = orderInformation;

  // Use JTI from transient token instead of raw card details
  const jti = getJtiFromTransientToken(transientTokenJwt);
  requestObj.tokenInformation = { transientToken: jti };

  console.log(
    "[PAYER_AUTH_TOKEN] Sending enrollment check request to CyberSource (token)..."
  );
  console.log(
    "[PAYER_AUTH_TOKEN] Request object:",
    JSON.stringify(requestObj, null, 2)
  );

  const instance = new cybersourceRestApi.PayerAuthenticationApi(
    configObject,
    apiClient
  );
  const result = await promisify(
    instance.checkPayerAuthEnrollment.bind(instance),
    requestObj
  );

  console.log(
    "[PAYER_AUTH_TOKEN] ✅ Enrollment check response status:",
    result?.response?.status
  );
  console.log(
    "[PAYER_AUTH_TOKEN] ✅ Enrollment check response data:",
    JSON.stringify(result?.data || {}, null, 2)
  );
  console.log(
    "[PAYER_AUTH_TOKEN] ========== Enrollment Check (token) Complete =========="
  );

  return result;
}

async function chargeGooglePayToken({
  transientToken,
  amount,
  currency,
  referenceCode,
  billingInfo,
}) {
  console.log(
    "[GOOGLE_PAY] ========== Starting Google Pay Payment from Transient Token =========="
  );
  console.log(
    `[GOOGLE_PAY] Reference Code: ${
      referenceCode || "GPAY_" + Date.now().toString()
    }`
  );
  console.log(`[GOOGLE_PAY] Amount: ${amount} ${currency}`);
  console.log(
    `[GOOGLE_PAY] Transient Token Length: ${
      transientToken ? String(transientToken).length : 0
    } characters`
  );
  console.log(
    `[GOOGLE_PAY] Billing Info: ${
      billingInfo ? JSON.stringify(billingInfo) : "Not provided"
    }`
  );

  if (!transientToken) {
    throw new Error("transientToken is required");
  }

  const { configObject, apiClient } = createApiClients();

  const requestObj = new cybersourceRestApi.CreatePaymentRequest();

  const clientReferenceInformation =
    new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
  clientReferenceInformation.code =
    referenceCode || "GPAY_" + Date.now().toString();
  requestObj.clientReferenceInformation = clientReferenceInformation;

  const processingInformation =
    new cybersourceRestApi.Ptsv2paymentsProcessingInformation();
  processingInformation.capture = true;
  // Per CyberSource Google Pay samples (cybersource-rest-samples-node),
  // paymentSolution "012" identifies the payload as a Google Pay token
  // so the platform does not expect a raw card number.
  processingInformation.paymentSolution = "012";
  console.log("[GOOGLE_PAY] Payment Solution: 012 (Google Pay token)");
  requestObj.processingInformation = processingInformation;

  const orderInformation =
    new cybersourceRestApi.Ptsv2paymentsOrderInformation();
  const amountDetails =
    new cybersourceRestApi.Ptsv2paymentsOrderInformationAmountDetails();
  amountDetails.totalAmount = parseFloat(amount).toFixed(2).toString();
  amountDetails.currency = currency;
  orderInformation.amountDetails = amountDetails;
  // Always send billTo with required fields (with safe defaults) to avoid MISSING_FIELD
  const orderInformationBillTo =
    new cybersourceRestApi.Ptsv2paymentsOrderInformationBillTo();
  const normalizedBilling = {
    address1: billingInfo?.address1,
    locality: billingInfo?.locality, // city
    country: billingInfo?.country,
    lastName: billingInfo?.lastName,
    firstName: billingInfo?.firstName,
    postalCode: billingInfo?.postalCode,
    phoneNumber: billingInfo?.phoneNumber || "",
    email: billingInfo?.email || "",
    administrativeArea: billingInfo?.administrativeArea || "",
  };
  Object.assign(orderInformationBillTo, normalizedBilling);

  // Ensure required fields are non-empty; CyberSource rejects blank strings.
  const ensureValue = (val, fallback) => {
    if (val === undefined || val === null) return fallback;
    if (typeof val === "string" && val.trim() === "") return fallback;
    return val;
  };
  orderInformationBillTo.address1 = ensureValue(
    orderInformationBillTo.address1,
    "N/A"
  );
  orderInformationBillTo.locality = ensureValue(
    orderInformationBillTo.locality,
    "N/A"
  );
  orderInformationBillTo.country = ensureValue(
    orderInformationBillTo.country,
    "KE"
  );
  orderInformationBillTo.lastName = ensureValue(
    orderInformationBillTo.lastName,
    "Customer"
  );
  orderInformationBillTo.firstName = ensureValue(
    orderInformationBillTo.firstName,
    "Customer"
  );
  orderInformationBillTo.postalCode = ensureValue(
    orderInformationBillTo.postalCode,
    "00000"
  );

  // Normalize country to upper-case
  if (typeof orderInformationBillTo.country === "string") {
    orderInformationBillTo.country =
      orderInformationBillTo.country.toUpperCase();
  }

  orderInformation.billTo = orderInformationBillTo;

  // Final guard: ensure billTo required fields are non-empty on the request object
  const billTo = orderInformation.billTo || {};
  // Use real address values (not "N/A") - CyberSource rejects "N/A" as invalid
  billTo.address1 = ensureValue(billTo.address1, "123 Main Street");
  billTo.locality = ensureValue(billTo.locality, "Nairobi");
  billTo.country = ensureValue(
    typeof billTo.country === "string"
      ? billTo.country.toUpperCase()
      : billTo.country,
    "KE"
  );
  billTo.lastName = ensureValue(billTo.lastName, "Customer");
  billTo.firstName = ensureValue(billTo.firstName, "Customer");
  billTo.postalCode = ensureValue(billTo.postalCode, "00000");
  orderInformation.billTo = billTo;
  requestObj.orderInformation = orderInformation;

  const tokenInformation =
    new cybersourceRestApi.Ptsv2paymentsTokenInformation();
  tokenInformation.transientToken = transientToken;
  requestObj.tokenInformation = tokenInformation;

  console.log("[GOOGLE_PAY] Sending payment request to CyberSource...");
  console.log(
    "📋 RAW REQUEST TO CYBERSOURCE (chargeGooglePayToken):",
    JSON.stringify(
      requestObj,
      (key, value) => {
        if (key === "transientToken" && typeof value === "string") {
          return `[TRANSIENT_TOKEN_${value.length}_chars]`;
        }
        return value;
      },
      2
    )
  );

  const instance = new cybersourceRestApi.PaymentsApi(configObject, apiClient);
  const result = await promisify(
    instance.createPayment.bind(instance),
    requestObj
  );

  console.log("[GOOGLE_PAY] ✅ Payment response received");
  console.log(
    "📋 RAW CYBERSOURCE RESPONSE (chargeGooglePayToken):",
    JSON.stringify(result.data, null, 2)
  );
  console.log(
    "📋 RAW HTTP RESPONSE HEADERS (chargeGooglePayToken):",
    result.response.header
  );

  const processorInfo = result.data?.processorInformation || {};
  const responseAmountDetails =
    result.data?.orderInformation?.amountDetails || {};
  const errorInfo = result.data?.errorInformation || {};

  console.log(`[GOOGLE_PAY] Transaction ID: ${result.data?.id}`);
  console.log(`[GOOGLE_PAY] Status: ${result.data?.status}`);
  console.log(`[GOOGLE_PAY] HTTP Status: ${result.response?.status}`);

  if (errorInfo.reason) {
    console.log(`[GOOGLE_PAY] ⚠️ Error Reason: ${errorInfo.reason}`);
    console.log(`[GOOGLE_PAY] ⚠️ Error Message: ${errorInfo.message}`);
    if (errorInfo.reason === "INVALID_ACCOUNT") {
      console.log(
        '[GOOGLE_PAY] ⚠️ NOTE: "INVALID_ACCOUNT" in sandbox/test environment usually means:'
      );
      console.log(
        "[GOOGLE_PAY]   - Google Pay is using a REAL card from your Google account"
      );
      console.log(
        "[GOOGLE_PAY]   - CyberSource sandbox only accepts TEST card numbers"
      );
      console.log(
        "[GOOGLE_PAY]   - Solution: Use card payments directly for testing, or add test cards to Google Pay"
      );
    }
  }

  if (processorInfo.responseCode) {
    console.log(
      `[GOOGLE_PAY] Processor Response Code: ${processorInfo.responseCode}`
    );
  }
  if (processorInfo.approvalCode) {
    console.log(
      `[GOOGLE_PAY] Processor Approval Code: ${processorInfo.approvalCode}`
    );
  }
  if (
    responseAmountDetails.authorizedAmount &&
    responseAmountDetails.currency
  ) {
    console.log(`[GOOGLE_PAY] Amount Details:`);
    console.log(
      `[GOOGLE_PAY]   - Authorized: ${responseAmountDetails.authorizedAmount} ${responseAmountDetails.currency}`
    );
    console.log(
      `[GOOGLE_PAY]   - Total: ${responseAmountDetails.totalAmount} ${responseAmountDetails.currency}`
    );
  }

  console.log("[GOOGLE_PAY] ========== Payment Complete ==========");
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
  console.log(
    "[GOOGLE_PAY] ========== Starting Google Pay Payment from Blob =========="
  );
  console.log(
    `[GOOGLE_PAY] Reference Code: ${
      referenceCode || "GPAY_BLOB_" + Date.now().toString()
    }`
  );
  console.log(`[GOOGLE_PAY] Amount: ${amount} ${currency}`);
  console.log(
    `[GOOGLE_PAY] Blob Length: ${
      googlePayBlob ? String(googlePayBlob).length : 0
    } characters`
  );
  console.log(
    `[GOOGLE_PAY] Billing Info: ${
      billingInfo ? JSON.stringify(billingInfo) : "Not provided"
    }`
  );

  if (!googlePayBlob) {
    throw new Error("googlePayBlob is required");
  }

  const { configObject, apiClient } = createApiClients();

  const requestObj = new cybersourceRestApi.CreatePaymentRequest();

  const clientReferenceInformation =
    new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
  clientReferenceInformation.code =
    referenceCode || "GPAY_BLOB_" + Date.now().toString();
  requestObj.clientReferenceInformation = clientReferenceInformation;

  const processingInformation =
    new cybersourceRestApi.Ptsv2paymentsProcessingInformation();
  processingInformation.capture = true;
  // Payment solution 012 = Google Pay via Barclays decryption
  processingInformation.paymentSolution = "012";
  console.log(
    "[GOOGLE_PAY] Payment Solution: 012 (Google Pay via Barclays decryption)"
  );
  requestObj.paymentInformation =
    requestObj.paymentInformation ||
    new cybersourceRestApi.Ptsv2paymentsPaymentInformation();
  requestObj.processingInformation = processingInformation;

  const orderInformation =
    new cybersourceRestApi.Ptsv2paymentsOrderInformation();
  const amountDetails =
    new cybersourceRestApi.Ptsv2paymentsOrderInformationAmountDetails();
  amountDetails.totalAmount = parseFloat(amount).toFixed(2).toString();
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

  console.log("[GOOGLE_PAY] Sending payment request to CyberSource...");
  console.log(
    "📋 RAW REQUEST TO CYBERSOURCE (createGooglePayPaymentFromBlob):",
    JSON.stringify(
      requestObj,
      (key, value) => {
        if (key === "value" && typeof value === "string") {
          // Mask the blob value (it's encrypted anyway, but don't log the full thing)
          return `[ENCRYPTED_BLOB_${value.length}_chars]`;
        }
        return value;
      },
      2
    )
  );

  const instance = new cybersourceRestApi.PaymentsApi(configObject, apiClient);
  const result = await promisify(
    instance.createPayment.bind(instance),
    requestObj
  );

  console.log("[GOOGLE_PAY] ✅ Payment response received");
  console.log(
    "📋 RAW CYBERSOURCE RESPONSE (createGooglePayPaymentFromBlob):",
    JSON.stringify(result.data, null, 2)
  );
  console.log(
    "📋 RAW HTTP RESPONSE HEADERS (createGooglePayPaymentFromBlob):",
    result.response.header
  );

  const processorInfo = result.data?.processorInformation || {};
  const responseAmountDetails =
    result.data?.orderInformation?.amountDetails || {};
  const errorInfo = result.data?.errorInformation || {};

  console.log(`[GOOGLE_PAY] Transaction ID: ${result.data?.id}`);
  console.log(`[GOOGLE_PAY] Status: ${result.data?.status}`);
  console.log(`[GOOGLE_PAY] HTTP Status: ${result.response?.status}`);

  if (errorInfo.reason) {
    console.log(`[GOOGLE_PAY] ⚠️ Error Reason: ${errorInfo.reason}`);
    console.log(`[GOOGLE_PAY] ⚠️ Error Message: ${errorInfo.message}`);
    if (errorInfo.reason === "INVALID_ACCOUNT") {
      console.log(
        '[GOOGLE_PAY] ⚠️ NOTE: "INVALID_ACCOUNT" in sandbox/test environment usually means:'
      );
      console.log(
        "[GOOGLE_PAY]   - Google Pay is using a REAL card from your Google account"
      );
      console.log(
        "[GOOGLE_PAY]   - CyberSource sandbox only accepts TEST card numbers"
      );
      console.log(
        "[GOOGLE_PAY]   - Solution: Use card payments directly for testing, or add test cards to Google Pay"
      );
    }
  }

  if (processorInfo.responseCode) {
    console.log(
      `[GOOGLE_PAY] Processor Response Code: ${processorInfo.responseCode}`
    );
  }
  if (processorInfo.approvalCode) {
    console.log(
      `[GOOGLE_PAY] Processor Approval Code: ${processorInfo.approvalCode}`
    );
  }
  if (
    responseAmountDetails.authorizedAmount &&
    responseAmountDetails.currency
  ) {
    console.log(`[GOOGLE_PAY] Amount Details:`);
    console.log(
      `[GOOGLE_PAY]   - Authorized: ${responseAmountDetails.authorizedAmount} ${responseAmountDetails.currency}`
    );
    console.log(
      `[GOOGLE_PAY]   - Total: ${responseAmountDetails.totalAmount} ${responseAmountDetails.currency}`
    );
  }

  console.log("[GOOGLE_PAY] ========== Payment Complete ==========");
  return result;
}

/**
 * Search for transactions by reference code using CyberSource Transaction Search API.
 *
 * @param {string} referenceCode - The client reference code used in the payment
 * @param {number} limit - Maximum number of results to return (default: 10)
 * @returns {Promise<Object>} Search results with transactions
 */
async function searchTransactionsByReference({ referenceCode, limit = 10 }) {
  console.log(
    "[TRANSACTION_SEARCH] ========== Starting Transaction Search =========="
  );
  console.log(`[TRANSACTION_SEARCH] Reference Code: ${referenceCode}`);
  console.log(`[TRANSACTION_SEARCH] Limit: ${limit}`);

  if (!referenceCode) {
    throw new Error("referenceCode is required");
  }

  const { configObject, apiClient } = createApiClients();

  // Step 1: Create search request
  const searchQuery = `clientReferenceInformation.code:${referenceCode}`;
  console.log(`[TRANSACTION_SEARCH] Query: ${searchQuery}`);

  const createSearchRequest = new cybersourceRestApi.CreateSearchRequest();
  createSearchRequest.save = false; // Don't save the search
  createSearchRequest.name = `Search_${referenceCode}`;
  createSearchRequest.timezone = "UTC";
  createSearchRequest.query = searchQuery;
  createSearchRequest.offset = 0;
  createSearchRequest.limit = limit;
  createSearchRequest.sort = "id:desc,submitTimeUtc:desc"; // Most recent first

  console.log("[TRANSACTION_SEARCH] Creating search request...");
  console.log(
    "📋 RAW REQUEST TO CYBERSOURCE (createSearch):",
    JSON.stringify(createSearchRequest, null, 2)
  );

  const searchApi = new cybersourceRestApi.SearchTransactionsApi(
    configObject,
    apiClient
  );

  try {
    // Create search
    const createResult = await promisify(
      searchApi.createSearch.bind(searchApi),
      createSearchRequest
    );

    console.log("[TRANSACTION_SEARCH] ✅ Search created");
    console.log(
      "📋 RAW CYBERSOURCE RESPONSE (createSearch):",
      JSON.stringify(createResult.data, null, 2)
    );

    const searchId = createResult.data?.searchId;
    if (!searchId) {
      throw new Error("No searchId returned from search creation");
    }

    console.log(`[TRANSACTION_SEARCH] Search ID: ${searchId}`);

    // Step 2: Get search results (wait a moment for CyberSource to process)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log("[TRANSACTION_SEARCH] Retrieving search results...");

    const getResult = await promisify(
      searchApi.getSearch.bind(searchApi),
      searchId
    );

    console.log("[TRANSACTION_SEARCH] ✅ Search results retrieved");
    console.log(
      "📋 RAW CYBERSOURCE RESPONSE (getSearch):",
      JSON.stringify(getResult.data, null, 2)
    );
    console.log(
      "📋 RAW HTTP RESPONSE HEADERS (getSearch):",
      getResult.response.header
    );

    // Extract transactions from _embedded.transactionSummaries
    const transactionSummaries =
      getResult.data?._embedded?.transactionSummaries || [];
    const totalCount = getResult.data?.totalCount || 0;
    const returnedCount = getResult.data?.count || 0;

    // Map transaction summaries to a consistent format
    const transactions = transactionSummaries.map((tx) => {
      // Determine status from applicationInformation or other fields
      const status =
        tx.applicationInformation?.applications?.[0]?.name === "ics_pa_enroll"
          ? "ENROLLMENT"
          : tx.status || "UNKNOWN";

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
        ...tx,
      };
    });

    const count = transactions.length;

    console.log(
      `[TRANSACTION_SEARCH] Found ${count} transaction(s) (Total matching: ${totalCount})`
    );

    if (transactions.length > 0) {
      transactions.forEach((tx, idx) => {
        const txId = tx.id || "N/A";
        const txStatus = tx.status || "UNKNOWN";
        const txRef = tx.clientReferenceInformation?.code || "N/A";
        const txType =
          tx.applicationInformation?.applications?.[0]?.name || "PAYMENT";
        console.log(
          `[TRANSACTION_SEARCH]   [${
            idx + 1
          }] ID: ${txId}, Status: ${txStatus}, Type: ${txType}, Ref: ${txRef}`
        );
      });
    } else {
      console.log(
        "[TRANSACTION_SEARCH] ⚠️ No transactions found (may need time to index)"
      );
    }

    console.log("[TRANSACTION_SEARCH] ========== Search Complete ==========");

    return {
      ...getResult.data,
      transactions,
      count,
    };
  } catch (err) {
    console.log("[TRANSACTION_SEARCH] ❌ Search failed");
    console.log(
      `[TRANSACTION_SEARCH] Error: ${err.error || err.message || err}`
    );
    if (err.response) {
      console.log(
        `[TRANSACTION_SEARCH] Response status: ${err.response.status}`
      );
      console.log(
        `[TRANSACTION_SEARCH] Response body: ${
          err.response.text || JSON.stringify(err.response.data)
        }`
      );
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
  console.log(
    "[PAYER_AUTH] ========== Starting 3D Secure Enrollment Check =========="
  );
  console.log(
    `[PAYER_AUTH] Reference Code: ${
      referenceCode || "ENROLL_" + Date.now().toString()
    }`
  );
  console.log(`[PAYER_AUTH] Amount: ${amount} ${currency}`);
  console.log(
    `[PAYER_AUTH] Card: ****${card.number.slice(-4)} (Exp: ${
      card.expirationMonth
    }/${card.expirationYear})`
  );
  console.log(
    `[PAYER_AUTH] Billing: ${billingInfo?.firstName || ""} ${
      billingInfo?.lastName || ""
    }, ${billingInfo?.email || ""}`
  );

  const { configObject, apiClient } = createApiClients();

  const requestObj = new cybersourceRestApi.CheckPayerAuthEnrollmentRequest();

  const clientReferenceInformation =
    new cybersourceRestApi.Riskv1authenticationsetupsClientReferenceInformation();
  clientReferenceInformation.code =
    referenceCode || "ENROLL_" + Date.now().toString();
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

  console.log(
    "[PAYER_AUTH] Sending enrollment check request to CyberSource..."
  );

  // Log raw request being sent (sanitize sensitive data)
  console.log("[PAYER_AUTH] 📋 RAW REQUEST TO CYBERSOURCE:");
  try {
    const requestLog = {
      clientReferenceInformation: {
        code: requestObj.clientReferenceInformation?.code || "N/A",
      },
      orderInformation: {
        amountDetails: {
          currency:
            requestObj.orderInformation?.amountDetails?.currency || "N/A",
          totalAmount:
            requestObj.orderInformation?.amountDetails?.totalAmount || "N/A",
        },
        billTo: {
          firstName: requestObj.orderInformation?.billTo?.firstName || "N/A",
          lastName: requestObj.orderInformation?.billTo?.lastName || "N/A",
          email: requestObj.orderInformation?.billTo?.email || "N/A",
          country: requestObj.orderInformation?.billTo?.country || "N/A",
        },
      },
      paymentInformation: {
        card: {
          number: requestObj.paymentInformation?.card?.number
            ? `****${requestObj.paymentInformation.card.number.slice(-4)}`
            : "N/A",
          expirationMonth:
            requestObj.paymentInformation?.card?.expirationMonth || "N/A",
          expirationYear:
            requestObj.paymentInformation?.card?.expirationYear || "N/A",
          type: requestObj.paymentInformation?.card?.type || "N/A",
        },
      },
    };
    console.log(JSON.stringify(requestLog, null, 2));
  } catch (e) {
    console.log("[PAYER_AUTH] ⚠️ Could not log request details");
  }

  const instance = new cybersourceRestApi.PayerAuthenticationApi(
    configObject,
    apiClient
  );

  try {
    const result = await promisify(
      instance.checkPayerAuthEnrollment.bind(instance),
      requestObj
    );

    console.log("[PAYER_AUTH] ✅ Enrollment check response received");
    console.log(
      `[PAYER_AUTH] HTTP Status: ${result.response?.status || "N/A"}`
    );
    console.log(`[PAYER_AUTH] Status: ${result.data?.status || "N/A"}`);

    // Log raw response from CyberSource
    console.log("[PAYER_AUTH] 📋 RAW CYBERSOURCE RESPONSE:");
    try {
      console.log(JSON.stringify(result.data, null, 2));
    } catch (e) {
      console.log("[PAYER_AUTH] ⚠️ Could not stringify response:", result.data);
    }

    const authInfo = result.data?.consumerAuthenticationInformation || {};
    console.log(
      `[PAYER_AUTH] Veres Enrolled: ${
        authInfo.veresEnrolled || "N/A"
      } (Y=enrolled, N=not enrolled, U=unavailable)`
    );
    console.log(
      `[PAYER_AUTH] Authentication Transaction ID: ${
        authInfo.authenticationTransactionId || "N/A"
      }`
    );
    console.log(
      `[PAYER_AUTH] Step-up URL: ${
        authInfo.stepUpUrl ? "Present" : "Not present"
      }`
    );
    console.log(
      `[PAYER_AUTH] E-commerce Indicator: ${
        authInfo.ecommerceIndicator || "N/A"
      }`
    );
    console.log(
      `[PAYER_AUTH] Specification Version: ${
        authInfo.specificationVersion || "N/A"
      }`
    );

    if (authInfo.directoryServerErrorCode) {
      console.log(
        `[PAYER_AUTH] ⚠️ Directory Server Error Code: ${authInfo.directoryServerErrorCode}`
      );
      console.log(
        `[PAYER_AUTH] ⚠️ Directory Server Error Description: ${
          authInfo.directoryServerErrorDescription || "N/A"
        }`
      );
    }

    console.log("[PAYER_AUTH] ========== Enrollment Check Complete ==========");

    return result;
  } catch (error) {
    console.log("[PAYER_AUTH] ❌ Enrollment check failed");
    console.log(
      `[PAYER_AUTH] Error: ${error.error || error.message || "Unknown error"}`
    );

    // Log raw error response
    if (error.response) {
      console.log("[PAYER_AUTH] 📋 RAW ERROR RESPONSE:");
      console.log(
        `[PAYER_AUTH] HTTP Status: ${error.response.status || "N/A"}`
      );
      console.log(
        `[PAYER_AUTH] Response Body: ${error.response.text || "N/A"}`
      );
      if (error.response.headers) {
        console.log("[PAYER_AUTH] Response Headers:");
        try {
          console.log(JSON.stringify(error.response.headers, null, 2));
        } catch (e) {
          console.log("[PAYER_AUTH] ⚠️ Could not stringify error headers");
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
    referenceCode || "SETUP_" + Date.now().toString();
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
    throw new Error("Either card or transientToken is required");
  }

  const instance = new cybersourceRestApi.PayerAuthenticationApi(
    configObject,
    apiClient
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
    throw new Error("authenticationTransactionId is required");
  }

  const { configObject, apiClient } = createApiClients();

  const requestObj = new cybersourceRestApi.ValidateRequest();

  const clientReferenceInformation =
    new cybersourceRestApi.Riskv1authenticationsetupsClientReferenceInformation();
  clientReferenceInformation.code =
    referenceCode || "VALIDATE_" + Date.now().toString();
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
  requestObj.consumerAuthenticationInformation =
    consumerAuthenticationInformation;

  const instance = new cybersourceRestApi.PayerAuthenticationApi(
    configObject,
    apiClient
  );
  return promisify(
    instance.validateAuthenticationResults.bind(instance),
    requestObj
  );
}

/**
 * Validate authentication results using Unified Checkout transient token (JTI)
 * after step-up completes, matching the Java sample Risk API 3DS flow.
 */
async function validateAuthenticationResultsWithToken({
  transientTokenJwt,
  authenticationTransactionId,
}) {
  if (!transientTokenJwt) {
    throw new Error("transientTokenJwt is required");
  }
  if (!authenticationTransactionId) {
    throw new Error("authenticationTransactionId is required");
  }

  console.log(
    "[PAYER_AUTH_TOKEN] ========== Validate Authentication (token) =========="
  );
  console.log(
    `[PAYER_AUTH_TOKEN] Authentication Transaction ID: ${authenticationTransactionId}`
  );

  const { configObject, apiClient } = createApiClients();

  const requestObj = new cybersourceRestApi.ValidateRequest();

  // Use JTI from transient token instead of card details
  const jti = getJtiFromTransientToken(transientTokenJwt);
  requestObj.tokenInformation = { jti };

  const consumerAuthenticationInformation =
    new cybersourceRestApi.Riskv1authenticationresultsConsumerAuthenticationInformation();
  consumerAuthenticationInformation.authenticationTransactionId =
    authenticationTransactionId;
  requestObj.consumerAuthenticationInformation =
    consumerAuthenticationInformation;

  console.log(
    "[PAYER_AUTH_TOKEN] Validate request object (token):",
    JSON.stringify(requestObj, null, 2)
  );

  const instance = new cybersourceRestApi.PayerAuthenticationApi(
    configObject,
    apiClient
  );
  const result = await promisify(
    instance.validateAuthenticationResults.bind(instance),
    requestObj
  );

  console.log(
    "[PAYER_AUTH_TOKEN] ✅ Validate response status:",
    result?.response?.status
  );
  console.log(
    "[PAYER_AUTH_TOKEN] ✅ Validate response data:",
    JSON.stringify(result?.data || {}, null, 2)
  );
  console.log(
    "[PAYER_AUTH_TOKEN] ========== Validate Authentication (token) Complete =========="
  );

  return result;
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
  console.log(
    "[CARD_PAYMENT] ========== Starting Card Payment with 3D Secure =========="
  );
  console.log(
    `[CARD_PAYMENT] Reference Code: ${
      referenceCode || "PAY_" + Date.now().toString()
    }`
  );
  console.log(`[CARD_PAYMENT] Amount: ${amount} ${currency}`);
  console.log(
    `[CARD_PAYMENT] Card: ****${card.number.slice(-4)} (Exp: ${
      card.expirationMonth
    }/${card.expirationYear})`
  );
  console.log(
    `[CARD_PAYMENT] Capture: ${
      capture ? "YES (authorize + capture)" : "NO (authorize only)"
    }`
  );

  const { configObject, apiClient } = createApiClients();

  const requestObj = new cybersourceRestApi.CreatePaymentRequest();

  const clientReferenceInformation =
    new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
  clientReferenceInformation.code =
    referenceCode || "PAY_" + Date.now().toString();
  requestObj.clientReferenceInformation = clientReferenceInformation;

  const processingInformation =
    new cybersourceRestApi.Ptsv2paymentsProcessingInformation();
  processingInformation.capture = capture;
  requestObj.processingInformation = processingInformation;
  console.log(`[CARD_PAYMENT] Processing Information: capture=${capture}`);

  // Include 3D Secure authentication data if provided
  if (authenticationTransactionId || authenticationResult) {
    console.log("[CARD_PAYMENT] 🔐 Including 3D Secure authentication data");
    const consumerAuthenticationInformation =
      new cybersourceRestApi.Ptsv2paymentsConsumerAuthenticationInformation();
    if (authenticationTransactionId) {
      consumerAuthenticationInformation.authenticationTransactionId =
        authenticationTransactionId;
      console.log(
        `[CARD_PAYMENT]   - Authentication Transaction ID: ${authenticationTransactionId}`
      );
    }
    if (authenticationResult) {
      consumerAuthenticationInformation.authenticationResult =
        authenticationResult; // 'Y' = authenticated, 'N' = not authenticated, 'U' = unavailable
      console.log(
        `[CARD_PAYMENT]   - Authentication Result: ${authenticationResult} (Y=authenticated, N=not authenticated, U=unavailable)`
      );
    }
    requestObj.consumerAuthenticationInformation =
      consumerAuthenticationInformation;
  } else {
    console.log("[CARD_PAYMENT] ⚠️ No 3D Secure authentication data provided");
  }

  const paymentInformation =
    new cybersourceRestApi.Ptsv2paymentsPaymentInformation();
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

  console.log("[CARD_PAYMENT] Sending payment request to CyberSource...");

  // Log raw request being sent (sanitize sensitive data)
  console.log("[CARD_PAYMENT] 📋 RAW REQUEST TO CYBERSOURCE:");
  try {
    const requestLog = {
      clientReferenceInformation: {
        code: requestObj.clientReferenceInformation?.code || "N/A",
      },
      processingInformation: {
        capture: requestObj.processingInformation?.capture !== false,
      },
      paymentInformation: {
        card: {
          number: requestObj.paymentInformation?.card?.number
            ? `****${requestObj.paymentInformation.card.number.slice(-4)}`
            : "N/A",
          expirationMonth:
            requestObj.paymentInformation?.card?.expirationMonth || "N/A",
          expirationYear:
            requestObj.paymentInformation?.card?.expirationYear || "N/A",
        },
      },
      orderInformation: {
        amountDetails: {
          currency:
            requestObj.orderInformation?.amountDetails?.currency || "N/A",
          totalAmount:
            requestObj.orderInformation?.amountDetails?.totalAmount || "N/A",
        },
        billTo: {
          firstName: requestObj.orderInformation?.billTo?.firstName || "N/A",
          lastName: requestObj.orderInformation?.billTo?.lastName || "N/A",
          email: requestObj.orderInformation?.billTo?.email || "N/A",
          country: requestObj.orderInformation?.billTo?.country || "N/A",
        },
      },
      consumerAuthenticationInformation:
        requestObj.consumerAuthenticationInformation
          ? {
              authenticationTransactionId:
                requestObj.consumerAuthenticationInformation
                  .authenticationTransactionId || "N/A",
              authenticationResult:
                requestObj.consumerAuthenticationInformation
                  .authenticationResult || "N/A",
            }
          : null,
    };
    console.log(JSON.stringify(requestLog, null, 2));
  } catch (e) {
    console.log("[CARD_PAYMENT] ⚠️ Could not log request details");
  }

  const instance = new cybersourceRestApi.PaymentsApi(configObject, apiClient);

  try {
    const result = await promisify(
      instance.createPayment.bind(instance),
      requestObj
    );

    console.log("[CARD_PAYMENT] ✅ Payment response received");
    console.log(
      `[CARD_PAYMENT] HTTP Status: ${result.response?.status || "N/A"}`
    );
    console.log(`[CARD_PAYMENT] Transaction ID: ${result.data?.id || "N/A"}`);
    console.log(`[CARD_PAYMENT] Status: ${result.data?.status || "N/A"}`);

    // Log raw response from CyberSource
    console.log("[CARD_PAYMENT] 📋 RAW CYBERSOURCE RESPONSE:");
    try {
      console.log(JSON.stringify(result.data, null, 2));
    } catch (e) {
      console.log(
        "[CARD_PAYMENT] ⚠️ Could not stringify response:",
        result.data
      );
    }

    // Log raw HTTP response if available
    if (result.response) {
      console.log("[CARD_PAYMENT] 📋 RAW HTTP RESPONSE HEADERS:");
      try {
        console.log(JSON.stringify(result.response.headers || {}, null, 2));
      } catch (e) {
        console.log("[CARD_PAYMENT] ⚠️ Could not stringify headers");
      }
    }

    const procInfo = result.data?.processorInformation || {};
    console.log(
      `[CARD_PAYMENT] Processor Response Code: ${
        procInfo.responseCode || "N/A"
      }`
    );
    console.log(
      `[CARD_PAYMENT] Processor Approval Code: ${
        procInfo.approvalCode || "N/A"
      }`
    );
    console.log(
      `[CARD_PAYMENT] Processor AVS Code: ${procInfo.avs?.code || "N/A"}`
    );
    console.log(
      `[CARD_PAYMENT] Processor CVV Code: ${
        procInfo.cardVerification?.resultCode || "N/A"
      }`
    );

    const authInfo = result.data?.consumerAuthenticationInformation || {};
    if (authInfo.authenticationTransactionId || authInfo.authenticationResult) {
      console.log("[CARD_PAYMENT] 🔐 3D Secure Authentication Info:");
      console.log(
        `[CARD_PAYMENT]   - Authentication Transaction ID: ${
          authInfo.authenticationTransactionId || "N/A"
        }`
      );
      console.log(
        `[CARD_PAYMENT]   - Authentication Result: ${
          authInfo.authenticationResult || "N/A"
        }`
      );
      console.log(`[CARD_PAYMENT]   - ECI: ${authInfo.eci || "N/A"}`);
      console.log(
        `[CARD_PAYMENT]   - CAVV: ${authInfo.cavv ? "Present" : "Not present"}`
      );
    }

    const orderInfo = result.data?.orderInformation?.amountDetails || {};
    console.log(`[CARD_PAYMENT] Amount Details:`);
    console.log(
      `[CARD_PAYMENT]   - Authorized: ${orderInfo.authorizedAmount || "N/A"} ${
        orderInfo.currency || currency
      }`
    );
    console.log(
      `[CARD_PAYMENT]   - Total: ${orderInfo.totalAmount || amount} ${
        orderInfo.currency || currency
      }`
    );

    if (result.data?.status === "AUTHORIZED" && capture) {
      console.log(
        "[CARD_PAYMENT] ✅ Payment AUTHORIZED and CAPTURED (capture=true means authorize+capture in one step)"
      );
      console.log(
        "[CARD_PAYMENT] ℹ️  No separate capture call needed - payment is complete"
      );
    } else if (result.data?.status === "AUTHORIZED" && !capture) {
      console.log(
        "[CARD_PAYMENT] ✅ Payment AUTHORIZED (separate capture call needed)"
      );
      console.log("[CARD_PAYMENT] ⚠️  Use Capture API to complete the payment");
    } else if (result.data?.status === "CAPTURED") {
      console.log("[CARD_PAYMENT] ✅ Payment CAPTURED");
    }

    console.log("[CARD_PAYMENT] ========== Payment Complete ==========");

    return result;
  } catch (error) {
    console.log("[CARD_PAYMENT] ❌ Payment failed");
    console.log(
      `[CARD_PAYMENT] Error: ${error.error || error.message || "Unknown error"}`
    );

    // Log raw error response
    if (error.response) {
      console.log("[CARD_PAYMENT] 📋 RAW ERROR RESPONSE:");
      console.log(
        `[CARD_PAYMENT] HTTP Status: ${error.response.status || "N/A"}`
      );
      console.log(
        `[CARD_PAYMENT] Response Body: ${error.response.text || "N/A"}`
      );
      if (error.response.headers) {
        console.log("[CARD_PAYMENT] Response Headers:");
        try {
          console.log(JSON.stringify(error.response.headers, null, 2));
        } catch (e) {
          console.log("[CARD_PAYMENT] ⚠️ Could not stringify error headers");
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
  paymentType = "CARD", // 'CARD' or 'GOOGLEPAY'
  authenticationTransactionId, // Optional: 3DS authentication transaction ID
  authenticationResult, // Optional: 3DS authentication result ('Y', 'N', 'U')
  completeResponse, // Optional: complete() response to check if payment was already processed
}) {
  console.log(
    "[UNIFIED_CHECKOUT] ========== Starting Unified Checkout Payment from Transient Token =========="
  );
  console.log(
    `[UNIFIED_CHECKOUT] Reference Code: ${
      referenceCode || "UC_" + Date.now().toString()
    }`
  );
  console.log(`[UNIFIED_CHECKOUT] Amount: ${amount} ${currency}`);
  console.log(`[UNIFIED_CHECKOUT] Payment Type: ${paymentType}`);
  console.log(
    `[UNIFIED_CHECKOUT] Transient Token Length: ${
      transientToken ? String(transientToken).length : 0
    } characters`
  );
  console.log(
    `[UNIFIED_CHECKOUT] Billing Info: ${
      billingInfo ? JSON.stringify(billingInfo) : "Not provided"
    }`
  );

  // Extract 3DS authentication fields from completeResponse JWT
  let decodedCompleteResponse = null;
  let authEcommerceIndicator = null;
  let authCavv = null;
  let authUcafCollectionIndicator = null;
  let authUcafAuthenticationData = null; // AAV for Mastercard
  let authXid = null;
  let authSpecificationVersion = null;
  let authDirectoryServerTransactionId = null;

  // Check completeResponse JWT for early rejection (e.g., DAGGREJECTED) and extract 3DS fields
  if (completeResponse && typeof completeResponse === "string" && completeResponse.includes(".")) {
    try {
      const parts = completeResponse.split(".");
      if (parts.length === 3) {
        // Decode JWT payload (handle base64url padding)
        let base64Url = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        // Add padding if needed
        while (base64Url.length % 4) {
          base64Url += "=";
        }
        const payload = JSON.parse(Buffer.from(base64Url, "base64").toString());

        decodedCompleteResponse = payload;

        const status = payload.status || payload.outcome;
        const errorReason = payload.details?.errorInformation?.reason;
        const errorMessage = payload.message;

        console.log(`[UNIFIED_CHECKOUT] 🔍 Complete Response Status: ${status}`);
        console.log(`[UNIFIED_CHECKOUT] 🔍 Complete Response Error Reason: ${errorReason || "None"}`);
        console.log(`[UNIFIED_CHECKOUT] 🔍 Complete Response Message: ${errorMessage || "None"}`);

        // Status "201" means rejection (Decision Manager / DAG rejection)
        if (status === "201" || status === 201) {
          const rejectionMessage = errorMessage || `Transaction rejected: ${errorReason || "Unknown reason"}`;
          console.error(`[UNIFIED_CHECKOUT] ❌ Payment rejected by Decision Manager: ${rejectionMessage}`);
          
          // Create error object that matches CyberSource API error format
          // Use 400 (Bad Request) as HTTP status since 201 is not a standard error code
          const error = new Error(rejectionMessage);
          error.error = errorReason || "DAGGREJECTED";
          error.response = {
            status: 400, // Use 400 Bad Request for rejection
            text: JSON.stringify({
              status: "201", // Keep CyberSource status in response body
              message: rejectionMessage,
              errorInformation: {
                reason: errorReason || "DAGGREJECTED",
              },
            }),
          };
          throw error;
        }

        // Status "200" means success (payment already processed by complete())
        if (status === "200" || status === 200) {
          console.log(`[UNIFIED_CHECKOUT] ✅ Payment already processed by complete() - status: ${status}`);
          // Continue with charge request to get transaction details
        }

        // Extract 3DS authentication fields from completeResponse
        // These fields can be in multiple locations:
        // 1. payload.details.consumerAuthenticationInformation (most common)
        // 2. payload.consumerAuthenticationInformation (top level)
        // 3. payload.details (direct fields)
        const authInfo = payload.details?.consumerAuthenticationInformation || 
                        payload.consumerAuthenticationInformation || 
                        payload.details ||
                        {};

        // E-commerce Indicator (ECI) - per developer guide page 163, Visa should have ECI of 11, etc.
        // Can be: ecommerceIndicator, indicator, eci, eciRaw
        authEcommerceIndicator = authInfo.ecommerceIndicator || 
                                 authInfo.indicator || 
                                 authInfo.eci ||
                                 authInfo.eciRaw ||
                                 null;

        // CAVV (Cardholder Authentication Verification Value)
        // Required for Visa, American Express, JCB, Diners Club, Discover, China UnionPay, Elo
        authCavv = authInfo.cavv || null;

        // UCAF Collection Indicator (UCSF) - for Mastercard only
        // Also known as ucafCollectionIndicator
        authUcafCollectionIndicator = authInfo.ucafCollectionIndicator || 
                                     authInfo.UCSF || 
                                     null;

        // XID - Transaction identifier (may not be present for all card types)
        authXid = authInfo.xid || null;

        // 3-D Secure specification version
        authSpecificationVersion = authInfo.specificationVersion || 
                                  authInfo.paSpecificationVersion || 
                                  null;

        // Directory server transaction ID (not required for 3-D Secure 1.0)
        authDirectoryServerTransactionId = authInfo.directoryServerTransactionId || null;

        // Also check for ucafAuthenticationData (AAV for Mastercard)
        authUcafAuthenticationData = authInfo.ucafAuthenticationData || null;

        console.log(`[UNIFIED_CHECKOUT] 🔐 Extracted 3DS authentication fields from completeResponse:`);
        console.log(`[UNIFIED_CHECKOUT]   - ecommerceIndicator (ECI): ${authEcommerceIndicator || "Not present"}`);
        console.log(`[UNIFIED_CHECKOUT]   - cavv: ${authCavv ? "Present (" + authCavv.substring(0, 10) + "...)" : "Not present"}`);
        console.log(`[UNIFIED_CHECKOUT]   - ucafCollectionIndicator (UCSF): ${authUcafCollectionIndicator || "Not present"}`);
        console.log(`[UNIFIED_CHECKOUT]   - ucafAuthenticationData (AAV): ${authUcafAuthenticationData ? "Present (" + authUcafAuthenticationData.substring(0, 10) + "...)" : "Not present"}`);
        console.log(`[UNIFIED_CHECKOUT]   - xid: ${authXid || "Not present"}`);
        console.log(`[UNIFIED_CHECKOUT]   - specificationVersion: ${authSpecificationVersion || "Not present"}`);
        console.log(`[UNIFIED_CHECKOUT]   - directoryServerTransactionId: ${authDirectoryServerTransactionId || "Not present"}`);
      }
    } catch (decodeError) {
      console.warn(
        `[UNIFIED_CHECKOUT] ⚠️ Could not decode completeResponse JWT: ${decodeError.message}`
      );
      // Continue with charge request if we can't decode
    }
  }

  // #region agent log
  // Instrumentation: Decode transient token to check if it contains card details
  if (transientToken && transientToken.includes(".")) {
    try {
      const parts = transientToken.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(
          Buffer.from(
            parts[1].replace(/-/g, "+").replace(/_/g, "/"),
            "base64"
          ).toString()
        );

        // Console log a safe subset of what Unified Checkout embedded in the token.
        // IMPORTANT: Do NOT log the full token.
        const extractJwtValue = (maybe) => {
          if (maybe === null || typeof maybe === "undefined") return null;
          if (typeof maybe === "string" || typeof maybe === "number")
            return String(maybe);
          if (typeof maybe === "object") {
            if (
              typeof maybe.value === "string" ||
              typeof maybe.value === "number"
            ) {
              return String(maybe.value);
            }
            if (typeof maybe.maskedValue === "string") return maybe.maskedValue;
          }
          return null;
        };

        const tokenMeta = payload.metadata || {};
        const tokenContent = payload.content || {};
        const tokenOrder = tokenContent.orderInformation || {};
        const tokenAmountDetails = tokenOrder.amountDetails || {};
        const tokenBillTo = tokenOrder.billTo || {};
        const tokenPayment = tokenContent.paymentInformation || {};
        const tokenCard = tokenPayment.card || {};

        const embeddedTotalAmount = extractJwtValue(tokenAmountDetails.totalAmount);
        const embeddedCurrency = extractJwtValue(tokenAmountDetails.currency);
        const embeddedEmail = extractJwtValue(tokenBillTo.email);
        const embeddedMaskedPan =
          extractJwtValue(tokenCard.number?.maskedValue) ||
          extractJwtValue(tokenCard.number);
        const embeddedBin =
          extractJwtValue(tokenCard.number?.bin) || extractJwtValue(tokenCard.bin);

        console.log("[UNIFIED_CHECKOUT] 🔍 Transient token embedded data:");
        console.log("[UNIFIED_CHECKOUT]   - jti:", payload.jti || "(missing)");
        console.log(
          "[UNIFIED_CHECKOUT]   - metadata.paymentType:",
          tokenMeta.paymentType || "(missing)"
        );
        console.log(
          "[UNIFIED_CHECKOUT]   - token amountDetails.totalAmount:",
          embeddedTotalAmount || "(missing/empty)"
        );
        console.log(
          "[UNIFIED_CHECKOUT]   - token amountDetails.currency:",
          embeddedCurrency || "(missing/empty)"
        );
        console.log(
          "[UNIFIED_CHECKOUT]   - token billTo.email:",
          embeddedEmail || "(missing/empty)"
        );
        console.log(
          "[UNIFIED_CHECKOUT]   - token card.maskedValue:",
          embeddedMaskedPan || "(missing)"
        );
        console.log(
          "[UNIFIED_CHECKOUT]   - token card.bin:",
          embeddedBin || "(missing)"
        );

        // Explicitly call out the pattern you saw in Android logs: totalAmount/currency present as empty objects {}.
        const isEmptyObject = (v) =>
          v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0;
        if (
          (embeddedTotalAmount === null && isEmptyObject(tokenAmountDetails.totalAmount)) ||
          (embeddedCurrency === null && isEmptyObject(tokenAmountDetails.currency))
        ) {
          console.warn(
            "[UNIFIED_CHECKOUT] ⚠️ Token contains empty amountDetails fields (e.g. totalAmount/currency are {}). This commonly correlates with $0.00 outcomes."
          );
        }

        fetch(
          "http://127.0.0.1:7244/ingest/927f92d7-6e46-4215-ba8b-2c4152d16b3b",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "cybersourceService.js:1850",
              message: "Decoded transient token payload structure",
              data: {
                hasContent: !!payload.content,
                hasPaymentInformation: !!payload.content?.paymentInformation,
                hasCard: !!payload.content?.paymentInformation?.card,
                hasCardNumber:
                  !!payload.content?.paymentInformation?.card?.number,
                hasOrderInformation: !!payload.content?.orderInformation,
                hasBillTo: !!payload.content?.orderInformation?.billTo,
                paymentType: payload.metadata?.paymentType,
                cardholderAuthStatus:
                  payload.metadata?.cardholderAuthenticationStatus,
                topLevelKeys: Object.keys(payload),
                contentKeys: payload.content
                  ? Object.keys(payload.content)
                  : [],
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "post-fix",
              hypothesisId: "M",
            }),
          }
        ).catch(() => {});
      }
    } catch (e) {
      console.warn(
        "[UNIFIED_CHECKOUT] Could not decode transient token:",
        e.message
      );
    }
  }
  // #endregion

  if (!transientToken) {
    throw new Error("transientToken is required");
  }

  const { configObject, apiClient } = createApiClients();

  const requestObj = new cybersourceRestApi.CreatePaymentRequest();

  const clientReferenceInformation =
    new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
  clientReferenceInformation.code =
    referenceCode || "UC_" + Date.now().toString();
  // Set applicationName to "unifiedCheckout" so CyberSource dashboard shows it correctly
  // instead of defaulting to "REST API"
  try {
    clientReferenceInformation.applicationName = "unifiedCheckout";
    console.log("[UNIFIED_CHECKOUT] ✅ Set applicationName via property");
  } catch (e) {
    // Fallback: Set via bracket notation if property doesn't exist
    clientReferenceInformation["applicationName"] = "unifiedCheckout";
    console.log(
      "[UNIFIED_CHECKOUT] ✅ Set applicationName via bracket notation"
    );
  }
  console.log("[UNIFIED_CHECKOUT] Client Application: unifiedCheckout");
  requestObj.clientReferenceInformation = clientReferenceInformation;

  // Ensure applicationName is set on the final request object (override SDK serialization if needed)
  if (
    !requestObj.clientReferenceInformation.applicationName &&
    !requestObj.clientReferenceInformation["applicationName"]
  ) {
    console.log(
      "[UNIFIED_CHECKOUT] ⚠️ applicationName missing, setting directly on requestObj..."
    );
    const clientRefObj = {};
    if (requestObj.clientReferenceInformation.code) {
      clientRefObj.code = requestObj.clientReferenceInformation.code;
    }
    clientRefObj.applicationName = "unifiedCheckout";
    requestObj.clientReferenceInformation = clientRefObj;
    console.log(
      "[UNIFIED_CHECKOUT] ✅ Set applicationName directly on requestObj.clientReferenceInformation"
    );
  }

  // For Google Pay, we still need paymentSolution
  if (paymentType === "GOOGLEPAY") {
  const processingInformation =
    new cybersourceRestApi.Ptsv2paymentsProcessingInformation();
  processingInformation.capture = true;
    processingInformation.paymentSolution = "012";
    requestObj.processingInformation = processingInformation;
    console.log("[UNIFIED_CHECKOUT] Payment Solution: 012 (Google Pay token)");
  } else {
    // For Unified Checkout card payments (PANENTRY), always send explicit amount + billTo
    // This matches the REST guide example and avoids SYSTEM_ERROR 120 for this merchant.

    // processingInformation: required commerceIndicator for transient token auth
    // Note: commerceIndicator (internet/moto/etc.) is different from ecommerceIndicator (ECI value like 05, 06, 07, 11)
    // The ecommerceIndicator (ECI) comes from 3DS authentication and goes in consumerAuthenticationInformation
    const processingInformation =
      new cybersourceRestApi.Ptsv2paymentsProcessingInformation();
    processingInformation.capture = true;
    processingInformation.commerceIndicator = "internet"; // Transaction type: internet (e-commerce)
  requestObj.processingInformation = processingInformation;

  const orderInformation =
    new cybersourceRestApi.Ptsv2paymentsOrderInformation();
    const orderInformationAmountDetails =
    new cybersourceRestApi.Ptsv2paymentsOrderInformationAmountDetails();
    // TEMPORARY WORKAROUND: Convert 2.00 to 2.01 to bypass CyberSource discount rule
    orderInformationAmountDetails.totalAmount = applyAmountWorkaround(amount);
    orderInformationAmountDetails.currency = currency;
    orderInformation.amountDetails = orderInformationAmountDetails;

    // Add billing information with safe defaults
  const orderInformationBillTo =
    new cybersourceRestApi.Ptsv2paymentsOrderInformationBillTo();

  const ensureValue = (val, fallback) => {
    if (val === undefined || val === null) return fallback;
    if (typeof val === "string" && val.trim() === "") return fallback;
    return val;
  };

    if (billingInfo) {
      orderInformationBillTo.firstName = ensureValue(
        billingInfo.firstName,
        "Customer"
  );
  orderInformationBillTo.lastName = ensureValue(
        billingInfo.lastName,
    "Customer"
  );
      orderInformationBillTo.email =
        billingInfo.email && billingInfo.email.trim()
          ? billingInfo.email.trim()
          : "customer@example.com";
      orderInformationBillTo.phoneNumber =
        billingInfo.phoneNumber && billingInfo.phoneNumber.trim().length >= 6
          ? billingInfo.phoneNumber.trim()
          : "0000000";
      orderInformationBillTo.address1 = ensureValue(
        billingInfo.address1,
        "123 Main Street"
      );
      orderInformationBillTo.locality = ensureValue(
        billingInfo.locality,
        "Nairobi"
      );
      orderInformationBillTo.administrativeArea =
        billingInfo.administrativeArea || "";
  orderInformationBillTo.postalCode = ensureValue(
        billingInfo.postalCode,
        "00000"
  );
      orderInformationBillTo.country = ensureValue(billingInfo.country, "KE");
      orderInformationBillTo.buildingNumber =
        billingInfo.buildingNumber || "1";
    } else {
      // Default values if billingInfo not provided
      orderInformationBillTo.firstName = "Customer";
      orderInformationBillTo.lastName = "Customer";
      orderInformationBillTo.email = "customer@example.com";
      orderInformationBillTo.phoneNumber = "0000000";
      orderInformationBillTo.address1 = "123 Main Street";
      orderInformationBillTo.locality = "Nairobi";
      orderInformationBillTo.administrativeArea = "";
      orderInformationBillTo.postalCode = "00000";
      orderInformationBillTo.country = "KE";
      orderInformationBillTo.buildingNumber = "1";
    }

    // Normalize country to upper-case
  if (typeof orderInformationBillTo.country === "string") {
      orderInformationBillTo.country =
        orderInformationBillTo.country.toUpperCase();
  }

    orderInformation.billTo = orderInformationBillTo;
    requestObj.orderInformation = orderInformation;

    console.log(
      "[UNIFIED_CHECKOUT] ✅ Added processingInformation.commerceIndicator and orderInformation.amountDetails/billTo for card payment"
    );
  }

  // #region agent log
  // Instrumentation: Log request structure with orderInformation.billTo
  fetch("http://127.0.0.1:7244/ingest/927f92d7-6e46-4215-ba8b-2c4152d16b3b", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "cybersourceService.js:1751",
      message: "Request structure with orderInformation.billTo (hypothesis J)",
      data: {
        paymentType: paymentType,
        hasProcessingInformation: !!requestObj.processingInformation,
        hasOrderInformation: !!requestObj.orderInformation,
        hasOrderInformationBillTo: !!requestObj.orderInformation?.billTo,
        hasClientReferenceInformation: !!requestObj.clientReferenceInformation,
        hasTokenInformation: !!requestObj.tokenInformation,
        billingInfoProvided: !!billingInfo,
        billingInfoFields: billingInfo
          ? Object.keys(billingInfo).filter((k) => billingInfo[k])
          : [],
      },
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "hypothesis-j",
      hypothesisId: "J",
    }),
  }).catch(() => {});
  // #endregion

  // Use plain object instead of SDK class to ensure proper serialization
  // Per CyberSource documentation, Unified Checkout card payments MUST use transientTokenJwt
  // Google Pay uses transientToken (handled separately above)
  const tokenInformation = {
    transientTokenJwt: transientToken,
  };
  console.log(
    "[UNIFIED_CHECKOUT] ✅ Using plain object for tokenInformation with transientTokenJwt"
  );

  requestObj.tokenInformation = tokenInformation;

  // Ensure transientTokenJwt is set (using plain object, so this should already be set)
  // Remove transientToken if it exists - we're using transientTokenJwt per docs
  if (requestObj.tokenInformation.transientToken) {
    delete requestObj.tokenInformation.transientToken;
    console.log(
      "[UNIFIED_CHECKOUT] ✅ Removed transientToken (using transientTokenJwt per documentation)"
    );
  }
  // Since we're using a plain object, transientTokenJwt should already be set
  // But verify it's there
  if (!requestObj.tokenInformation.transientTokenJwt) {
    requestObj.tokenInformation.transientTokenJwt = transientToken;
    console.log(
      "[UNIFIED_CHECKOUT] ✅ Set transientTokenJwt directly on requestObj.tokenInformation (fallback)"
    );
  }

  // Include 3D Secure authentication data if provided (required after 3DS validation)
  // Include if we have authenticationTransactionId, authenticationResult, or any extracted 3DS fields
  if (authenticationTransactionId || authenticationResult || 
      authEcommerceIndicator || authCavv || authUcafCollectionIndicator || 
      authUcafAuthenticationData || authXid) {
    console.log(
      "[UNIFIED_CHECKOUT] 🔐 Including 3D Secure authentication data"
    );
    const consumerAuthenticationInformation =
      new cybersourceRestApi.Ptsv2paymentsConsumerAuthenticationInformation();

    // REQUIRED FIELDS for 3D Secure pass-through (per Unified Checkout Developer Guide)
    // These fields are required when using completeMandate.consumerAuthentication: true
    // Without these, the acquirer/aggregator will reject with CARD_CATEGORY_ECI_REFUSED
    consumerAuthenticationInformation.challengeCode = "01"; // Required: "01" for payment authentication
    consumerAuthenticationInformation.messageCategory = "01"; // Required: "01" for payment authentication (not non-payment)
    console.log(
      `[UNIFIED_CHECKOUT]   - Challenge Code: 01 (required for 3DS pass-through)`
    );
    console.log(
      `[UNIFIED_CHECKOUT]   - Message Category: 01 (payment authentication)`
    );
    
    if (authenticationTransactionId) {
      consumerAuthenticationInformation.authenticationTransactionId =
        authenticationTransactionId;
      console.log(
        `[UNIFIED_CHECKOUT]   - Authentication Transaction ID: ${authenticationTransactionId}`
      );
    }
    
    if (authenticationResult) {
      consumerAuthenticationInformation.authenticationResult =
        authenticationResult; // 'Y' = authenticated, 'N' = not authenticated, 'U' = unavailable
      console.log(
        `[UNIFIED_CHECKOUT]   - Authentication Result: ${authenticationResult} (Y=authenticated, N=not authenticated, U=unavailable)`
      );
    }

    // Include 3DS authentication fields from completeResponse (per developer guide page 163)
    if (authEcommerceIndicator) {
      consumerAuthenticationInformation.ecommerceIndicator = authEcommerceIndicator;
    console.log(
        `[UNIFIED_CHECKOUT]   - E-commerce Indicator (ECI): ${authEcommerceIndicator}`
    );
    }

    if (authCavv) {
      consumerAuthenticationInformation.cavv = authCavv;
    console.log(
        `[UNIFIED_CHECKOUT]   - CAVV: Present (${authCavv.length} chars)`
      );
    }

    if (authUcafCollectionIndicator) {
      consumerAuthenticationInformation.ucafCollectionIndicator = authUcafCollectionIndicator;
    console.log(
        `[UNIFIED_CHECKOUT]   - UCAF Collection Indicator (UCSF): ${authUcafCollectionIndicator}`
    );
  }

    if (authUcafAuthenticationData) {
      consumerAuthenticationInformation.ucafAuthenticationData = authUcafAuthenticationData;
      console.log(
        `[UNIFIED_CHECKOUT]   - UCAF Authentication Data (AAV): Present (${authUcafAuthenticationData.length} chars)`
      );
    }

    if (authXid) {
      consumerAuthenticationInformation.xid = authXid;
    console.log(
        `[UNIFIED_CHECKOUT]   - XID: ${authXid}`
      );
    }

    if (authSpecificationVersion) {
      consumerAuthenticationInformation.specificationVersion = authSpecificationVersion;
    console.log(
        `[UNIFIED_CHECKOUT]   - Specification Version: ${authSpecificationVersion}`
      );
    }

    if (authDirectoryServerTransactionId) {
      consumerAuthenticationInformation.directoryServerTransactionId = authDirectoryServerTransactionId;
      console.log(
        `[UNIFIED_CHECKOUT]   - Directory Server Transaction ID: ${authDirectoryServerTransactionId}`
      );
    }

    requestObj.consumerAuthenticationInformation =
      consumerAuthenticationInformation;
  } else {
      console.log(
      "[UNIFIED_CHECKOUT] ⚠️ No 3D Secure authentication data provided"
      );
  }

  // CRITICAL: When using transient tokens (both transientToken and transientTokenJwt),
  // we MUST NOT include paymentInformation or paymentAccountInformation
  // The transient token contains all payment information, and including paymentInformation causes validation errors
  // Explicitly remove/clear any paymentInformation that might have been set by the SDK
  if (requestObj.paymentInformation) {
    console.log(
      `[UNIFIED_CHECKOUT] ⚠️ paymentInformation found on requestObj - removing it (not needed with ${
        paymentType === "GOOGLEPAY" ? "transientToken" : "transientTokenJwt"
      })`
    );
    delete requestObj.paymentInformation;
  }
  if (requestObj.paymentAccountInformation) {
    console.log(
      `[UNIFIED_CHECKOUT] ⚠️ paymentAccountInformation found on requestObj - removing it (not needed with ${
        paymentType === "GOOGLEPAY" ? "transientToken" : "transientTokenJwt"
      })`
    );
    delete requestObj.paymentAccountInformation;
  }

  console.log("[UNIFIED_CHECKOUT] 🔍 Final tokenInformation structure:");
  console.log(
    "[UNIFIED_CHECKOUT]   - Keys:",
    Object.keys(requestObj.tokenInformation || {})
  );
  console.log(
    "[UNIFIED_CHECKOUT]   - Has transientToken:",
    !!requestObj.tokenInformation?.transientToken
  );
  console.log(
    "[UNIFIED_CHECKOUT]   - Has transientTokenJwt:",
    !!(
      requestObj.tokenInformation?.transientTokenJwt ||
      requestObj.tokenInformation?.["transientTokenJwt"]
    )
  );
  console.log(
    "[UNIFIED_CHECKOUT]   - processingInformation present:",
    !!requestObj.processingInformation
  );
  console.log(
    "[UNIFIED_CHECKOUT]   - orderInformation present:",
    !!requestObj.orderInformation
  );
  console.log(
    "[UNIFIED_CHECKOUT]   - paymentInformation present:",
    !!requestObj.paymentInformation
  );
  console.log(
    "[UNIFIED_CHECKOUT]   - paymentAccountInformation present:",
    !!requestObj.paymentAccountInformation
  );

  console.log("[UNIFIED_CHECKOUT] Sending payment request to CyberSource...");
  console.log(
    "[UNIFIED_CHECKOUT] TokenInformation keys:",
    Object.keys(tokenInformation)
  );

  // Before sending, ensure paymentInformation and paymentAccountInformation are completely removed
  // The SDK might add them during serialization, so we need to be explicit
  if (requestObj.hasOwnProperty("paymentInformation")) {
    delete requestObj.paymentInformation;
  }
  if (requestObj.hasOwnProperty("paymentAccountInformation")) {
    delete requestObj.paymentAccountInformation;
  }

  // NOTE: We intentionally KEEP processingInformation and orderInformation here.
  // - For PANENTRY (card), we need commerceIndicator + amount + billTo.
  // - For GOOGLEPAY, we keep processingInformation.paymentSolution = \"012\" set above.
  // We only strip paymentInformation/paymentAccountInformation (above) to avoid
  // the old MISSING_FIELD: paymentAccountInformation.card.number error.

  // #region agent log
  // Instrumentation: Log request structure to verify completeMandate fix
  const finalTransientTokenLength = transientToken
    ? String(transientToken).length
    : 0;
  const finalLikelyFromComplete = finalTransientTokenLength > 1400;
  fetch("http://127.0.0.1:7244/ingest/927f92d7-6e46-4215-ba8b-2c4152d16b3b", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "cybersourceService.js:2100",
      message: "Payment request structure (completeMandate fix)",
      data: {
        paymentType: paymentType,
        transientTokenLength: finalTransientTokenLength,
        likelyFromComplete: finalLikelyFromComplete,
        hasOrderInformation: !!requestObj.orderInformation,
        hasOrderInformationBillTo: !!requestObj.orderInformation?.billTo,
        hasProcessingInformation: !!requestObj.processingInformation,
        hasClientReferenceInformation: !!requestObj.clientReferenceInformation,
        hasTokenInformation: !!requestObj.tokenInformation,
        billingInfoProvided: !!billingInfo,
      },
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "complete-mandate-fix",
      hypothesisId: "COMPLETE_MANDATE",
    }),
  }).catch(() => {});
  // #endregion

  console.log(
    "📋 RAW REQUEST TO CYBERSOURCE (chargeUnifiedCheckoutToken):",
    JSON.stringify(
      requestObj,
      (key, value) => {
        if (
          (key === "transientToken" || key === "transientTokenJwt") &&
          typeof value === "string"
        ) {
          return `[TRANSIENT_TOKEN_${value.length}_chars]`;
        }
        // Also check for paymentAccountInformation in the serialized output
        if (
          key === "paymentAccountInformation" ||
          key === "paymentInformation" ||
          key === "_transientTokenLength"
        ) {
          return "[REMOVED_FOR_TRANSIENT_TOKEN]";
        }
        return value;
      },
      2
    )
  );

  // Log the actual keys that will be sent
  console.log(
    "[UNIFIED_CHECKOUT] 🔍 Request object keys before API call:",
    Object.keys(requestObj)
  );
  if (requestObj.paymentInformation) {
    console.log(
      "[UNIFIED_CHECKOUT] ⚠️ WARNING: paymentInformation still present!"
    );
  }
  if (requestObj.paymentAccountInformation) {
    console.log(
      "[UNIFIED_CHECKOUT] ⚠️ WARNING: paymentAccountInformation still present!"
    );
  }

  // Log the request object one more time before sending to verify it's clean
  const requestJson = JSON.stringify(
    requestObj,
    (key, value) => {
      if (
        (key === "transientToken" || key === "transientTokenJwt") &&
        typeof value === "string"
      ) {
        return `[TRANSIENT_TOKEN_${value.length}_chars]`;
      }
      return value;
    },
    2
  );
  console.log(
    "[UNIFIED_CHECKOUT] 📤 Final request object before API call:",
    requestJson
  );

  // Double-check: ensure paymentAccountInformation is not in the serialized JSON
  if (requestJson.includes("paymentAccountInformation")) {
    console.log(
      "[UNIFIED_CHECKOUT] ⚠️ WARNING: paymentAccountInformation found in serialized request!"
    );
  }
  if (requestJson.includes('"paymentInformation"')) {
    console.log(
      "[UNIFIED_CHECKOUT] ⚠️ WARNING: paymentInformation found in serialized request!"
    );
  }

  // #region agent log
  // Instrumentation: Capture actual serialized request before API call (post-fix)
  try {
    const serializedRequest = JSON.stringify(requestObj, null, 2);
    fetch("http://127.0.0.1:7244/ingest/927f92d7-6e46-4215-ba8b-2c4152d16b3b", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "cybersourceService.js:2096",
        message: "Serialized request before API call (post-fix)",
        data: {
          hasTransientToken: !!requestObj.tokenInformation?.transientToken,
          hasTransientTokenJwt:
            !!requestObj.tokenInformation?.transientTokenJwt,
          hasPaymentAccountInformation: !!requestObj.paymentAccountInformation,
          hasPaymentInformation: !!requestObj.paymentInformation,
          hasProcessingInformation: !!requestObj.processingInformation,
          hasOrderInformation: !!requestObj.orderInformation,
          paymentSolution: requestObj.processingInformation?.paymentSolution,
          serializedRequestLength: serializedRequest.length,
          requestKeys: Object.keys(requestObj),
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "post-fix",
        hypothesisId: "E",
      }),
    }).catch(() => {});
  } catch (e) {
    fetch("http://127.0.0.1:7244/ingest/927f92d7-6e46-4215-ba8b-2c4152d16b3b", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "cybersourceService.js:2096",
        message: "Error serializing request",
        data: { error: e.message },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "post-fix",
        hypothesisId: "E",
      }),
    }).catch(() => {});
  }
  // #endregion

  // #region agent log
  // Instrumentation: Log tokenInformation structure right before API call (post-fix)
  fetch("http://127.0.0.1:7244/ingest/927f92d7-6e46-4215-ba8b-2c4152d16b3b", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "cybersourceService.js:2115",
      message: "TokenInformation before API call (post-fix)",
      data: {
        tokenInfoKeys: Object.keys(requestObj.tokenInformation || {}),
        hasTransientToken: !!requestObj.tokenInformation?.transientToken,
        transientTokenLength:
          requestObj.tokenInformation?.transientToken?.length || 0,
        hasTransientTokenJwt: !!(
          requestObj.tokenInformation?.transientTokenJwt ||
          requestObj.tokenInformation?.["transientTokenJwt"]
        ),
      },
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "post-fix",
      hypothesisId: "E",
    }),
  }).catch(() => {});
  // #endregion

  const instance = new cybersourceRestApi.PaymentsApi(configObject, apiClient);

  // #region agent log
  // Instrumentation: Intercept SDK's request serialization by patching ApiClient
  const originalCallApi = apiClient.callApi;
  if (originalCallApi) {
    apiClient.callApi = function (
      resourcePath,
      method,
      pathParams,
      queryParams,
      headerParams,
      formParams,
      bodyParam,
      authNames,
      contentTypes,
      accepts,
      returnType,
      callback
    ) {
      if (bodyParam && typeof bodyParam === "object") {
        const bodyStr = JSON.stringify(bodyParam);
        // Check if billTo fields are in the serialized body
        const hasBillTo = bodyStr.includes('"billTo"');
        const hasBillToAddress1 = bodyStr.includes('"address1"');
        const hasBillToLocality = bodyStr.includes('"locality"');
        const hasBillToCountry = bodyStr.includes('"country"');
        const hasBillToLastName = bodyStr.includes('"lastName"');
        const hasBillToEmail = bodyStr.includes('"email"');
        const hasAmountDetails = bodyStr.includes('"amountDetails"');
        const hasTotalAmount = bodyStr.includes('"totalAmount"');
        const hasCurrency = bodyStr.includes('"currency"');
        const hasCaptureFlag = bodyStr.includes('"capture":true');

        fetch(
          "http://127.0.0.1:7244/ingest/927f92d7-6e46-4215-ba8b-2c4152d16b3b",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "cybersourceService.js:2125",
              message: "SDK callApi bodyParam - checking billTo serialization",
              data: {
                resourcePath: resourcePath,
                method: method,
                hasTransientToken: bodyStr.includes('"transientToken"'),
                hasTransientTokenJwt: bodyStr.includes("transientTokenJwt"),
                hasPaymentAccountInformation: bodyStr.includes(
                  "paymentAccountInformation"
                ),
                hasPaymentInformation: bodyStr.includes('"paymentInformation"'),
                hasOrderInformation: bodyStr.includes('"orderInformation"'),
                hasBillTo: hasBillTo,
                hasBillToAddress1: hasBillToAddress1,
                hasBillToLocality: hasBillToLocality,
                hasBillToCountry: hasBillToCountry,
                hasBillToLastName: hasBillToLastName,
                hasBillToEmail: hasBillToEmail,
                hasAmountDetails,
                hasTotalAmount,
                hasCurrency,
                hasCaptureFlag,
                bodyLength: bodyStr.length,
                bodyPreview: bodyStr.substring(0, 2000),
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "sdk-serialization-check",
              hypothesisId: "L",
            }),
          }
        ).catch(() => {});
      }
      return originalCallApi.call(
        this,
        resourcePath,
        method,
        pathParams,
        queryParams,
        headerParams,
        formParams,
        bodyParam,
        authNames,
        contentTypes,
        accepts,
        returnType,
        callback
      );
    };
  }
  // #endregion

  let result;
  try {
    // Force the SDK to serialize a plain JSON object (not SDK model instances).
    // This avoids cases where SDK classes don't serialize fields like capture/amountDetails correctly.
    const plainRequestObj = JSON.parse(JSON.stringify(requestObj));
    console.log(
      "[UNIFIED_CHECKOUT] 📦 Sending plain JSON request to SDK createPayment (workaround for serialization issues)"
    );
    result = await promisify(
    instance.createPayment.bind(instance),
      plainRequestObj
  );
  } catch (error) {
    // #region agent log
    // Instrumentation: Log caught error
    fetch("http://127.0.0.1:7244/ingest/927f92d7-6e46-4215-ba8b-2c4152d16b3b", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "cybersourceService.js:2222",
        message: "Caught error from promisify",
        data: {
          errorMessage: error?.message || error?.error || "Unknown error",
          errorType: error?.constructor?.name,
          hasResponse: !!error?.response,
          responseStatus: error?.response?.status,
          responseBody:
            error?.response?.text ||
            error?.response?.body ||
            JSON.stringify(error?.response?.data || {}).substring(0, 500),
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "post-fix",
        hypothesisId: "E",
      }),
    }).catch(() => {});
    // #endregion
    throw error;
  }

  // #region agent log
  // Instrumentation: Log error response details (post-fix)
  if (result.response && result.response.status !== 201) {
    fetch("http://127.0.0.1:7244/ingest/927f92d7-6e46-4215-ba8b-2c4152d16b3b", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "cybersourceService.js:2140",
        message: "API error response (post-fix)",
        data: {
          status: result.response.status,
          errorDetails: result.data?.errorInformation,
          responseBody:
            typeof result.data === "string"
              ? result.data.substring(0, 500)
              : JSON.stringify(result.data).substring(0, 500),
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "post-fix",
        hypothesisId: "E",
      }),
    }).catch(() => {});
  } else if (result.response && result.response.status === 201) {
    // Log success
    fetch("http://127.0.0.1:7244/ingest/927f92d7-6e46-4215-ba8b-2c4152d16b3b", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "cybersourceService.js:2140",
        message: "API success response (post-fix)",
        data: {
          status: result.response.status,
          transactionId: result.data?.id,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "post-fix",
        hypothesisId: "E",
      }),
    }).catch(() => {});
  }
  // #endregion

  console.log("[UNIFIED_CHECKOUT] ✅ Payment response received");
  console.log(
    "📋 RAW CYBERSOURCE RESPONSE (chargeUnifiedCheckoutToken):",
    JSON.stringify(result.data, null, 2)
  );
  console.log(
    "📋 RAW HTTP RESPONSE HEADERS (chargeUnifiedCheckoutToken):",
    result.response.header
  );

  const processorInfo = result.data?.processorInformation || {};
  const responseAmountDetails =
    result.data?.orderInformation?.amountDetails || {};
  const errorInfo = result.data?.errorInformation || {};

  console.log(`[UNIFIED_CHECKOUT] Transaction ID: ${result.data?.id}`);
  console.log(`[UNIFIED_CHECKOUT] HTTP Status: ${result.response?.status}`);

  // Infer status from HTTP status code and processor response code
  // HTTP 201 = Created/Authorized, responseCode "00" = Approved
  const httpStatus = result.response?.status;
  const responseCode = processorInfo.responseCode;
  let inferredStatus = result.data?.status;

  if (!inferredStatus) {
    if (httpStatus === 201 && responseCode === "00") {
      inferredStatus = "AUTHORIZED"; // Payment authorized and captured (since capture=true)
      console.log(
        `[UNIFIED_CHECKOUT] ✅ Status inferred: AUTHORIZED (HTTP ${httpStatus}, ResponseCode ${responseCode})`
      );
    } else if (httpStatus === 201) {
      inferredStatus = "AUTHORIZED";
      console.log(
        `[UNIFIED_CHECKOUT] ✅ Status inferred: AUTHORIZED (HTTP ${httpStatus})`
      );
    } else if (errorInfo.reason) {
      inferredStatus = "FAILED";
      console.log(
        `[UNIFIED_CHECKOUT] ❌ Status inferred: FAILED (Error: ${errorInfo.reason})`
      );
    } else {
      inferredStatus = "PENDING";
      console.log(
        `[UNIFIED_CHECKOUT] ⚠️ Status inferred: PENDING (HTTP ${httpStatus}, ResponseCode ${responseCode})`
      );
    }
  } else {
    console.log(`[UNIFIED_CHECKOUT] Status: ${inferredStatus}`);
  }

  if (errorInfo.reason) {
    console.log(`[UNIFIED_CHECKOUT] ⚠️ Error Reason: ${errorInfo.reason}`);
    console.log(`[UNIFIED_CHECKOUT] ⚠️ Error Message: ${errorInfo.message}`);
  }

  if (processorInfo.responseCode) {
    console.log(
      `[UNIFIED_CHECKOUT] Processor Response Code: ${processorInfo.responseCode}`
    );
  }
  if (processorInfo.approvalCode) {
    console.log(
      `[UNIFIED_CHECKOUT] Processor Approval Code: ${processorInfo.approvalCode}`
    );
  }

  // Restored behavior (per request): allow $0.00 responses without throwing.
  // This matches the earlier "working" point where the flow continued even when the
  // CyberSource response showed 0.00 (often seen with certain payer-auth/verification flows).
  const responseAuthorizedAmount = responseAmountDetails.authorizedAmount;
  const responseTotalAmount = responseAmountDetails.totalAmount;
  const responseCurrency = responseAmountDetails.currency;

    console.log(`[UNIFIED_CHECKOUT] Amount Details:`);
  console.log(`[UNIFIED_CHECKOUT]   - Requested: ${amount} ${currency}`);
    console.log(
    `[UNIFIED_CHECKOUT]   - Response authorizedAmount: ${
      responseAuthorizedAmount ?? "N/A"
    } ${responseCurrency ?? currency}`
    );
    console.log(
    `[UNIFIED_CHECKOUT]   - Response totalAmount: ${
      responseTotalAmount ?? "N/A"
    } ${responseCurrency ?? currency}`
  );

  if (
    responseCurrency &&
    responseAuthorizedAmount &&
    parseFloat(String(amount)) > 0 &&
    parseFloat(String(responseAuthorizedAmount)) === 0
  ) {
    console.warn(
      "[UNIFIED_CHECKOUT] ⚠️ CyberSource responded with authorizedAmount 0.00 even though a non-zero amount was requested."
    );
    console.warn(
      "[UNIFIED_CHECKOUT] ⚠️ This typically happens when the transaction is treated as verification/0-dollar auth or is tied to a 0.00 payer-auth flow."
    );
  }

  if (inferredStatus === "AUTHORIZED" || inferredStatus === "CAPTURED") {
    console.log(`[UNIFIED_CHECKOUT] ✅ Payment AUTHORIZED and CAPTURED`);
    console.log(
      `[UNIFIED_CHECKOUT] ℹ️  No separate capture call needed - payment is complete`
    );
  } else if (errorInfo.reason) {
    console.log(
      `[UNIFIED_CHECKOUT] ❌ Payment failed: ${errorInfo.reason} - ${errorInfo.message}`
    );
    throw new Error(
      `${errorInfo.reason}: ${errorInfo.message || "Payment failed"}`
    );
  }

  // Add inferred status to result data for easier access
  if (!result.data.status) {
    result.data.status = inferredStatus;
  }

  console.log("[UNIFIED_CHECKOUT] ========== Payment Complete ==========");

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
