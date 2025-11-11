# Backoffice Configuration Guide

This guide explains how to integrate game-specific configuration schemas with your backoffice tooling.

## Overview

Games now export structured configuration schemas that:
- Define required and optional fields
- Specify variant-specific overrides
- Provide validation rules
- Include metadata for UI generation
- Handle mapping between database and game formats

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Game Package                                            │
│  Exports: POKER_CONFIG_SCHEMA, gameConfigToPokerConfig │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ Platform Database (GameConfig)                          │
│  - Generic columns (anteAmount, variant, etc.)          │
│  - paramOverrides JSON (game-specific fields)           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ Backoffice UI                                           │
│  - Reads schema to generate forms                       │
│  - Validates input before saving                        │
│  - Shows variant-specific fields dynamically            │
└─────────────────────────────────────────────────────────┘
```

## Using Schemas in Backoffice

### 1. Import Game Schema

```typescript
// In your backoffice API
import {
  POKER_CONFIG_METADATA,
  validatePokerConfig,
  gameConfigToPokerConfig,
  pokerConfigToGameConfig
} from '@pirate/game-houserules';

// Get schema for a game type
const schema = POKER_CONFIG_METADATA.configSchema;
const variants = POKER_CONFIG_METADATA.variants;
```

### 2. Generate Form UI

```typescript
// Extract base fields and metadata
const baseFields = schema.baseSchema.shape;
const metadata = schema.fieldMetadata;

// Example: Generate form fields
function renderConfigForm(variant: string) {
  const fields = [];

  // Render base fields
  for (const [key, zodType] of Object.entries(baseFields)) {
    const meta = metadata[key];

    fields.push({
      name: key,
      label: meta?.label || key,
      description: meta?.description,
      type: getInputType(zodType),
      group: meta?.group || 'General',
      displayOrder: meta?.displayOrder || 999,
      unit: meta?.unit,
      min: meta?.min,
      max: meta?.max,
      step: meta?.step
    });
  }

  // Add variant-specific fields
  if (variant && schema.variantSchemas?.[variant]) {
    const variantSchema = schema.variantSchemas[variant];
    // ... extract variant fields similarly
  }

  // Sort by displayOrder and group
  return fields.sort((a, b) => {
    if (a.group !== b.group) {
      return a.group.localeCompare(b.group);
    }
    return a.displayOrder - b.displayOrder;
  });
}

