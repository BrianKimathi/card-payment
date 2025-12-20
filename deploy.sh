#!/bin/bash
# Deployment script for CyberSource backend
# Usage: ./deploy.sh

set -e  # Exit on error

echo "🚀 Starting deployment..."

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  Warning: .env file not found. Please create it with your configuration."
    echo "   See .env.example for reference"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "⚠️  PM2 not found. Installing globally..."
    sudo npm install -g pm2
fi

# Restart or start the application
if pm2 list | grep -q "cybersource-backend"; then
    echo "🔄 Restarting existing PM2 process..."
    pm2 restart cybersource-backend
else
    echo "▶️  Starting new PM2 process..."
    pm2 start server.js --name "cybersource-backend" --instances 1
    pm2 save
fi

# Show status
echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 PM2 Status:"
pm2 status

echo ""
echo "📋 Recent logs:"
pm2 logs cybersource-backend --lines 10 --nostream

echo ""
echo "💡 Useful commands:"
echo "   pm2 logs cybersource-backend    # View logs"
echo "   pm2 monit                       # Monitor resources"
echo "   pm2 restart cybersource-backend # Restart"
echo "   pm2 stop cybersource-backend    # Stop"


