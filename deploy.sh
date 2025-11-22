#!/bin/bash
# Vercel Deploy Hook Script
# Usage: ./deploy.sh

HOOK_URL="https://api.vercel.com/v1/integrations/deploy/prj_zNkTlWnYVXU76aGkJBUFML3FItUm/8EpZ500XtN"

echo "🚀 Triggering Vercel deployment..."
RESPONSE=$(curl -s -X POST "$HOOK_URL")

if [ $? -eq 0 ]; then
    echo "✅ Deployment triggered successfully!"
    echo "Response: $RESPONSE"
    echo ""
    echo "📊 Check deployment status at: https://vercel.com/dashboard"
else
    echo "❌ Failed to trigger deployment"
    exit 1
fi
