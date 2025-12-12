# Firebase Setup Instructions

## ⚠️ Security Note

**DO NOT commit Firebase credentials files to git!** GitHub will block pushes that contain secrets.

## Setup Options

### Option 1: Environment Variable (Recommended for Production)

Use the `FIREBASE_CREDENTIALS_JSON` environment variable:

1. Get your Firebase credentials JSON content
2. Convert it to a single-line JSON string (or base64 encode it)
3. Set it in your Render.com environment variables:

```env
FIREBASE_CREDENTIALS_JSON='{"type":"service_account","project_id":"kile-kitabu",...}'
```

The code in `src/firebaseService.js` will automatically use this if set.

### Option 2: Local File (For Development Only)

1. Copy your Firebase credentials file to the `cybersource` directory
2. Name it: `kile-kitabu-firebase-adminsdk-pjk21-887b32b1fc.json`
3. **Make sure it's in `.gitignore`** (already added)
4. The code will automatically find and use it

### Option 3: Custom Path

Set `FIREBASE_CREDENTIALS_PATH` environment variable:

```env
FIREBASE_CREDENTIALS_PATH=/path/to/your/credentials.json
```

## Priority Order

The code checks in this order:
1. `FIREBASE_CREDENTIALS_JSON` (environment variable) - **Highest priority**
2. `FIREBASE_CREDENTIALS_PATH` (environment variable)
3. Default path: `kile-kitabu-firebase-adminsdk-pjk21-887b32b1fc.json`

## For Render.com Deployment

**Use Option 1** - Set `FIREBASE_CREDENTIALS_JSON` in your Render.com service environment variables.

To get the JSON string:
1. Open your Firebase credentials JSON file
2. Copy the entire contents
3. Remove all newlines and format as a single line
4. Paste into Render.com environment variable

Or use base64 encoding:
```bash
# On Linux/Mac
cat credentials.json | base64

# On Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("credentials.json"))
```

Then decode in Node.js if needed (the code handles both formats).

