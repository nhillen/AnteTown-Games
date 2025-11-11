/**
 * GameConfig Mapper
 *
 * Handles conversion between platform's generic GameConfig (database)
 * and game-specific PokerTableConfig (game logic).
 *
 * Storage strategy:
 * - Common fields: Use GameConfig columns (anteAmount, variant, etc.)
 * - Game-specific fields: Store in paramOverrides JSON field
 * - Variant-specific rules: Store in paramOverrides.rules
 */

import { PokerTableConfig } from '../lobby/TableConfig.js';
import { GameVariant } from '../rules/index.js';
import { validatePokerConfig, POKER_CONFIG_SCHEMA } from './PokerConfigSchema.js';

/**
 * Platform's GameConfig model (from Prisma)
 * This is what's stored in the database
 */
export interface PlatformGameConfig {
  id: string;
  gameId: string;              // tableId
  gameType: string;            // 'houserules-poker'
  displayName: string;

  // Generic fields
  anteAmount: number;          // We'll map this to bigBlind
  variant?: string;            // 'holdem', 'squidz-game', etc.
  mode: string;                // 'PVP', 'PVE'

  // Rake configuration
  rakePercentage?: number | null;
  rakeCap?: number | null;

  // Game-specific overrides (JSON)
  paramOverrides?: string | null;  // Stringified JSON

  // Metadata
  status: string;              // 'draft', 'published', 'archived'
  environment: string;         // 'dev', 'staging', 'prod'

  // ... other platform fields
}

/**
 * Structure of paramOverrides JSON for poker
 */
interface PokerParamOverrides {
  // Poker-specific fields not in base GameConfig
  smallBlind?: number;
  bigBlind?: number;          // Can override anteAmount
  minBuyIn?: number;
  maxBuyIn?: number;
  maxSeats?: number;

  // Rake (can be stored in paramOverrides or platform fields)
  rakePercentage?: number;
  rakeCap?: number;

  // Metadata
  emoji?: string;
  description?: string;
  difficulty?: string;

  // Variant-specific rules
  rules?: {
    squidzConfig?: {
      baseSquidValueType: 'flat' | 'bigBlind';
      baseSquidValue: number;
      squidzFormula?: string;
      squidzCount?: number;
    };
    holeCardCount?: number;
    mustUseExactly?: number;
    potLimit?: boolean;
    [key: string]: any;
  };
}

/**
 * Convert platform GameConfig (database) to PokerTableConfig (game logic)
 */
export function gameConfigToPokerConfig(dbConfig: PlatformGameConfig): PokerTableConfig {
  // Parse paramOverrides JSON
  let overrides: PokerParamOverrides = {};
  if (dbConfig.paramOverrides) {
    try {
      overrides = JSON.parse(dbConfig.paramOverrides);
    } catch (e) {
      console.error('Failed to parse paramOverrides:', e);
    }
  }

  // Map fields (overrides take precedence)
  const bigBlind = overrides.bigBlind ?? dbConfig.anteAmount;
  const smallBlind = overrides.smallBlind ?? Math.floor(bigBlind / 2);

  const pokerConfig: PokerTableConfig = {
    tableId: dbConfig.gameId,
    displayName: dbConfig.displayName,
    variant: (dbConfig.variant || 'holdem') as GameVariant,
    mode: dbConfig.mode as 'PVP' | 'PVE',

    // Betting
    bigBlind,
    smallBlind,
    minBuyIn: overrides.minBuyIn ?? bigBlind * 20,      // Default: 20 BB
    maxBuyIn: overrides.maxBuyIn ?? bigBlind * 100,     // Default: 100 BB

    // Rake (prefer platform fields over overrides)
    rakePercentage: dbConfig.rakePercentage ?? overrides.rakePercentage ?? 5,
    rakeCap: dbConfig.rakeCap ?? overrides.rakeCap,

    // Table settings
    maxSeats: overrides.maxSeats ?? 9,

    // Metadata
    emoji: overrides.emoji ?? '♠️',
    description: overrides.description ?? `${dbConfig.displayName} poker table`,
    difficulty: overrides.difficulty,

    // Rules (including variant-specific)
    rules: overrides.rules ?? {},

    // Runtime state
    currentPlayers: 0,
    isActive: dbConfig.status === 'published'
  };

  // Validate the constructed config
  try {
    validatePokerConfig(pokerConfig, pokerConfig.variant);
  } catch (e) {
    console.error(`Invalid config for table ${dbConfig.gameId}:`, e);
    throw e;
  }

  return pokerConfig;
}

