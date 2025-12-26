# Fix Firebase Functions Deployment Permissions

## Error

```
Missing required permission on project kile-kitabu to deploy new HTTPS functions.
The permission cloudfunctions.functions.setIamPolicy is required.
```

## Solution

You need the **"Cloud Functions Admin"** role to deploy HTTPS functions.

### Option 1: Grant Role via Google Cloud Console (Recommended)

1. Go to [Google Cloud IAM Console](https://console.cloud.google.com/iam-admin/iam?project=kile-kitabu)

2. Find your account in the list (or search for your email)

3. Click the **pencil icon** (Edit) next to your account

4. Click **"ADD ANOTHER ROLE"**

5. Search for and select: **"Cloud Functions Admin"**

6. Click **"SAVE"**

7. Wait 1-2 minutes for permissions to propagate

8. Try deploying again:
   ```bash
   firebase deploy --only functions,hosting
   ```

### Option 2: Grant Role via gcloud CLI

If you have `gcloud` CLI installed and have permission to grant roles:

```bash
# Set the project
gcloud config set project kile-kitabu

# Grant Cloud Functions Admin role to your account
gcloud projects add-iam-policy-binding kile-kitabu \
  --member="user:YOUR_EMAIL@example.com" \
  --role="roles/cloudfunctions.admin"

# Or if you want to grant to the current authenticated user
gcloud projects add-iam-policy-binding kile-kitabu \
  --member="user:$(gcloud config get-value account)" \
  --role="roles/cloudfunctions.admin"
```

### Option 3: Ask Project Owner

If you don't have permission to grant roles, ask the project owner to:

1. Go to [Google Cloud IAM Console](https://console.cloud.google.com/iam-admin/iam?project=kile-kitabu)
2. Add your email with the **"Cloud Functions Admin"** role

## Alternative: Use Service Account

If you can't get the role, you can also use a service account with the required permissions:

1. Create a service account in Google Cloud Console
2. Grant it "Cloud Functions Admin" role
3. Download the service account key
4. Use it for deployment:
   ```bash
   gcloud auth activate-service-account --key-file=path/to/service-account-key.json
   firebase deploy --only functions,hosting
   ```

## Verify Permissions

After granting the role, verify you have the permission:

```bash
gcloud projects get-iam-policy kile-kitabu \
  --flatten="bindings[].members" \
  --filter="bindings.members:YOUR_EMAIL@example.com" \
  --format="table(bindings.role)"
```

You should see `roles/cloudfunctions.admin` in the list.

## Required Roles for Firebase Functions Deployment

- **Cloud Functions Admin** (`roles/cloudfunctions.admin`) - Required for deploying functions
- **Firebase Admin** (`roles/firebase.admin`) - Helpful for full Firebase access
- **Service Account User** (`roles/iam.serviceAccountUser`) - May be needed for some operations

## Troubleshooting

### Still getting permission errors after granting role?

1. **Wait 1-2 minutes** - IAM changes can take time to propagate
2. **Refresh authentication**:
   ```bash
   firebase logout
   firebase login
   ```
3. **Check you're using the correct account**:
   ```bash
   firebase login:list
   gcloud auth list
   ```

### Need to check current permissions?

```bash
# Check Firebase project access
firebase projects:list

# Check Google Cloud permissions
gcloud projects get-iam-policy kile-kitabu \
  --flatten="bindings[].members" \
  --filter="bindings.members:$(gcloud config get-value account)"
```
