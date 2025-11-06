# Deployment Lessons Learned

## Issues Encountered & Solutions

### 1. Express 5 Compatibility Issue
**Problem**: `TypeError: Missing parameter name at 1: https://git.new/pathToRegexpError`
**Root Cause**: Express 5.x has breaking changes with path-to-regexp that break wildcard routes
**Solution**: Downgrade to Express 4.21.1
```bash
# In package.json
"express": "^4.21.1"
"@types/express": "^4.17.21"
```

### 2. Reusable Workflow Access
**Problem**: GitHub Actions failing with "workflow was not found"
**Root Cause**: infra-workflows repository is private, preventing workflow access
**Solution**: Use helper scripts that temporarily make repo public
```bash
# Use these instead of direct gh workflow run:
cd ../infra-workflows
./provision-helper.sh pirateplunder node tcp
./deploy-helper.sh pirateplunder
```

### 3. Service Configuration Mismatch
**Problem**: SystemD service failing because of wrong paths/commands
**Root Cause**: Deployment scripts use different paths than our custom service files
**Solution**: Use deployment-generated service configuration, not custom ones

### 4. Dependency Caching
**Problem**: Deployment uses cached node_modules with wrong Express version
**Root Cause**: CI/CD doesn't clear dependency cache when package.json changes
**Solution**: Manually clear dependencies on server after deployment
```bash
cd /opt/PiratePlunder/games/pirate-plunder/backend
rm -rf node_modules package-lock.json
npm install
```

### 5. Missing AI Profiles
**Problem**: Server starts but AI profiles fail to load
**Root Cause**: TypeScript compilation doesn't copy JSON files to dist/
**Solution**: Manually copy required files
```bash
cp /opt/PiratePlunder/games/pirate-plunder/backend/src/ai-profiles.json /opt/PiratePlunder/games/pirate-plunder/backend/dist/
```

### 6. Frontend Not Built During Deployment
**Problem**: Main app returns "Not Found", only API endpoints work
**Root Cause**: Deployment workflow only builds backend, ignores frontend completely
**Solution**: Created comprehensive Makefile that builds both frontend and backend
- Frontend builds first and gets copied to `games/pirate-plunder/backend/dist/public/`
- Even when deployment workflow runs backend-only install afterward, frontend files remain

### 7. Production TypeScript Build Fails
**Problem**: `tsc` fails with missing `@types/express` in production
**Root Cause**: Types are in devDependencies, get excluded with `--omit=dev`
**Solution**: Move essential types to regular dependencies
```json
{
  "dependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^24.2.1", 
    "typescript": "^5.9.2"
  }
}
```

## Deployment Process (Working)

### First-Time Setup
1. **Run provision once**: `cd ../infra-workflows && ./provision-helper.sh pirateplunder node tcp`
2. **Deploy code**: `./deploy-helper.sh pirateplunder`
3. **Verify deployment**: Check that frontend and backend are both working

### Regular Updates
1. **Deploy**: `cd ../infra-workflows && ./deploy-helper.sh pirateplunder`
2. **No manual fixes needed** - Makefile handles frontend + backend build automatically
3. **Monitor**: Check service status and logs

### What Happens During Deployment
1. **Makefile runs**: Builds frontend → backend → copies files to correct locations
2. **Workflow tries backend-only install**: Doesn't affect already-built frontend files
3. **Service restarts**: Serves both frontend (at `/`) and backend APIs

## Key Commands

### Monitoring
```bash
# Service status
sudo systemctl status PiratePlunder

# Real-time logs
sudo journalctl -u PiratePlunder -f

# Health check
curl http://localhost:3001/health

# Debug info
curl http://localhost:3001/api/debug
```

### Troubleshooting
```bash
# Manual server test
cd /opt/PiratePlunder/games/pirate-plunder/backend && NODE_ENV=production PORT=3001 node dist/server.js

# Clean dependencies
cd /opt/PiratePlunder/games/pirate-plunder/backend
rm -rf node_modules package-lock.json
npm install

# Fix AI profiles
cp /opt/PiratePlunder/games/pirate-plunder/backend/src/ai-profiles.json /opt/PiratePlunder/games/pirate-plunder/backend/dist/

# Restart service
sudo systemctl restart PiratePlunder
```

### Tailscale Funnel
```bash
# Enable public access
sudo tailscale funnel --bg 3001

# Check status
sudo tailscale funnel status

# Reset if needed
sudo tailscale funnel reset
```

