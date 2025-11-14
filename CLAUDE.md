# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is This Repository?

**AnteTown-Games is a monorepo containing all casino games for the AnteTown platform.**

This repository consolidates:
- All game packages (backend + frontend)
- Shared game SDK framework
- Common UI components

## Structure

```
AnteTown-Games/
├── games/
│   ├── pirate-plunder/      # Dice game - Roll to be Captain or Crew (primary reference)
│   ├── ck-flipz/            # Simple coin/card flip betting (minimal reference implementation)
│   ├── war-faire/           # Strategic card game across three fairs
│   ├── houserules-poker/    # Texas Hold'em poker
│   └── last-breath/         # Additional game
├── packages/
│   └── game-sdk/            # Shared game framework (GameBase, GameRegistry, MultiTableLobby)
└── tools/                   # Build and development tools (TODO)
```

Each game follows this structure:
```
games/{game-name}/
├── backend/
│   ├── src/
│   │   ├── index.ts           # Exports: initializeGame(), GAME_METADATA
│   │   ├── {GameName}Table.ts # Game logic class (extends GameBase)
│   │   └── types/             # Type definitions
│   ├── tests/                 # Jest tests
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── index.ts           # Exports: GameClient component
│   │   └── components/        # React components
│   ├── package.json
│   └── tsconfig.json
└── package.json               # Root package for game (coordinates backend/frontend)
```

## Development Commands

### Monorepo Commands (from root)
```bash
# Install all dependencies
npm install

# Build all games
npm run build

# Build only games (not packages)
npm run build:games

# Build only shared packages
npm run build:packages

# Build specific game
npm run build --workspace games/pirate-plunder

# Clean all builds
npm run clean

# Run tests across all packages
npm run test
```

### Working with Individual Games
```bash
# Pirate Plunder development
cd games/pirate-plunder
npm run dev                    # Start both backend + frontend (uses concurrently)
npm run dev:backend           # Backend only (port 3001)
npm run dev:frontend          # Frontend only (port 5173)

# Build specific parts
npm run build:backend         # Compile backend TypeScript to dist/
npm run build:frontend        # Build frontend library

# Type checking (MANDATORY before commits)
(cd backend && npx tsc --noEmit)
(cd frontend && npx tsc --noEmit)

# Run tests
(cd backend && npm test)              # Jest tests
(cd backend && npm run test:watch)    # Jest watch mode
(cd frontend && npm test)             # Vitest tests
```

### Working with game-sdk
```bash
cd packages/game-sdk
npm run build                  # Compile TypeScript
npm run watch                 # Watch mode for development
```

## Architecture & Key Patterns

### Game Package Exports Pattern

Each game exports these main modules:

**Backend (`backend/src/index.ts`):**
```typescript
// GameInitializer for platform TableManager (NEW - required for all games)
export const gameInitializer: GameInitializer = {
  createInstance(config: any, io?: any): GameInstance
  destroyInstance?(instance: any): void
  validateConfig?(config: any): { valid: boolean; error?: string }
  getDefaultConfig?(): any
}

// Game metadata
export const GAME_METADATA: GameMetadata  // id, name, description, min/maxPlayers, etc.

// Legacy initialization (deprecated - Pirate Plunder only)
export function initializeGame(io: SocketIOServer, options?: {...}): GameInstance
```

**Frontend (`frontend/src/index.ts`):**
```typescript
export const GameClient: React.FC        // Main game component
export const GAME_CLIENT_INFO: GameClientInfo
```

### Game Initialization Flow (Platform TableManager)

Modern games use the **TableManager pattern**:

1. **Game exports GameInitializer**: `export const ckFlipzInitializer: GameInitializer = {...}`
2. **Platform registers initializer**: `tableManager.registerGame('ck-flipz', ckFlipzInitializer)`
3. **Platform creates tables dynamically**:
   ```typescript
   await tableManager.createTable({
     gameType: 'ck-flipz',
     displayName: 'Coin Flip PVP - 100 TC',
     config: { variant: 'coin-flip', ante: 100, mode: 'pvp' },
     context: { type: 'system' },  // or 'guild', 'tournament', 'player'
     lifecycle: 'permanent'  // or 'temporary'
   }, io);
   ```
4. **Frontend imports component**: `import { GameClient } from '@antetown/game-ck-flipz/client'`
5. **Platform renders component**: `<GameClient />`

**Benefits of TableManager:**
- Dynamic table creation (guild tables, tournament tables, player-created)
- Automatic cleanup of empty/AI-only tables
- Unified table discovery and stats
- Table context tracking (system, guild, tournament, etc.)
- Activity and player count tracking

### Multi-Table Architecture

Games use the **table pattern** from game-sdk:
- Each game can have multiple table instances (different stake levels, rule variations)
- `{GameName}Table` class (e.g., `PiratePlunderTable`) extends `GameBase` from game-sdk
- Table tracks: players, game state, config (min/max players, antes, timeouts)
- Socket connections map to specific table IDs

