# Table Management Architecture

**Status:** ✅ Implemented
**Current State:** Platform-managed table lifecycle with GameInitializer pattern

---

## Architecture Overview

The table management system uses a **centralized TableManager** in the platform that coordinates all table instances across all games. Games provide **GameInitializer** implementations that the platform uses to create, validate, and destroy game instances.

```
┌─────────────────────────────────────────────────────────────┐
│                PLATFORM (AnteTown-Platform)                 │
├─────────────────────────────────────────────────────────────┤
│ TableManager                                                │
│  ├─ Registers GameInitializers from all games              │
│  ├─ Creates/destroys table instances dynamically           │
│  ├─ Tracks table metadata (context, lifecycle, status)     │
│  ├─ Monitors player counts (total + human)                 │
│  ├─ Auto-cleanup empty/AI-only tables                      │
│  └─ Provides table discovery API                           │
└─────────────────────────────────────────────────────────────┘
                           ▼
                  calls GameInitializer
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  GAME (AnteTown-Games)                      │
├─────────────────────────────────────────────────────────────┤
│ GameInitializer                                             │
│  ├─ createInstance(config) → GameInstance                  │
│  ├─ destroyInstance(instance) → cleanup                    │
│  ├─ validateConfig(config) → { valid, error? }             │
│  └─ getDefaultConfig() → default config                    │
│                                                             │
│ Game Class (extends GameBase)                              │
│  ├─ Implements game rules & logic                          │
│  ├─ Manages game state                                     │
│  ├─ Handles player actions                                 │
│  └─ Broadcasts state updates                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Platform Layer (AnteTown-Platform)

### TableManager Service

**Location:** `platform/backend/src/services/TableManager.ts`

**Key Features:**
- **Dynamic table creation** - Create tables on-demand from any source
- **Table contexts** - System, guild, tournament, player, event
- **Lifecycle management** - Permanent vs temporary tables
- **Auto-cleanup** - Empty/AI-only tables cleaned after 30min idle
- **Player tracking** - Tracks total and human player counts separately

**Table Contexts:**
```typescript
type TableContextType = 'system' | 'guild' | 'tournament' | 'player' | 'event';

// Examples:
{ type: 'system' }                                    // System table from GameConfig
{ type: 'guild', contextId: 'guild-123' }            // Guild-specific table
{ type: 'tournament', contextId: 'tournament-456' }  // Tournament bracket table
{ type: 'player', createdBy: 'user-789' }            // Player-created private table
```

**Table Lifecycle:**
- `permanent` - Never auto-cleanup (system tables)
- `temporary` - Auto-cleanup when empty/AI-only after 30min idle

**Auto-Cleanup Rules:**
- ✅ Tables with 0 human players + 30min idle → cleanup
- ✅ Tables with only AI players + 30min idle → cleanup
- ❌ Tables with ≥1 human player → never auto-cleanup

### Tables API

**Location:** `platform/backend/src/routes/tables.ts`

**Endpoints:**
```
GET    /api/tables              - List tables (filter by gameType, context, status)
GET    /api/tables/:tableId     - Get specific table details
GET    /api/tables/stats        - Table statistics
POST   /api/tables/create       - Create dynamic table
DELETE /api/tables/:tableId     - Close table
```

**Example: Create Guild Table**
```typescript
POST /api/tables/create
{
  "gameType": "ck-flipz",
  "displayName": "Warriors Guild Flipz",
  "config": {
    "variant": "coin-flip",
    "ante": 500,
    "mode": "pvp",
    "maxSeats": 2
  },
  "context": {
    "type": "guild",
    "contextId": "guild-warriors-123",
    "createdBy": "user-456"
  },
  "lifecycle": "temporary"
}
```

---

## Game Layer (AnteTown-Games)

### GameInitializer Pattern

Each game exports a **GameInitializer** that implements this interface:

```typescript
export interface GameInitializer {
  /**
   * Create a new game instance from config
   */
  createInstance(config: any, io?: SocketIOServer): any;

  /**
   * Destroy a game instance (cleanup timers, listeners, etc.)
   */
  destroyInstance?(instance: any): void;

  /**
   * Validate config before creating instance
   */
  validateConfig?(config: any): { valid: boolean; error?: string };

