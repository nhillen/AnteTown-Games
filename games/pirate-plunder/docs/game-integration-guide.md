# Game Integration Guide

Guide for integrating external games (like WarFaire) into the Pirate Platform.

## Architecture Overview

```
Game Repo (WarFaire)         Verdaccio Registry           PiratePlunder Platform
────────────────────         ──────────────────           ──────────────────────
1. Extend GameBase          2. Publish Package           3. Register & Serve
   WarFaireGame.ts             @pirate/game-warfare         gameRegistry.register()
   manifest.json               └─ game logic                Multi-game menu
   frontend/                   └─ manifest
                               └─ frontend bundle
```

## Phase 1: Prepare Game Repository

### 1. Install Platform Dependencies

In your game repo, add the platform packages:

```bash
cd /path/to/your-game
npm install @pirate/game-sdk@latest
npm install @pirate/core-engine@latest
```

Configure `.npmrc` to use Verdaccio:
```
@pirate:registry=http://vps-0b87e710.tail751d97.ts.net:4873/
```

### 2. Create Game Adapter Class

Create a TypeScript file that extends `GameBase`:

```typescript
// src/YourGame.ts
import { GameBase, GameState, Seat, WinnerResult } from '@pirate/game-sdk';

export class YourGame extends GameBase {
  gameType = 'your-game-type';

  // Required: Start a new hand/round
  startHand(): void {
    // Initialize your game state
    this.gameState = {
      phase: 'YourPhase',
      seats: Array.from(this.connectedPlayers.values()).map(p => ({
        playerId: p.id,
        name: p.name,
        isAI: p.isAI,
        tableStack: p.bankroll,
        currentBet: 0,
        hasFolded: false,
        hasActed: false,
        dice: [] // or cards, or whatever your game uses
      })),
      pot: 0,
      currentBet: 0
    };

    this.broadcastGameState();
  }

  // Required: Handle player actions
  handlePlayerAction(playerId: string, action: string, data?: any): void {
    // Route actions to your game logic
    switch(action) {
      case 'your_action':
        // Handle action
        this.broadcastGameState();
        break;
    }
  }

  // Required: Determine winners and payouts
  evaluateWinners(): WinnerResult[] {
    return [{
      playerId: 'winner-id',
      payout: 1000 // in pennies
    }];
  }

  // Required: Valid actions for a player
  getValidActions(playerId: string): string[] {
    return ['your_action', 'another_action'];
  }
}
```

### 3. Create Game Manifest

Create `manifest.json` describing your game:

```json
{
  "gameId": "your-game",
  "gameType": "your-game-type",
  "displayName": "Your Game Name",
  "version": "0.1.0",
  "description": "Description of your game",
  "minPlayers": 2,
  "maxPlayers": 8,
  "assets": {
    "serverPackage": "@pirate/game-your-game",
    "clientBundle": "your-game-client.js"
  },
  "deployment": {
    "timestamp": "",
    "commitHash": ""
  }
}
```

### 4. Update package.json for Publishing

```json
{
  "name": "@pirate/game-your-game",
  "version": "0.1.0",
  "description": "Your game for Pirate Platform",
  "main": "dist/YourGame.js",
  "types": "dist/YourGame.d.ts",
  "files": [
    "dist/",
    "manifest.json",
    "public/"
  ],
  "scripts": {
    "build": "tsc && cp manifest.json dist/",
    "publish:local": "npm publish --registry http://vps-0b87e710.tail751d97.ts.net:4873/"
  },
  "dependencies": {
    "@pirate/game-sdk": "^0.1.0",
    "@pirate/core-engine": "^0.1.0"
  },
  "publishConfig": {
    "registry": "http://vps-0b87e710.tail751d97.ts.net:4873/"
  }
}
```

### 5. Add TypeScript Configuration

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 6. Build and Publish

```bash
# Build your game
npm run build

# Publish to Verdaccio registry
npm run publish:local
```

## Phase 2: Integrate into Platform

### 1. Install Game Package

In the PiratePlunder repository:

```bash
cd /home/nathan/GitHub/PiratePlunder
npm install @pirate/game-your-game@latest
```

### 2. Register in Platform Backend

Edit `games/pirate-plunder/backend/src/server.ts`:

```typescript
import { YourGame } from '@pirate/game-your-game';
import { gameRegistry } from '@pirate/game-sdk';

// Register your game
gameRegistry.registerGameType('your-game-type', YourGame as any);
```

### 3. Update Frontend (if custom UI needed)

The `GameSelector` component will automatically show registered games. If you need custom UI:

1. Create game-specific components in `frontend/src/components/`
2. Update `GameRouter` to route to your game type
3. Build frontend: `npm run build --workspace @pirate/game-pirate-plunder-frontend`

### 4. Deploy Platform

```bash
# Build everything
make build

# Deploy to production
./deploy-direct.sh
```

## Development Workflow

### Iterating on Your Game

1. **Make changes** in your game repository
2. **Bump version** in package.json (0.1.0 → 0.1.1)
3. **Build & publish**: `npm run build && npm run publish:local`
4. **Update platform**: `npm update @pirate/game-your-game` in PiratePlunder
5. **Rebuild & redeploy**: `make build && ./deploy-direct.sh`

### Testing Locally

```bash
# In game repo: link for local development
npm link

# In PiratePlunder repo: use linked version
npm link @pirate/game-your-game

# Make changes, rebuild game, platform automatically picks up changes
```

## Game SDK API Reference

### GameBase Methods You Must Implement

```typescript
abstract startHand(): void;
abstract handlePlayerAction(playerId: string, action: string, data?: any): void;
abstract evaluateWinners(): WinnerResult[];
abstract getValidActions(playerId: string): string[];
```

### GameBase Methods Available to You

```typescript
// Player management
this.connectedPlayers: Map<string, Player>
this.addPlayer(socket: Socket, player: Player): void
this.removePlayer(playerId: string): void

// Game state
this.gameState: GameState | null
this.broadcastGameState(): void

// Socket communication
this.sockets: Map<string, Socket>
this.emit(event: string, data: any): void

// Table configuration
this.tableConfig: TableConfig
```

### Core Types

```typescript
interface Player {
  id: string;
  name: string;
  isAI: boolean;
  bankroll: number;
  googleId?: string;
}

interface GameState {
  phase: string;
  seats: Seat[];
  pot: number;
  currentBet: number;
}

interface WinnerResult {
  playerId: string;
  payout: number; // in pennies
}
```

## Benefits of This Architecture

✅ **Separation of Concerns**: Games live in their own repos
✅ **Independent Versioning**: Each game has its own release cycle
✅ **Shared Infrastructure**: All games use platform auth, database, UI shell
✅ **Easy Updates**: Publish new version, update platform, redeploy
✅ **Multi-Game Platform**: One platform hosts many games

## Troubleshooting

### "Cannot find module '@pirate/game-sdk'"

Make sure Verdaccio is running and `.npmrc` is configured:
```bash
# Check Verdaccio
curl http://vps-0b87e710.tail751d97.ts.net:4873/

# Check package is published
curl http://vps-0b87e710.tail751d97.ts.net:4873/@pirate/game-sdk
```

### "Game not showing in menu"

1. Verify registration in server.ts
2. Check browser console for errors
3. Verify manifest.json is included in package

### "TypeScript errors when building"

Ensure you're using compatible versions of `@pirate/game-sdk` and `@pirate/core-engine`.

## Example: WarFaire Integration

See `/home/nathan/GitHub/WarFaire` for a complete example of integrating an existing card game into the platform.
