"use strict";

const express = require("express");
const morgan = require("morgan");
const {
  createCardPayment,
  generateCaptureContext,
  chargeGooglePayToken,
  createGooglePayPaymentFromBlob,
} = require("./src/cybersourceService");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

function logJson(label, payload) {
  try {
    console.log(
      `[${label}]`,
      JSON.stringify(payload, (key, value) => {
        if (
          typeof value === "string" &&
          key.toLowerCase().includes("token") &&
          value.length > 12
        ) {
          return `${value.slice(0, 6)}***${value.slice(-4)}`;
        }
        return value;
      })
    );
  } catch (err) {
    console.log(`[${label}]`, payload);
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "CyberSource Helper" });
});

app.post("/api/cards/pay", async (req, res) => {
  try {
    const { amount, currency, card, billingInfo, referenceCode, capture } =
      req.body || {};

    if (
      !amount ||
      !currency ||
      !card?.number ||
      !card?.expirationMonth ||
      !card?.expirationYear
    ) {
      return res
        .status(400)
        .json({ error: "Missing required card payment fields" });
    }

    const result = await createCardPayment({
      amount,
      currency,
      card,
      billingInfo,
      referenceCode,
      capture,
    });

    res.status(result.response?.status || 200).json(result.data);
  } catch (err) {
    const status = err.response?.status || 500;
    res.status(status).json({
      error: err.error || err.message || "Card payment failed",
      responseBody: err.response?.text,
    });
  }
});

app.post("/api/googlepay/capture-context", async (req, res) => {
  try {
    logJson("GPAY_CAPTURE_CONTEXT_REQUEST", req.body || {});
    const captureContext = await generateCaptureContext(req.body || {});
    logJson("GPAY_CAPTURE_CONTEXT_RESPONSE", captureContext);
    res.json(captureContext);
  } catch (err) {
    const status = err.response?.status || 500;
    logJson("GPAY_CAPTURE_CONTEXT_ERROR", {
      status,
      message: err.error || err.message,
      responseBody: err.response?.text,
    });
    res.status(status).json({
      error: err.error || err.message || "Capture context generation failed",
      responseBody: err.response?.text,
    });
  }
});

app.post("/api/googlepay/charge", async (req, res) => {
  try {
    const {
      transientToken,
      googlePayBlob,
      amount,
      currency,
      referenceCode,
      billingInfo,
    } = req.body || {};
    logJson("GPAY_CHARGE_REQUEST", {
      transientToken,
      googlePayBlobLen: googlePayBlob ? String(googlePayBlob).length : 0,
      amount,
      currency,
      referenceCode,
      billingInfo,
    });
    if (!amount || !currency || (!transientToken && !googlePayBlob)) {
      logJson("GPAY_CHARGE_ERROR", {
        status: 400,
        error:
          "Missing required google pay charge fields (googlePayBlob or transientToken)",
      });
      return res.status(400).json({
        error:
          "googlePayBlob or transientToken, plus amount and currency, are required",
      });
    }

    let result;
    if (googlePayBlob) {
      logJson("GPAY_CHARGE_MODE", {
        mode: "blob",
        googlePayBlobLen: String(googlePayBlob).length,
      });
      result = await createGooglePayPaymentFromBlob({
        googlePayBlob,
        amount,
        currency,
        referenceCode,
        billingInfo,
      });
    } else {
      logJson("GPAY_CHARGE_MODE", { mode: "transientToken" });
      result = await chargeGooglePayToken({
        transientToken,
        amount,
        currency,
        referenceCode,
        billingInfo,
      });
    }

    logJson("GPAY_CHARGE_RESPONSE", result?.data || {});
    res.status(result.response?.status || 200).json(result.data);
  } catch (err) {
    const status = err.response?.status || 500;
    logJson("GPAY_CHARGE_ERROR", {
      status,
      message: err.error || err.message,
      responseBody: err.response?.text,
    });
    res.status(status).json({
      error: err.error || err.message || "Google Pay charge failed",
      responseBody: err.response?.text,
    });
  }
});

app.use((err, _req, res, _next) => {
  console.error("Unexpected error", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`CyberSource helper server running on http://localhost:${PORT}`);
});
