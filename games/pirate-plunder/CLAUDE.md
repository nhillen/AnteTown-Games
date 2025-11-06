# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🎮 What is This Repository?

**PiratePlunder is a game package designed for the AnteTown gaming platform.**

This repository contains:
- **Frontend**: React components exported as a library (`@pirate/game-pirate-plunder`)
- **Backend**: Game logic and Socket.IO event handlers exported as initialization functions
- **Standalone dev server**: For local development and testing only (not used in production)

### Platform Integration

**This game DEPENDS on the AnteTown platform backend** for:
- **Authentication**: Google OAuth and session management
- **User Management**: User accounts, bankrolls, and cosmetics
- **Database**: PostgreSQL database with Prisma ORM
- **Socket.IO Hosting**: Platform hosts Socket.IO server and initializes game
- **Static Assets**: Platform serves game frontend assets

**Production deployment** is handled by the AnteTown platform, not this repository directly.

### Package Structure

```
@pirate/game-pirate-plunder/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Exports: initializePiratePlunder(), GAME_METADATA
│   │   ├── server.ts             # Standalone dev server (dev only)
│   │   └── game-logic/...        # Game implementation
│   └── dist/                     # Compiled output
│
├── frontend/
│   ├── src/
│   │   ├── index.ts              # Exports: PiratePlunderClient, BackOffice
│   │   └── components/...        # React components
│   └── dist/                     # Library build output
│
└── package.json                  # Package metadata and exports
```

### How It Integrates with AnteTown

1. **AnteTown platform** lists this package in its `package.json` dependencies
2. **Platform backend** imports and calls `initializePiratePlunder(io)` at startup
3. **Platform frontend** imports `PiratePlunderClient` component and renders it
4. **Game initialization** happens in the platform's Socket.IO namespace
5. **Deployment** happens by updating the platform, not deploying this game directly

---

## Critical Development Commands

### Quick Start (Standalone Dev Server)
```bash
npm install                  # Install dependencies
npm run dev:backend          # Start backend dev server (port 3001)
npm run dev:frontend         # Start frontend dev server (port 5173)

# OR start both together:
npm run dev                  # Both servers (requires concurrently)
```

**Note**: The standalone dev server is for testing only. Production uses AnteTown platform.

### Testing Commands (Run in this order)
```bash
# 1. TypeScript compilation check (MANDATORY before any commit)
(cd backend && npx tsc --noEmit)
(cd frontend && npx tsc --noEmit)

# 2. Unit tests
(cd backend && npm run test)     # Backend unit tests (Jest)
(cd frontend && npm run test)    # Frontend component tests (Vitest)

# Single test file (backend)
(cd backend && npx jest path/to/test.test.ts)

# Single test file (frontend)
(cd frontend && npx vitest run path/to/test.test.tsx)

# Watch mode for development
(cd backend && npm run test:watch)  # Jest watch mode
(cd frontend && npm test)           # Vitest watch mode

# 3. Integration tests
(cd backend && npm run test:integration) # Full game flow testing (requires backend running)

# 4. Debug tools
open debug-client.html  # Real-time game state monitoring dashboard
```

### Build & Validation
```bash
# Frontend (Library Mode)
(cd frontend && npm run build)  # Builds library with TypeScript declarations
(cd frontend && npm run lint)   # ESLint validation

# Backend (Package Mode)
(cd backend && npm run build)   # Compile TypeScript to dist/

# Full package build test
npm run build:backend && npm run build:frontend
```

### Publishing Package (if using Verdaccio or npm)
```bash
# Bump version
npm version patch  # or minor, or major

# Publish to registry
npm publish  # If configured for private registry

# Or use file: dependency in AnteTown platform
# platform/backend/package.json:
#   "@pirate/game-pirate-plunder": "file:../../PiratePlunder-repo"
```

---

## Architecture & Key Patterns

### Package Exports

**Backend exports** (`backend/src/index.ts`):
```typescript
export function initializePiratePlunder(io: SocketIOServer, options?: {
  namespace?: string
  enableDebugRoutes?: boolean
}): GameInstance

export const GAME_METADATA: GameMetadata
export type PiratePlunderPlayer = { ... }
export type PiratePlunderGameState = { ... }
```

**Frontend exports** (`frontend/src/index.ts`):
```typescript
export const PiratePlunderClient: FC         // Main game component
export const BackOffice: FC                   // Admin/config tools
export const GAME_CLIENT_INFO: GameClientInfo
```

