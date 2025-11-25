# CyberSource Sandbox Test

Simple configuration and test scripts for CyberSource sandbox environment.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure credentials:**
   - Open `Configuration.js`
   - Update the following with your sandbox credentials:
     - `MerchantId`
     - `MerchantKeyId`
     - `MerchantSecretKey`

## Running Tests

### Card Payment Test

Test a simple card payment (authorization with capture):

```bash
node test-card-payment.js
```

This will:
- Send a test payment of 10.00 USD (sandbox-friendly)
- Use test card: 4111111111111111 (Visa)
- Display the response (success or error)

### Google Pay (Unified Checkout) Helpers

#### 1. Generate Capture Context

```bash
npm run gpay:capture
# or
node googlepay-capture-context.js
```

- Calls `UnifiedCheckoutCaptureContextApi` and prints the captureContext JWT.
- Replace `targetOrigins` in the script with your actual backend origin.
- Paste the JWT into the Android `UnifiedCheckoutDialogFragment` (or serve via API).

#### 2. Charge a Google Pay Transient Token

```bash
npm run gpay:charge -- <TRANSIENT_TOKEN>
# or
node googlepay-charge-transient.js <TRANSIENT_TOKEN>
```

- Expects a transient token obtained from the WebView Google Pay flow.
- Sends it to `/pts/v2/payments` with `tokenInformation.transientToken`.
- Mirrors the sample `payment-with-flex-token.js`.
- Use this as a reference; in production the Android app should POST the token to your backend instead of running this script locally.

## Test Cards

Use these test cards in sandbox:

- **Success:** `4111111111111111`
- **Decline:** `4000000000000002`
- **3D Secure:** `4000000000003220`
- **Expiry:** Any future date (e.g., 12/2031)
- **CVV:** Any 3 digits (optional in test)

## Configuration

The `Configuration.js` file contains:

- **Authentication:** HTTP Signature (default)
- **Environment:** `apitest.cybersource.com` (sandbox)
- **Logging:** Enabled with masking for sensitive data

## Running the API Server

The helper Express server exposes REST endpoints for card payments and Google Pay flows. It is used by `kilekitabu-backend`.

```bash
npm run dev   # starts server with nodemon on http://localhost:4000
# or
npm start     # starts server with node
```

Available endpoints:

- `POST /api/cards/pay`
- `POST /api/googlepay/capture-context`
- `POST /api/googlepay/charge`
- `GET /health`

## API Endpoint

- **Sandbox:** `https://apitest.cybersource.com`
- **Production:** `https://api.cybersource.com` (change in Configuration.js)

## Response Codes

- **201:** Payment authorized/captured successfully
- **400:** Bad request (invalid data)
- **401:** Authentication failed (check credentials)
- **500:** Server error

## Notes

- All test transactions are simulated in sandbox
- No real money is charged
- Test cards work only in sandbox environment
- Logs are saved to `log/` directory (if enabled)

