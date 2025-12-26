# Set CyberSource to Production in Firebase Console

## Current Issue
The logs show `apitest.cybersource.com` because the environment variable is set in Firebase Console.

## Fix: Update Environment Variable

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select project: **kile-kitabu**
3. Go to **Functions** → **Configuration**
4. Click the **"Environment variables"** tab
5. Find `CYBERSOURCE_RUN_ENVIRONMENT` in the list
6. Click the **pencil/edit icon** next to it
7. Change the value from `apitest.cybersource.com` to `api.cybersource.com`
8. Click **"Save"**

## Alternative: Set via gcloud CLI

If you prefer using CLI:

```bash
gcloud functions deploy cybersourceBackend \
  --gen2 \
  --region=us-central1 \
  --runtime=nodejs20 \
  --set-env-vars CYBERSOURCE_RUN_ENVIRONMENT=api.cybersource.com
```

Or update the existing function:

```bash
gcloud run services update cybersourceBackend \
  --region us-central1 \
  --update-env-vars CYBERSOURCE_RUN_ENVIRONMENT=api.cybersource.com
```

## After Setting

The function will automatically use the new environment variable on the next request. No redeploy needed, but you can verify by checking the logs:

```bash
firebase functions:log --only cybersourceBackend
```

You should see:
```
[API_CLIENT] Using environment: api.cybersource.com
[API_CLIENT] Base path: https://api.cybersource.com
```

