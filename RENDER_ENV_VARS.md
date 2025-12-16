# Render.com Environment Variables for Node.js Service

## ✅ Copy these to Render.com Environment Variables

```env
# Application Configuration
BASE_URL=https://card-payment-hso8.onrender.com
PORT=4000
NODE_ENV=production
DEBUG=false
SECRET_KEY=aB3xK9mP2qR7vT5wY8zA1bC4dE6fG9hI0jK2lM3nO4pQ5rS6tU7vW8xY9z
CRON_SECRET_KEY=your-cron-secret-key-here-change-this-to-a-random-string

# Firebase Configuration
# IMPORTANT: Use FIREBASE_CREDENTIALS_JSON (not FIREBASE_CREDENTIALS_PATH)
# Get the JSON content from kile-kitabu-firebase-adminsdk-pjk21-887b32b1fc.json
# Remove all newlines and paste as single line below
FIREBASE_CREDENTIALS_JSON={"type":"service_account","project_id":"kile-kitabu","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}
FIREBASE_DATABASE_URL=https://kile-kitabu-default-rtdb.firebaseio.com
FIREBASE_PROJECT_ID=kile-kitabu

# Subscription Configuration
DAILY_RATE=5.0
FREE_TRIAL_DAYS=14
MONTHLY_CAP_KES=150
MAX_PREPAY_MONTHS=12
USD_TO_KES_RATE=130.0

# M-Pesa Daraja Configuration (PRODUCTION)
MPESA_ENV=production
MPESA_CONSUMER_KEY=rs7K6PTbaAzDFIcmkK0Rcg8u6GphrzUTAwfpuyd4DeSv43Og
MPESA_CONSUMER_SECRET=xshsALdAGkdfwjxALLBZCI7udGWB8dDSAubXs6tbbbUABvxqwfPuXml0hb7cbUYV
MPESA_SHORT_CODE=3576603
MPESA_TILL_NUMBER=5695092
MPESA_PASSKEY=bcfeb194a2df8ca55f17c2816a55234c837516ce016dcade10621ce0ffc9e84d
MPESA_CALLBACK_URL=https://card-payment-hso8.onrender.com/api/mpesa/callback

# CyberSource Configuration
# ⚠️ IMPORTANT: Variable names are different from Python backend!
CYBERSOURCE_RUN_ENVIRONMENT=apitest.cybersource.com
CYBERSOURCE_AUTH_TYPE=http_signature
CYBERSOURCE_MERCHANT_ID=tiankainvestmentsltd_qr
CYBERSOURCE_MERCHANT_KEY_ID=b83c5e8e-cf46-43cd-908e-22e485e75069
CYBERSOURCE_MERCHANT_SECRET_KEY=b6RWWLoVb7J2eoVkXqwE+euHKE/amaZvcp6L93LR2kg=

# Google Pay Configuration
GOOGLE_PAY_ENABLED=true
GOOGLE_PAY_MIN_AMOUNT=1.0
GOOGLE_PAY_PROCESSOR=cybersource
GOOGLE_PAY_CURRENCY=USD

# Test Flags
ALLOW_UNAUTH_TEST=false
FORCE_TRIAL_END=false
RESET_USERS_ON_LOGIN=true
```

## ⚠️ Critical Changes from Python Backend

### 1. CyberSource Variable Names (FIXED)

```diff
- CYBERSOURCE_API_KEY_ID=b83c5e8e-cf46-43cd-908e-22e485e75069
+ CYBERSOURCE_MERCHANT_KEY_ID=b83c5e8e-cf46-43cd-908e-22e485e75069

- CYBERSOURCE_SECRET_KEY=b6RWWLoVb7J2eoVkXqwE+euHKE/amaZvcp6L93LR2kg=
+ CYBERSOURCE_MERCHANT_SECRET_KEY=b6RWWLoVb7J2eoVkXqwE+euHKE/amaZvcp6L93LR2kg=

+ CYBERSOURCE_RUN_ENVIRONMENT=apitest.cybersource.com
+ CYBERSOURCE_AUTH_TYPE=http_signature
```

### 2. Firebase Credentials (CHANGED)

```diff
- FIREBASE_CREDENTIALS_PATH=kile-kitabu-firebase-adminsdk-pjk21-887b32b1fc.json
+ FIREBASE_CREDENTIALS_JSON={"type":"service_account",...}  # Single line JSON
```

### 3. Added Missing Variables

```diff
+ MPESA_TILL_NUMBER=5695092
+ USD_TO_KES_RATE=130.0
+ RESET_USERS_ON_LOGIN=true
```

## 📝 How to Get FIREBASE_CREDENTIALS_JSON

1. Open `backend/kile-kitabu-firebase-adminsdk-pjk21-887b32b1fc.json`
2. Copy the entire JSON content
3. Remove all newlines (make it a single line)
4. Paste into Render.com `FIREBASE_CREDENTIALS_JSON` variable

Or use this command to get single-line JSON:

```bash
# On Linux/Mac
cat backend/kile-kitabu-firebase-adminsdk-pjk21-887b32b1fc.json | tr -d '\n' | tr -d ' '

# On Windows PowerShell
$content = Get-Content backend/kile-kitabu-firebase-adminsdk-pjk21-887b32b1fc.json -Raw
$content -replace "`r`n", "" -replace " ", ""
```

## ✅ Quick Checklist

- [ ] Changed `CYBERSOURCE_API_KEY_ID` → `CYBERSOURCE_MERCHANT_KEY_ID`
- [ ] Changed `CYBERSOURCE_SECRET_KEY` → `CYBERSOURCE_MERCHANT_SECRET_KEY`
- [ ] Added `CYBERSOURCE_RUN_ENVIRONMENT=apitest.cybersource.com`
- [ ] Added `CYBERSOURCE_AUTH_TYPE=http_signature`
- [ ] Changed `FIREBASE_CREDENTIALS_PATH` → `FIREBASE_CREDENTIALS_JSON` (single-line JSON)
- [ ] Added `MPESA_TILL_NUMBER=5695092`
- [ ] Updated `BASE_URL` to your Render.com service URL
- [ ] Updated `MPESA_CALLBACK_URL` to match your service URL
