# Environment Variables Fix

## Issue 1: CyberSource "MerchantKeyId is Mandatory"

### ❌ Wrong Variable Names (What you might have set):
```
CYBERSOURCE_API_KEY_ID=...
CYBERSOURCE_SECRET_KEY=...
```

### ✅ Correct Variable Names (What you need):
```
CYBERSOURCE_MERCHANT_KEY_ID=...
CYBERSOURCE_MERCHANT_SECRET_KEY=...
```

**Fix**: In Render.com, update your environment variables:
- Change `CYBERSOURCE_API_KEY_ID` → `CYBERSOURCE_MERCHANT_KEY_ID`
- Change `CYBERSOURCE_SECRET_KEY` → `CYBERSOURCE_MERCHANT_SECRET_KEY`

## Issue 2: Firebase Not Initializing (500 Error on /api/notifications/register-token)

### Check Your Firebase Credentials

The error "Firebase not available" means Firebase didn't initialize. Check:

1. **Is `FIREBASE_CREDENTIALS_JSON` set?**
   - It should be a **single-line JSON string** (no newlines)
   - Example format: `{"type":"service_account","project_id":"kile-kitabu",...}`

2. **Common Issues:**
   - ❌ JSON has newlines (will fail to parse)
   - ❌ JSON is base64 encoded but code expects plain JSON
   - ❌ JSON string has extra quotes or escaping issues
   - ❌ Environment variable not set in Render.com

### How to Fix Firebase Credentials JSON

**Option A: Single-line JSON (Recommended)**
1. Open your Firebase credentials JSON file
2. Copy the entire content
3. Remove ALL newlines (make it one line)
4. Paste into Render.com `FIREBASE_CREDENTIALS_JSON` variable

**Option B: Check if it's parsing correctly**
Add this to your server.js temporarily to debug:
```javascript
console.log("FIREBASE_CREDENTIALS_JSON exists:", !!process.env.FIREBASE_CREDENTIALS_JSON);
console.log("FIREBASE_CREDENTIALS_JSON length:", process.env.FIREBASE_CREDENTIALS_JSON?.length);
```

## Complete CyberSource Environment Variables

Make sure you have ALL of these set in Render.com:

```
CYBERSOURCE_MERCHANT_ID=your-merchant-id
CYBERSOURCE_MERCHANT_KEY_ID=your-merchant-key-id
CYBERSOURCE_MERCHANT_SECRET_KEY=your-merchant-secret-key
CYBERSOURCE_RUN_ENVIRONMENT=apitest.cybersource.com  # or api.cybersource.com for production
CYBERSOURCE_AUTH_TYPE=http_signature
```

## Complete Firebase Environment Variables

```
FIREBASE_CREDENTIALS_JSON={"type":"service_account","project_id":"kile-kitabu",...}  # Single line, no newlines
FIREBASE_DATABASE_URL=https://kile-kitabu-default-rtdb.firebaseio.com
FIREBASE_PROJECT_ID=kile-kitabu
```

## Quick Checklist

- [ ] `CYBERSOURCE_MERCHANT_KEY_ID` set (not `CYBERSOURCE_API_KEY_ID`)
- [ ] `CYBERSOURCE_MERCHANT_SECRET_KEY` set (not `CYBERSOURCE_SECRET_KEY`)
- [ ] `FIREBASE_CREDENTIALS_JSON` set as single-line JSON (no newlines)
- [ ] `FIREBASE_DATABASE_URL` set
- [ ] `FIREBASE_PROJECT_ID` set
- [ ] All M-Pesa variables set
- [ ] `BASE_URL` set to your Render.com service URL