## Directory Structure (Actual)
```
/opt/PiratePlunder/
├── games/
│   └── pirate-plunder/
│       ├── backend/
│       │   ├── dist/           # Compiled TypeScript
│       │   │   ├── server.js   # Main server file
│       │   │   └── ai-profiles.json (needs manual copy)
│       │   ├── node_modules/   # Dependencies
│       │   └── package.json    # Dependencies config
│       └── frontend/           # Source files (not served)
├── logs/              # Service logs
└── .env               # Environment variables
```

## Access URLs (Working!)
- **Game**: http://vps-0b87e710.tail751d97.ts.net:3001 ✅
- **Public**: http://tail751d97.ts.net:3001 ✅ (via Tailscale funnel)
- **Health**: http://vps-0b87e710.tail751d97.ts.net:3001/health ✅
- **Debug**: http://vps-0b87e710.tail751d97.ts.net:3001/api/debug ✅
- **Debug Dashboard**: http://vps-0b87e710.tail751d97.ts.net:3001/debug-client.html ✅

## 🚨 CRITICAL DEPLOYMENT FAILURE POSTMORTEM (August 2025)

### Silent Deployment Failure Issue
**Problem**: Between commits 685c827 and de3e7f8, we experienced a **critical deployment pipeline failure**:
- Code was committed locally but **NOT reaching production**
- GitHub Actions reported "success" but **old code remained on server**
- No way to verify if deployments actually worked
- Caused hours of debugging "broken fixes" that were never deployed

**Root Cause**: Unknown issue in reusable deployment workflow where builds succeeded but artifacts weren't properly deployed to server.

**Impact**: 
- Wasted development time debugging issues that didn't exist
- False confidence in deployment system
- No reliable way to verify deployment success

### MIME Type & Route Order Issues  
**Problem**: After deployment pipeline was fixed, JavaScript loading errors occurred:
```
Failed to load module script: Expected a JavaScript-or-Wasm module script 
but the server responded with a MIME type of "text/html"
```

**Root Causes**:
1. **Wrong Route Order**: Catch-all SPA route (`app.get('*')`) was placed BEFORE static file middleware
2. **Missing MIME Types**: Express wasn't setting `Content-Type: application/javascript` for .js files
3. **Asset Interception**: JavaScript files returning HTML content instead of actual JS code

**Solutions Implemented**:
1. **Fixed Route Order**: API routes → Static file middleware → SPA catch-all
2. **Explicit MIME Types**: Added `setHeaders` in `express.static()` options
3. **Deployment Verification**: Added `/api/deploy-info` endpoint for version checking

### Prevention Systems Added

#### 1. Version Verification System
- **UI Display**: `v1.0.4 (Frontend) | v1.0.4 (Backend)` visible in game header
- **API Endpoint**: `GET /api/deploy-info` returns version, commit hash, uptime
- **Immediate Feedback**: Visual confirmation that deployment worked

#### 2. Deployment Verification Commands
```bash
# Check backend version
curl -s http://vps-0b87e710.tail751d97.ts.net:3001/api/deploy-info | jq '.backendVersion'

# Verify MIME types
curl -I http://vps-0b87e710.tail751d97.ts.net:3001/assets/index-*.js | grep Content-Type
# Should return: Content-Type: application/javascript

# Check if version matches local
grep version games/pirate-plunder/backend/package.json
```

#### 3. Enhanced Logging Infrastructure  
- **Structured Logging**: `logBankrollOperation()` for all critical game operations
- **Before/After States**: Detailed logging of bankroll transfers, sit/stand operations
- **Operation Tracking**: Timestamp, player ID, amounts for debugging

## Critical Notes (Updated)
1. **ALWAYS verify deployments** - Don't trust "success" status alone
2. **Always use helper scripts** for deployment (not direct gh workflow run)  
3. **Express 5 breaks the app** - stay on Express 4.x
4. **Route order matters** - API → Static → Catch-all (wrong order breaks assets)
5. **MIME types are critical** - Browsers enforce strict module script types
6. **Version tracking essential** - Visible version numbers prevent confusion
7. **Service name** - Use `PiratePlunder` (capital P), not `pirateplunder`

## Deployment Checklist (Mandatory)
```bash
# 1. Pre-deployment validation
npm exec --workspace @pirate/game-pirate-plunder-backend tsc -- --noEmit
cd frontend && npx tsc --noEmit

# 2. Deploy
cd ../infra-workflows && ./deploy-helper.sh pirateplunder

# 3. Post-deployment verification  
curl -s http://vps-0b87e710.tail751d97.ts.net:3001/api/deploy-info | jq '.backendVersion'
curl -I http://vps-0b87e710.tail751d97.ts.net:3001/assets/index-*.js | grep Content-Type

# 4. UI verification
# Check that UI shows correct version numbers in header
```
