# Deployment Guide

## Separate Frontend and Backend Deployments

The frontend (React checkout page) and backend (API) are deployed separately to avoid conflicts.

## Quick Deploy Commands

### Deploy Backend Only (API)
```powershell
.\deploy-backend.ps1
```
Or manually:
```bash
firebase deploy --only functions
```

### Deploy Frontend Only (Checkout Page)
```powershell
.\deploy-frontend.ps1
```
Or manually:
```bash
# 1. Build React app
cd ../kilekitabu
npm run build

# 2. Copy to public directory
cd ../cybersource
Copy-Item -Path "..\kilekitabu\dist\*" -Destination "public\" -Recurse -Force

# 3. Deploy hosting
firebase deploy --only hosting
```

## Important Notes

1. **Backend deployment (`firebase deploy --only functions`)**:
   - Only updates the API endpoints
   - Does NOT affect the frontend checkout page
   - Safe to run anytime

2. **Frontend deployment (`firebase deploy --only hosting`)**:
   - Updates the checkout page
   - Does NOT affect the backend API
   - Requires building the React app first

3. **Never run `firebase deploy` without flags**:
   - This deploys both functions and hosting
   - Can cause conflicts if frontend isn't built

## Current Setup

- **Backend API**: `https://tiankainvestmentsltd.com/api/*`
- **Frontend**: `https://tiankainvestmentsltd.com/` (checkout page)
- **Local Dev**: `http://localhost:3000` (can call production API)

## CORS Configuration

The backend allows all origins, so:
- Local React app (`localhost:3000`) can call production API
- Production React app can call production API
- No CORS errors

