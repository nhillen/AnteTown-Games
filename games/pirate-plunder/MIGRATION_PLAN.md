# Pirate Plunder - Platform Socket Migration Plan

**Date**: 2025-11-17
**Goal**: Migrate Pirate Plunder from old namespace-based pattern to new platform socket pattern
**Reference**: CK Flipz (recently migrated, cleanest implementation)

---

## Current State (Old Pattern)

### Backend
- ❌ Game manages own socket handlers in `backend/src/index.ts`
- ❌ Uses `/pirateplunder` namespace
- ❌ Uses `join` event instead of `join_table`
- ❌ Handles own `sit_down` without platform currency validation
- ❌ No `GameInitializer` interface
- ❌ Not registered with `TableManager`

### Frontend
- ❌ Creates own socket connection to `/pirateplunder` namespace
- ❌ Uses `join` event
- ❌ Manages own balance state

---

## Target State (New Pattern)

### Backend
- ✅ Platform handles all socket events in `server.ts`
- ✅ Uses `/` namespace (main platform socket)
- ✅ Uses `join_table` event routed by platform
- ✅ Platform validates currency before `sit_down`
- ✅ Implements `GameInitializer` interface
- ✅ Registered with `TableManager` for dynamic table creation

### Frontend
- ✅ Uses `useAuth()` socket from platform `AuthProvider`
- ✅ Uses `join_table` event
- ✅ Uses platform balance from `useAuth().user`

---

## Migration Steps

### 1. Backend - Create GameInitializer Interface

**File**: `backend/src/initializer.ts` (NEW FILE)

**Template**: Use `games/ck-flipz/backend/src/initializer.ts` as reference

```typescript
import type { Server as SocketIOServer } from 'socket.io';
import { PiratePlunderTable } from './PiratePlunderTable.js';
import type { GameInitializer } from '@antetown/game-sdk';

export const piratePlunderInitializer: GameInitializer = {
  createInstance(config: any, io?: SocketIOServer): any {
    // Build game config structure
    const gameConfig = {
      maxSeats: config.maxSeats || 8,
      minHumanPlayers: 1,
      targetTotalPlayers: 2,
      betting: {
        ante: {
          mode: config.anteMode || 'per_player',
          amount: config.ante || config.anteAmount || 100
        }
      }
    };

    // Build game options
    const gameOptions = {
      rakePercentage: config.rakePercentage || 5,
      minBuyInMultiplier: config.minBuyInMultiplier || 5
    };

    // Create game instance
    return new PiratePlunderTable(gameConfig, gameOptions);
  },

  destroyInstance(instance: any): void {
    // Cleanup
    if (instance && typeof instance.removeAllListeners === 'function') {
      instance.removeAllListeners();
    }
  },

  validateConfig(config: any): { valid: boolean; error?: string } {
    // Validate ante
    const ante = config.ante || config.anteAmount;
    if (!ante || typeof ante !== 'number' || ante <= 0) {
      return { valid: false, error: 'Invalid ante amount: must be a positive number' };
    }

    // Validate maxSeats
    if (config.maxSeats && (config.maxSeats < 2 || config.maxSeats > 8)) {
      return { valid: false, error: 'Pirate Plunder supports 2-8 seats' };
    }

    return { valid: true };
  },

  getDefaultConfig(): any {
    return {
      variant: 'standard',
      mode: 'pvp',
      ante: 100,
      anteMode: 'per_player',
      maxSeats: 8,
      rakePercentage: 5,
      minBuyInMultiplier: 5,
      currencyCode: 'TC'
    };
  }
};
```

**Changes to `backend/src/index.ts`**:
```typescript
// OLD: Remove initializePiratePlunder function entirely
// NEW: Just export initializer and metadata
export { piratePlunderInitializer } from './initializer.js';
export { GAME_METADATA } from './metadata.js'; // Move metadata to separate file if needed
export { PiratePlunderTable } from './PiratePlunderTable.js';
```

---

### 2. Backend - Update PiratePlunderTable

**File**: `backend/src/PiratePlunderTable.ts`

**Changes Needed**:

1. **Remove constructor's namespace parameter** (no longer needed):
```typescript
// OLD
constructor(config: PiratePlunderTableConfig, nsp: Namespace) {
  this.nsp = nsp;
}

// NEW
constructor(config: PiratePlunderTableConfig) {
  // No namespace needed - platform handles sockets
}
```

2. **Add `registerSocket()` method** (for platform to call):
```typescript
public registerSocket(socket: Socket, player: Player): void {
  // Store socket mapping
  this.socketMap.set(player.id, socket);

  // Register player in game
  this.handleJoin(socket, player);

  // Send initial state
  socket.emit('table_joined', {
    tableId: this.config.tableId,
    state: this.getGameState()
  });
}
```

