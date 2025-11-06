# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is This Repository?

**AnteTown-Games is a monorepo containing all casino games for the AnteTown platform.**

This repository consolidates:
- All game packages (backend + frontend)
- Shared utilities and frameworks
- Common UI components

## Structure

```
AnteTown-Games/
├── games/
│   ├── pirate-plunder/      # Dice game - Roll to be Captain or Crew
│   ├── ck-flipz/            # Coin/card flip betting game
│   ├── war-faire/           # Strategic card game across three fairs
│   └── houserules-poker/    # Texas Hold'em poker
├── packages/
│   ├── game-sdk/            # Shared game framework (TODO)
│   ├── ui-components/       # Shared React components (TODO)
│   └── core-engine/         # Core game utilities (TODO)
└── tools/                   # Build and development tools
```

## Development Commands

```bash
# Install all dependencies (from repo root)
npm install

# Build all games
npm run build

# Build specific game
npm run build --workspace games/pirate-plunder

# Build only game packages
npm run build:games

# Build only shared packages
npm run build:packages

# Clean all builds
npm run clean

# Run tests
npm run test
```

## Working with Individual Games

Each game in `games/` is a complete package with its own:
- Backend (game logic, Socket.IO handlers)
- Frontend (React components)
- Tests
- Documentation

See individual game directories for game-specific documentation.

## Adding a New Game

1. Create directory: `games/your-game/`
2. Add backend and frontend subdirectories
3. Create package.json files for both
4. Follow patterns from existing games (especially CK Flipz for simplicity)
5. Add to AnteTown platform imports

## Integration with AnteTown Platform

The AnteTown platform imports games from this monorepo:

**Platform package.json:**
```json
{
  "dependencies": {
    "@antetown/game-pirate-plunder": "file:../AnteTown-Games/games/pirate-plunder",
    "@antetown/game-ck-flipz": "file:../AnteTown-Games/games/ck-flipz"
  }
}
```

**Platform backend:**
```typescript
import { initializeGame } from '@antetown/game-pirate-plunder';
```

**Platform frontend:**
```typescript
import { GameClient } from '@antetown/game-pirate-plunder/client';
```

## Monorepo Benefits

- **Single source of truth**: All games in one place
- **Shared updates**: Update SDK and all games benefit
- **Consistent patterns**: Easy to see how other games solve problems
- **Atomic changes**: Update SDK + all games in single commit
- **Easier testing**: Test interactions between games
- **Simplified CI/CD**: One pipeline for all games

## Game Package Naming Convention

- Backend: `@antetown/game-{name}`
- Frontend: `@antetown/game-{name}/client`
- Example: `@antetown/game-pirate-plunder` and `@antetown/game-pirate-plunder/client`

## Shared Packages (TODO)

### game-sdk
Core framework for building games:
- Base game class
- Socket.IO integration patterns
- State management helpers
- Common game logic

### ui-components
Shared React components:
- Card rendering
- Chip displays
- Table layouts
- Action buttons

### core-engine
Utilities used across games:
- Bankroll calculations
- Rake computation
- Hand evaluation
- Deck shuffling

## Development Workflow

1. **Make changes** in appropriate game directory
2. **Build** the specific game or all games
3. **Test** locally with AnteTown platform
4. **Commit** to this repository
5. **Platform will automatically pick up** file: dependency changes

## TypeScript

All games use TypeScript with strict mode. Always run type checking before committing:

```bash
# For specific game
cd games/pirate-plunder/backend && npx tsc --noEmit
cd games/pirate-plunder/frontend && npx tsc --noEmit
```

## Git Workflow

- **Main branch**: main
- **Commits**: Follow conventional commits (feat:, fix:, docs:, etc.)
- **PRs**: Not required for solo dev, but recommended for larger changes

## Deployment

Games are not deployed directly from this repository. The AnteTown platform:
1. References games via `file:` dependencies
2. Builds games as part of platform build
3. Deploys complete platform with all games

See [AnteTown platform DEPLOY.md](https://github.com/nhillen/AnteTown/blob/main/DEPLOY.md) for deployment instructions.
