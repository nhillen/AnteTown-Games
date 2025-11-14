# Table Management Architecture

**Status:** 🚧 Architectural Proposal
**Current State:** Games manage their own table configs (antipattern)
**Proposed State:** Platform-managed table lifecycle with game-defined schemas

---

## Current Problems

### 1. Hardcoded Table Configurations

**Current Pattern:**
```typescript
// games/ck-flipz/backend/src/FlipzTableConfig.ts
export const FLIPZ_TABLES: FlipzTableConfig[] = [
  { tableId: 'coin-low', variant: 'coin-flip', ante: 100, ... },
  { tableId: 'coin-high', variant: 'coin-flip', ante: 500, ... }
];

// Platform calls initialization with hardcoded configs
initializeCKFlipz(io, { tables: FLIPZ_TABLES });
```

**Issues:**
- ❌ Can't dynamically create/remove tables without code changes
- ❌ Can't adjust stakes or settings without redeployment
- ❌ Different environments (dev/staging/prod) need different configs but share code
- ❌ No admin interface for table management
- ❌ Configuration lives in code, not database

### 2. Split Responsibilities

**Currently:**
- Games define table configs ← Should be platform
- Games create table instances ← OK
- Games manage player connections ← Should be platform
- Games handle game logic ← OK

**Problems:**
- Who decides when to create a new table?
- Who tracks which tables are active across all games?
- How do we persist table state?
- How do we scale tables independently?

### 3. No Central Source of Truth

- Each game has its own table config format
- No unified table discovery mechanism
- Can't query "all active tables across all games"
- Can't implement cross-game features (tournaments, table hopping)

---

## Proposed Architecture

### Separation of Concerns

```
┌─────────────────────────────────────────────────────────────┐
│                     PLATFORM LAYER                          │
├─────────────────────────────────────────────────────────────┤
│ - Table CRUD (create, read, update, delete)                │
│ - Table lifecycle (spin up/down instances)                 │
│ - Table discovery & listing                                │
│ - Player routing & matchmaking                             │
│ - Socket.IO connection management                          │
│ - Authentication & session management                      │
│ - Database persistence (table configs, game state)         │
│ - Transaction logging & bankroll management                │
└─────────────────────────────────────────────────────────────┘
                           ▼
                    passes config
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      GAME LAYER                             │
├─────────────────────────────────────────────────────────────┤
│ - Define config schema (what settings game needs)          │
│ - Validate config values                                   │
│ - Implement game rules & logic                             │
│ - Manage game state (current phase, active players)        │
│ - Broadcast state updates to players                       │
│ - Handle player actions within game context                │
│ - Provide default configs for development/testing only     │
└─────────────────────────────────────────────────────────────┘
```

### Platform Responsibilities

#### 1. Database Schema

```typescript
// Platform database schema
interface TableRecord {
  id: string;                      // UUID
  gameId: string;                  // 'ck-flipz', 'houserules-poker', etc.
  displayName: string;             // "High Stakes Poker"
  description: string;
  emoji: string;

  // Status
  status: 'active' | 'paused' | 'archived';
  isListed: boolean;               // Show in lobby?

  // Game-specific configuration (validated against game's schema)
  config: Record<string, unknown>; // JSON blob

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;               // Admin who created it

  // Runtime state (could be separate table)
  currentPlayers: number;
  instanceId?: string;             // Which server instance is running this table
}
```

#### 2. Table Management API

```typescript
class TableManager {
  // CRUD operations
  createTable(gameId: string, config: GameTableConfig): Promise<TableRecord>
  updateTable(tableId: string, updates: Partial<TableRecord>): Promise<TableRecord>
  deleteTable(tableId: string): Promise<void>
  listTables(filters?: TableFilters): Promise<TableRecord[]>
  getTable(tableId: string): Promise<TableRecord>

  // Lifecycle management
  spinUpTable(tableRecord: TableRecord): Promise<GameInstance>
  shutDownTable(tableId: string): Promise<void>

  // Player routing
  findAvailableTable(gameId: string, playerRequirements: PlayerReqs): Promise<TableRecord>
  joinTable(playerId: string, tableId: string): Promise<void>
}
```

#### 3. Admin Interface

- Web UI for creating/editing/deleting tables
- Set stake levels, blind structures, rule modifiers
- Activate/deactivate tables dynamically
- Monitor table utilization and player counts
- Clone tables with modified configs

### Game Responsibilities

#### 1. Config Schema Definition

Games export a schema describing what configuration they accept:

```typescript
// games/ck-flipz/backend/src/index.ts
import { z } from 'zod';

export const CKFlipzConfigSchema = z.object({
  variant: z.enum(['coin-flip', 'card-flip']),
  mode: z.enum(['pvp', 'pve']),
  ante: z.number().positive(),
  rakePercentage: z.number().min(0).max(20).default(5),
  minBuyInMultiplier: z.number().positive().default(5),
  maxSeats: z.literal(2),  // CK Flipz is always 2-player
});

export type CKFlipzConfig = z.infer<typeof CKFlipzConfigSchema>;

export const GAME_METADATA = {
  id: 'ck-flipz',
  name: 'CK Flipz',
  configSchema: CKFlipzConfigSchema,  // Platform uses this for validation
  description: '...',
  // ...
};
```

#### 2. Table Initialization

Games receive validated config from platform:

