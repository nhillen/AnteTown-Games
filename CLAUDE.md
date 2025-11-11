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

Each game exports two main modules:

**Backend (`backend/src/index.ts`):**
```typescript
export function initializeGame(io: SocketIOServer, options?: {
  namespace?: string
  tables?: TableConfig[]
}): GameInstance

export const GAME_METADATA: GameMetadata  // id, name, description, min/maxPlayers, etc.
```

**Frontend (`frontend/src/index.ts`):**
```typescript
export const GameClient: React.FC        // Main game component
export const GAME_CLIENT_INFO: GameClientInfo
```

### Game Initialization Flow

1. **Platform imports game**: `import { initializeGame } from '@antetown/game-pirate-plunder'`
2. **Platform calls initialize**: `initializeGame(io, { namespace: '/pirateplunder', tables: [...] })`
3. **Game registers Socket.IO handlers**: On the provided namespace
4. **Frontend imports component**: `import { GameClient } from '@antetown/game-pirate-plunder/client'`
5. **Platform renders component**: `<GameClient />`

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
   - Create `YourGameTable` class extending `GameBase` from game-sdk
   - Export `initializeYourGame()` and `GAME_METADATA` from `index.ts`
   - Define game state types

4. **Implement frontend:**
   - Create React component for game UI
   - Export `GameClient` from `index.ts`
   - Handle Socket.IO events

5. **Add workspace to root** if needed (npm workspaces auto-discovers `games/*`)

6. **Reference implementations:**
   - **Minimal**: CK Flipz - Simplest game, good starting point
   - **Full-featured**: Pirate Plunder - Complex game with AI, multiple phases, cosmetics

## Integration with AnteTown Platform

The AnteTown platform imports games from this monorepo using `file:` dependencies:

**Platform package.json:**
```json
{
  "dependencies": {
    "@antetown/game-pirate-plunder": "file:../AnteTown-Games/games/pirate-plunder",
    "@antetown/game-ck-flipz": "file:../AnteTown-Games/games/ck-flipz"
  }
}
```

**Platform backend** imports and initializes:
```typescript
import { initializePiratePlunder, GAME_METADATA } from '@antetown/game-pirate-plunder';

// During server startup:
initializePiratePlunder(io, {
  namespace: '/pirateplunder',
  tables: [
    { tableId: 'low-stakes', displayName: 'Scallywag', minAnte: 1, maxAnte: 10 }
  ]
});
```

**Platform frontend** imports and renders:
```typescript
import { PiratePlunderClient } from '@antetown/game-pirate-plunder/client';

// In game router:
<Route path="/pirate-plunder" element={<PiratePlunderClient />} />
```

## Package Naming Convention

- Backend package: `@antetown/game-{name}` (or `@pirate/game-{name}` for legacy)
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

The AnteTown platform:
1. References games via `file:` dependencies
2. Builds games as part of platform build process
3. Deploys complete platform with all integrated games

**To deploy game changes:**
1. Commit and push changes to this repo
2. Platform's `npm install` picks up the changes (due to `file:` dependency)
3. Deploy the platform (see platform's DEPLOY.md)

See individual game CLAUDE.md files for game-specific details (e.g., `games/pirate-plunder/CLAUDE.md`).