### Real-time Game State Management
- **Server**: `backend/src/server.ts` manages all game state in-memory
- **Client-Server Protocol**: Socket.io events for state synchronization
- **State Machine**: Strict phase transitions (Lobby → PreHand → Ante → Roll1-3 → Lock1-3 → Bet1-3 → Roll4 → Showdown → Payout → HandEnd)
- **Player Types**: Human (Socket.io) and AI (with personality profiles)
- **Durable Player Identity**: Persistent player IDs across reconnections (googleId or guest_Name)
- **Disconnection Timeouts**: Configurable grace periods (30s action, 30s fold, 3min kick)

### TypeScript Configuration
**CRITICAL**: Both directories use strict TypeScript with `exactOptionalPropertyTypes: true`
- Always check for null/undefined before accessing optional properties
- Never assign `undefined` to non-optional properties
- Run `npx tsc --noEmit` in both directories before committing

### AI System Architecture
- **Profiles**: Located in `backend/src/ai-profiles.json` (4 distinct personalities)
- **Decision Pipeline**: `evaluateHandStrength()` → `makeAIBettingDecision()` → `makeAILockingDecision()`
- **Behavioral Variance**: ±10% randomization on profile parameters per game
- **Hand Evaluation**: 0-6 scale based on achievable roles and game phase

### Socket.io Event Flow
**Lobby Events**:
- `join` → `lobby_state` (broadcast)
- `add_ai` / `fill_ai_to_min` → `lobby_state`
- `start_hand` → `game_state`

**Game Events**:
- `lock_select` → `game_state` (dice locking)
- `player_action` → `game_state` (betting actions)
- `next_phase` → `game_state` (phase transitions)

### Testing Architecture
1. **Unit Tests**: `backend/tests/game-logic.test.ts`, `frontend/src/test/App.test.tsx`
2. **Integration Tests**: `backend/scripts/test-game-flow.js` (automated Socket.io client)
3. **Debug Middleware**: `backend/src/debug-middleware.ts` + `debug-client.html` dashboard

---

## Critical Implementation Details

### Game Rules Implementation
- **Role Assignment**: Most dice wins (Ship=6s, Captain=5s, Crew=4s), ties create vacancies
- **Cargo System**: Non-role players use 1s/2s/3s via plurality voting
- **Public/Private Dice**: Lock3 allows locking more dice than shown to opponents
- **Roll4 Phase**: Final roll after Lock3, before Bet3 (Yahtzee-style viewing)

### Port Configuration (Standalone Dev Server Only)
- Backend: Port 3001 (auto-selects next available if busy)
- Frontend: Port 5173 (Vite dev server)
- Environment: `VITE_BACKEND_URL` in `frontend/.env.local`

**Note**: In production, AnteTown platform hosts on port 3001.

### Key File Locations
- Game initialization: `backend/src/index.ts` (exported for platform)
- Game phase logic: `backend/src/server.ts:262-327`
- Socket connection: `frontend/src/components/GameApp.tsx`
- AI profiles: `backend/src/ai-profiles.json`
- Game rules: `docs/gdd.md`
- Architecture: `docs/architecture.md`

### Progressive Jackpot System
- **Cargo Chest**: Progressive pot managed in `backend/src/cargo-chest-config.ts`
- **Drip Rate**: 5% of wagers flow into cargo chest
- **Payout Conditions**: Triggered by specific cargo combinations

### Development Workflow
- Always run `(cd backend && npx tsc --noEmit)` and `(cd frontend && npx tsc --noEmit)` before committing code
- Use standalone dev server for testing game logic changes
- Test integration with AnteTown platform before deploying
- Check `debug-client.html` for real-time game state debugging
- Git workflow: commit locally, then push to remote

---

## Deployment

**⚠️ IMPORTANT: This game package is NOT deployed standalone in production.**

### Production Deployment Process