```typescript
// Platform calls this when spinning up a table instance
export function initializeCKFlipzTable(
  io: SocketIOServer,
  tableRecord: TableRecord,
  config: CKFlipzConfig  // Already validated by platform
): CKFlipzGameInstance {
  // Config is guaranteed to match schema
  // Create game instance for this specific table

  const gameInstance = config.variant === 'coin-flip'
    ? new CoinFlipGame(config)
    : new CardFlipGame(config);

  return {
    gameId: tableRecord.id,
    instance: gameInstance,
    metadata: GAME_METADATA
  };
}
```

#### 3. Default Configs (Dev/Testing Only)

```typescript
// Optional: Provide defaults for development
export const DEV_TABLES: CKFlipzConfig[] = [
  {
    variant: 'coin-flip',
    mode: 'pvp',
    ante: 100,
    maxSeats: 2,
  }
];

// Platform uses these only if DATABASE is empty (first run)
// Or in development mode for quick testing
```

---

## Migration Path

### Phase 1: Platform Infrastructure (Backend)

**In AnteTown platform repository:**

1. **Database Schema**
   - Add `tables` table with fields above
   - Migration script to create table

2. **Table Management Service**
   - Implement `TableManager` class
   - CRUD operations
   - Table lifecycle management

3. **Admin API Endpoints**
   - `POST /api/admin/tables` - Create table
   - `GET /api/admin/tables` - List tables
   - `PUT /api/admin/tables/:id` - Update table
   - `DELETE /api/admin/tables/:id` - Delete table
   - `POST /api/admin/tables/:id/activate` - Activate table
   - `POST /api/admin/tables/:id/deactivate` - Deactivate table

### Phase 2: Admin UI

**In AnteTown platform repository:**

1. **Admin Dashboard**
   - Table list with filters (by game, status)
   - Create/edit table form
   - Validate against game's config schema
   - Real-time player count display

2. **Table Management Interface**
   - Drag-and-drop table reordering
   - Bulk operations (activate/deactivate multiple)
   - Table templates (clone existing configs)

### Phase 3: Game Integration Updates

**In AnteTown-Games repository:**

1. **Update game-sdk**
   - Add schema validation utilities
   - Update `GameBase` to accept platform-provided config
   - Update types to support schema-based configs

2. **Update each game**
   - Export config schema (Zod or similar)
   - Update initialization to accept `TableRecord`
   - Mark hardcoded configs as `DEV_ONLY`
   - Update documentation

3. **Migration Script**
   - Read existing hardcoded table configs
   - Insert into platform database as initial seed data
   - Games continue to work during transition

### Phase 4: Cleanup

1. **Remove hardcoded configs** from games (keep dev configs)
2. **Update deployment scripts** to seed initial tables from JSON
3. **Document admin workflow** for creating new tables

---

## Benefits of New Architecture

### For Platform Operators

✅ **Dynamic table management** - Create/edit/remove tables without deployment
✅ **Environment-specific configs** - Different tables for dev/staging/prod
✅ **A/B testing** - Test different stake levels or rule variations
✅ **Seasonal events** - Temporarily add special tables
✅ **Easy scaling** - Spin up more instances of popular tables

### For Developers

✅ **Clear separation of concerns** - Platform handles infra, games handle logic
✅ **Type-safe configs** - Schema validation prevents invalid configs
✅ **Better testing** - Mock configs easily without touching game code
✅ **Easier game development** - Focus on rules, not table management

### For Players

✅ **More table variety** - Platform can create tables dynamically
✅ **Better matchmaking** - Platform can route to optimal tables
✅ **Tournaments** - Platform can create temporary tournament tables
✅ **Private tables** - Platform can create user-specific tables

---

## Implementation Checklist

### Platform (AnteTown repo) - Required for migration

- [ ] Design database schema for `tables` table
- [ ] Implement `TableManager` service
- [ ] Create admin API endpoints
- [ ] Build admin UI for table management
- [ ] Add schema validation system
- [ ] Update game initialization to use DB configs
- [ ] Create migration script from hardcoded configs

### Games (AnteTown-Games repo) - For each game

- [ ] Define config schema using Zod
- [ ] Export schema in `GAME_METADATA`
- [ ] Update initialization function signature
- [ ] Mark existing `*_TABLES` as `DEV_DEFAULTS`
- [ ] Add schema validation examples to docs
- [ ] Update README with new pattern

### Documentation

- [ ] Document config schema pattern in CLAUDE.md
- [ ] Create admin guide for table management
- [ ] Write migration guide for existing games
- [ ] Update game development tutorial

---

## Open Questions

1. **Table Lifecycle**: When should platform spin up/down table instances?
   - On-demand (when first player joins)?
   - Pre-warmed pool of instances?
   - Persistent instances that never shut down?

2. **Multi-Instance Games**: How do games like Poker (multiple tables) differ from CK Flipz?
   - Does platform create one game instance managing multiple tables?
   - Or one instance per table?

3. **State Persistence**: Should table state persist across restarts?
   - Save ongoing games to DB?
   - Or always start fresh when instance spins up?

4. **Config Versioning**: What happens when game updates its schema?
   - How to migrate existing table configs?
   - Backward compatibility strategy?

5. **Dynamic Matchmaking**: Should platform auto-create tables?
   - "Create table when 2+ players waiting"?
   - Or always have pre-created tables?

---

## Related Documentation

- [Multi-Table Integration](../../games/houserules-poker/docs/multi-table-integration.md) - Poker's current approach
- [Game SDK](../../packages/game-sdk/) - Base classes and types
- Main [CLAUDE.md](../../CLAUDE.md) - Overall architecture

---

**Next Steps**: Discuss with team and decide on implementation priority. This is a significant architectural shift that touches both platform and games, but provides much better separation of concerns and operational flexibility.
