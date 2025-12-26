# Testing Your API

## Your API is Now Live! 🎉

Since you've:
1. ✅ Deployed the function successfully
2. ✅ Connected the custom domain `tiankainvestmentsltd.com`

Your backend should now be accessible at:

**Base URL**: `https://tiankainvestmentsltd.com/api`

## Test Endpoints

### 1. Health Check
```bash
# Using curl (Linux/Mac)
curl https://tiankainvestmentsltd.com/api/health

# Using PowerShell (Windows)
Invoke-WebRequest -Uri "https://tiankainvestmentsltd.com/api/health" -Method GET

# Expected response:
# {"ok":true,"service":"KileKitabu Backend (Node.js)"}
```

### 2. Test from Browser
Open in your browser:
```
https://tiankainvestmentsltd.com/api/health
```

### 3. Test Capture Context
```bash
# PowerShell
$body = @{
    targetOrigins = @("https://tiankainvestmentsltd.com")
    allowedPaymentTypes = @("PANENTRY")
    amount = "10.00"
    currency = "USD"
} | ConvertTo-Json

Invoke-WebRequest -Uri "https://tiankainvestmentsltd.com/api/unified-checkout/capture-context" `
    -Method POST `
    -Body $body `
    -ContentType "application/json"
```

## Available Endpoints

All endpoints are accessible at `https://tiankainvestmentsltd.com/api/*`:

- `GET /api/health` - Health check
- `POST /api/unified-checkout/capture-context` - Generate capture context
- `POST /api/unified-checkout/charge` - Charge payment
- `POST /api/googlepay/charge` - Google Pay charge
- `POST /api/payer-auth/enroll` - 3DS enrollment
- `POST /api/payer-auth/validate` - 3DS validation
- `POST /api/cards/pay` - Direct card payment
- And all other routes...

## Troubleshooting

### If you get 404 or connection errors:

1. **Check DNS propagation**:
   ```bash
   nslookup tiankainvestmentsltd.com
   ```

2. **Verify domain in Firebase Console**:
   - Go to Firebase Console → Hosting
   - Check that `tiankainvestmentsltd.com` shows as "Connected"
   - SSL certificate should be "Active"

3. **Check function is deployed**:
   ```bash
   firebase functions:list
   ```

4. **Check hosting deployment**:
   ```bash
   firebase hosting:sites:list
   ```

### If you get 500 errors:

1. **Check function logs**:
   ```bash
   firebase functions:log
   ```

2. **Verify environment variables are set**:
   - Go to Firebase Console → Functions → Configuration
   - Check all required variables are present

3. **Test direct function URL**:
   ```
   https://us-central1-kile-kitabu.cloudfunctions.net/cybersourceBackend/api/health
   ```

## Next Steps

1. ✅ Test the health endpoint
2. ✅ Update your React app (`kilekitabu`) to use:
   ```javascript
   const API_BASE_URL = 'https://tiankainvestmentsltd.com/api'
   ```
3. ✅ Update Android app to use the new URL
4. ✅ Test end-to-end payment flow

