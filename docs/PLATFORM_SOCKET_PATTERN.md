# Platform-Level Socket Architecture

**How games integrate with AnteTown's unified socket and currency system**

## Overview

All games now use a **single platform-managed socket connection** instead of creating their own. The platform handles:
- ✅ Authentication (Google OAuth via handshake)
- ✅ Currency operations (buy-ins, payouts, balance updates)
- ✅ Table routing (join/leave table events)
- ✅ Player tracking (online status, session management)

Games focus purely on **game logic** (rules, phases, actions, outcomes).

## Architecture Diagram

```
┌─────────────┐
│   Frontend  │ (React)
│             │
│  useAuth()  │──────┐
│  socket     │      │ Single WebSocket connection
└─────────────┘      │
                     ▼
              ┌─────────────────┐
              │   Platform      │
              │   server.ts     │
              │                 │
              │  • join_table   │───► TableManager.getTable(tableId)
              │  • sit_down     │───► currencyManager.deduct()
              │  • player_action│───► game.handlePlayerAction()
              │  • stand_up     │───► currencyManager.credit()
              └─────────────────┘
                     │
                     ▼
              ┌─────────────────┐
              │   Game Instance │
              │   (CoinFlipGame)│
              │                 │
              │  • startHand()  │
              │  • handleAction│
              │  • payoutWinner│──► broadcast('balance_updated')
              └─────────────────┘
```

## Platform Responsibilities

### 1. Socket Connection & Authentication

**What Platform Does:**
```typescript
// server.ts - Socket.IO middleware
io.use((socket, next) => {
  const userId = socket.handshake.auth?.userId;    // Google ID
  const username = socket.handshake.auth?.username;

  if (!userId) {
    return next(new Error('Authentication required'));
  }

  // Attach to socket for later use
  socket.data.googleId = userId;
  socket.data.username = username;
  next();
});
```

**What Game Does:**
- ❌ **Nothing** - games don't create sockets or handle auth

### 2. Table Join/Leave

**What Platform Does:**
```typescript
// server.ts - join_table handler
socket.on('join_table', async (data) => {
  const { tableId } = data;

  // Look up table from TableManager
  const tableInstance = tableManager.getTable(tableId);
  if (!tableInstance) {
    socket.emit('error', { message: 'Table not found' });
    return;
  }

  // Route to game-specific join handler
  switch (tableInstance.gameType) {
    case 'ck-flipz':
      handleCKFlipzJoin(socket, tableId, tableInstance);
      break;
    case 'war-faire':
      handleWarFaireJoin(socket, tableId, tableInstance);
      break;
    // ... etc
  }
});
```

**What Game Does:**
```typescript
// In handleCKFlipzJoin (server.ts)
async function handleCKFlipzJoin(socket, tableId, tableInstance) {
  const { game, config } = tableInstance;
  const googleId = socket.handshake.auth.userId;

  // Load player data from database
  const bankroll = await currencyManager.getBalance(googleId, config.currencyCode);

  // Create player object
  const player = {
    id: googleId,
    name: socket.handshake.auth.username,
    bankroll,
    isAI: false,
    // ...
  };

  // Register with game
  game.registerSocket(socket, player);

  // Send initial state
  socket.emit('table_joined', {
    tableId,
    state: game.gameState
  });
}
```

### 3. Currency Operations (CRITICAL)