**Key Table Methods** (from GameBase):
- `handleJoin(socket, payload)` - Player joins table
- `handleSitDown(socket, payload)` - Player takes seat
- `handleStandUp(socket)` - Player leaves seat
- `handleDisconnect(socket)` - Connection lost
- `broadcastState()` - Send state to all players

### TypeScript Configuration

**CRITICAL**: All packages use **strict TypeScript** with these important flags:
- `strict: true` - All strict checks enabled
- `exactOptionalPropertyTypes: true` - Never assign `undefined` to optional properties
- `noUncheckedIndexedAccess: true` - Array/object access returns `T | undefined`

**This means:**
- Always check for null/undefined before accessing optional properties
- Never assign `undefined` to properties marked optional with `?`
- Array indexing requires null checks: `array[0]` returns `T | undefined`

**Example:**
```typescript
// WRONG
player.cosmetics = undefined  // Error with exactOptionalPropertyTypes

// RIGHT
if (seat) {  // seat could be undefined from array access
  player.name = seat.name
}
```

### Socket.IO Event Patterns

**Common events across games:**
- `join` - Connect to game, optionally specify tableId
- `sit_down` - Take a seat at table
- `stand_up` - Leave seat
- `game_action` - Generic action (bet, fold, etc.)
- `game_state` - Server broadcasts current state
- `error` - Error message to client

**State Synchronization:**
- Server is source of truth
- All state changes broadcast via `game_state` event
- Clients render based on received state
- Optimistic updates discouraged (can cause desync)

### Testing Strategy

**Backend:**
- Jest for unit tests
- Test game logic in isolation
- Integration tests with Socket.IO client
- Location: `backend/tests/`

**Frontend:**
- Vitest for component tests
- Testing Library for React components
- Location: `frontend/src/test/`

**Integration:**
- Full game flow tests with automated Socket.IO clients
- Example: `backend/scripts/test-game-flow.js` in Pirate Plunder

## Adding a New Game

1. **Create game structure:**
   ```bash
   mkdir -p games/your-game/{backend/src,frontend/src}
   ```

2. **Copy package.json templates** from CK Flipz (simplest reference)

3. **Implement backend:**
   - Create `YourGame` class extending `GameBase` from game-sdk
   - Create `initializer.ts` implementing `GameInitializer` interface:
     ```typescript
     import type { GameInitializer } from '@pirate/game-sdk';

     export const yourGameInitializer: GameInitializer = {
       createInstance(config: any, io?: any): any {
         return new YourGame(config);
       },
       validateConfig(config: any): { valid: boolean; error?: string } {
         // Validate required fields
         if (!config.ante) return { valid: false, error: 'Missing ante' };
         return { valid: true };
       },
       getDefaultConfig(): any {
         return { ante: 100, maxSeats: 6, mode: 'pvp' };
       }
     };
     ```
   - Export `yourGameInitializer` and `GAME_METADATA` from `index.ts`
   - Define game state types

4. **Implement frontend:**
   - Create React component for game UI
   - Export `GameClient` from `index.ts`
   - Handle Socket.IO events

5. **Register with platform** (in AnteTown-Platform):
   ```typescript
   const { yourGameInitializer } = require('@pirate/game-your-game');
   tableManager.registerGame('your-game', yourGameInitializer);
   ```

6. **Reference implementations:**
   - **Minimal**: CK Flipz - Simplest game, good starting point, has GameInitializer
   - **War Faire**: Medium complexity, has GameInitializer
   - **Poker**: Advanced features, has GameInitializer with config mapper
   - **Full-featured**: Pirate Plunder - Complex game (still uses legacy initialization)

## Integration with AnteTown Platform

The AnteTown platform imports games from this monorepo using `file:` dependencies:

**Platform package.json:**
```json
{
  "dependencies": {
    "@pirate/game-ck-flipz": "file:../AnteTown-Games/games/ck-flipz",
    "@pirate/game-warfaire": "file:../AnteTown-Games/games/war-faire",
    "@pirate/game-houserules": "file:../AnteTown-Games/games/houserules-poker/backend",
    "@pirate/game-pirate-plunder": "file:../AnteTown-Games/games/pirate-plunder"
  }
}
```

**Platform backend** registers game initializers:
```typescript
// Import game initializers
const { ckFlipzInitializer } = require('@pirate/game-ck-flipz');
const { warFaireInitializer } = require('@pirate/game-warfaire');
const { pokerInitializer } = await import('@pirate/game-houserules');

// Register with TableManager
tableManager.registerGame('ck-flipz', ckFlipzInitializer);
tableManager.registerGame('war-faire', warFaireInitializer);
tableManager.registerGame('houserules-poker', pokerInitializer);

// Load system tables from database
const configs = await prisma.gameConfig.findMany({...});
for (const config of configs) {
  await tableManager.createTable({
    gameType: 'ck-flipz',
    baseConfigId: config.gameId,
    displayName: config.displayName,
    config: { /* mapped from GameConfig */ },
    context: { type: 'system' },
    lifecycle: 'permanent'
  }, io);
}

// Legacy: Pirate Plunder still uses old initialization
const { initializePiratePlunder } = require('@pirate/game-pirate-plunder');
initializePiratePlunder(io, { namespace: '/pirateplunder', tables: [...] });
```

