# Troubleshooting Guide

## Common Issues and Solutions

### Authentication Issues

#### 500 Internal Server Error on OAuth Callback
**Symptoms**: 
- OAuth redirects to Google successfully
- Callback returns 500 error
- "TokenError: Malformed auth code" in logs

**Root Causes**:
1. Session store not working (most common)
2. Database schema mismatch
3. Missing environment variables

**Solutions**:
```bash
# 1. Check session store errors
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net
cd /opt/PiratePlunder && npm run start:prod
# Look for session-related errors

# 2. Verify sessions table schema
PGPASSWORD='svcpassword123' psql -h localhost -U svc -d PiratePlunder -c '\d sessions'
# Should have: sid, sess, expire columns (NOT data, expires)

# 3. Check environment variables
cat /opt/PiratePlunder/.env
# Ensure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET are set
```

#### No Session Cookies Being Set
**Symptoms**:
- No Set-Cookie headers in responses
- OAuth flow fails with session errors
- Login doesn't persist

**Solutions**:
- Ensure `saveUninitialized: true` in session config
- Check cookie settings (secure: false for HTTP)
- Verify session store is initialized properly

### Deployment Issues

#### Service Won't Start
**Symptoms**:
- `systemctl status PiratePlunder` shows failed
- Exit code 1 repeatedly

**Common Causes**:
1. Port already in use
2. Missing environment variables
3. Database connection issues
4. Missing Prisma client

**Solutions**:
```bash
# Kill processes on port
sudo lsof -ti:3001 | xargs -r sudo kill -9

# Run manually to see actual error
cd /opt/PiratePlunder/games/pirate-plunder
export $(grep -v '^#' .env | xargs)
node games/pirate-plunder/backend/dist/server.js

# Regenerate Prisma client if needed
(cd games/pirate-plunder/backend && npx prisma generate)
cp -r src/generated dist/
```

#### 🚨 CRITICAL: Deployment Not Updating Code (Silent Failures)
**Symptoms**:
- Changes don't appear after deployment
- Old code still running despite "successful" GitHub Actions
- Version numbers don't match between local and production

**This is a CRITICAL issue that wasted hours of debugging time in August 2025!**

**Root Cause**: Deployment pipeline can report "success" but not actually deploy new code to server.

**MANDATORY Verification Steps**:
```bash
# 1. Check if deployment actually worked
curl -s http://vps-0b87e710.tail751d97.ts.net:3001/api/deploy-info | jq '.backendVersion'

# 2. Compare with local version
grep version games/pirate-plunder/backend/package.json

# 3. Check asset MIME types (common failure point)
curl -I http://vps-0b87e710.tail751d97.ts.net:3001/assets/index-*.js | grep Content-Type
# Should return: Content-Type: application/javascript

# 4. Check file timestamps on server
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "stat /opt/PiratePlunder/games/pirate-plunder/backend/dist/server.js"
```

**If deployment failed**:
1. **Manual restart**: `sudo systemctl restart PiratePlunder`
2. **Re-run deployment**: `cd ../infra-workflows && ./deploy-helper.sh pirateplunder`
3. **Check GitHub Actions logs**: `gh run view --log`

#### JavaScript Module Loading Errors
**Symptoms**:
```
Failed to load module script: Expected a JavaScript-or-Wasm module script 
but the server responded with a MIME type of "text/html"
```

**Root Causes**:
1. **Wrong Express Route Order**: SPA catch-all route before static middleware
2. **Missing MIME Types**: Server not setting `application/javascript` for .js files
3. **Asset Path Issues**: JavaScript files returning HTML instead of JS code

**Solutions**:
```bash
# Check if assets are served correctly
curl -I http://vps-0b87e710.tail751d97.ts.net:3001/assets/index-*.js
# Should show: Content-Type: application/javascript

# If showing text/html, route order is wrong in server.ts
# Correct order: API routes → Static middleware → SPA catch-all
```

#### Header Bankroll Not Updating
**Symptoms**:
- Player sits down at table with buy-in amount
- Header still shows old bankroll amount
- Console shows correct values but UI doesn't update

**Root Cause**: React state not updating when lobby state changes

**Solution**: Enhanced in August 2025 - lobby state handler now always updates player state:
```typescript
// Always update to ensure latest state
setMe(prevMe => ({
  ...prevMe,
  ...updatedMe
}))
```

### Database Issues

#### PostgreSQL Connection Errors
**Symptoms**:
- "password authentication failed"
- "relation does not exist"

**Solutions**:
```bash
# Reset database password
sudo -u postgres psql -c "ALTER USER svc PASSWORD 'svcpassword123';"

# Grant permissions
sudo -u postgres psql -d PiratePlunder -c "GRANT ALL PRIVILEGES ON SCHEMA public TO svc;"

# Create sessions table with correct schema
PGPASSWORD='svcpassword123' psql -h localhost -U svc -d PiratePlunder -c "
CREATE TABLE IF NOT EXISTS sessions (
  sid varchar NOT NULL COLLATE \"default\",
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_pkey ON sessions(sid);
CREATE INDEX IF NOT EXISTS sessions_expire_idx ON sessions(expire);"
```

## Development Best Practices

### 1. Always Test Locally First
```bash
# Run full test suite before deploying
npm run test:all

# Test authentication flow locally
npm run dev
# Navigate to http://localhost:5173
```

### 2. Use Manual Server Startup for Debugging
Instead of relying on systemd service, run manually to see errors:
```bash
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net
cd /opt/PiratePlunder
npm run start:prod  # Shows actual error messages
```

### 3. Check Logs at Multiple Levels
```bash
# System level
sudo journalctl -u PiratePlunder.service -f

# Application level (run manually)
npm run start:prod

# Database level
sudo -u postgres psql -c "SELECT * FROM sessions;"
```

