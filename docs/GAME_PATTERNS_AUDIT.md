# Game Patterns Audit - Platform Socket & Betting Compliance

**Date**: 2025-11-17
**Purpose**: Verify all games follow platform socket pattern and correct betting/currency patterns

## Summary

✅ **All games correctly implement ante/blind collection** - Money is deducted from `tableStack` and added to `pot` upfront
⚠️ **Pirate Plunder needs migration** to platform socket pattern
✅ **CK Flipz, War Faire, HouseRules Poker** use platform sockets correctly

---

## Betting Pattern Compliance

### ✅ CK Flipz (Coin & Card Variants)

**Status**: COMPLIANT ✅

**Ante Collection** (`CoinFlipGame.ts:261-273`, `CardFlipGame.ts:261-273`):
```typescript
let totalAntes = 0;
for (const seat of this.gameState.seats) {
  if (seat && !seat.hasFolded) {
    seat.tableStack -= anteAmount;        // ✅ Deduct from stack
    seat.currentBet = anteAmount;
    seat.totalContribution = anteAmount;
    totalAntes += anteAmount;
  }
}
this.gameState.pot = totalAntes;          // ✅ Add to pot
```

**Pattern**: Collects antes in `handleAntePhase()` before gameplay begins

---

### ✅ War Faire

**Status**: COMPLIANT ✅

**Ante Collection** (`WarFaireGame.ts:151-168`):
```typescript
const anteAmount = (this.tableConfig as any).ante || 0;
if (anteAmount > 0) {
  let totalCollected = 0;
  for (const seat of seatedPlayers) {
    if (seat.tableStack >= anteAmount) {
      seat.tableStack -= anteAmount;      // ✅ Deduct from stack
      seat.currentBet = anteAmount;
      seat.totalContribution = anteAmount;
      totalCollected += anteAmount;
    }
  }
  this.gameState.pot = totalCollected;    // ✅ Add to pot
}
```

**Pattern**: Collects antes in `startHand()` before first Fair setup

---

### ✅ Pirate Plunder

**Status**: COMPLIANT ✅

**Ante Collection** (`PiratePlunderTable.ts:1376-1445`):
```typescript
// In handleAntePhase()
if (shouldPayAnte) {
  const amt = Math.min(seat.tableStack, anteAmount);
  seat.tableStack -= amt;                 // ✅ Deduct from stack

  const { mainPot, chestDrip } = this.processDripFromWager(amt);
  this.gameState.pot += mainPot;          // ✅ Add to pot
  seat.totalContribution = amt;
}
```

**Pattern**: Complex ante system with multiple modes (`per_player`, `button`, `every_nth`)
**Note**: Includes "drip" system for cargo chest (side jackpot)

---

### ✅ HouseRules Poker

**Status**: COMPLIANT ✅

**Blind Collection** (`HouseRules.ts:1279-1299`):
```typescript
// Small blind
const sbAmount = Math.min(sbSeat.tableStack, this.smallBlindAmount);
sbSeat.currentBet = sbAmount;
sbSeat.totalContribution = sbAmount;
sbSeat.tableStack -= sbAmount;            // ✅ Deduct from stack
this.gameState.pot += sbAmount;           // ✅ Add to pot

// Big blind
const bbAmount = Math.min(bbSeat.tableStack, this.bigBlindAmount);
bbSeat.currentBet = bbAmount;
bbSeat.totalContribution = bbAmount;
bbSeat.tableStack -= bbAmount;            // ✅ Deduct from stack
this.gameState.pot += bbAmount;           // ✅ Add to pot
```

**Pattern**: Collects blinds in `startHand()` before dealing hole cards

---

## Platform Socket Pattern Compliance

### ✅ CK Flipz

**Status**: FULLY MIGRATED ✅

**Platform Integration**:
- ✅ Uses `GameInitializer` interface (`initializer.ts`)
- ✅ Registered with `TableManager`
- ✅ Platform handles `join_table` → `handleCKFlipzJoin()` (`server.ts:642,697`)
- ✅ Platform handles `sit_down` with currency validation
- ✅ Frontend uses `useAuth()` socket from `AuthProvider`

**Join Handler** (`server.ts:697-750`):
```typescript
async function handleCKFlipzJoin(socket, tableId, tableInstance) {
  const { game, io: tableIo } = tableInstance;
  const googleId = socket.handshake.auth.userId;

  // Platform loads player from database
  const bankroll = await currencyManager.getBalance(googleId, ...);

  // Platform creates player object
  const player = { id: googleId, name: ..., bankroll, isAI: false };

  // Game registers socket
  game.registerSocket(socket, player);
}
```

---

### ✅ War Faire

**Status**: FULLY MIGRATED ✅

**Platform Integration**:
- ✅ Uses `GameInitializer` interface (`initializer.ts`)
- ✅ Registered with `TableManager`
- ✅ Platform handles `join_table` → `handleWarFaireJoin()` (`server.ts:645,1037`)
- ✅ Platform handles `sit_down` with currency validation
- ✅ Frontend uses `useAuth()` socket

