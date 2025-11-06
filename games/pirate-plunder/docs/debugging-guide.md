# PiratePlunder Debugging Guide

This guide captures lessons learned from debugging sessions to help triage issues more efficiently.

## 🎯 Core Debugging Rules

### 1. **Currency System Confusion - Always Check Units First**
**Common Issue:** "Bankroll showing wrong values" when the real issue is unit confusion.

**Our System:**
- Database: Dollars (float)
- Backend: Pennies (integers)
- Frontend Display: Mixed (dollars in header, gold coins at table)

**Rule:** When dealing with currency/units:
- ✅ FIRST identify what unit each layer uses
- ✅ ALWAYS trace the exact data flow: Database → Backend → Socket → Frontend State → Display
- ✅ Check conversion points BEFORE assuming the value is wrong
- ✅ Look for `* 100` (dollars to pennies) and `/ 100` (pennies to dollars)

### 2. **State Synchronization - Identify ALL State Sources**
**Common Issue:** Updates not reflecting because multiple state sources exist.

**Our System:**
- Auth Context: `user.bankroll` (for header display)
- Game State: `me.bankroll` (for game logic)
- Table State: seat bankrolls (for seated amounts)

**Rule:** For state management issues:
- ✅ FIRST map ALL state sources (Context, Local State, Props, etc.)
- ✅ Identify which component uses which state
- ✅ Check if states are meant to sync and HOW they sync
- ✅ Never assume one state update will magically update another

### 3. **User Feedback - Validate Before Confirming**
**Anti-Pattern:** Saying "You're right" without actually investigating.

**Rule:** When user reports an issue:
- ✅ Thank them for the direction
- ✅ INVESTIGATE first using tools and logs
- ✅ Only confirm AFTER finding evidence
- ✅ Ask for clarification if the issue description is ambiguous
- ✅ Example: "Thanks for pointing that out, let me trace through the code to confirm..."

### 4. **Display vs Data Issues - Check the Render Point**
**Common Issue:** Fixing the data but not where it displays, or vice versa.

**Rule:** For display issues:
- ✅ Find the EXACT line that renders the value
- ✅ Trace backward from display to data source
- ✅ Don't assume fixing the data fixes the display
- ✅ Check for multiple display points of the same data
- ✅ Use browser DevTools to inspect actual DOM values

### 5. **Frontend Debugging - Use Browser DevTools**
**Anti-Pattern:** Making code changes without running and testing the app.

**Rule:** For frontend issues:
- ✅ ALWAYS run the app and test changes
- ✅ Use console.log at key points (with distinctive prefixes like `🏦 BANKROLL:`)
- ✅ Check Network tab for socket events
- ✅ Use React DevTools to inspect component state
- ✅ Don't just read code - SEE the actual behavior
- ✅ Test with real user interactions

### 6. **Socket Communication - Verify Both Ends**
**Common Issue:** Assuming backend broadcasts reach frontend correctly.

**Rule:** For socket issues:
- ✅ Log on SEND (backend): `console.log('📡 Broadcasting lobby_state:', data)`
- ✅ Log on RECEIVE (frontend): `console.log('📡 Received lobby_state:', data)`
- ✅ Verify the data structure matches expectations
- ✅ Check if the handler is properly registered
- ✅ Use browser DevTools Network tab to see WebSocket messages

### 7. **Default Values - Check Initialization**
**Common Issue:** Wrong defaults due to unit mismatches or undefined values.

**Rule:** For initialization issues:
- ✅ Check what happens when values are undefined
- ✅ Verify unit consistency in defaults
- ✅ Test edge cases (first load, no data, empty state)
- ✅ Look for fallback chains: `value || defaultValue`

### 8. **Configuration Updates - Check Constraints**
**Common Issue:** Config changes not working due to hidden constraints.

**Rule:** For configuration issues:
- ✅ Check ALL related constraints and validations
- ✅ Look for Math.min/Math.max that might override values
- ✅ Test the full flow, not just the immediate change
- ✅ Check frontend AND backend validation logic

## 🔍 Systematic Debugging Approach

Instead of jumping to code changes, follow this order:

1. **Reproduce** - Can we see the issue ourselves?
   - Start both servers: `npm run dev`
   - Open browser to test the actual behavior
   - Try to reproduce the exact user scenario

2. **Locate** - Find the EXACT display/error point
   - Use browser DevTools to inspect the problematic element
   - Find the component that renders it
   - Identify the data source for that component

3. **Trace** - Follow data flow backward
   - From display component → props → state → API/socket
   - Check each transformation and conversion
   - Look for where the data might be getting lost or corrupted

4. **Log** - Add logging at each step
   - Use distinctive prefixes: `🏦`, `📡`, `🎮`, `⚙️`
   - Log both before and after transformations
   - Include data types and values

