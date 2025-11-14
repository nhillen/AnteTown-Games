# Pirate Plunder Configuration System

This directory contains the configuration schema and mapping utilities for Pirate Plunder.

**📖 For complete backoffice integration guide, see:**
[`/BACKOFFICE_CONFIG_GUIDE.md`](../../../../BACKOFFICE_CONFIG_GUIDE.md) in the AnteTown-Games repository root (if exists).

This README documents the internal game package architecture. The backoffice guide shows how to integrate with the platform.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ Game Package (pirate-plunder)                               │
│                                                              │
│  PiratePlunderConfigSchema.ts                               │
│  ├─ Base schema (common fields)                            │
│  ├─ Full config schema (27 sections)                       │
│  └─ Field metadata (for UI generation)                     │
│                                                              │
│  GameConfigMapper.ts                                        │
│  ├─ gameConfigToPiratePlunderConfig() - DB → Game          │
│  ├─ piratePlunderConfigToGameConfig() - Game → DB          │
│  └─ updateParamOverrides() - Partial updates               │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│ Platform Database (GameConfig model)                        │
│                                                              │
│  Generic columns:                                           │
│  ├─ anteAmount → ante                                      │
│  ├─ mode → 'PVP' | 'PVE'                                   │
│  ├─ currency → 'TC' | 'SC' | 'VT'                          │
│  └─ status, environment, etc.                              │
│                                                              │
│  paramOverrides (JSON):                                     │
│  ├─ ante, minBuyIn, maxSeats, rake, rakeCap               │
│  ├─ emoji, description, difficulty                         │
│  └─ fullConfig: { table, betting, payouts, ... }          │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│ Game Logic (PiratePlunderTableConfig)                       │
│                                                              │
│  Typed, validated configuration used by:                    │
│  ├─ PiratePlunderTable (manages game instance)             │
│  ├─ Game rules engine (applies config-driven rules)        │
│  └─ initializePiratePlunder()                              │
└─────────────────────────────────────────────────────────────┘
```

## Usage Examples

### 1. Loading Configs from Database (Platform)

```typescript
import { gameConfigToPiratePlunderConfig } from '@pirate/game-pirate-plunder/backend';
import { prisma } from './db';

// Platform server.ts
async function loadPiratePlunderTables() {
  const dbConfigs = await prisma.gameConfig.findMany({
    where: {
      gameType: 'pirate-plunder',
      status: 'published',
      environment: process.env.NODE_ENV === 'production' ? 'prod' : 'dev'
    }
  });

  // Convert to game-specific format
  const plunderTables = dbConfigs.map(gameConfigToPiratePlunderConfig);

  // Initialize game with tables
  initializePiratePlunder(io, { tables: plunderTables });
}
```

### 2. Creating a New Table Config (Backoffice)

```typescript
import { piratePlunderConfigToGameConfig, validatePiratePlunderConfig } from '@pirate/game-pirate-plunder/backend';
import { PIRATE_PLUNDER_CONFIG_METADATA } from '@pirate/game-pirate-plunder/backend';

