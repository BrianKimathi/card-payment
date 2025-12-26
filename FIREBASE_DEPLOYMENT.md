# Firebase Deployment Guide for tiankainvestmentsltd.com

## Overview

This guide explains how to deploy the CyberSource backend to Firebase Functions and make it accessible at `https://tiankainvestmentsltd.com/api`.

## Configuration

### 1. Firebase Project
- **Project ID**: `kile-kitabu`
- **Function Name**: `cybersourceBackend`
- **Region**: `us-central1`

### 2. Custom Domain Setup

The API will be accessible at:
- **Base URL**: `https://tiankainvestmentsltd.com/api`
- **Example Endpoints**:
  - `https://tiankainvestmentsltd.com/api/health`
  - `https://tiankainvestmentsltd.com/api/unified-checkout/capture-context`
  - `https://tiankainvestmentsltd.com/api/unified-checkout/charge`

### 3. Firebase Hosting Configuration

The `firebase.json` file is configured to:
- Route all `/api/**` requests to the `cybersourceBackend` Cloud Function
- Serve a landing page at the root (`/`)
- Handle CORS headers for API requests

## Deployment Steps

### Step 1: Install Dependencies

```bash
cd cybersource/functions
npm install
```

### Step 2: Set Environment Variables

Set environment variables in Firebase Console or via CLI:

```bash
firebase functions:config:set \
  cybersource.merchant_id="your_merchant_id" \
  cybersource.merchant_key_id="your_key_id" \
  cybersource.merchant_secret_key="your_secret_key" \
  cybersource.run_environment="apitest.cybersource.com"
```

**OR** set them in Firebase Console:
1. Go to Firebase Console → Functions → Configuration
2. Add environment variables:
   - `CYBERSOURCE_MERCHANT_ID`
   - `CYBERSOURCE_MERCHANT_KEY_ID`
   - `CYBERSOURCE_MERCHANT_SECRET_KEY`
   - `CYBERSOURCE_RUN_ENVIRONMENT` (apitest.cybersource.com or api.cybersource.com)
   - `BASE_URL` (https://tiankainvestmentsltd.com)
   - `FIREBASE_CREDENTIALS_JSON` (base64 encoded Firebase service account JSON)

### Step 3: Deploy Functions and Hosting

```bash
cd cybersource
firebase deploy --only functions,hosting
```

This will:
1. Deploy the Cloud Function (`cybersourceBackend`)
2. Deploy Firebase Hosting with rewrites configured

### Step 4: Connect Custom Domain

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select project: `kile-kitabu`
3. Go to **Hosting** → **Add custom domain**
4. Enter: `tiankainvestmentsltd.com`
5. Follow the DNS configuration instructions
6. Wait for SSL certificate provisioning (usually 5-10 minutes)

### Step 5: Verify Deployment

1. **Test Health Endpoint**:
   ```bash
   curl https://tiankainvestmentsltd.com/api/health
   ```
   Should return: `{"ok":true,"service":"KileKitabu Backend (Node.js)"}`

2. **Test from Browser**:
   - Visit: `https://tiankainvestmentsltd.com/api/health`
   - Should see JSON response

3. **Test API Endpoint**:
   ```bash
   curl -X POST https://tiankainvestmentsltd.com/api/unified-checkout/capture-context \
     -H "Content-Type: application/json" \
     -d '{"targetOrigins":["https://tiankainvestmentsltd.com"]}'
   ```

## Important Notes

### CORS Configuration

The Express app already includes CORS configuration that allows:
- `https://tiankainvestmentsltd.com`
- `https://www.tiankainvestmentsltd.com`
- `https://*.tiankainvestmentsltd.com` (all subdomains)

### Function URL vs Hosting URL

- **Direct Function URL**: `https://us-central1-kile-kitabu.cloudfunctions.net/cybersourceBackend`
- **Hosting Rewrite URL**: `https://tiankainvestmentsltd.com/api`

Both URLs work, but the hosting rewrite URL is recommended for production.

### Route Structure

All routes in `server.js` are prefixed with `/api/`, so:
- `/api/health` → Express route `/health`
- `/api/unified-checkout/capture-context` → Express route `/unified-checkout/capture-context`

The Firebase Hosting rewrite removes the `/api` prefix before forwarding to the function, but the Express app routes already include `/api/` in their definitions.

### Troubleshooting

1. **Function Timeout**: Check that lazy initialization is working (Firebase should initialize on first request)

2. **CORS Errors**: Verify CORS configuration in `server.js` includes your domain

3. **404 Errors**: Check that:
   - Function is deployed: `firebase functions:list`
   - Hosting rewrite is configured: Check `firebase.json`
   - Route exists in `server.js`

4. **Environment Variables**: Verify all required env vars are set:
   ```bash
   firebase functions:config:get
   ```

## Updating the App

After deployment, update your Android app's `NetworkConfig.kt`:

```kotlin
private const val BASE_URL = "https://tiankainvestmentsltd.com/api/"
```

## Monitoring

- **Function Logs**: `firebase functions:log`
- **Hosting Logs**: Firebase Console → Hosting → Logs
- **Function Metrics**: Firebase Console → Functions → Metrics

