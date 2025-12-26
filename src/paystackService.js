"use strict";

const axios = require("axios");
const crypto = require("crypto");

/**
 * Paystack Payment Service
 * Handles card payments and transaction verification
 */
class PaystackService {
  constructor(config) {
    // Support both naming conventions: PAYSTACK_SECRET_KEY (from config) or paystackSecretKey (legacy)
    // Trim whitespace to handle trailing spaces in .env files
    this.secretKey = (config.PAYSTACK_SECRET_KEY || config.paystackSecretKey || "").trim();
    this.publicKey = (config.PAYSTACK_PUBLIC_KEY || config.paystackPublicKey || "").trim();
    this.baseUrl = "https://api.paystack.co";

    // Create axios instance with auth
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Initialize a transaction (for Android SDK PaymentSheet)
   * Returns access_code needed by PaymentSheet.launch()
   */
  async initializeTransaction({ amount, email, currency = "USD", reference, metadata }) {
    try {
      // Convert amount to smallest currency unit (kobo for NGN, cents for USD, etc.)
      // For USD: 1 USD = 100 cents
      // For NGN: 1 NGN = 100 kobo
      // For KES: 1 KES = 100 cents
      const amountInSmallestUnit = Math.round(amount * 100);
      
      const payload = {
        amount: amountInSmallestUnit,
        email,
        currency: currency.toUpperCase(),
        reference,
        metadata,
      };

      const response = await this.client.post("/transaction/initialize", payload);

      return {
        success: true,
        data: response.data.data,
        response: response,
      };
    } catch (error) {
      console.error("[Paystack] Initialize transaction failed:", error.message);
      if (error.response?.data) {
        console.error("[Paystack] Error response:", JSON.stringify(error.response.data));
      }
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        response: error.response,
      };
    }
  }

  /**
   * Charge a card directly (no redirect)
   */
  async chargeCard({ amount, email, card, reference, metadata }) {
    try {
      const payload = {
        amount: Math.round(amount * 100), // Convert to kobo
        email,
        reference,
        card: {
          number: card.number.replace(/\s/g, ""), // Remove spaces
          cvv: card.cvv,
          expiry_month: card.expirationMonth,
          expiry_year: card.expirationYear,
        },
        metadata,
      };

      const response = await this.client.post("/charge", payload);

      return {
        success: true,
        data: response.data.data,
        response: response,
      };
    } catch (error) {
      console.error("[Paystack] Card charge failed:", error.message);
      return {
        success: false,
        error: error.message,
        response: error.response,
      };
    }
  }

  /**
   * Submit PIN for card charge (if required)
   */
  async submitPin({ pin, reference }) {
    try {
      const response = await this.client.post("/charge/submit_pin", {
        pin,
        reference,
      });

      return {
        success: true,
        data: response.data.data,
        response: response,
      };
    } catch (error) {
      console.error("[Paystack] Submit PIN failed:", error.message);
      return {
        success: false,
        error: error.message,
        response: error.response,
      };
    }
  }

  /**
   * Submit OTP for card charge (if required)
   */
  async submitOtp({ otp, reference }) {
    try {
      const response = await this.client.post("/charge/submit_otp", {
        otp,
        reference,
      });

      return {
        success: true,
        data: response.data.data,
        response: response,
      };
    } catch (error) {
      console.error("[Paystack] Submit OTP failed:", error.message);
      return {
        success: false,
        error: error.message,
        response: error.response,
      };
    }
  }

  /**
   * Submit phone number for card charge (if required)
   */
  async submitPhone({ phone, reference }) {
    try {
      const response = await this.client.post("/charge/submit_phone", {
        phone,
        reference,
      });

      return {
        success: true,
        data: response.data.data,
        response: response,
      };
    } catch (error) {
      console.error("[Paystack] Submit phone failed:", error.message);
      return {
        success: false,
        error: error.message,
        response: error.response,
      };
    }
  }

  /**
   * Verify transaction status
   */
  async verifyTransaction(reference) {
    try {
      const response = await this.client.get(`/transaction/verify/${reference}`);

      return {
        success: true,
        data: response.data.data,
        response: response,
      };
    } catch (error) {
      console.error("[Paystack] Verify transaction failed:", error.message);
      return {
        success: false,
        error: error.message,
        response: error.response,
      };
    }
  }

  /**
   * Get transaction details
   */
  async getTransaction(id) {
    try {
      const response = await this.client.get(`/transaction/${id}`);

      return {
        success: true,
        data: response.data.data,
        response: response,
      };
    } catch (error) {
      console.error("[Paystack] Get transaction failed:", error.message);
      return {
        success: false,
        error: error.message,
        response: error.response,
      };
    }
  }

  /**
   * List transactions
   */
  async listTransactions({ reference, page = 1, perPage = 50 }) {
    try {
      const params = { page, perPage };
      if (reference) params.reference = reference;

      const response = await this.client.get("/transaction", { params });

      return {
        success: true,
        data: response.data.data,
        meta: response.data.meta,
        response: response,
      };
    } catch (error) {
      console.error("[Paystack] List transactions failed:", error.message);
      return {
        success: false,
        error: error.message,
        response: error.response,
      };
    }
  }

  /**
   * Charge with bank transfer (alternative to cards)
   */
  async chargeBankTransfer({ amount, email, reference, metadata }) {
    try {
      const payload = {
        amount: Math.round(amount * 100),
        email,
        reference,
        metadata,
      };

      const response = await this.client.post("/transaction/initialize", payload);

      return {
        success: true,
        data: response.data.data,
        response: response,
      };
    } catch (error) {
      console.error("[Paystack] Bank transfer charge failed:", error.message);
      return {
        success: false,
        error: error.message,
        response: error.response,
      };
    }
  }

  /**
   * Webhook signature verification
   */
  verifyWebhookSignature(payload, signature) {
    const hash = crypto
      .createHmac("sha512", this.secretKey)
      .update(JSON.stringify(payload))
      .digest("hex");

    return hash === signature;
  }
}

module.exports = PaystackService;