3. **Keep internal game logic** - `handleSitDown()`, `handlePlayerAction()`, etc. stay the same

---

### 3. Platform - Register Game with TableManager

**File**: `platform/backend/src/server.ts`

**Add to imports** (around line 37):
```typescript
const { piratePlunderInitializer, GAME_METADATA: PLUNDER_METADATA } = require('@antetown/game-pirate-plunder');
```

**Register with TableManager** (around line 290):
```typescript
// Register game types with TableManager
tableManager.registerGame('ck-flipz', ckFlipzInitializer);
tableManager.registerGame('war-faire', warFaireInitializer);
tableManager.registerGame('houserules-poker', pokerInitializer);
tableManager.registerGame('pirate-plunder', piratePlunderInitializer);  // ← ADD THIS
```

**Remove old initialization** (around line 441):
```typescript
// OLD - DELETE THIS ENTIRE BLOCK
const plunderConfigs = await loadPiratePlunderConfigs();
const piratePlunderResult = initializePiratePlunder(io, {
  namespace: '/pirateplunder',
  tables: plunderConfigs
});
```

---

### 4. Platform - Add Join Handler

**File**: `platform/backend/src/server.ts`

**Add to join_table switch** (around line 650):
```typescript
switch (tableInstance.gameType) {
  case 'ck-flipz':
    handleCKFlipzJoin(socket, tableId, { game: tableInstance.game, config: tableInstance.config, io });
    break;
  case 'war-faire':
    handleWarFaireJoin(socket, tableId, { game: tableInstance.game, config: tableInstance.config });
    break;
  case 'houserules-poker':
    handlePokerJoin(socket, tableId, { game: tableInstance.game, config: tableInstance.config });
    break;
  case 'pirate-plunder':  // ← ADD THIS
    handlePlunderJoin(socket, tableId, { game: tableInstance.game, config: tableInstance.config });
    break;
  default:
    socket.emit('error', { message: `Unknown game type: ${tableInstance.gameType}` });
}
```

**Add join handler function** (after `handlePokerJoin` around line 1350):
```typescript
// Pirate Plunder join handler
async function handlePlunderJoin(socket: any, tableId: string, tableInstance: any) {
  console.log(`[Server] 🏴‍☠️ handlePlunderJoin called for table ${tableId}, socket ${socket.id}`);
  const { game, config } = tableInstance;

  // Get player info from socket auth
  const googleId = socket.handshake.auth.userId;
  const username = socket.handshake.auth.username;

  if (!googleId || !username) {
    socket.emit('error', { message: 'Authentication required' });
    return;
  }

  console.log(`[Server] 🏴‍☠️ Player ${username} (${googleId}) joining Pirate Plunder table ${tableId}`);

  // Load player data from database
  const currencyCode = config.currencyCode || 'TC';
  const bankroll = await currencyManager.getBalance(googleId, currencyCode);

  console.log(`[Server] 🏴‍☠️ Player ${username} bankroll: ${bankroll} ${currencyCode}`);

  // Get cosmetics
  const dbUser = await prisma.user.findUnique({
    where: { googleId },
    select: { gameCosmetics: true }
  });

  // Create player object
  const player = {
    id: googleId,
    name: username,
    bankroll,
    isAI: false,
    cosmetics: dbUser?.gameCosmetics || {},
    tableStack: 0
  };

  // Register with game
  game.registerSocket(socket, player);

  console.log(`[Server] 🏴‍☠️ Player ${username} successfully joined Pirate Plunder table ${tableId}`);
}
```

---

### 5. Frontend - Use Platform Socket

**File**: `frontend/src/PiratePlunderApp.tsx` (or main game component)

**Changes**:

1. **Remove socket creation**:
```typescript
// OLD - DELETE
import { io } from 'socket.io-client';
const socket = io(BACKEND_URL + '/pirateplunder');

// NEW - USE PLATFORM SOCKET
import { useAuth } from '@/components/AuthProvider';
const { socket, user } = useAuth();
```

2. **Use `join_table` event**:
```typescript
// OLD
socket.emit('join', { name: username, bankroll, tableId });

// NEW
socket.emit('join_table', { tableId: selectedTable });
```

3. **Listen for `table_joined` event**:
```typescript
// NEW - Platform confirms join
socket.on('table_joined', (data: { tableId: string; state: GameState }) => {
  console.log('Joined Pirate Plunder table:', data.tableId);
  setGameState(data.state);

  // Auto-sit at first available seat
  const isAlreadySeated = data.state.seats.some(s => s?.playerId === socket.id);
  if (!isAlreadySeated) {
    const emptySeatIndex = data.state.seats.findIndex(s => !s || !s.playerId);
    if (emptySeatIndex !== -1) {
      const minBuyIn = data.state.ante * 5;
      socket.emit('sit_down', {
        tableId: data.tableId,
        seatIndex: emptySeatIndex,
        buyInAmount: minBuyIn
      });
    }
  }
});
```

