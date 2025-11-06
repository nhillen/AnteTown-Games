# Deployment Health Checks

## How We Should Have Caught the Deployment Issue Earlier

The deployment was silently broken for days because we didn't have proper verification. Here's what we should implement:

## 1. Mandatory Post-Deployment Verification

### Current `/api/deploy-info` Endpoint
```bash
curl -s http://vps-0b87e710.tail751d97.ts.net:3001/api/deploy-info | jq '.'
```

**Problem**: We checked this but it only shows when the service restarted, not when the source code was last updated.

### Solution: Enhanced Verification
Add these checks to the GitHub Actions workflow:

```yaml
- name: Verify Deployment Actually Updated
  run: |
    # Wait for service to start
    sleep 15
    
    # Get current commit being deployed
    EXPECTED_COMMIT="${{ github.sha }}"
    
    # Get deployment info from server
    DEPLOY_INFO=$(curl -s http://${{ inputs.host }}:3001/api/deploy-info)
    ACTUAL_COMMIT=$(echo "$DEPLOY_INFO" | jq -r '.commitHash')
    BUILD_DATE=$(echo "$DEPLOY_INFO" | jq -r '.buildDate')
    
    # Compare expected vs actual
    if [ "$ACTUAL_COMMIT" != "$EXPECTED_COMMIT" ] && [ "$ACTUAL_COMMIT" != "unknown" ]; then
      echo "❌ DEPLOYMENT FAILED: Expected commit $EXPECTED_COMMIT but server shows $ACTUAL_COMMIT"
      echo "🔍 This means the deployment didn't actually update the running code!"
      exit 1
    fi
    
    # Check if build date is recent (within last 10 minutes)
    BUILD_TIMESTAMP=$(date -d "$BUILD_DATE" +%s)
    CURRENT_TIMESTAMP=$(date +%s)
    AGE_SECONDS=$((CURRENT_TIMESTAMP - BUILD_TIMESTAMP))
    
    if [ $AGE_SECONDS -gt 600 ]; then
      echo "❌ STALE BUILD: Build is $((AGE_SECONDS / 60)) minutes old, expected fresh build"
      exit 1
    fi
    
    echo "✅ Deployment verification passed!"
```

## 2. Frontend Asset Verification

**Problem**: Frontend assets had old timestamps but we didn't check.

**Solution**: Add asset freshness check:

```bash
# Check if main JS asset was built recently
MAIN_JS=$(curl -s http://server:3001/ | grep -o 'assets/index-[^"]*\.js' | head -1)
JS_RESPONSE=$(curl -I http://server:3001/$MAIN_JS 2>/dev/null)

if echo "$JS_RESPONSE" | grep -q "Last-Modified:"; then
    LAST_MODIFIED=$(echo "$JS_RESPONSE" | grep "Last-Modified:" | cut -d' ' -f2-)
    ASSET_AGE=$(( $(date +%s) - $(date -d "$LAST_MODIFIED" +%s) ))
    
    if [ $ASSET_AGE -gt 600 ]; then
        echo "❌ Frontend assets are stale (${ASSET_AGE}s old)"
        exit 1
    fi
fi
```

## 3. Source Code Verification

**What We Should Have Done**: Check if a specific recent change is actually deployed.

```bash
# Pick a unique string from recent commits to verify deployment
VERIFICATION_STRING="refreshUser.*useAuth"
tailscale ssh deploy@server "grep -q '$VERIFICATION_STRING' /opt/PiratePlunder/games/pirate-plunder/frontend/src/components/GameApp.tsx" || {
    echo "❌ Recent code changes not found in deployed source!"
    exit 1
}
```

## 4. Build Process Verification

**Problem**: `make build || true` was failing silently.

**Solution**: Make build failures fail the deployment:

```yaml
- name: Build (REQUIRED)
  run: |
    echo "🔨 Building application..."
    if ! make build; then
        echo "❌ Build failed - aborting deployment"
        exit 1
    fi
    
    # Verify build artifacts exist
    if [ ! -f games/pirate-plunder/backend/dist/server.js ]; then
        echo "❌ Backend build failed - server.js not found"
        exit 1
    fi
    
    if [ ! -d games/pirate-plunder/frontend/dist/assets ]; then
        echo "❌ Frontend build failed - assets directory not found"
        exit 1
    fi
    
    echo "✅ Build completed successfully"
```

## 5. Deployment Red Flags We Missed

🚩 **Red Flag #1**: Version endpoint showing old commit hash
🚩 **Red Flag #2**: Frontend assets from days ago  
🚩 **Red Flag #3**: TypeScript errors in build but deployment "succeeds"
🚩 **Red Flag #4**: "Preserving pre-built assets" message in logs
🚩 **Red Flag #5**: No actual verification that code changes work

## 6. Prevention Strategy

### Pre-Deployment Checklist
- [ ] TypeScript compiles without errors locally
- [ ] `make build` succeeds locally  
- [ ] Recent changes are in source files on server after deployment
- [ ] Version/commit hash updated after deployment
- [ ] Frontend assets have recent timestamps
- [ ] Functionality actually works on production server (via Tailscale testing)

### Automated Verification
Add to GitHub Actions workflow:
1. **Build verification**: Ensure build succeeds and outputs exist
2. **Asset freshness check**: Verify frontend assets are newly built
3. **Source code verification**: Check specific recent changes are deployed
4. **Functional testing**: Basic smoke tests on deployed service
5. **Rollback on failure**: Auto-rollback if verification fails

## 7. Monitoring Dashboard

Create a simple monitoring page that checks:
- ✅ Last successful deployment time
- ✅ Current running commit vs latest commit  
- ✅ Frontend asset freshness
- ✅ Backend service health
- ✅ Build pipeline status

**URL**: http://vps-0b87e710.tail751d97.ts.net:3001/admin/deployment-status

This way we can immediately see if deployments are lagging behind commits.
