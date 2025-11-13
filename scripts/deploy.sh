#!/bin/bash
# Deploy external game package changes to AnteTown platform
#
# Usage:
#   ./scripts/deploy.sh <game-name>
#
# Examples:
#   ./scripts/deploy.sh war-faire
#   ./scripts/deploy.sh pirate-plunder
#   ./scripts/deploy.sh ck-flipz
#
# This script handles the critical ordering issue with file: dependencies:
# 1. Build the game package FIRST
# 2. THEN rebuild platform frontend (Vite won't detect game changes otherwise)
# 3. Copy frontend to backend/dist/public/
# 4. Restart the platform
# 5. Clear Caddy cache

set -e

GAME_NAME="$1"

if [ -z "$GAME_NAME" ]; then
    echo "❌ Error: Game name required"
    echo "Usage: $0 <game-name>"
    echo "Examples: war-faire, pirate-plunder, ck-flipz"
    exit 1
fi

# Tailscale host
HOST="deploy@vps-0b87e710.tail751d97.ts.net"

echo "🎮 Deploying $GAME_NAME to AnteTown platform..."
echo ""

# Step 1: Update and build game package
echo "📦 Step 1/5: Building game package..."
tailscale ssh $HOST "cd /opt/AnteTown-Games/games/$GAME_NAME && git pull && npm run build"
echo "✅ Game package built"
echo ""

# Step 2: Rebuild platform frontend (CRITICAL - picks up game changes)
echo "🏗️  Step 2/5: Rebuilding platform frontend..."
echo "⚠️  This step is CRITICAL - Vite won't detect game changes without rebuilding"
tailscale ssh $HOST "cd /opt/AnteTown/platform/frontend && npm run build"
echo "✅ Platform frontend rebuilt"
echo ""

# Step 3: Copy frontend to backend public directory (CRITICAL!)
echo "📂 Step 3/5: Copying frontend to backend..."
tailscale ssh $HOST "cp -r /opt/AnteTown/platform/frontend/dist/* /opt/AnteTown/platform/backend/dist/public/"
echo "✅ Frontend copied to backend"
echo ""

# Step 4: Restart platform service
echo "🔄 Step 4/5: Restarting platform..."
tailscale ssh $HOST "sudo systemctl restart AnteTown"
echo "✅ Platform restarted"
echo ""

# Step 5: Clear Caddy cache
echo "🗑️  Step 5/5: Clearing Caddy cache..."
tailscale ssh $HOST "sudo rm -rf /var/lib/caddy/.local/share/caddy/* && sudo systemctl reload caddy"
echo "✅ Caddy cache cleared"
echo ""

# Verify deployment
echo "🔍 Verifying deployment..."
sleep 3
tailscale ssh $HOST "sudo systemctl status AnteTown --no-pager -l | head -20"

echo ""
echo "✅ Deployment complete!"
echo "🌐 Test at: https://antetown.com"
echo ""
echo "💡 TIP: Hard refresh your browser (Ctrl+Shift+R / Cmd+Shift+R) to see changes"
