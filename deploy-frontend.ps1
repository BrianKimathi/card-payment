# Deploy Frontend (Hosting)
# This script builds the React app and deploys it to Firebase Hosting

Write-Host "🔨 Building React app..." -ForegroundColor Green
cd ..\kilekitabu
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "📦 Copying built files to public directory..." -ForegroundColor Green
cd ..\cybersource
Copy-Item -Path "..\kilekitabu\dist\*" -Destination "public\" -Recurse -Force

Write-Host "🚀 Deploying Frontend (Hosting only)..." -ForegroundColor Green
Write-Host "⚠️  Note: If API requests fail, you may need to redeploy functions too." -ForegroundColor Yellow
Write-Host "⚠️  Use: firebase deploy --only functions,hosting" -ForegroundColor Yellow
firebase deploy --only hosting

Write-Host "✅ Frontend deployment complete!" -ForegroundColor Green
Write-Host "Backend API remains unchanged." -ForegroundColor Cyan
Write-Host ""
Write-Host "🔍 If you see HTML instead of JSON from API:" -ForegroundColor Yellow
Write-Host "   1. The rewrite rule may need functions to be deployed" -ForegroundColor Yellow
Write-Host "   2. Try: firebase deploy --only functions,hosting" -ForegroundColor Yellow