/**
 * Convert PokerTableConfig (game logic) to platform GameConfig (database)
 */
export function pokerConfigToGameConfig(
  pokerConfig: PokerTableConfig,
  existingConfig?: Partial<PlatformGameConfig>
): PlatformGameConfig {
  // Separate base fields from overrides
  const overrides: PokerParamOverrides = {
    smallBlind: pokerConfig.smallBlind,
    bigBlind: pokerConfig.bigBlind,
    minBuyIn: pokerConfig.minBuyIn,
    maxBuyIn: pokerConfig.maxBuyIn,
    maxSeats: pokerConfig.maxSeats,
    emoji: pokerConfig.emoji,
    description: pokerConfig.description,
    difficulty: pokerConfig.difficulty,
    rules: pokerConfig.rules
  };

  return {
    id: existingConfig?.id ?? '',
    gameId: pokerConfig.tableId,
    gameType: 'houserules-poker',
    displayName: pokerConfig.displayName,

    // Use bigBlind as the primary anteAmount
    anteAmount: pokerConfig.bigBlind,
    variant: pokerConfig.variant,
    mode: pokerConfig.mode ?? 'PVP',

    // Rake configuration (stored in platform base fields)
    rakePercentage: pokerConfig.rakePercentage ?? 5,
    rakeCap: pokerConfig.rakeCap ?? null,

    // Store poker-specific fields in JSON
    paramOverrides: JSON.stringify(overrides),

    // Default metadata
    status: existingConfig?.status ?? 'draft',
    environment: existingConfig?.environment ?? 'dev'
  };
}

/**
 * Update specific fields in paramOverrides without replacing entire object
 */
export function updateParamOverrides(
  dbConfig: PlatformGameConfig,
  updates: Partial<PokerParamOverrides>
): PlatformGameConfig {
  // Parse existing overrides
  let overrides: PokerParamOverrides = {};
  if (dbConfig.paramOverrides) {
    try {
      overrides = JSON.parse(dbConfig.paramOverrides);
    } catch (e) {
      console.error('Failed to parse paramOverrides:', e);
    }
  }

  // Merge updates
  const merged = {
    ...overrides,
    ...updates
  };

  // Deep merge rules if both exist
  if (overrides.rules && updates.rules) {
    merged.rules = {
      ...overrides.rules,
      ...updates.rules
    };
  }

  return {
    ...dbConfig,
    paramOverrides: JSON.stringify(merged)
  };
}

/**
 * Get variant-specific schema for a poker variant
 */
export function getVariantSchema(variant: GameVariant) {
  if (!POKER_CONFIG_SCHEMA.variantSchemas) {
    return null;
  }
  return POKER_CONFIG_SCHEMA.variantSchemas[variant];
}

/**
 * Helper to extract only variant-specific fields from a config
 */
export function extractVariantOverrides(
  pokerConfig: PokerTableConfig
): Record<string, any> {
  const variant = pokerConfig.variant;
  const variantSchema = getVariantSchema(variant);

  if (!variantSchema) {
    return {};
  }

  // For squidz-game, return squidzConfig
  if (variant === 'squidz-game' && pokerConfig.rules?.squidzConfig) {
    return {
      squidzConfig: pokerConfig.rules.squidzConfig
    };
  }

  // For omaha, return omaha-specific rules
  if (variant === 'omaha') {
    return {
      holeCardCount: pokerConfig.rules?.holeCardCount,
      mustUseExactly: pokerConfig.rules?.mustUseExactly,
      potLimit: pokerConfig.rules?.potLimit
    };
  }

  return {};
}
