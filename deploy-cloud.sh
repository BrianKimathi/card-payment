#!/bin/bash
# Quick deployment script for Google Cloud Run
# Usage: ./deploy-cloud.sh

set -e  # Exit on error

echo "🚀 Deploying to Google Cloud Run..."

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Configuration
SERVICE_NAME="cybersource-backend"
REGION="us-central1"
MEMORY="512Mi"
CPU="1"
TIMEOUT="60"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not found. Please install it first."
    echo "   Visit: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "⚠️  Not authenticated. Running gcloud auth login..."
    gcloud auth login
fi

# Get current project
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
    echo "❌ No GCP project set. Please set one:"
    echo "   gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo "📋 Configuration:"
echo "   Project: $PROJECT_ID"
echo "   Service: $SERVICE_NAME"
echo "   Region: $REGION"
echo ""

# Deploy to Cloud Run
echo "🔨 Building and deploying..."
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --platform managed \
  --region "$REGION" \
  --allow-unauthenticated \
  --memory "$MEMORY" \
  --cpu "$CPU" \
  --timeout "$TIMEOUT" \
  --max-instances 10 \
  --min-instances 0

# Get the service URL
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format="value(status.url)")

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 Service URL: $SERVICE_URL"
echo ""
echo "🧪 Test the deployment:"
echo "   curl $SERVICE_URL/health"
echo ""
echo "📋 Useful commands:"
echo "   gcloud run services logs read $SERVICE_NAME --region $REGION"
echo "   gcloud run services describe $SERVICE_NAME --region $REGION"
echo "   gcloud run services update $SERVICE_NAME --region $REGION --update-env-vars KEY=VALUE"