// Admin API endpoint
app.post('/api/admin/pirate-plunder/tables', async (req, res) => {
  const plunderConfig = req.body;

  // Validate against schema
  try {
    validatePiratePlunderConfig(plunderConfig);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  // Convert to platform format
  const dbConfig = piratePlunderConfigToGameConfig(plunderConfig);

  // Save to database
  const saved = await prisma.gameConfig.create({
    data: dbConfig
  });

  res.json(saved);
});
```

### 3. Updating Specific Config Sections (Backoffice)

```typescript
import { updateParamOverrides } from '@pirate/game-pirate-plunder/backend';

// Update chest config only
app.patch('/api/admin/pirate-plunder/tables/:id/chest', async (req, res) => {
  const { id } = req.params;
  const { chestConfig } = req.body;

  // Load existing config
  const existing = await prisma.gameConfig.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Not found' });

  // Update only chest configuration
  const updated = updateParamOverrides(existing, {
    fullConfig: { chest: chestConfig }
  });

  // Save back
  const saved = await prisma.gameConfig.update({
    where: { id },
    data: { paramOverrides: updated.paramOverrides }
  });

  res.json(saved);
});
```

### 4. Generating UI Forms (Backoffice)

```typescript
import { PIRATE_PLUNDER_CONFIG_METADATA } from '@pirate/game-pirate-plunder/backend';

// Get schema for UI generation
const schema = PIRATE_PLUNDER_CONFIG_METADATA.configSchema;
const metadata = schema.fieldMetadata;

// Render form fields
Object.entries(schema.baseSchema.shape).forEach(([key, zodType]) => {
  const meta = metadata[key];
  console.log(`
    Field: ${key}
    Label: ${meta?.label}
    Type: ${zodType._def.typeName}
    Group: ${meta?.group}
    Unit: ${meta?.unit}
  `);
});
```

### 5. Example Configs

#### Standard PVP Table
```typescript
const pvpTable: PiratePlunderTableConfig = {
  tableId: 'pirate-pvp-1',
  displayName: 'High Seas Battle',
  mode: 'PVP',
  currency: 'TC',
  ante: 100,
  minBuyIn: 2000,
  maxSeats: 8,
  rake: 5,
  emoji: '🏴‍☠️',
  description: 'Standard PVP Pirate Plunder'
};

// Stored in DB as:
{
  gameId: 'pirate-pvp-1',
  gameType: 'pirate-plunder',
  displayName: 'High Seas Battle',
  anteAmount: 100,
  mode: 'PVP',
  currency: 'TC',
  minBuyInMultiplier: 20,
  rakePercentage: 5,
  paramOverrides: JSON.stringify({
    ante: 100,
    minBuyIn: 2000,
    maxSeats: 8,
    rake: 5,
    emoji: '🏴‍☠️',
    description: 'Standard PVP Pirate Plunder'
  })
}
```

#### PVE (Solo vs Bots) Table
```typescript
const pveTable: PiratePlunderTableConfig = {
  tableId: 'pirate-pve-1',
  displayName: 'Solo Adventure',
  mode: 'PVE',
  currency: 'VT',
  ante: 50,
  minBuyIn: 1000,
  maxSeats: 5,
  rake: 0,  // No rake for practice mode
  emoji: '🦜',
  description: 'Practice against AI pirates',
  difficulty: 'Beginner'
};
```

#### Advanced Table with Full Config
```typescript
const advancedTable: PiratePlunderTableConfig = {
  tableId: 'pirate-advanced-1',
  displayName: 'Legendary Plunder',
  mode: 'PVP',
  currency: 'TC',
  ante: 500,
  minBuyIn: 10000,
  maxSeats: 6,
  rake: 10,
  rakeCap: 5000,
  emoji: '👑',
  description: 'High stakes with progressive jackpot',
  difficulty: 'Advanced',
  fullConfig: {
    chest: {
      drip_percent: 0.15,  // 15% to cargo chest
      carryover: true,
      unfilled_role_to_chest: 0.75,  // 75% of unclaimed payouts
      low_rank_triggers: {
        trips: 0.40,
        quads: 0.70,
        yahtzee: 1.00
      },
      trigger_tiebreak: 'rank_then_time'
    },
    betting: {
      streets: {
        enabled: true,
        S1: 100,
        S2: 300,
        S3: 600,
        s3_multiplier: '2x'
      },
      ante: {
        mode: 'per_player',
        amount: 500,
        every_nth: 5,
        progressive: true,
        street_multiplier: 50
      },
      edge_tiers: {
        enabled: true,
        behind: 0.50,
        co: 0.75,
        leader: 1.00,
        dominant: 1.25
      },
      dominant_threshold: 3,
      rounding: 10
    }
  }
};
```

## Configuration Sections

### Simple Fields (in paramOverrides)
- `ante` - Ante amount (pennies)
- `minBuyIn` - Minimum buy-in (pennies)
- `maxSeats` - Max players (2-8)
- `rake` - Rake percentage (0-100)
- `rakeCap` - Max rake (pennies)
- `emoji` - Lobby icon
- `description` - Table description
- `difficulty` - Skill level

### Full Config Sections (in paramOverrides.fullConfig)

1. **table** - Table settings (minHumanPlayers, targetTotalPlayers, cargoChestLearningMode, tableMinimumMultiplier)
2. **betting** - Betting rules (streets, ante modes, edge tiers, rounding)
3. **payouts** - Role payouts (ship, captain, crew, combos, requirements)
4. **house** - House configuration (rake, rake cap)
5. **chest** - Cargo chest (drip %, triggers, carryover)
6. **bust_fee** - Bust-out fees (amount, destination)
7. **advanced** - Advanced rules (tie resolution, role declaration)
8. **timing** - Phase timers and delays
9. **display** - Display settings (hand history count)
10. **ai_behavior** - AI difficulty and personality
11. **rules_display** - Rules panel sections

See `PiratePlunderConfigSchema.ts` for complete schema definitions.

## Benefits of This Architecture

1. **Type Safety** - Full TypeScript inference from Zod schemas
2. **Runtime Validation** - Validates configs at creation and load time
3. **UI Generation** - Field metadata enables dynamic form generation
4. **Flexible Storage** - paramOverrides JSON field stores game-specific data
5. **Backwards Compatible** - Simple fields work without fullConfig
6. **Maintainable** - Schema changes automatically flow through type system
7. **Self-Documenting** - Schema serves as source of truth

## Migration from Hardcoded Configs

The current platform uses hardcoded table configs in server.ts. These can be migrated to the database using the mapper:

```typescript
import { piratePlunderConfigToGameConfig } from './config/GameConfigMapper';

// Current platform code
const plunderTables = configs.map((config: any) => ({
  tableId: config.gameId,
  displayName: config.displayName,
  ante: config.anteAmount,
  minBuyIn: config.anteAmount * (config.minBuyInMultiplier || 10),
  // ...
}));

// After migration - store in database
async function migratePlunderTables(configs: any[]) {
  for (const config of configs) {
    const tableConfig = {
      tableId: config.gameId,
      displayName: config.displayName,
      mode: config.mode,
      currency: config.currency,
      ante: config.anteAmount,
      minBuyIn: config.anteAmount * (config.minBuyInMultiplier || 10),
      maxSeats: 8,
      rake: config.rakePercentage || 5
    };

    const dbConfig = piratePlunderConfigToGameConfig(tableConfig);

    await prisma.gameConfig.create({
      data: {
        ...dbConfig,
        status: 'published',
        environment: 'prod'
      }
    });
  }
}
```

---

## Integration with Platform Backoffice

This README documents the game package's internal config architecture. For implementing backoffice UI that uses this schema, see the platform documentation.

**Key Pattern:**
1. Game package exports `PIRATE_PLUNDER_CONFIG_METADATA` (defined here)
2. Platform backend exposes schema via `/api/admin/games/schemas/pirate-plunder`
3. Platform frontend fetches schema and generates UI dynamically

This ensures the game package is the single source of truth for configuration structure.
