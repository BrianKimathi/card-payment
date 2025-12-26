"use strict";

const axios = require("axios");
const crypto = require("crypto");

class MpesaClient {
  constructor(config) {
    this.consumerKey = config.consumerKey;
    this.consumerSecret = config.consumerSecret;
    this.shortCode = config.shortCode;
    this.tillNumber = config.tillNumber || config.shortCode;
    this.passkey = config.passkey;
    this.callbackUrl = config.callbackUrl;
    this.env = config.env || "production";
    this.base =
      this.env === "sandbox"
        ? "https://sandbox.safaricom.co.ke"
        : "https://api.safaricom.co.ke";

    console.log("[MpesaClient] Initializing M-Pesa client");
    console.log(`[MpesaClient] Environment: ${this.env}`);
    console.log(`[MpesaClient] Base URL: ${this.base}`);
    console.log(
      `[MpesaClient] Consumer Key: ${this.consumerKey ? this.consumerKey.substring(0, 10) + "..." : "NOT SET"}`
    );
    console.log(
      `[MpesaClient] Consumer Secret: ${this.consumerSecret ? "*".repeat(this.consumerSecret.length) : "NOT SET"}`
    );
    console.log(`[MpesaClient] Short Code: ${this.shortCode}`);
    console.log(`[MpesaClient] Till Number: ${this.tillNumber}`);
    console.log(
      `[MpesaClient] Passkey: ${this.passkey ? "*".repeat(this.passkey.length) : "NOT SET"}`
    );
    console.log(`[MpesaClient] Callback URL: ${this.callbackUrl}`);
    console.log("[MpesaClient] Initialization complete");
  }

  /**
   * Get OAuth access token
   */
  async _accessToken() {
    console.log(
      "[MpesaClient] [Token] ========== OAuth Token Request =========="
    );
    console.log(`[MpesaClient] [Token] Base URL: ${this.base}`);
    console.log(
      `[MpesaClient] [Token] Full URL: ${this.base}/oauth/v1/generate?grant_type=client_credentials`
    );

    try {
      const response = await axios.get(
        `${this.base}/oauth/v1/generate?grant_type=client_credentials`,
        {
          auth: {
            username: this.consumerKey,
            password: this.consumerSecret,
          },
          timeout: 20000,
        }
      );

      if (response.status === 200 && response.data.access_token) {
        const token = response.data.access_token;
        const expiresIn = response.data.expires_in;
        console.log("[MpesaClient] [Token] ✅ Token generated successfully");
        console.log(
          `[MpesaClient] [Token] Access Token: ${token.substring(0, 30)}...`
        );
        console.log(
          `[MpesaClient] [Token] Expires in: ${expiresIn} seconds (${Math.floor(expiresIn / 60)} minutes)`
        );
        return token;
      } else {
        console.log(
          `[MpesaClient] [Token] ❌ Token generation failed (HTTP ${response.status})`
        );
        return null;
      }
    } catch (error) {
      console.error("[MpesaClient] [Token] ❌ Error:", error.message);
      if (error.response) {
        console.error(
          `[MpesaClient] [Token] Response: ${JSON.stringify(error.response.data)}`
        );
      }
      return null;
    }
  }

  /**
   * Generate password (Base64(BusinessShortCode + Passkey + Timestamp))
   */
  _password(timestamp) {
    const rawString = `${this.shortCode}${this.passkey}${timestamp}`;
    const password = Buffer.from(rawString).toString("base64");
    console.log(
      `[MpesaClient] [Password] ✅ Password generated: ${password.substring(0, 30)}...`
    );
    return password;
  }

  /**
   * Format phone number to E.164 format
   */
  _formatPhoneNumber(phone) {
    if (!phone) return null;

    const cleaned = phone.trim().replace(/[\s\-+]/g, "");

    // +2547xxxxxxxx or +2541xxxxxxxx (13 chars)
    if (cleaned.startsWith("+2547") && cleaned.length === 13) {
      return cleaned.substring(1); // Remove +
    }
    if (cleaned.startsWith("+2541") && cleaned.length === 13) {
      return cleaned.substring(1);
    }

    // 2547xxxxxxxx or 2541xxxxxxxx (12 digits)
    if (cleaned.startsWith("2547") && cleaned.length === 12) {
      return cleaned;
    }
    if (cleaned.startsWith("2541") && cleaned.length === 12) {
      return cleaned;
    }

    // 07xxxxxxxx (10 digits) -> 2547xxxxxxxx
    if (cleaned.startsWith("07") && cleaned.length === 10) {
      return `254${cleaned.substring(1)}`;
    }

    // 01xxxxxxxx (10 digits) -> 2541xxxxxxxx
    if (cleaned.startsWith("01") && cleaned.length === 10) {
      return `254${cleaned.substring(1)}`;
    }

    return null;
  }

