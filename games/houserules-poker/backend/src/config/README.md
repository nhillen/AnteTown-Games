# Poker Configuration System

This directory contains the configuration schema and mapping utilities for House Rules Poker.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ Game Package (houserules-poker)                             │
│                                                              │
│  PokerConfigSchema.ts                                       │
│  ├─ Base schema (common fields)                            │
│  ├─ Variant schemas (squidz, omaha, etc.)                  │
│  └─ Field metadata (for UI generation)                     │
│                                                              │
│  GameConfigMapper.ts                                        │
│  ├─ gameConfigToPokerConfig() - DB → Game                  │
│  ├─ pokerConfigToGameConfig() - Game → DB                  │
│  └─ updateParamOverrides() - Partial updates               │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│ Platform Database (GameConfig model)                        │
│                                                              │
│  Generic columns:                                           │
│  ├─ anteAmount → bigBlind                                  │
│  ├─ variant → 'holdem' | 'squidz-game'                     │
│  └─ status, environment, etc.                              │
│                                                              │
│  paramOverrides (JSON):                                     │
│  ├─ smallBlind, bigBlind, minBuyIn, maxBuyIn               │
│  ├─ maxSeats, emoji, description, difficulty               │
│  └─ rules: { squidzConfig: {...}, ... }                    │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│ Game Logic (PokerTableConfig)                               │
│                                                              │
│  Typed, validated configuration used by:                    │
│  ├─ TableRegistry (manages table instances)                │
│  ├─ RulesEngine (applies variant-specific rules)           │
│  └─ HouseRules game instance                               │
└─────────────────────────────────────────────────────────────┘
```

## Usage Examples

### 1. Loading Configs from Database (Platform)

```typescript
import { gameConfigToPokerConfig } from '@pirate/game-houserules-poker/backend';
import { prisma } from './db';

// Platform server.ts
async function loadPokerTables() {
  const dbConfigs = await prisma.gameConfig.findMany({
    where: {
      gameType: 'houserules-poker',
      status: 'published',
      environment: process.env.NODE_ENV === 'production' ? 'prod' : 'dev'
    }
  });

  // Convert to game-specific format
  const pokerTables = dbConfigs.map(gameConfigToPokerConfig);

  // Initialize game with tables
  initializeHouseRulesPoker(io, { tables: pokerTables });
}
```

### 2. Creating a New Table Config (Backoffice)

```typescript
import { pokerConfigToGameConfig, validatePokerConfig } from '@pirate/game-houserules-poker/backend';
import { POKER_CONFIG_METADATA } from '@pirate/game-houserules-poker/backend';

