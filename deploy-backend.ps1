# Deploy Backend Only (Functions)
# This script deploys ONLY the backend API, not the frontend

Write-Host "🚀 Deploying Backend (Functions only)..." -ForegroundColor Green
Write-Host "This will NOT affect the frontend checkout page." -ForegroundColor Yellow

firebase deploy --only functions

Write-Host "✅ Backend deployment complete!" -ForegroundColor Green
Write-Host "Frontend remains unchanged." -ForegroundColor Cyan