4. **Use platform balance**:
```typescript
// OLD
const [balance, setBalance] = useState(0);

// NEW
const { user } = useAuth();
// Use user.bankroll for display
```

---

### 6. Platform - Update Database Configs

**Migration**: Create Pirate Plunder table configs in database

```sql
-- Example: Create PvE and PvP tables
INSERT INTO "GameConfig" ("gameId", "gameType", "anteAmount", "currency", "status", "environment", "paramOverrides")
VALUES
  ('plunder-pve-100', 'pirate-plunder', 100, 'TC', 'published', 'prod', '{"mode": "pve", "anteMode": "per_player", "maxSeats": 8}'),
  ('plunder-pvp-100', 'pirate-plunder', 100, 'TC', 'published', 'prod', '{"mode": "pvp", "anteMode": "per_player", "maxSeats": 8}'),
  ('plunder-pvp-500', 'pirate-plunder', 500, 'TC', 'published', 'prod', '{"mode": "pvp", "anteMode": "per_player", "maxSeats": 8}');
```

---

## Testing Checklist

### Backend Tests
- [ ] Game initializer creates instance correctly
- [ ] Config validation catches invalid antes
- [ ] `registerSocket()` adds player to game
- [ ] Platform join handler loads player from database
- [ ] Platform `sit_down` validates currency before deducting

### Frontend Tests
- [ ] Uses platform socket (not creating own)
- [ ] `join_table` event routes to correct table
- [ ] `table_joined` event received with game state
- [ ] Auto-sit works after joining
- [ ] Balance updates come from platform

### Integration Tests
- [ ] Join PvE table → AI spawns
- [ ] Join PvP table → Waiting for opponent
- [ ] Second player joins → Both can ready up
- [ ] Ante collection works (pot shows correct amount)
- [ ] Buy-in deducts from database
- [ ] Cash-out credits back to database

---

## Rollback Plan

If migration fails:
1. Revert `backend/src/index.ts` to export `initializePiratePlunder`
2. Revert `platform/backend/src/server.ts` to old initialization (around line 441)
3. Revert frontend to use `/pirateplunder` namespace
4. Redeploy with `./scripts/deploy-external-game.sh pirate-plunder`

---

## Deployment Order

1. **Backend changes** (AnteTown-Games repo):
   - Create `backend/src/initializer.ts`
   - Update `backend/src/index.ts` exports
   - Update `backend/src/PiratePlunderTable.ts`
   - Build: `cd games/pirate-plunder && npm run build`

2. **Platform changes** (AnteTown-Platform repo):
   - Update `platform/backend/src/server.ts`
   - Remove old initialization, add join handler
   - Register with TableManager

3. **Frontend changes** (AnteTown-Games repo):
   - Update `frontend/src/PiratePlunderApp.tsx`
   - Use `useAuth()` socket
   - Use `join_table` event

4. **Deploy**:
   ```bash
   ./scripts/deploy-external-game.sh pirate-plunder
   ```

---

## Risk Assessment

### Low Risk
- Ante collection logic already correct ✅
- Game logic doesn't need changes ✅
- Platform pattern proven with 3 other games ✅

### Medium Risk
- Pirate Plunder has complex ante modes (per_player, button, every_nth)
- Need to ensure `paramOverrides` JSON handles all modes

### Mitigation
- Test all ante modes thoroughly
- Keep old initialization code commented out for quick rollback
- Deploy to dev environment first

---

## Time Estimate

- Backend initializer: 30 minutes
- Platform join handler: 30 minutes
- Frontend socket migration: 1 hour
- Testing: 1 hour
- **Total: ~3 hours**

---

## Reference Files

### Backend Template
- `games/ck-flipz/backend/src/initializer.ts` - GameInitializer implementation
- `games/ck-flipz/backend/src/CoinFlipGame.ts:95-124` - AI auto-spawn pattern
- `games/ck-flipz/backend/src/CoinFlipGame.ts:261-273` - Ante collection pattern

### Platform Template
- `platform/backend/src/server.ts:697-750` - `handleCKFlipzJoin` implementation
- `platform/backend/src/server.ts:290-330` - TableManager registration

### Frontend Template
- `games/ck-flipz/frontend/src/CKFlipzApp.tsx` - Platform socket usage
- `platform/frontend/src/components/AuthProvider.tsx` - Socket context

---

## Related Documentation
- `../../docs/PLATFORM_SOCKET_PATTERN.md` - Platform socket architecture
- `../../docs/GAME_PATTERNS_AUDIT.md` - Current state audit
- `../../docs/PVE_GAME_PATTERNS.md` - PvE implementation patterns