// Helper to determine input type
function getInputType(zodType: any): string {
  const typeName = zodType._def.typeName;

  switch (typeName) {
    case 'ZodNumber':
      return 'number';
    case 'ZodString':
      return 'text';
    case 'ZodBoolean':
      return 'checkbox';
    case 'ZodEnum':
      return 'select';
    default:
      return 'text';
  }
}
```

### 3. Validate User Input

```typescript
// POST /api/admin/poker/tables
app.post('/api/admin/poker/tables', async (req, res) => {
  try {
    const config = req.body;

    // Validate using game's schema
    validatePokerConfig(config, config.variant);

    // Convert to platform format
    const dbConfig = pokerConfigToGameConfig(config);

    // Save to database
    const saved = await prisma.gameConfig.create({
      data: {
        ...dbConfig,
        status: 'draft',
        environment: 'dev',
        createdBy: req.user.id
      }
    });

    res.json(saved);
  } catch (error) {
    res.status(400).json({
      error: 'Invalid configuration',
      details: error.message
    });
  }
});
```

### 4. Load Configs for Editing

```typescript
// GET /api/admin/poker/tables/:id
app.get('/api/admin/poker/tables/:id', async (req, res) => {
  const dbConfig = await prisma.gameConfig.findUnique({
    where: { id: req.params.id }
  });

  if (!dbConfig) {
    return res.status(404).json({ error: 'Not found' });
  }

  // Convert to game-specific format for editing
  const pokerConfig = gameConfigToPokerConfig(dbConfig);

  res.json({
    // Platform fields
    id: dbConfig.id,
    status: dbConfig.status,
    environment: dbConfig.environment,
    createdAt: dbConfig.createdAt,

    // Game-specific config
    config: pokerConfig,

    // Available variants
    availableVariants: POKER_CONFIG_METADATA.variants
  });
});
```

### 5. Update Configs

```typescript
// PATCH /api/admin/poker/tables/:id
app.patch('/api/admin/poker/tables/:id', async (req, res) => {
  const existing = await prisma.gameConfig.findUnique({
    where: { id: req.params.id }
  });

  if (!existing) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const updates = req.body;

    // Validate updates
    validatePokerConfig(updates, updates.variant);

    // Convert to DB format
    const dbConfig = pokerConfigToGameConfig(updates, existing);

    // Update in database
    const saved = await prisma.gameConfig.update({
      where: { id: req.params.id },
      data: {
        ...dbConfig,
        updatedAt: new Date()
      }
    });

    // Create audit log
    await prisma.configAuditLog.create({
      data: {
        configId: saved.id,
        changeType: 'update',
        changedBy: req.user.id,
        beforeData: JSON.stringify(existing),
        afterData: JSON.stringify(saved),
        environment: saved.environment
      }
    });

    res.json(saved);
  } catch (error) {
    res.status(400).json({
      error: 'Invalid configuration',
      details: error.message
    });
  }
});
```

### 6. Handle Variant-Specific Updates

```typescript
// PATCH /api/admin/poker/tables/:id/squidz
app.patch('/api/admin/poker/tables/:id/squidz', async (req, res) => {
  const existing = await prisma.gameConfig.findUnique({
    where: { id: req.params.id }
  });

  if (!existing || existing.variant !== 'squidz-game') {
    return res.status(400).json({
      error: 'Can only update squidz config on squidz-game tables'
    });
  }

  const { squidzConfig } = req.body;

  // Parse existing paramOverrides
  let overrides = {};
  if (existing.paramOverrides) {
    overrides = JSON.parse(existing.paramOverrides);
  }

  // Update squidz config
  overrides.rules = {
    ...overrides.rules,
    squidzConfig
  };

  // Validate the full config
  const fullConfig = gameConfigToPokerConfig({
    ...existing,
    paramOverrides: JSON.stringify(overrides)
  });

  validatePokerConfig(fullConfig, 'squidz-game');

  // Save back
  const saved = await prisma.gameConfig.update({
    where: { id: req.params.id },
    data: {
      paramOverrides: JSON.stringify(overrides),
      updatedAt: new Date()
    }
  });

  res.json(saved);
});
```

## Example UI Component (React)

```typescript
import { useState, useEffect } from 'react';
import { POKER_CONFIG_METADATA } from '@pirate/game-houserules';

function PokerConfigForm({ tableId }: { tableId?: string }) {
  const [config, setConfig] = useState<any>({});
  const [variant, setVariant] = useState('holdem');
  const [fields, setFields] = useState<any[]>([]);

  useEffect(() => {
    // Generate form fields based on variant
    const schema = POKER_CONFIG_METADATA.configSchema;
    const baseFields = generateFields(schema.baseSchema, schema.fieldMetadata);

    let variantFields = [];
    if (variant && schema.variantSchemas?.[variant]) {
      variantFields = generateFields(
        schema.variantSchemas[variant],
        schema.fieldMetadata
      );
    }

    setFields([...baseFields, ...variantFields]);
  }, [variant]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const url = tableId
      ? `/api/admin/poker/tables/${tableId}`
      : '/api/admin/poker/tables';

    const method = tableId ? 'PATCH' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });

    if (response.ok) {
      alert('Saved successfully!');
    } else {
      const error = await response.json();
      alert(`Error: ${error.details}`);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Variant selector */}
      <div>
        <label>Game Variant</label>
        <select
          value={variant}
          onChange={(e) => setVariant(e.target.value)}
        >
          {POKER_CONFIG_METADATA.variants?.map(v => (
            <option key={v.id} value={v.id}>
              {v.displayName} - {v.description}
            </option>
          ))}
        </select>
      </div>

      {/* Grouped fields */}
      {Object.entries(groupBy(fields, 'group')).map(([group, groupFields]) => (
        <fieldset key={group}>
          <legend>{group}</legend>

          {groupFields.map(field => (
            <div key={field.name}>
              <label>
                {field.label}
                {field.description && (
                  <span className="help-text">{field.description}</span>
                )}
              </label>

              {renderInput(field, config, setConfig)}

              {field.unit && <span className="unit">{field.unit}</span>}
            </div>
          ))}
        </fieldset>
      ))}

      <button type="submit">Save Configuration</button>
    </form>
  );
}