**Buy-In Flow:**
```typescript
// server.ts - sit_down handler
socket.on('sit_down', async (data) => {
  const { tableId, seatIndex, buyInAmount } = data;
  const googleId = socket.handshake.auth.userId;

  // 1. Validate buy-in amount
  const table = tableManager.getTable(tableId);
  const minBuyIn = table.config.ante * table.config.minBuyInMultiplier;
  if (buyInAmount < minBuyIn) {
    socket.emit('error', { message: `Minimum buy-in is ${minBuyIn}` });
    return;
  }

  // 2. Check bankroll (platform responsibility)
  const currencyCode = table.config.currencyCode || 'TC';
  const canAfford = await currencyManager.canAfford(googleId, buyInAmount, currencyCode);
  if (!canAfford) {
    socket.emit('error', { message: 'Insufficient funds' });
    return;
  }

  // 3. Deduct from database (platform responsibility)
  const deductResult = await currencyManager.deduct(
    googleId,
    buyInAmount,
    currencyCode,
    'game_buyin',
    { tableId }
  );

  if (!deductResult.success) {
    socket.emit('error', { message: 'Buy-in failed' });
    return;
  }

  // 4. Sit player in game (game responsibility)
  const player = game.getPlayerByGoogleId(googleId);
  const result = game.sitPlayer(player, seatIndex, buyInAmount);

  // 5. Notify player of balance change
  socket.emit('balance_updated', {
    currencyCode,
    newBalance: deductResult.newBalance,
    change: -buyInAmount,
    reason: 'game_buyin',
    tableId
  });
});
```

**Stand-Up Flow:**
```typescript
socket.on('stand_up', async (data) => {
  const { tableId } = data;
  const googleId = socket.handshake.auth.userId;

  // 1. Get player's current table stack
  const seat = game.findSeatByGoogleId(googleId);
  const tableStack = seat?.tableStack || 0;

  // 2. Remove from game
  game.standPlayer(googleId);

  // 3. Credit back to database (platform responsibility)
  if (tableStack > 0) {
    await currencyManager.credit(
      googleId,
      tableStack,
      config.currencyCode,
      'game_cashout',
      { tableId }
    );

    socket.emit('balance_updated', {
      currencyCode: config.currencyCode,
      newBalance: /* new balance */,
      change: tableStack,
      reason: 'game_cashout',
      tableId
    });
  }
});
```

**What Game Does:**
```typescript
// Game should NEVER modify player.bankroll directly!
// ❌ WRONG:
player.bankroll -= buyInAmount;  // NO! Platform handles this

// ✅ CORRECT:
// Just track tableStack (money at the table)
seat.tableStack = buyInAmount;  // This is OK - it's table money, not wallet
```

## Game Implementation Pattern

### Frontend: Use Platform Socket

```typescript
// Game component
import { useAuth } from '@/components/AuthProvider';

export default function GameClient({ initialTableId }) {
  const { socket, user } = useAuth();  // Get platform socket
  const [gameState, setGameState] = useState(null);

  useEffect(() => {
    if (!socket || !initialTableId) return;

    // Use platform socket for all game events
    socket.emit('join_table', { tableId: initialTableId });

    socket.on('table_joined', (data) => {
      setGameState(data.state);

      // Auto-sit if not already seated
      const isSeated = data.state.seats.some(s => s?.playerId === user.googleId);
      if (!isSeated) {
        const buyIn = data.state.ante * 10;
        socket.emit('sit_down', {
          tableId: initialTableId,
          seatIndex: 0,
          buyInAmount: buyIn
        });
      }
    });

    socket.on('game_state', (state) => {
      setGameState(state);
    });

    socket.on('balance_updated', (data) => {
      // Platform handles balance updates via AuthProvider
      // Game just shows updated balance from useAuth()
    });

    return () => {
      socket.off('table_joined');
      socket.off('game_state');
      socket.off('balance_updated');
    };
  }, [socket, initialTableId, user]);

  const handleAction = (action, data) => {
    socket.emit('player_action', {
      tableId: initialTableId,
      action,
      ...data
    });
  };

  return <GameUI gameState={gameState} onAction={handleAction} />;
}
```

### Backend: Register with Platform