5. **Test** - Verify our understanding
   - Test with different scenarios
   - Check edge cases and error conditions
   - Confirm the data flow matches our expectations

6. **Fix** - Make the minimal change
   - Address root cause, not symptoms
   - Prefer single-responsibility fixes
   - Update related documentation

7. **Verify** - Confirm it actually works
   - Test the fix with real user interactions
   - Check that it doesn't break other functionality
   - Verify the fix persists across page reloads/reconnections

## 🚫 Anti-Patterns We Fell Into

1. **Shotgun Debugging** - Making multiple changes hoping one works
2. **Assuming Propagation** - Thinking one fix would cascade to others
3. **Code-Only Analysis** - Not running the app to verify behavior
4. **Incomplete Fixes** - Fixing data but not display, or vice versa
5. **Over-Confirmation** - Saying things are fixed without testing
6. **State Assumption** - Assuming all state sources are in sync

## 📋 Pre-Flight Checklist for Issues

Before diving into code changes:
- [ ] Is this a display issue or a data issue?
- [ ] What is the current value vs expected value?
- [ ] Is this frontend, backend, or both?
- [ ] Are there multiple places showing this same data?
- [ ] Is this a synchronization issue between different states?
- [ ] What are the units/types involved?
- [ ] Can I reproduce this issue myself?
- [ ] Have I checked the browser DevTools?

## 🔧 Common PiratePlunder Debugging Commands

```bash
# Start both servers for testing
npm run dev

# Check TypeScript compilation
npm exec --workspace @pirate/game-pirate-plunder-backend tsc -- --noEmit
npm exec --workspace @pirate/game-pirate-plunder-frontend tsc -- --noEmit

# Kill stuck processes
npm run kill-ports

# Check for specific patterns in code
(cd games/pirate-plunder/frontend && grep -r "bankroll" src/)
(cd games/pirate-plunder/backend && grep -r "sit_down" src/)

# Monitor backend logs with filtering
npm run dev --workspace @pirate/game-pirate-plunder-backend | grep "BANKROLL\|SIT_DOWN"
```

## 🎯 PiratePlunder-Specific Patterns

### Currency Flow
```
User Database ($) → Backend (pennies) → Socket (pennies) → Frontend State (pennies) → Display ($)
```

### State Sources Map
```
Header Bankroll: user.bankroll (AuthProvider)
Game Bankroll: me.bankroll (GameApp state)  
Seat Bankroll: seat.bankroll (table state)
```

### Common Socket Events to Monitor
- `lobby_state` - Player bankroll updates
- `table_state` - Seat information
- `sit_down` / `stand_up` - Player actions
- `game_state` - Game progression

## 🔍 When Things Go Wrong

### "Bankroll not updating"
1. Check which bankroll (header vs game vs seat)
2. Check auth context vs game state synchronization
3. Verify socket events are being received
4. Check unit conversions at each step

### "Button not changing state"
1. Check what state controls the button
2. Verify state is actually updating
3. Check if component is re-rendering
4. Look for conditional rendering logic

### "Config changes not working"
1. Check backend validation constraints
2. Verify frontend sends the right data format
3. Check for competing default values
4. Look for Math.min/max overrides

This guide should be referenced whenever debugging takes longer than expected or when we find ourselves making assumptions without verification.

## 🔥 CRITICAL LESSON: Deployment Pipeline Failures (Aug 28, 2025)

### What Happened
Deployment was silently broken for days. GitHub Actions showed "success" but wasn't actually deploying new code to production. All code fixes appeared to work locally but failed in production.

### Root Cause
- Deployment script had `echo "Preserving pre-built frontend assets..."` instead of `make build`
- Frontend assets committed to git from Aug 27 were being used instead of building fresh
- TypeScript compilation errors were ignored (`make build || true`)
- No verification that deployed code matched source code changes

### Red Flags We Missed
🚩 `/api/deploy-info` showing old commit hash but we didn't investigate deeply  
🚩 Frontend asset files days old but we assumed they were being rebuilt  
🚩 TypeScript errors during build but deployment reported "success"  
🚩 Testing locally instead of on actual production server  
🚩 No verification that specific changes were actually deployed  

### Prevention Rules
1. **ALWAYS test changes on production server via Tailscale** - never assume local=production
2. **Verify specific code changes exist** - grep for recent changes in deployed source  
3. **Check asset timestamps** - frontend dist files should have recent build dates
4. **Build must not fail silently** - remove `|| true` from critical build steps
5. **Commit hash verification** - deployed version must match expected commit
6. **Functional smoke tests** - test key features after deployment