**Join Handler** (`server.ts:1037-1091`):
```typescript
async function handleWarFaireJoin(socket, tableId, tableInstance) {
  const { game, config } = tableInstance;
  const googleId = socket.handshake.auth.userId;

  // Platform loads player from database
  const bankroll = await currencyManager.getBalance(googleId, config.currencyCode);

  // Game registers socket
  game.registerSocket(socket, { id: googleId, name, bankroll, ... });
}
```

---

### ✅ HouseRules Poker

**Status**: FULLY MIGRATED ✅

**Platform Integration**:
- ✅ Uses `GameInitializer` interface (`initializer.ts`)
- ✅ Registered with `TableManager`
- ✅ Platform handles `join_table` → `handlePokerJoin()` (`server.ts:648,1287`)
- ✅ Platform handles `sit_down` with currency validation
- ✅ Frontend uses `useAuth()` socket

**Join Handler** (`server.ts:1287-1353`):
```typescript
async function handlePokerJoin(socket, tableId, tableInstance) {
  const { game, config } = tableInstance;
  const googleId = socket.handshake.auth.userId;

  // Platform loads player from database
  const bankroll = await currencyManager.getBalance(googleId, config.currencyCode);

  // Game registers socket
  game.registerSocket(socket, { id: googleId, name, bankroll, ... });
}
```

---

### ⚠️ Pirate Plunder

**Status**: NOT MIGRATED - USES OLD PATTERN ⚠️

**Current Implementation**:
- ❌ Uses own namespace (`/pirateplunder`)
- ❌ Manages own socket handlers in game package (`index.ts:54-150`)
- ❌ Uses `join` event instead of platform's `join_table`
- ❌ Handles own `sit_down` event without platform currency validation
- ❌ No `GameInitializer` interface
- ❌ Not registered with `TableManager`

**Code Location** (`pirate-plunder/backend/src/index.ts:33-99`):
```typescript
export function initializePiratePlunder(io: SocketIOServer, options = {}) {
  const namespace = options?.namespace || '/';
  const nsp = namespace === '/' ? io.of('/') : io.of(namespace);

  // Game creates own tables
  const tables = new Map<string, PiratePlunderTable>();
  for (const config of tableConfigs) {
    const table = new PiratePlunderTable(config, nsp);
    tables.set(config.tableId, table);
  }

  // Game registers own socket handlers
  nsp.on('connection', (socket) => {
    socket.on('join', (payload) => {       // ❌ Uses 'join' not 'join_table'
      // Game handles join logic itself
      table.handleJoin(socket, payload);
    });

    socket.on('sit_down', (payload) => {   // ❌ Game handles sit_down itself
      table.handleSitDown(socket, payload);
    });
  });
}
```

**Migration Needed**:
1. Create `GameInitializer` interface implementation
2. Remove socket handlers from game package
3. Add `handlePlunderJoin()` to platform `server.ts`
4. Update frontend to use `join_table` event
5. Let platform handle `sit_down` with currency validation
6. Change namespace from `/pirateplunder` to `/` (or remove namespace entirely)

---

## Currency Management Compliance

All games correctly follow the pattern:

### ✅ Platform Responsibilities
- ✅ Deducts buy-ins from `User.bankroll` via `currencyManager.deduct()`
- ✅ Credits cash-outs to `User.bankroll` via `currencyManager.credit()`
- ✅ Emits `balance_updated` events
- ✅ Validates currency availability before buy-in

### ✅ Game Responsibilities
- ✅ Manages `seat.tableStack` (money at the table)
- ✅ Collects antes/blinds from `tableStack`
- ✅ Adds antes/blinds to `gameState.pot`
- ✅ Pays winners by adding `pot` to winner's `tableStack`
- ❌ NEVER modifies `player.bankroll` directly

**Verification**: All games checked - NONE modify `player.bankroll` in game code ✅

---

## Migration Priority

### Immediate
- **Pirate Plunder** - Full platform socket migration needed

### Future Enhancements (All Games)
- Consider adding auto-stand for players who can't afford ante (CK Flipz does this)
- Standardize error handling patterns
- Add comprehensive ante/blind collection logging

---

## Reference Implementations

### Best Example: CK Flipz
- **Why**: Recently migrated, cleanest implementation
- **Frontend**: `games/ck-flipz/frontend/src/CKFlipzApp.tsx`
- **Backend Join Handler**: `platform/backend/src/server.ts:697-750`
- **Ante Collection**: `games/ck-flipz/backend/src/CoinFlipGame.ts:261-273`
- **Initializer**: `games/ck-flipz/backend/src/initializer.ts`

### Use as Template for Pirate Plunder Migration

---

## Related Documentation

- `PLATFORM_SOCKET_PATTERN.md` - Comprehensive platform socket architecture guide
- `PVE_GAME_PATTERNS.md` - PvE-specific patterns (AI spawn, auto-ready)
- `LESSONS_LEARNED.md` - CK Flipz debugging retrospective
- `../packages/game-sdk/README.md` - GameBase class documentation