  /**
   * Get default config for this game type
   */
  getDefaultConfig?(): any;
}
```

### Implementation Examples

**CK Flipz** (`games/ck-flipz/backend/src/initializer.ts`):
```typescript
export const ckFlipzInitializer: GameInitializer = {
  createInstance(config: any, io?: any) {
    if (config.variant === 'coin-flip') {
      return new CoinFlipGame(config, { rakePercentage: config.rakePercentage });
    } else {
      return new CardFlipGame(config, { rakePercentage: config.rakePercentage });
    }
  },

  validateConfig(config: any) {
    if (!config.ante || config.ante <= 0) {
      return { valid: false, error: 'Invalid ante amount' };
    }
    if (config.maxSeats !== 2) {
      return { valid: false, error: 'CK Flipz only supports 2 seats' };
    }
    return { valid: true };
  },

  getDefaultConfig() {
    return { variant: 'coin-flip', mode: 'pvp', ante: 100, maxSeats: 2 };
  }
};
```

**War Faire** (`games/war-faire/src/initializer.ts`):
```typescript
export const warFaireInitializer: GameInitializer = {
  createInstance(config: any, io?: any) {
    return new WarFaireGame({
      tableId: config.tableId,
      mode: config.mode || 'pvp',
      ante: config.ante || 5,
      maxSeats: config.maxSeats || 10,
      minSeats: config.minSeats || 4,
      // ... other config
    });
  },

  validateConfig(config: any) {
    if (config.maxSeats && (config.maxSeats < 4 || config.maxSeats > 10)) {
      return { valid: false, error: 'War Faire supports 4-10 players' };
    }
    return { valid: true };
  }
};
```

**HouseRules Poker** (`games/houserules-poker/backend/src/initializer.ts`):
```typescript
export const pokerInitializer: GameInitializer = {
  createInstance(config: any, io?: any) {
    // Convert platform config to PokerTableConfig if needed
    const pokerConfig = config.bigBlind
      ? config  // Already PokerTableConfig
      : gameConfigToPokerConfig(config);  // Convert from platform format

    return new HouseRules(pokerConfig);
  },

  validateConfig(config: any) {
    // Use existing poker validation
    try {
      const pokerConfig = gameConfigToPokerConfig(config);
      validatePokerConfig(pokerConfig, pokerConfig.variant);
      return { valid: true };
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }
};
```

---

## Integration Flow

### 1. Game Registration (Server Startup)

**Platform:** `platform/backend/src/server.ts`

```typescript
// Import game initializers
const { ckFlipzInitializer } = require('@pirate/game-ck-flipz');
const { warFaireInitializer } = require('@pirate/game-warfaire');
const { pokerInitializer } = await import('@pirate/game-houserules');

// Register with TableManager
tableManager.registerGame('ck-flipz', ckFlipzInitializer);
tableManager.registerGame('war-faire', warFaireInitializer);
tableManager.registerGame('houserules-poker', pokerInitializer);
```

### 2. System Table Creation (Database → Tables)

```typescript
// Load configs from database
const configs = await prisma.gameConfig.findMany({
  where: { gameType: 'ck-flipz', status: 'published' }
});

// Create system tables via TableManager
for (const config of configs) {
  await tableManager.createTable({
    gameType: 'ck-flipz',
    baseConfigId: config.gameId,
    displayName: config.displayName,
    config: {
      variant: config.variant,
      ante: config.anteAmount,
      maxSeats: config.maxSeats,
      // ... other fields
    },
    context: { type: 'system' },
    lifecycle: 'permanent'
  }, io);
}
```

### 3. Player Joins Table

```typescript
socket.on('join_table', (data: { tableId: string }) => {
  // Get table from TableManager
  const tableInstance = tableManager.getTable(data.tableId);

  if (!tableInstance) {
    socket.emit('error', { message: 'Table not found' });
    return;
  }

  // Update activity timestamp
  tableManager.touchTable(data.tableId);

  // Route to game-specific handler
  switch (tableInstance.gameType) {
    case 'ck-flipz':
      handleCKFlipzJoin(socket, data.tableId, tableInstance);
      break;
    case 'war-faire':
      handleWarFaireJoin(socket, data.tableId, tableInstance);
      break;
    // ... etc
  }
});
```

### 4. Player Count Updates

```typescript
// After player sits or stands
const humanCount = gameState.seats.filter(s => s && !s.isAI).length;
const totalCount = gameState.seats.filter(s => s).length;

tableManager.updatePlayerCount(tableId, totalCount, humanCount);
```

### 5. Auto-Cleanup (Every 5 Minutes)

```typescript
// Runs automatically in TableManager
cleanupEmptyTables(30) {  // 30-minute threshold
  for (const [tableId, instance] of this.tables.entries()) {
    // Skip if table has human players
    if (instance.metadata.currentHumanPlayers > 0) continue;

    // Check idle time
    if (idleTime < 30min) continue;

    // Cleanup: empty or AI-only
    this.closeTable(tableId);
  }
}
```

---

## Current Implementation Status

### Implemented Games
- ✅ **CK Flipz** - Full TableManager integration
- ✅ **War Faire** - Full TableManager integration
- ✅ **HouseRules Poker** - Full TableManager integration
- ⏳ **Pirate Plunder** - Still uses legacy `initializePiratePlunder()` pattern

### Features
- ✅ Dynamic table creation via API
- ✅ Table context tracking (system, guild, tournament, etc.)
- ✅ Player count tracking (human vs AI)
- ✅ Auto-cleanup of empty/AI-only tables
- ✅ Table lifecycle management
- ✅ Unified table discovery
- ✅ Activity timestamp tracking

### Not Yet Implemented
- ⏳ Admin UI for table creation (API exists, UI TODO)
- ⏳ Guild table creation UI
- ⏳ Tournament table spawning system
- ⏳ Player-created private tables UI

---

## Documentation

**Platform:**
- [TABLE_MANAGEMENT.md](../../../AnteTown-Platform/platform/backend/docs/TABLE_MANAGEMENT.md) - Complete platform implementation guide

**Games:**
- See each game's `initializer.ts` for implementation examples
- CK Flipz: Simplest reference implementation
- War Faire: Medium complexity
- Poker: Advanced with config mapper

---

**Next Steps:**
1. Migrate Pirate Plunder to GameInitializer pattern
2. Build admin UI for dynamic table creation
3. Implement guild table creation workflow
4. Build tournament bracket table spawning