### 4. Environment Variable Management
- Keep `.env.example` updated
- Document all required variables
- Use strong, unique secrets in production
- Never commit real credentials

### 5. Session Store Best Practices
- Use PostgreSQL for production (persistence)
- Use memory store only for local development
- Ensure sessions table has correct schema for `connect-pg-simple`
- Set appropriate cookie lifetimes

## Lessons Learned from This Troubleshooting Session

### What Went Wrong
1. **Schema Mismatch**: Prisma created sessions table with different column names than `connect-pg-simple` expected
2. **Deployment Confusion**: Deployed code wasn't matching local builds
3. **Silent Failures**: Session store errors weren't visible in systemd logs
4. **Environment Issues**: Complex password characters caused parsing issues

### Key Takeaways
1. **Run manually first**: Always test with `npm run start:prod` to see actual errors
2. **Check deployed files**: Verify timestamps and content of deployed code
3. **Session debugging**: Use curl with `-I` flag to check for Set-Cookie headers
4. **Database schema matters**: Different libraries expect different column names
5. **Simple passwords in dev**: Avoid special characters that need escaping

### Future Improvements
1. Add health check endpoint that validates session store
2. Implement better error logging for session issues
3. Create deployment verification script
4. Add session store tests to test suite
5. Document all third-party library requirements

### Reconnection Issues

#### Player Controls Not Restoring After Reconnection
**Symptoms**:
- Player refreshes page or reconnects
- They can see the game but have no betting/locking controls
- Console shows socket ID mismatches: `currentTurnPlayerId=ABC123, meId=XYZ789`

**Root Cause**: Socket IDs change on each connection, but game state uses socket IDs as player identifiers.

**Solutions**:
```bash
# Check for socket ID mismatches in logs
tail -f games/pirate-plunder/backend/logs/server.log | grep "currentTurnPlayerId\|meId"

# Verify durable player ID system is working
grep -n "getDurablePlayerId\|registerPlayerConnection" games/pirate-plunder/backend/src/server.ts

# Test name-based seat detection fallback
# Look for player name in game state even if socket ID doesn't match
```

**Fixed in Durable Player Identity System (v3.0)**:
- Game state now uses persistent player IDs instead of socket IDs
- Name-based fallback for seat detection during reconnection
- Automatic conversion between durable IDs and socket IDs for frontend compatibility

#### Disconnection Timeout Issues
**Symptoms**:
- Player disconnects during their turn and game gets stuck
- No automatic advancement after reasonable timeout
- Other players waiting indefinitely

**Solutions**:
```bash
# Check timeout configuration
cat games/pirate-plunder/backend/config/table-config.json | jq '.session'

# Monitor disconnection handling
tail -f games/pirate-plunder/backend/logs/server.log | grep -E "(disconnect|timeout|fold)"

# Manual timeout values (configurable)
# Action timeout: 30s to make a move when disconnected
# Fold timeout: 30s before auto-folding  
# Kick timeout: 3min before removing from game
```

**Fixed with Configurable Timeout System**:
- Progressive timeouts: action → fold → kick
- Phase timer coordination (pause when player disconnects during their turn)
- Configurable via `table-config.json`

#### Phase-Specific Reconnection Failures
**Symptoms**:
- Reconnection works fine during locking phases
- Fails during betting phases (no betting controls appear)
- Player can see game state but can't interact

**Root Cause**: Different control rendering logic between phases, socket ID dependency.

**Solutions**:
```bash
# Check phase-specific control logic
grep -A 10 -B 5 "betting.*controls\|phase.*bet" games/pirate-plunder/frontend/src/components/ImprovedGameTable.tsx

# Verify me.id vs mySeat.playerId consistency  
# Both should match after reconnection
```

**Fixed with Enhanced Seat Detection**:
- Added name-based fallback when socket IDs don't match
- Consistent player identity across all game phases
- Fixed control rendering to use durable player IDs

### Cache-Related Issues

#### Changes Not Appearing After Deployment
**Symptoms**:
- Code deployed successfully according to logs
- Changes don't appear in browser
- Version numbers in UI don't update
- Hard refresh (Ctrl+Shift+R) required to see changes

**Root Cause**: Aggressive browser/server caching preventing fresh assets from loading.

**Solutions**:
```bash
# Check if assets have cache headers
curl -I http://vps-0b87e710.tail751d97.ts.net:3001/assets/index-*.js | grep -E "(Cache-Control|Last-Modified)"

# Should show no-cache headers in development:
# Cache-Control: no-cache, no-store, must-revalidate
# Pragma: no-cache
# Expires: 0

# Verify asset timestamps are recent
curl -I http://vps-0b87e710.tail751d97.ts.net:3001/assets/index-*.js | grep Last-Modified
```

**Fixed with Complete Cache Disabling**:
- All static assets served with no-cache headers during development
- Added `/api/deploy-info` endpoint for version verification
- Build process includes cache-busting asset names

## Quick Diagnostic Commands

```bash
# Is the service running?
systemctl is-active PiratePlunder

# What's on port 3001?
sudo lsof -i:3001

# Are sessions working?
curl -c /tmp/test.txt -I http://vps-0b87e710.tail751d97.ts.net:3001/auth/google | grep Cookie

# Check database connectivity
PGPASSWORD='svcpassword123' psql -h localhost -U svc -d PiratePlunder -c 'SELECT COUNT(*) FROM sessions;'

# View recent errors
sudo journalctl -u PiratePlunder.service --since "10 minutes ago" | grep -i error

# Manual server start with full output
cd /opt/PiratePlunder && export $(grep -v '^#' .env | xargs) && node games/pirate-plunder/backend/dist/server.js
```