  /**
   * Initiate STK Push
   */
  async initiateStkPush(amount, phoneE164, accountRef, description) {
    console.log(
      "[MpesaClient] [STK Push] ========== Starting STK Push Request =========="
    );
    console.log(`[MpesaClient] [STK Push] Amount: ${amount}`);
    console.log(`[MpesaClient] [STK Push] Phone: ${phoneE164}`);
    console.log(`[MpesaClient] [STK Push] Account Reference: ${accountRef}`);
    console.log(`[MpesaClient] [STK Push] Description: ${description}`);

    // Step 1: Get access token
    console.log("[MpesaClient] [STK Push] Step 1: Generating OAuth token...");
    const token = await this._accessToken();
    if (!token) {
      console.log(
        "[MpesaClient] [STK Push] ❌ Failed to get access token, aborting"
      );
      return { ok: false, error: "token_failed" };
    }
    console.log("[MpesaClient] [STK Push] ✅ Access token obtained");

    // Step 2: Generate timestamp
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\..+/, "")
      .replace("T", "");
    console.log(`[MpesaClient] [STK Push] ✅ Timestamp: ${timestamp}`);

    // Step 3: Process phone number
    const phoneClean = phoneE164.replace(/[+\-\s]/g, "");
    let phoneValue;
    if (this.env === "sandbox") {
      phoneValue = phoneClean; // String for sandbox
    } else {
      phoneValue = parseInt(phoneClean); // Integer for production
    }
    console.log(`[MpesaClient] [STK Push] ✅ Phone: ${phoneValue}`);

    // Step 4: Generate password
    const password = this._password(timestamp);
    console.log("[MpesaClient] [STK Push] ✅ Password generated");

    // Step 5: Construct payload
    const payload = {
      BusinessShortCode:
        this.env === "sandbox"
          ? String(this.shortCode)
          : parseInt(this.shortCode),
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerBuyGoodsOnline",
      Amount: this.env === "sandbox" ? String(Math.round(amount)) : Math.round(amount),
      PartyA: phoneValue,
      PartyB:
        this.env === "sandbox"
          ? String(this.tillNumber)
          : parseInt(this.tillNumber),
      PhoneNumber: phoneValue,
      CallBackURL: this.callbackUrl,
      AccountReference:
        accountRef.length > 12 ? accountRef.substring(0, 12) : accountRef,
      TransactionDesc:
        description.length > 20 ? description.substring(0, 20) : description,
    };

    console.log("[MpesaClient] [STK Push] ✅ Payload constructed");

    // Step 6: Send STK Push request
    try {
      const requestUrl = `${this.base}/mpesa/stkpush/v1/processrequest`;
      console.log(`[MpesaClient] [STK Push] Sending POST to: ${requestUrl}`);

      const response = await axios.post(requestUrl, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 30000,
      });

      console.log(
        `[MpesaClient] [STK Push] ✅ Response received (HTTP ${response.status})`
      );
      console.log(
        `[MpesaClient] [STK Push] Response: ${JSON.stringify(response.data, null, 2)}`
      );

      return {
        ok: response.status === 200,
        response: response.data,
        status_code: response.status,
      };
    } catch (error) {
      console.error("[MpesaClient] [STK Push] ❌ Error:", error.message);
      if (error.response) {
        console.error(
          `[MpesaClient] [STK Push] Response: ${JSON.stringify(error.response.data, null, 2)}`
        );
        return {
          ok: false,
          error: error.message,
          response: error.response.data,
          status_code: error.response.status,
        };
      }
      return { ok: false, error: error.message };
    }
  }
}

module.exports = MpesaClient;