### Quick Deployment Health Check
```bash
# 1. Check service is running recent code
curl -s http://vps-0b87e710.tail751d97.ts.net:3001/api/deploy-info | jq '{commitHash, buildVersion, timestamp}'

# 2. Check frontend assets are fresh (< 10 min old)  
curl -I http://vps-0b87e710.tail751d97.ts.net:3001/assets/index-*.js | grep Last-Modified

# 3. Verify specific recent changes are deployed
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "grep -q 'RECENT_CHANGE_STRING' /opt/PiratePlunder/games/pirate-plunder/frontend/src/components/GameApp.tsx"

# 4. Test actual functionality on production
# (Open browser and test features - automation can't replace this)
```

This was a **deployment infrastructure issue**, not an application bug. The lesson: verify the deployment pipeline is actually working before spending time debugging application logic.

## 🔄 CRITICAL LESSON: Reconnection & Socket ID Management (Aug 2025)

### What Happened
Players couldn't properly reconnect to games because socket IDs changed on each connection, but game state used socket IDs as player identifiers. This created mismatches where `currentTurnPlayerId !== meId` after reconnection.

### Root Cause
Game state architecture used ephemeral socket IDs as player identity, making reconnection impossible:
```typescript
// BROKEN: Socket ID as identity
seat.playerId = socket.id  // Changes on every connection
currentTurnPlayerId = socket.id  // Different after reconnection
```

### Solution: Durable Player Identity System
Implemented separation between connection identity and game identity:
```typescript
// FIXED: Durable identity system
function getDurablePlayerId(googleId: string | null, name: string): string {
  return googleId || `guest_${name.replace(/\s+/g, '_')}`;
}

// Meta layer for connection mapping
socketToDurableId: Map<string, string>
durableIdToSocket: Map<string, string>

// Game state uses durable IDs
seat.playerId = durablePlayerId  // Persistent across connections
currentTurnPlayerId = durablePlayerId  // Same after reconnection
```

### Reconnection Flow Debugging
1. **Connection Registration**: `registerPlayerConnection()` maps socket → durable ID
2. **Seat Detection**: Name-based fallback when socket ID doesn't match
3. **State Synchronization**: Convert durable IDs back to socket IDs for frontend compatibility
4. **Turn Restoration**: Verify `currentTurnPlayerId` matches after reconnection

### Red Flags for Reconnection Issues
🚩 **Socket ID mismatches**: `currentTurnPlayerId=ABC123, meId=XYZ789`  
🚩 **Controls not restoring**: Betting/locking buttons missing after refresh  
🚩 **Name-based detection failing**: Can't find seat by player name  
🚩 **Phase-specific issues**: Works in locking but not betting phases  
🚩 **Turn stuck on disconnect**: Game doesn't advance when player disconnects during their turn  

### Disconnection Timeout System
Implemented graceful disconnection with configurable timeouts:
- **Action Timeout**: 30s to make a move when disconnected
- **Fold Timeout**: 30s before auto-folding
- **Kick Timeout**: 3min before removing from game
- **Phase Timer Coordination**: Pause timers when player disconnects during their turn

## 🚫 CRITICAL LESSON: Cache-Related Deployment Issues (Aug 2025)

### What Happened
Changes weren't appearing in browser despite successful deployment due to aggressive caching. Even with successful builds, frontend showed old cached versions of JavaScript modules.

### Root Cause
Express serving static files with default caching headers, causing browsers to use stale JavaScript for hours.

### Solution: Disable All Caching During Development
```typescript
// Complete cache disabling
res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
res.setHeader('Pragma', 'no-cache');
res.setHeader('Expires', '0');
```

### Red Flags for Cache Issues
🚩 **Code changes not visible**: Recent edits don't appear in browser  
🚩 **Old version numbers**: UI shows previous build version after deployment  
🚩 **Hard refresh required**: Ctrl+Shift+R needed to see changes  
🚩 **JavaScript module errors**: Old modules trying to load new APIs  
🚩 **Asset timestamp mismatch**: Frontend dist files are hours old  

### Cache Debugging Commands
```bash
# Check asset freshness
curl -I http://vps-0b87e710.tail751d97.ts.net:3001/assets/index-*.js | grep -E "(Last-Modified|Cache-Control)"

# Verify no caching headers
curl -I http://vps-0b87e710.tail751d97.ts.net:3001/ | grep Cache

# Force browser cache clear
# Ctrl+Shift+R or DevTools → Network → Disable cache
```

### Prevention Rules
1. **Disable caching during development** - Use no-cache headers for all assets
2. **Version endpoints for verification** - Add `/api/deploy-info` with build timestamps
3. **Check asset timestamps** - Frontend dist files should be recent after build
4. **Browser testing protocol** - Always test with cache disabled in DevTools
5. **Manual cache clear** - Hard refresh after every deployment