function renderInput(field: any, config: any, setConfig: any) {
  const value = getNestedValue(config, field.name) ?? '';

  const handleChange = (newValue: any) => {
    setNestedValue(config, field.name, newValue);
    setConfig({ ...config });
  };

  switch (field.type) {
    case 'number':
      return (
        <input
          type="number"
          value={value}
          onChange={(e) => handleChange(Number(e.target.value))}
          min={field.min}
          max={field.max}
          step={field.step || 1}
        />
      );

    case 'select':
      return (
        <select value={value} onChange={(e) => handleChange(e.target.value)}>
          {field.options?.map((opt: string) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );

    case 'checkbox':
      return (
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => handleChange(e.target.checked)}
        />
      );

    default:
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
        />
      );
  }
}

// Helper functions
function groupBy(arr: any[], key: string) {
  return arr.reduce((groups, item) => {
    const group = item[key] || 'Other';
    groups[group] = groups[group] || [];
    groups[group].push(item);
    return groups;
  }, {});
}

function getNestedValue(obj: any, path: string) {
  return path.split('.').reduce((current, part) => current?.[part], obj);
}

function setNestedValue(obj: any, path: string, value: any) {
  const parts = path.split('.');
  const last = parts.pop()!;
  const target = parts.reduce((current, part) => {
    current[part] = current[part] || {};
    return current[part];
  }, obj);
  target[last] = value;
}
```

## Benefits

1. **Single Source of Truth** - Game defines its config structure once
2. **Type Safety** - Full TypeScript support from schema to UI
3. **Automatic Validation** - Zod validates at runtime
4. **Dynamic UI** - Forms adapt to variant selection
5. **Maintainable** - Schema changes propagate automatically
6. **Self-Documenting** - Field metadata provides labels and descriptions

## Adding Support for Other Games

Each game should export similar schema metadata:

```typescript
// In @pirate/game-mygame
export const MY_GAME_CONFIG_SCHEMA = {
  baseSchema: z.object({
    tableId: z.string(),
    displayName: z.string(),
    // ... game-specific fields
  }),
  variantSchemas: {
    'variant-1': z.object({ /* variant 1 fields */ }),
    'variant-2': z.object({ /* variant 2 fields */ })
  },
  fieldMetadata: {
    tableId: { label: 'Table ID', group: 'Identity' },
    // ... metadata for each field
  }
};

export const MY_GAME_CONFIG_METADATA = {
  gameType: 'my-game',
  displayName: 'My Game',
  configSchema: MY_GAME_CONFIG_SCHEMA,
  variants: [...]
};
```

Then in your backoffice, you can dynamically load schemas:

```typescript
// Map of game types to their metadata
const GAME_SCHEMAS = {
  'houserules-poker': POKER_CONFIG_METADATA,
  'ck-flipz': FLIPZ_CONFIG_METADATA,
  'my-game': MY_GAME_CONFIG_METADATA
};

// Dynamic form generation
function ConfigForm({ gameType }: { gameType: string }) {
  const metadata = GAME_SCHEMAS[gameType];
  // ... use metadata to generate form
}
```

## Database Storage Pattern

All game-specific fields are stored in `paramOverrides`:

```sql
-- Example row in game_config table
{
  "id": "abc123",
  "gameid": "classic-holdem-1",
  "gametype": "houserules-poker",
  "displayname": "Classic Hold'em",
  "variant": "holdem",
  "anteamount": 100,  -- bigBlind
  "paramoverrides": "{
    \"smallBlind\": 50,
    \"bigBlind\": 100,
    \"minBuyIn\": 2000,
    \"maxBuyIn\": 10000,
    \"maxSeats\": 9,
    \"emoji\": \"♠️\",
    \"description\": \"Standard Texas Hold'em poker\",
    \"rules\": {}
  }",
  "status": "published",
  "environment": "prod"
}
```

For squidz-game variant:

```sql
{
  "id": "def456",
  "gameid": "squidz-game-1",
  "gametype": "houserules-poker",
  "displayname": "Squidz Game",
  "variant": "squidz-game",
  "anteamount": 200,
  "paramoverrides": "{
    \"smallBlind\": 100,
    \"bigBlind\": 200,
    \"minBuyIn\": 10000,
    \"maxBuyIn\": 10000,
    \"maxSeats\": 8,
    \"emoji\": \"🦑\",
    \"description\": \"High stakes bounty poker\",
    \"difficulty\": \"Advanced\",
    \"rules\": {
      \"squidzConfig\": {
        \"baseSquidValueType\": \"bigBlind\",
        \"baseSquidValue\": 1,
        \"squidzFormula\": \"players + 3\"
      }
    }
  }",
  "status": "published",
  "environment": "prod"
}
```

This pattern keeps the database schema flexible while maintaining strong typing in code.