**Game Initializer (required):**
```typescript
// games/your-game/backend/src/initializer.ts
import { GameInitializer } from '@antetown/game-sdk';

export const yourGameInitializer: GameInitializer = {
  createInstance(config: any, io?: SocketIOServer): any {
    return new YourGame(config);
  },

  destroyInstance(instance: any): void {
    instance.removeAllListeners?.();
  },

  validateConfig(config: any): { valid: boolean; error?: string } {
    if (!config.ante || config.ante <= 0) {
      return { valid: false, error: 'Invalid ante amount' };
    }
    return { valid: true };
  },

  getDefaultConfig(): any {
    return {
      variant: 'standard',
      mode: 'pvp',
      ante: 100,
      maxSeats: 4,
      currencyCode: 'TC'
    };
  }
};
```

**Platform Registration (server.ts):**
```typescript
// Load game
const { yourGameInitializer } = require('@antetown/game-your-game');

// Register with TableManager
tableManager.registerGame('your-game', yourGameInitializer);
```

**Join Handler (server.ts):**
```typescript
async function handleYourGameJoin(socket, tableId, tableInstance) {
  const { game, config } = tableInstance;
  const googleId = socket.handshake.auth.userId;

  // Load player from database
  const bankroll = await currencyManager.getBalance(googleId, config.currencyCode);
  const dbUser = await prisma.user.findUnique({
    where: { googleId },
    select: { gameCosmetics: true }
  });

  // Create player object
  const player = {
    id: googleId,
    name: socket.handshake.auth.username,
    bankroll,
    isAI: false,
    cosmetics: dbUser?.gameCosmetics || {},
    tableStack: 0
  };

  // Register with game
  game.registerSocket(socket, player);

  // Send initial state
  socket.emit('table_joined', {
    tableId,
    state: game.gameState
  });
}
```

## Betting & Ante Collection Pattern

### ❌ WRONG: "Side Bet" Pattern

```typescript
// DON'T DO THIS - pot stays at 0!
private handleAntePhase(): void {
  // Side bet - no money collected at start, settled after flip
  console.log('Ante phase - will settle later');
  this.transitionToPhase('NextPhase');
}
```

### ✅ CORRECT: Upfront Collection

```typescript
private handleAntePhase(): void {
  const anteAmount = this.getAnteAmount();

  // 1. Auto-stand players who can't afford ante
  for (let i = 0; i < this.gameState.seats.length; i++) {
    const seat = this.gameState.seats[i];
    if (seat && seat.tableStack < anteAmount) {
      // Stand player (platform will credit remaining stack back)
      this.standPlayer(seat.playerId);
      this.gameState.seats[i] = null;
    }
  }

  // 2. Check we still have enough players
  const activePlayers = this.getActivePlayers();
  if (activePlayers.length < 2) {
    this.transitionToPhase('HandEnd');
    return;
  }

  // 3. CRITICAL: Collect antes from each player
  let totalPot = 0;
  for (const seat of this.gameState.seats) {
    if (seat && !seat.hasFolded) {
      seat.tableStack -= anteAmount;        // Deduct from stack
      seat.currentBet = anteAmount;         // Track current bet
      seat.totalContribution = anteAmount;  // Track total contributed
      totalPot += anteAmount;
    }
  }

  // 4. Update pot
  this.gameState.pot = totalPot;
  console.log(`Collected ${totalPot} in antes from ${activePlayers.length} players`);

  // 5. Broadcast updated state
  this.broadcastGameState();

  // 6. Move to next phase
  this.transitionToPhase('NextPhase');
}
```

### Payout Pattern

```typescript
private handlePayoutPhase(): void {
  const winner = this.determineWinner();
  const pot = this.gameState.pot;

  // 1. Add winnings to winner's table stack
  const winnerSeat = this.findSeat(winner.playerId);
  if (winnerSeat) {
    winnerSeat.tableStack += pot;
    console.log(`${winnerSeat.name} won ${pot} TC`);
  }

  // 2. Reset pot
  this.gameState.pot = 0;

  // 3. Broadcast updated state (winner's stack is now updated)
  this.broadcastGameState();

  // 4. Platform will handle crediting to database when player stands
  // (Or at end of session if they keep playing)
}
```

