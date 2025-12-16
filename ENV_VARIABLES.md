# Environment Variables Reference

## Required Environment Variables

### 🔴 Critical (Must Set)

#### Firebase

- **`FIREBASE_CREDENTIALS_JSON`** (Recommended) OR **`FIREBASE_CREDENTIALS_PATH`**
  - Firebase Admin SDK credentials
  - Use `FIREBASE_CREDENTIALS_JSON` for production (Render.com)
  - Use `FIREBASE_CREDENTIALS_PATH` for local development
- **`FIREBASE_DATABASE_URL`**
  - Default: `https://kile-kitabu-default-rtdb.firebaseio.com`
- **`FIREBASE_PROJECT_ID`**
  - Default: `kile-kitabu`

#### M-Pesa

- **`MPESA_CONSUMER_KEY`** - M-Pesa API consumer key
- **`MPESA_CONSUMER_SECRET`** - M-Pesa API consumer secret
- **`MPESA_SHORT_CODE`** - Business short code
- **`MPESA_TILL_NUMBER`** - Till number (PartyB)
- **`MPESA_PASSKEY`** - M-Pesa passkey
- **`MPESA_ENV`** - `production` or `sandbox` (default: `production`)
- **`MPESA_CALLBACK_URL`** - Auto-generated from `BASE_URL` if not set

#### CyberSource

- **`CYBERSOURCE_MERCHANT_ID`** - CyberSource merchant ID
- **`CYBERSOURCE_API_KEY_ID`** - CyberSource API key ID
- **`CYBERSOURCE_SECRET_KEY`** - CyberSource secret key
- **`CYBERSOURCE_ENV`** - `sandbox` or `production` (default: `sandbox`)

### 🟡 Important (Should Set)

- **`BASE_URL`** - Your service URL (default: `https://kilekitabu-backend.onrender.com`)
- **`PORT`** - Server port (default: `4000`)
- **`SECRET_KEY`** - Application secret key
- **`CRON_SECRET_KEY`** - Secret for cron endpoints (defaults to `SECRET_KEY`)

### 🟢 Optional (Has Defaults)

#### Subscription Settings

- **`DAILY_RATE`** - Cost per day in KES (default: `5.0`)
- **`FREE_TRIAL_DAYS`** - Free trial period (default: `14`)
- **`MONTHLY_CAP_KES`** - Monthly spending cap (default: `150`)
- **`MAX_PREPAY_MONTHS`** - Max months to prepay (default: `12`)
- **`USD_TO_KES_RATE`** - Exchange rate (default: `130.0`)

#### Test Flags

- **`ALLOW_UNAUTH_TEST`** - Allow unauthenticated requests for testing (default: `false`)
- **`FORCE_TRIAL_END`** - Force trial to end (default: `false`)
- **`RESET_USERS_ON_LOGIN`** - Reset users on login (default: `true`)

## Files Needed

### Required Files

1. **Firebase Credentials** (One of these):
   - `kile-kitabu-firebase-adminsdk-pjk21-887b32b1fc.json` (local development)
   - OR set `FIREBASE_CREDENTIALS_JSON` environment variable (production)

### Optional Files

1. **`.env`** - Local environment variables (not committed to git)
   - Copy from `.env.example`
   - Fill in your values

## Setup Instructions

### For Local Development

1. Copy `.env.example` to `.env`:

   ```bash
   cp .env.example .env
   ```

2. Copy Firebase credentials file:

   ```bash
   cp ../backend/kile-kitabu-firebase-adminsdk-pjk21-887b32b1fc.json .
   ```

3. Edit `.env` and fill in your values

4. Install dependencies:

   ```bash
   npm install
   ```

5. Run:
   ```bash
   npm start
   ```

### For Production (Render.com)

1. Go to your Render.com service settings
2. Navigate to "Environment" section
3. Add all required environment variables
4. For `FIREBASE_CREDENTIALS_JSON`:
   - Open your Firebase credentials JSON file
   - Copy entire contents
   - Remove all newlines (make it a single line)
   - Paste into Render.com environment variable

## Getting Firebase Credentials JSON String

### Method 1: Single Line (Recommended)

```bash
# On Linux/Mac
cat kile-kitabu-firebase-adminsdk-pjk21-887b32b1fc.json | tr -d '\n' | tr -d ' '
```

### Method 2: Base64 (Alternative)

```bash
# On Linux/Mac
cat kile-kitabu-firebase-adminsdk-pjk21-887b32b1fc.json | base64

# On Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("kile-kitabu-firebase-adminsdk-pjk21-887b32b1fc.json"))
```

Then in Node.js, decode if needed (the code handles both formats).

## Security Notes

⚠️ **NEVER commit these to git:**

- `.env` file
- Firebase credentials JSON files
- Any file containing secrets

✅ **Safe to commit:**

- `.env.example` (template without real values)
- `.gitignore` (already configured)

## Quick Checklist

- [ ] Firebase credentials set (JSON env var or file)
- [ ] M-Pesa credentials set
- [ ] CyberSource credentials set
- [ ] `BASE_URL` set to your service URL
- [ ] `PORT` set (or using default 4000)
- [ ] All subscription settings configured (or using defaults)