PiratePlunder is deployed as part of the **AnteTown platform**. See the [AnteTown platform repository](https://github.com/drybrushgames/PiratePlunder-new) for deployment instructions.

**Quick overview:**
1. **Update package**: Commit and push changes to this repository
2. **Update platform dependency**: AnteTown platform pulls latest changes (via `file:` path or package registry)
3. **Deploy platform**: Deploy AnteTown platform which includes this game
4. **Verify**: Test game at `https://antetown.com/#game/pirate-plunder`

### AnteTown Platform Deployment

**See: [PiratePlunder-new/DEPLOY.md](https://github.com/drybrushgames/PiratePlunder-new/blob/main/DEPLOY.md)**

```bash
# Deploy platform with integrated games (run from PiratePlunder-new repo)
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net \
  "cd /opt/AnteTown && git pull origin main && make build && sudo systemctl restart AnteTown"
```

### Production URLs
- **Primary**: https://antetown.com/#game/pirate-plunder
- **Internal (Tailscale)**: http://vps-0b87e710.tail751d97.ts.net:3001/#game/pirate-plunder

### Post-Deployment Verification
```bash
# 1. Verify platform deployed successfully
curl -s https://antetown.com/api/deploy-info | jq '{commitHash, buildVersion, timestamp}'

# 2. Test game loads
# Open https://antetown.com/#game/pirate-plunder in browser

# 3. Check platform logs for game initialization
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "sudo journalctl -u AnteTown -n 50 | grep -i pirate"
```

### For Local Testing with Platform

To test this game integrated with the AnteTown platform locally:

```bash
# 1. In this repo (PiratePlunder-repo): Make your changes and build
(cd backend && npm run build)
(cd frontend && npm run build)

# 2. In AnteTown platform repo (PiratePlunder-new):
cd ../PiratePlunder-new
npm install  # Will link file: dependency
npm run dev  # Start platform with your game changes

# 3. Open http://localhost:3001/#game/pirate-plunder
```

---

## Debugging Guide

### Pre-Debug Checklist
- [ ] Can I reproduce the issue myself?
- [ ] Is this display, data, or synchronization?
- [ ] What are the units/types involved?
- [ ] Are there multiple state sources?
- [ ] Have I checked browser DevTools?

### Common PiratePlunder Debugging Patterns

**"Bankroll not updating"**
1. Check which bankroll (platform header uses `user.bankroll`, game uses `me.bankroll`)
2. Verify auth context vs game state sync (managed by platform)
3. Check unit conversions (dollars ↔ pennies)

**"Button state wrong"**
1. Find state that controls button
2. Check state updates and re-renders
3. Look for multiple state sources

**"Socket connection issues"**
1. Verify platform backend is running and initialized game
2. Check Socket.IO connection in browser DevTools
3. Look for CORS issues (platform must allow frontend origin)

**"Authentication issues"**
1. Remember: Auth is handled by AnteTown platform backend
2. Check that platform's `/auth/google` flow is working
3. Verify session cookies are being set correctly

### Systematic Approach
1. **Reproduce** → 2. **Locate** → 3. **Trace** → 4. **Log** → 5. **Test** → 6. **Fix** → 7. **Verify**

---

## Platform Backend Dependencies

This game requires these services from the AnteTown platform backend:

### Authentication & User Management
- **Google OAuth**: Platform provides `/auth/google` and `/auth/google/callback` endpoints
- **Session Management**: Express sessions with PostgreSQL store
- **User API**: `/api/user` endpoint provides authenticated user info
- **Bankroll Management**: Platform manages user bankrolls in database

### Database Access
- **PostgreSQL**: Platform provides database connection
- **Prisma ORM**: Platform manages schema and migrations
- **Tables Used**:
  - `users` - User accounts, bankrolls, unlocked cosmetics
  - `sessions` - Session storage
  - `dice_collections` - Cosmetics (to be migrated to central system)

### Socket.IO Hosting
- **Server Creation**: Platform creates `http.Server` and `SocketIOServer`
- **Game Initialization**: Platform calls `initializePiratePlunder(io, options)`
- **Namespace Management**: Game uses platform's Socket.IO namespace (default: `/`)
- **CORS Configuration**: Platform configures CORS for frontend

### API Routes
- **Health Check**: `/api/health` - Server status
- **Deploy Info**: `/api/deploy-info` - Version information
- **User Info**: `/api/user` - Current user data
- **Dice Collections**: `/api/dice-collections` - Cosmetics (game-specific, to be centralized)

### Environment Configuration
The platform backend provides:
- `DATABASE_URL` - PostgreSQL connection string
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - OAuth credentials
- `SESSION_SECRET` - Session encryption key
- `FRONTEND_URL` - CORS allowed origin
- `NODE_ENV` - Environment (production/development)
- `PORT` - Server port (default: 3001)

---

## Historical Notes

### Migration from Monorepo to Package (Nov 2025)

This game was originally part of a monorepo at `/opt/PiratePlunder` that combined:
- Platform code (auth, user management, database)
- PiratePlunder game code
- Multiple other games (WarFaire, HouseRules, CK Flipz)

**The separation created**:
1. **AnteTown Platform** (`PiratePlunder-new` repo) - Platform backend/frontend
2. **Game Packages** (separate repos) - Individual games as npm packages

**Key changes from old architecture**:
- Path changes: `games/pirate-plunder/` → root `backend/` and `frontend/`
- No more npm workspaces
- Backend exports initialization functions instead of running standalone
- Frontend exports components as library instead of standalone app
- Deployment moved to platform level

### Old Deployment Documentation (Historical Reference Only)

The extensive deployment documentation in older versions of this file referred to deploying PiratePlunder as a standalone application. That is NO LONGER the deployment model.

**For current deployment**: See the [AnteTown platform DEPLOY.md](https://github.com/drybrushgames/PiratePlunder-new/blob/main/DEPLOY.md)