**Platform frontend** imports and renders:
```typescript
import { CKFlipzClient } from '@pirate/game-ck-flipz/client';
import { WarFaireClient } from '@pirate/game-warfaire/client';

// In game router:
<Route path="/ck-flipz" element={<CKFlipzClient />} />
<Route path="/war-faire" element={<WarFaireClient />} />
```

## Package Naming Convention

- Backend package: `@antetown/game-{name}`
- Frontend export: `@antetown/game-{name}/client`
- Table class: `{GameName}Table` (e.g., `PiratePlunderTable`)

**Example exports in package.json:**
```json
{
  "name": "@antetown/game-pirate-plunder",
  "main": "backend/dist/index.js",
  "exports": {
    ".": "./backend/dist/index.js",
    "./client": "./frontend/dist/index.js"
  }
}
```

## game-sdk Package

Located in `packages/game-sdk/`, provides shared framework:

**Exports:**
- `GameBase` - Base class for game tables (state management, player handling)
- `GameRegistry` - Registry for all available games
- `MultiTableLobby` - React component for multi-table UI
- Types: `GamePhase`, `Player`, `Seat`, `TableConfig`, `GameState`, `GameMetadata`

**Usage in games:**
```typescript
import { GameBase, type TableConfig, type GameState } from '@antetown/game-sdk';

class MyGameTable extends GameBase {
  // Implement game logic
}
```

## Development Workflow

### Standard Development Flow

1. **Make changes** in appropriate game directory
2. **Type check** (mandatory before commit):
   ```bash
   cd games/{game-name}/backend && npx tsc --noEmit
   cd games/{game-name}/frontend && npx tsc --noEmit
   ```
3. **Build** the game:
   ```bash
   cd games/{game-name} && npm run build
   ```
4. **Test** with platform or standalone dev server
5. **Commit and push** changes (see Git Workflow below)

### Testing with Platform

To test game changes integrated with AnteTown platform:

```bash
# 1. Build game in this repo
cd games/pirate-plunder
npm run build

# 2. In platform repo (AnteTown)
cd ../AnteTown  # Or wherever platform is located
npm install     # Links file: dependencies
npm run dev     # Start platform with your game

# 3. Test at http://localhost:3001/#game/pirate-plunder
```

Changes to game code require rebuilding and restarting the platform.

## Git Workflow

- **Main branch**: `main`
- **Commits**: Follow conventional commits (`feat:`, `fix:`, `docs:`, etc.)
- **Always push after committing** (per user's global CLAUDE.md)

**Example:**
```bash
git add .
git commit -m "feat: Add new betting phase to pirate-plunder"
git push origin main
```

## Deployment

**Games are NOT deployed directly from this repository.**

The AnteTown platform integrates games via `file:` dependencies. **CRITICAL:** There's a specific build order required!

### The Build Order Problem

When games are linked via `file:` dependencies in `platform/frontend/package.json`, Vite (the frontend bundler) caches the game package. If you rebuild the platform frontend BEFORE rebuilding the game, **Vite won't detect the game changes** and will use the cached version.

**This causes the "deployed but changes don't show up" issue!**

### Correct Deployment Process

**From the AnteTown platform repo**, use the deployment script:

```bash
# In AnteTown repository
./scripts/deploy-external-game.sh <game-name>

# Examples:
./scripts/deploy-external-game.sh war-faire
./scripts/deploy-external-game.sh pirate-plunder
```

**What the script does (in this CRITICAL order):**
1. Build game package in AnteTown-Games repo
2. Rebuild platform frontend (picks up game changes)
3. Restart platform service
4. Clear Caddy cache

**⚠️ DO NOT deploy manually** - the build order must be correct or changes won't appear!

### Manual Deployment (If You Must)

If you can't use the script, follow this EXACT order on the server:

```bash
# 1. Pull and build game FIRST
cd /opt/AnteTown-Games/games/war-faire
git pull
npm run build

# 2. THEN rebuild platform frontend
cd /opt/AnteTown/platform/frontend
npm run build

# 3. Restart platform
sudo systemctl restart AnteTown

# 4. Clear Caddy cache
sudo rm -rf /var/lib/caddy/.local/share/caddy/*
sudo systemctl reload caddy
```

**Skip step 2 and your changes won't appear! This is the root cause of most deployment issues.**

See individual game CLAUDE.md files for game-specific details (e.g., `games/pirate-plunder/CLAUDE.md`).
