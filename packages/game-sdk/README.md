# @antetown/game-sdk

**SDK for building games on the AnteTown Platform**

This package provides base classes, types, and utilities for developing multiplayer casino games that integrate with the AnteTown platform.

## Features

- **GameBase**: Abstract base class for game logic with built-in player management, betting, and state broadcasting
- **GameRegistry**: Central registry for managing multiple game types
- **MultiTableLobby**: React component for displaying and managing multiple game tables
- **TypeScript**: Full type definitions for all APIs

## Installation

```bash
npm install @antetown/game-sdk
```

## Usage

### Backend (Game Logic)

```typescript
import { GameBase, GameState, Seat, WinnerResult } from '@antetown/game-sdk';

class MyGame extends GameBase {
  public gameType = 'my-game';
  public gameState: MyGameState | null = null;

  public startHand(): void {
    // Implement game logic
  }

  public handlePlayerAction(playerId: string, action: string, data?: any): void {
    // Handle player actions
  }

  public evaluateWinners(): WinnerResult[] {
    // Determine winners
  }

  public getValidActions(playerId: string): string[] {
    // Return valid actions for player
  }
}
```

### Frontend (React Components)

```typescript
import { MultiTableLobby } from '@antetown/game-sdk';

function GameLobby() {
  return (
    <MultiTableLobby
      gameType="my-game"
      tables={tables}
      onJoinTable={handleJoinTable}
      onCreateTable={handleCreateTable}
    />
  );
}
```

## API Reference

### GameBase

Base class for implementing game logic.

**Methods:**
- `startHand()` - Start a new hand/round
- `endHand()` - End the current hand
- `sitPlayer(player, seatIndex?, buyInAmount?)` - Seat a player at the table
- `standPlayer(playerId, immediate?)` - Remove a player from the table
- `handlePlayerAction(playerId, action, data?)` - Process player actions
- `evaluateWinners()` - Determine hand winners
- `getValidActions(playerId)` - Get valid actions for a player
- `broadcast(event, data)` - Broadcast to all players
- `emitToPlayer(playerId, event, data)` - Send to specific player

### Types

- `GameState` - Base game state interface
- `Seat` - Player seat information
- `Player` - Player metadata
- `TableConfig` - Table configuration
- `WinnerResult` - Winner payout information
- `GameMetadata` - Game registration metadata

## License

MIT
