# Add CYBERSOURCE_RUN_ENVIRONMENT to Firebase Console

Since you don't see `CYBERSOURCE_RUN_ENVIRONMENT` in Firebase Console, you need to **add it**.

## Steps:

1. Go to [Firebase Console - Functions Config](https://console.firebase.google.com/project/kile-kitabu/functions/config)
2. Click the **"Environment variables"** tab
3. Click **"Add variable"** button (top right)
4. Enter:
   - **Name**: `CYBERSOURCE_RUN_ENVIRONMENT`
   - **Value**: `api.cybersource.com`
5. Click **"Save"**

## Why This is Needed:

The deployment logs show:
```
i  functions: Loaded environment variables from .env.
```

This means Firebase is loading from the `.env` file, which has `apitest.cybersource.com`. 

**Environment variables set in Firebase Console override `.env` file values**, so adding it in Console will ensure production is used.

## After Adding:

The change takes effect immediately - no redeploy needed. The next request will show:
```
[API_CLIENT] Using environment: api.cybersource.com
[API_CLIENT] Base path: https://api.cybersource.com
```

