# Deployment Verification Checklist

## 🚨 CRITICAL: Always Verify Deployments

**Why This Matters**: In August 2025, we experienced a critical deployment pipeline failure where GitHub Actions reported "success" but old code remained on the server. This wasted hours debugging "broken fixes" that were never actually deployed.

## Mandatory Pre-Deployment Steps

### 1. TypeScript Compilation Check
```bash
# MUST pass before any deployment
npm exec --workspace @pirate/game-pirate-plunder-backend tsc -- --noEmit
npm exec --workspace @pirate/game-pirate-plunder-frontend tsc -- --noEmit
```

### 2. Version Bump (Optional but Recommended)
```bash
# Update all package.json files with new version
# Update frontend version in GameApp.tsx
# This provides immediate visual confirmation of deployment
```

## Deployment Process

### 1. Deploy Using Manual Tailscale SSH Method (RECOMMENDED)
```bash
# 1. Sync source code to server
tar --exclude='.git' --exclude='node_modules' --exclude='games/pirate-plunder/frontend/node_modules' --exclude='games/pirate-plunder/backend/node_modules' --exclude='games/pirate-plunder/frontend/dist' --exclude='games/pirate-plunder/backend/dist' -czf - . | tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/PiratePlunder && tar -xzf -"

# 2. Build and restart on server  
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/PiratePlunder && sudo systemctl stop PiratePlunder && make build && sudo systemctl start PiratePlunder"
```

#### Alternative: Deploy Using Helper Script (HAS CACHING ISSUES)
```bash
cd /home/nathan/GitHub/infra-workflows
./deploy-helper.sh pirateplunder
# ⚠️ This method may serve cached frontend assets that don't reflect recent changes
```

### 2. MANDATORY Post-Deployment Verification

#### A. Check Backend Version
```bash
curl -s http://vps-0b87e710.tail751d97.ts.net:3001/api/deploy-info | jq '.backendVersion'
```
**Expected**: Should match your local `games/pirate-plunder/backend/package.json` version

#### B. Verify Asset MIME Types
```bash
curl -I http://vps-0b87e710.tail751d97.ts.net:3001/assets/index-*.js | grep Content-Type
```
**Expected**: `Content-Type: application/javascript`
**Bad**: `Content-Type: text/html` (means route order is wrong)

#### C. Check Asset File Size
```bash
curl -I http://vps-0b87e710.tail751d97.ts.net:3001/assets/index-*.js | grep Content-Length
```
**Expected**: ~290KB (large JavaScript file)
**Bad**: ~714 bytes (means serving HTML instead)

#### D. Visual UI Verification
1. Open http://vps-0b87e710.tail751d97.ts.net:3001
2. Check version display in header: `v1.0.X (Frontend) | v1.0.X (Backend)`
3. Both should match your local versions

#### E. Functional Test
```bash
# Basic health check
curl http://vps-0b87e710.tail751d97.ts.net:3001/health
```
**Expected**: `{"status":"ok"}`

## Troubleshooting Failed Deployments

### If Version Doesn't Match
```bash
# 1. Check deployment workflow status
gh run list --repo drybrushgames/PiratePlunder --limit 3

# 2. Manual service restart
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "sudo systemctl restart PiratePlunder"

# 3. Re-run deployment
cd /home/nathan/GitHub/infra-workflows && ./deploy-helper.sh pirateplunder
```

### If MIME Types Are Wrong
**Symptoms**: JavaScript files return `text/html` instead of `application/javascript`

**Cause**: Express route order issue - SPA catch-all route intercepting asset requests

**Fix**: Verify route order in server.ts:
1. API routes (`/api/*`, `/auth/*`, `/health`)
2. Static file middleware (`express.static`)  
3. SPA catch-all route (`app.get('*')`)

### If Assets Return HTML Content
**Symptoms**: JavaScript files are ~714 bytes and contain HTML instead of JS

**Cause**: Same as above - route order issue

**Immediate Fix**:
```bash
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "sudo systemctl restart PiratePlunder"
```

## Success Criteria

✅ **Deployment Successful If**:
- Backend version matches local version
- Assets serve with `Content-Type: application/javascript`
- UI shows correct version numbers in header
- Health endpoint returns OK
- Game loads without JavaScript errors

❌ **Deployment Failed If**:
- Version numbers don't match
- Assets return HTML content
- JavaScript module loading errors in browser
- Health endpoint unreachable

## Development Workflow Integration

### Before Every Commit
```bash
npm exec --workspace @pirate/game-pirate-plunder-backend tsc -- --noEmit
npm exec --workspace @pirate/game-pirate-plunder-frontend tsc -- --noEmit
git add -A && git commit -m "..."
```

### After Every Deployment
```bash
# Quick verification (30 seconds)
curl -s http://vps-0b87e710.tail751d97.ts.net:3001/api/deploy-info | jq '.backendVersion'
curl -I http://vps-0b87e710.tail751d97.ts.net:3001/assets/index-*.js | head -5
```

## Lesson Learned

**Never assume deployment worked based on GitHub Actions status alone.** Always verify with actual server responses. The 5 minutes spent on verification can save hours of debugging phantom issues.
