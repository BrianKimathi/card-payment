# Setting CyberSource Environment Variables in Firebase Functions

## ⚠️ 401 Authentication Failed Error

If you're getting a 401 "Authentication Failed" error, it means the CyberSource credentials are not set correctly in Firebase Functions.

## Required Environment Variables

You need to set these in Firebase Console:

1. `CYBERSOURCE_MERCHANT_ID` - Your CyberSource merchant ID
2. `CYBERSOURCE_MERCHANT_KEY_ID` - Your CyberSource API key ID
3. `CYBERSOURCE_MERCHANT_SECRET_KEY` - Your CyberSource secret key
4. `CYBERSOURCE_RUN_ENVIRONMENT` - `api.cybersource.com` (production) or `apitest.cybersource.com` (test)

## How to Set Environment Variables

### Option 1: Firebase Console (Recommended)

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: `kile-kitabu`
3. Go to **Functions** → **Configuration**
4. Click **"Environment variables"** tab
5. Click **"Add variable"** for each variable:

   - **Name**: `CYBERSOURCE_MERCHANT_ID`
   - **Value**: `tiankainvestmentsltd_qr` (or your actual merchant ID)

   - **Name**: `CYBERSOURCE_MERCHANT_KEY_ID`
   - **Value**: `b5b3f8f0-a9fe-4efc-9b77-b60ae68d2c2d` (or your actual key ID)

   - **Name**: `CYBERSOURCE_MERCHANT_SECRET_KEY`
   - **Value**: Your secret key (the full key, not truncated)

   - **Name**: `CYBERSOURCE_RUN_ENVIRONMENT`
   - **Value**: `api.cybersource.com` (for production) or `apitest.cybersource.com` (for test)

6. Click **"Save"** after adding all variables

### Option 2: Firebase CLI

```bash
# Set individual variables
firebase functions:config:set \
  cybersource.merchant_id="tiankainvestmentsltd_qr" \
  cybersource.merchant_key_id="b5b3f8f0-a9fe-4efc-9b77-b60ae68d2c2d" \
  cybersource.merchant_secret_key="YOUR_SECRET_KEY_HERE" \
  cybersource.run_environment="api.cybersource.com"

# Note: CLI uses dot notation, but in code access as:
# process.env.CYBERSOURCE_MERCHANT_ID (not cybersource.merchant_id)
```

**Important**: The CLI uses dot notation (`cybersource.merchant_id`), but the code expects underscore notation (`CYBERSOURCE_MERCHANT_ID`). Use the Console method instead.

### Option 3: gcloud CLI (if using Cloud Run)

```bash
gcloud run services update cybersourceBackend \
  --region us-central1 \
  --update-env-vars \
    CYBERSOURCE_MERCHANT_ID=tiankainvestmentsltd_qr,\
    CYBERSOURCE_MERCHANT_KEY_ID=b5b3f8f0-a9fe-4efc-9b77-b60ae68d2c2d,\
    CYBERSOURCE_MERCHANT_SECRET_KEY=YOUR_SECRET_KEY_HERE,\
    CYBERSOURCE_RUN_ENVIRONMENT=api.cybersource.com
```

## Verify Environment Variables

After setting the variables, redeploy:

```bash
cd cybersource
firebase deploy --only functions
```

Then check the logs to verify:

```bash
firebase functions:log
```

You should see:
```
[API_CLIENT] Using environment: api.cybersource.com
[API_CLIENT] Merchant ID: tiankainvestmentsltd_qr
[API_CLIENT] Merchant Key ID: b5b3f8f0-a9fe-4efc-9b...
```

## Common Issues

### 1. Variables Not Set
- **Symptom**: 401 Authentication Failed
- **Solution**: Set all required variables in Firebase Console

### 2. Wrong Secret Key
- **Symptom**: 401 Authentication Failed
- **Solution**: Verify the secret key is correct and complete (not truncated)

### 3. Wrong Environment
- **Symptom**: 401 Authentication Failed
- **Solution**: Ensure `CYBERSOURCE_RUN_ENVIRONMENT` matches your credentials:
  - Production credentials → `api.cybersource.com`
  - Test credentials → `apitest.cybersource.com`

### 4. Variables Not Applied
- **Symptom**: Still getting 401 after setting variables
- **Solution**: 
  1. Redeploy: `firebase deploy --only functions`
  2. Wait 1-2 minutes for changes to propagate
  3. Check logs: `firebase functions:log`

## Testing

After setting variables, test the API:

```bash
curl -X POST https://tiankainvestmentsltd.com/api/unified-checkout/capture-context \
  -H "Content-Type: application/json" \
  -d '{"targetOrigins":["https://tiankainvestmentsltd.com"]}'
```

Should return a capture context JWT (not 401).