// Admin API endpoint
app.post('/api/admin/poker/tables', async (req, res) => {
  const pokerConfig = req.body;

  // Validate against schema
  try {
    validatePokerConfig(pokerConfig, pokerConfig.variant);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  // Convert to platform format
  const dbConfig = pokerConfigToGameConfig(pokerConfig);

  // Save to database
  const saved = await prisma.gameConfig.create({
    data: dbConfig
  });

  res.json(saved);
});
```

### 3. Editing Squidz-Specific Rules (Backoffice)

```typescript
import { updateParamOverrides } from '@pirate/game-houserules-poker/backend';

// Update squidz config only
app.patch('/api/admin/poker/tables/:id/squidz', async (req, res) => {
  const { id } = req.params;
  const { squidzConfig } = req.body;

  // Load existing config
  const existing = await prisma.gameConfig.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Not found' });

  // Update only squidz rules
  const updated = updateParamOverrides(existing, {
    rules: { squidzConfig }
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
import { POKER_CONFIG_METADATA } from '@pirate/game-houserules-poker/backend';

// Get schema for UI generation
const schema = POKER_CONFIG_METADATA.configSchema;
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

// For squidz variant, also show variant fields
const squidzSchema = schema.variantSchemas['squidz-game'];
// ... render squidz-specific fields
```

### 5. Example Configs

#### Classic Hold'em Table
```typescript
const holdemTable: PokerTableConfig = {
  tableId: 'classic-holdem-1',
  displayName: 'Classic Hold\'em',
  variant: 'holdem',
  rules: {},
  smallBlind: 50,
  bigBlind: 100,
  minBuyIn: 2000,
  maxBuyIn: 10000,
  maxSeats: 9,
  emoji: '♠️',
  description: 'Standard Texas Hold\'em poker',
  currentPlayers: 0,
  isActive: true
};

// Stored in DB as:
{
  gameId: 'classic-holdem-1',
  gameType: 'houserules-poker',
  displayName: 'Classic Hold\'em',
  anteAmount: 100,  // bigBlind
  variant: 'holdem',
  paramOverrides: JSON.stringify({
    smallBlind: 50,
    bigBlind: 100,
    minBuyIn: 2000,
    maxBuyIn: 10000,
    maxSeats: 9,
    emoji: '♠️',
    description: 'Standard Texas Hold\'em poker',
    rules: {}
  })
}
```

#### Squidz Game Table
```typescript
const squidzTable: PokerTableConfig = {
  tableId: 'squidz-game-1',
  displayName: 'Squidz Game',
  variant: 'squidz-game',
  rules: {
    squidzConfig: {
      baseSquidValueType: 'bigBlind',
      baseSquidValue: 1,
      squidzFormula: 'players + 3'
    }
  },
  smallBlind: 100,
  bigBlind: 200,
  minBuyIn: 10000,
  maxBuyIn: 10000,
  maxSeats: 8,
  emoji: '🦑',
  description: 'High stakes bounty poker with squid collection',
  difficulty: 'Advanced',
  currentPlayers: 0,
  isActive: true
};

// Stored in DB as:
{
  gameId: 'squidz-game-1',
  gameType: 'houserules-poker',
  displayName: 'Squidz Game',
  anteAmount: 200,
  variant: 'squidz-game',
  paramOverrides: JSON.stringify({
    smallBlind: 100,
    bigBlind: 200,
    minBuyIn: 10000,
    maxBuyIn: 10000,
    maxSeats: 8,
    emoji: '🦑',
    description: 'High stakes bounty poker with squid collection',
    difficulty: 'Advanced',
    rules: {
      squidzConfig: {
        baseSquidValueType: 'bigBlind',
        baseSquidValue: 1,
        squidzFormula: 'players + 3'
      }
    }
  })
}
```

## Benefits of This Architecture

1. **Type Safety** - Full TypeScript inference from schemas
2. **Runtime Validation** - Zod validates configs at creation and load time
3. **Variant Support** - Each variant can define its own config extensions
4. **UI Generation** - Field metadata enables dynamic form generation
5. **Flexible Storage** - paramOverrides JSON field stores game-specific data
6. **Maintainable** - Schema changes automatically flow through type system
7. **Self-Documenting** - Schema serves as source of truth for config structure

## Adding a New Variant

1. Define variant schema in `PokerConfigSchema.ts`:
```typescript
const myVariantSchema = z.object({
  rules: z.object({
    myVariantConfig: z.object({
      specialRule: z.boolean()
    })
  })
});
```

2. Add to variant schemas:
```typescript
export const POKER_CONFIG_SCHEMA: ConfigSchemaDefinition = {
  baseSchema: pokerBaseSchema,
  variantSchemas: {
    'holdem': holdemSchema,
    'squidz-game': squidzGameSchema,
    'my-variant': myVariantSchema  // ← Add here
  },
  fieldMetadata
};
```

3. Add metadata:
```typescript
export const POKER_CONFIG_METADATA: GameConfigMetadata = {
  // ...
  variants: [
    // ...
    {
      id: 'my-variant',
      displayName: 'My Custom Variant',
      description: 'Description of variant'
    }
  ]
};
```

4. The mapper and validation will automatically handle it!

## Migration from Hardcoded Configs

The `DEFAULT_TABLES` in `TableConfig.ts` can be migrated to the database:

```typescript
import { DEFAULT_TABLES } from './lobby/TableConfig';
import { pokerConfigToGameConfig } from './config/GameConfigMapper';

// One-time migration
async function migrateDefaultTables() {
  for (const table of DEFAULT_TABLES) {
    const dbConfig = pokerConfigToGameConfig(table);
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
