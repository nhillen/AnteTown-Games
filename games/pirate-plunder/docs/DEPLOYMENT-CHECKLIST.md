# 🚀 DEPLOYMENT CHECKLIST

## ✅ PRE-DEPLOYMENT (MANDATORY)

### 1. Code Quality Checks
- [ ] `npm exec --workspace @pirate/game-pirate-plunder-backend tsc -- --noEmit` ✅ (no TypeScript errors)
- [ ] `npm exec --workspace @pirate/game-pirate-plunder-frontend tsc -- --noEmit` ✅ (no TypeScript errors)  
- [ ] `make build` ✅ (full build completes successfully)
- [ ] Test changes locally with `npm run dev`

### 2. Deployment
- [ ] **Recommended**: Manual deployment via Tailscale SSH:
  ```bash
  # Sync and build
  tar --exclude='.git' --exclude='node_modules' --exclude='games/pirate-plunder/frontend/node_modules' --exclude='games/pirate-plunder/backend/node_modules' --exclude='games/pirate-plunder/frontend/dist' --exclude='games/pirate-plunder/backend/dist' -czf - . | tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/PiratePlunder && tar -xzf -"
  tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/PiratePlunder && sudo systemctl stop PiratePlunder && make build && sudo systemctl start PiratePlunder"
  ```
- [ ] **Alternative**: Deploy via: `cd ../infra-workflows && ./deploy-helper.sh pirateplunder` (⚠️ has caching issues)
- [ ] Wait for service to restart successfully

## ✅ POST-DEPLOYMENT VERIFICATION (MANDATORY)

### 3. Deployment Success Verification
- [ ] **Build Version Check**: `curl -s http://vps-0b87e710.tail751d97.ts.net:3001/api/deploy-info | jq '.buildVersion'`
  - ❌ FAIL if not today's date (format: YYYY.MM.DD.X)
  - ✅ PASS if shows today's date

- [ ] **Service Status**: `curl -s http://vps-0b87e710.tail751d97.ts.net:3001/api/deploy-info | jq '.timestamp'`  
  - ❌ FAIL if timestamp > 10 minutes old
  - ✅ PASS if timestamp is recent

### 4. Frontend Asset Verification
- [ ] **Asset Freshness**: `curl -I http://vps-0b87e710.tail751d97.ts.net:3001/assets/index-*.js | grep Last-Modified`
  - ❌ FAIL if Last-Modified > 10 minutes ago
  - ✅ PASS if Last-Modified is recent

- [ ] **MIME Type**: `curl -I http://vps-0b87e710.tail751d97.ts.net:3001/assets/index-*.js | grep Content-Type`
  - ❌ FAIL if not "application/javascript"
  - ✅ PASS if shows "application/javascript"

### 5. Source Code Verification
- [ ] **Your Changes Deployed**: `tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "grep -n 'RECENT_CHANGE_STRING' /opt/PiratePlunder/games/pirate-plunder/frontend/src/components/GameApp.tsx"`
  - Replace `RECENT_CHANGE_STRING` with something unique from your recent commits
  - ❌ FAIL if your recent changes not found
  - ✅ PASS if your changes found in deployed source

### 6. Functional Testing (CRITICAL)
- [ ] **Production Testing**: Open http://vps-0b87e710.tail751d97.ts.net:3001 in browser
  - Test your specific changes on the live production server
  - ❌ NEVER assume local testing equals production
  - ✅ PASS if your changes work on production server

## 🚨 IF ANY CHECK FAILS

### Emergency Deployment Recovery
```bash
# 1. Manual source sync
tar --exclude='.git' --exclude='node_modules' --exclude='games/pirate-plunder/frontend/node_modules' --exclude='games/pirate-plunder/backend/node_modules' --exclude='games/pirate-plunder/frontend/dist' --exclude='games/pirate-plunder/backend/dist' -czf - . | tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/PiratePlunder && tar -xzf -"

# 2. Build on server
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/PiratePlunder && sudo systemctl stop PiratePlunder && make build && sudo systemctl start PiratePlunder"

# 3. Re-run verification steps above
```

## 🚩 RED FLAGS (Deployment Broken)

If you see ANY of these, the deployment is NOT working:

🚩 Old commit hash for multiple deployments  
🚩 "Preserving pre-built frontend assets" in deployment logs  
🚩 TypeScript errors during build but deployment reports "success"  
🚩 Frontend asset timestamps hours/days old  
🚩 Build version not today's date  
🚩 Your code changes work locally but not in production  
🚩 Service restart timestamp doesn't match deployment time

## 📝 Deployment Log Template

```
Date: ________
Deployment Method: [ ] GitHub Actions [ ] Direct Server
Pre-checks: [ ] TypeScript [ ] Build [ ] Local Test
Post-checks: [ ] Build Version [ ] Assets [ ] Source [ ] Functional
Notes: ________________________
Result: [ ] ✅ SUCCESS [ ] ❌ FAILED
```

---
**Remember**: A deployment is NOT successful until ALL verification steps pass AND your changes work on the production server!
