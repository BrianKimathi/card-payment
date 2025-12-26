# Firebase Configuration Summary

## ✅ Configuration Complete

The `cybersource/functions` directory is now fully configured to run on `https://tiankainvestmentsltd.com` with the API accessible at `https://tiankainvestmentsltd.com/api`.

## Configuration Files

### 1. `firebase.json`
- ✅ Functions configuration for `cybersourceBackend`
- ✅ Hosting configuration with `/api/**` rewrite to function
- ✅ CORS headers configured for API endpoints
- ✅ Region set to `us-central1`

### 2. `functions/index.js`
- ✅ Exports `cybersourceBackend` Cloud Function
- ✅ Uses Express app from `server.js`
- ✅ CORS enabled
- ✅ Region specified: `us-central1`

### 3. `functions/server.js`
- ✅ All routes properly configured with `/api/` prefix
- ✅ CORS allows `tiankainvestmentsltd.com` and subdomains
- ✅ Lazy Firebase initialization (prevents timeout)
- ✅ Lazy startup checks (prevents timeout)
- ✅ Health endpoint at `/api/health`

### 4. `functions/src/firebaseService.js`
- ✅ Lazy initialization (only initializes when accessed)
- ✅ Prevents deployment timeout

### 5. `public/index.html`
- ✅ Landing page for root domain
- ✅ API documentation

## API Endpoints

All endpoints are accessible at `https://tiankainvestmentsltd.com/api/*`:

- `GET /api/health` - Health check
- `POST /api/unified-checkout/capture-context` - Generate capture context
- `POST /api/unified-checkout/charge` - Charge payment
- `POST /api/googlepay/charge` - Google Pay charge
- `POST /api/payer-auth/enroll` - 3DS enrollment check
- `POST /api/payer-auth/validate` - 3DS validation
- `POST /api/payer-auth/setup` - 3DS setup
- `POST /api/payer-auth/validate-and-complete` - Validate and complete payment
- `POST /api/unified-checkout/payer-auth/enroll` - UC 3DS enrollment
- `POST /api/unified-checkout/payer-auth/validate` - UC 3DS validation
- `POST /api/cards/pay` - Direct card payment
- `POST /api/transactions/search` - Search transactions
- `POST /api/mpesa/*` - M-Pesa endpoints
- `POST /api/*` - Subscription endpoints
- `POST /api/notifications/*` - Notification endpoints
- `POST /api/cron/*` - Cron endpoints

## CORS Configuration

The following origins are allowed:
- ✅ `https://tiankainvestmentsltd.com`
- ✅ `https://www.tiankainvestmentsltd.com`
- ✅ `https://*.tiankainvestmentsltd.com` (all subdomains)
- ✅ `http://localhost:3000`, `http://localhost:8000`, `http://localhost:4000`
- ✅ Render.com domains
- ✅ ngrok domains

## Deployment

To deploy:

```bash
cd cybersource
firebase deploy --only functions,hosting
```

## Environment Variables Required

Set these in Firebase Console → Functions → Configuration:

- `CYBERSOURCE_MERCHANT_ID`
- `CYBERSOURCE_MERCHANT_KEY_ID`
- `CYBERSOURCE_MERCHANT_SECRET_KEY`
- `CYBERSOURCE_RUN_ENVIRONMENT` (apitest.cybersource.com or api.cybersource.com)
- `BASE_URL` (https://tiankainvestmentsltd.com)
- `FIREBASE_CREDENTIALS_JSON` (base64 encoded service account JSON)
- `MPESA_CONSUMER_KEY` (if using M-Pesa)
- `MPESA_CONSUMER_SECRET` (if using M-Pesa)
- `MPESA_SHORT_CODE` (if using M-Pesa)
- `MPESA_PASSKEY` (if using M-Pesa)

## Custom Domain Setup

1. Deploy functions and hosting:
   ```bash
   firebase deploy --only functions,hosting
   ```

2. In Firebase Console:
   - Go to Hosting → Add custom domain
   - Enter: `tiankainvestmentsltd.com`
   - Follow DNS configuration instructions
   - Wait for SSL certificate (5-10 minutes)

3. Verify:
   ```bash
   curl https://tiankainvestmentsltd.com/api/health
   ```

## Testing

After deployment, test the API:

```bash
# Health check
curl https://tiankainvestmentsltd.com/api/health

# Should return:
# {"ok":true,"service":"KileKitabu Backend (Node.js)"}
```

## Notes

- The function uses lazy initialization to prevent deployment timeouts
- All routes are prefixed with `/api/` to match the hosting rewrite
- CORS is configured to allow requests from the custom domain
- The landing page is served at the root (`/`)
- All API requests are routed to the Cloud Function via hosting rewrite

