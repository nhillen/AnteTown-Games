# HouseRules (Texas Hold'em Poker)

**A Texas Hold'em poker game package for the AnteTown gaming platform**

A full-featured Texas Hold'em poker game with multi-table support.

---

## 🎮 Platform Integration

**HouseRules integrates with the [AnteTown platform](https://github.com/drybrushgames/PiratePlunder-new)** for production deployment.

- **Package**: Deployed as `@pirate/game-houserules`
- **Production URL**: https://antetown.com/#game/houserules (when integrated)
- **Multi-table**: Supports multiple poker tables with different configurations

---

## Package Structure

This package exports both backend game logic and frontend React components for integration with the AnteTown platform.

- **Backend**: `HouseRules` class extending `GameBase` from `@pirate/game-sdk`
- **Frontend**: `PokerClient` React component for rendering the poker table
- **Features**: Full Texas Hold'em rules with hand evaluation, betting rounds, and showdown

## Installation

```bash
npm install @pirate/game-houserules
```

Or publish to Verdaccio:

```bash
npm run build
npm run publish:verdaccio
```

## Usage

### Backend (Game Server)

```typescript
import { HouseRules } from '@pirate/game-houserules';
import { gameRegistry } from '@pirate/game-sdk';

const tableConfig = {
  minHumanPlayers: 2,
  targetTotalPlayers: 9,
  maxSeats: 9
};

const game = new HouseRules(tableConfig);
gameRegistry.register('houserules-poker', game);
```

### Frontend (React Component)

```tsx
import { PokerClient } from '@pirate/game-houserules';

function PokerTable({ gameState, myPlayerId }) {
  const handleAction = (action, amount) => {
    // Send action to backend via socket
    socket.emit('player_action', { action, amount });
  };

  return (
    <PokerClient
      gameState={gameState}
      myPlayerId={myPlayerId}
      onAction={handleAction}
    />
  );
}
```

## Tech Stack

- TypeScript
- React 19 (peer dependency)
- `@pirate/game-sdk` - Base game framework
- `@pirate/core-engine` - Logging and money flow
- clsx - Conditional className utility

## Project Structure

```
houserules/
├── src/
│   ├── HouseRules.ts       # Backend game logic extending GameBase
│   ├── PokerClient.tsx     # Frontend React component
│   ├── types.ts            # TypeScript interfaces
│   ├── hand-evaluator.ts   # Poker hand evaluation
│   ├── deck.ts             # Card and deck utilities
│   └── index.ts            # Package exports
├── dist/                   # Built files
├── package.json
└── tsconfig.json
```

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Watch mode for development
npm run watch

# Publish to Verdaccio
npm run publish:verdaccio
```

## Game Rules

### Texas Hold'em Basics

1. **Blinds**: Two players post small blind and big blind
2. **Pre-flop**: Each player receives 2 hole cards
3. **Flop**: 3 community cards are dealt
4. **Turn**: 4th community card is dealt
5. **River**: 5th community card is dealt
6. **Showdown**: Best 5-card hand wins

### Hand Rankings (High to Low)

1. Royal Flush
2. Straight Flush
3. Four of a Kind
4. Full House
5. Flush
6. Straight
7. Three of a Kind
8. Two Pair
9. Pair
10. High Card

### Actions

- **Fold**: Give up your hand
- **Check**: Pass action (when no bet to call)
- **Call**: Match the current bet
- **Bet**: Make the first bet in a round
- **Raise**: Increase the current bet
- **All-in**: Bet all your remaining chips

## API

### HouseRules Class

Extends `GameBase` from `@pirate/game-sdk`.

#### Methods

- `sitPlayer(player, seatIndex?, buyInAmount?)` - Seat a player at the table
- `startHand()` - Start a new poker hand
- `handlePlayerAction(playerId, action, amount?)` - Process player actions

#### Actions

- `'fold'` - Fold current hand
- `'check'` - Check (no bet required)
- `'call'` - Match current bet
- `'bet'` / `'raise'` - Increase bet
- `'all-in'` - Bet all chips

### PokerClient Component

#### Props

```typescript
interface PokerClientProps {
  gameState: HouseRulesGameState;
  myPlayerId: string;
  onAction: (action: PokerAction, amount?: number) => void;
}
```

## Contributing

Part of the AnteTown platform game ecosystem.

## License

MIT

## TODO

- [ ] Add AI opponents
- [ ] Implement side pots for all-in scenarios
- [ ] Add tournament mode
- [ ] Add chat functionality
- [ ] Add hand history
- [ ] Add statistics tracking
- [ ] Add mobile responsive design
- [ ] Add sound effects
- [ ] Add table customization
- [ ] Add private tables