## Critical Rules

### Currency Management

1. **Platform deducts buy-ins** → Don't modify `player.bankroll` in game code
2. **Game manages tableStack** → This is OK, it's table money not wallet
3. **Platform credits cash-outs** → When player stands, platform returns `tableStack` to bankroll
4. **Ante/bet collection** → Deduct from `tableStack`, add to `pot`
5. **Payouts** → Add `pot` to winner's `tableStack`

### Socket Management

1. **One socket per player** → Platform creates it, game uses it
2. **Authentication** → Platform validates, game uses `socket.handshake.auth`
3. **Game events** → Use `game.broadcast()` to send to all players at table
4. **Balance updates** → Emit `balance_updated` event, platform propagates to frontend

### State Management

1. **Game state** → Managed by game (`this.gameState`)
2. **Player bankroll** → Managed by platform (database)
3. **Table stack** → Managed by game (`seat.tableStack`)
4. **Pot** → Managed by game (`this.gameState.pot`)

## Migration Checklist

Moving an existing game to platform socket pattern:

- [ ] **Frontend**: Remove `io()` socket creation, use `useAuth()` socket
- [ ] **Frontend**: Remove balance state management, use `useAuth()` user balance
- [ ] **Frontend**: Update events to use platform socket (`join_table`, `sit_down`, etc.)
- [ ] **Backend**: Create game initializer (`createInstance`, `validateConfig`, etc.)
- [ ] **Backend**: Register with TableManager in server.ts
- [ ] **Backend**: Create join handler (load player from DB, register with game)
- [ ] **Backend**: Remove `player.bankroll` modifications from game code
- [ ] **Backend**: Add ante collection in ante/betting phase
- [ ] **Backend**: Ensure payouts add to `tableStack` not `bankroll`
- [ ] **Testing**: Verify buy-in deducts from database
- [ ] **Testing**: Verify antes collected at game start
- [ ] **Testing**: Verify pot shows correct amount
- [ ] **Testing**: Verify cash-out credits back to database

## Reference Implementations

- **CK Flipz**: Recently migrated, good example of frontend + backend pattern
  - Frontend: `games/ck-flipz/frontend/src/CKFlipzApp.tsx`
  - Backend join handler: `platform/backend/src/server.ts:handleCKFlipzJoin`
  - Ante collection: `games/ck-flipz/backend/src/CoinFlipGame.ts:handleAntePhase`

- **War Faire**: Established pattern, multi-player example
  - Backend join handler: `platform/backend/src/server.ts:handleWarFaireJoin`
  - Ante collection: `games/war-faire/src/WarFaireGame.ts:startHand` (lines 151-166)

- **HouseRules Poker**: Complex betting example
  - Backend join handler: `platform/backend/src/server.ts:handlePokerJoin`
  - Blind/ante collection: Check poker game implementation

## Common Issues

### Issue: Pot Shows 0 TC
**Cause**: Antes not collected in ante phase
**Fix**: Add ante collection code (see "CORRECT" pattern above)

### Issue: Balance Not Updating
**Cause**: Game modifying `player.bankroll` instead of emitting `balance_updated`
**Fix**: Remove bankroll modifications, let platform handle via `currencyManager`

### Issue: Buy-In Not Working
**Cause**: Missing platform `sit_down` handler or incorrect currency code
**Fix**: Check server.ts has handler, verify `currencyCode` in config

### Issue: Multiple Socket Connections
**Cause**: Game creating own socket instead of using platform socket
**Fix**: Frontend should use `useAuth()` socket, not create new one

## Related Documentation

- `PVE_GAME_PATTERNS.md` - PvE-specific patterns (AI spawn, auto-ready)
- `../packages/game-sdk/README.md` - GameBase class reference
- `GAME_INTEGRATION.md` - General game integration guide
