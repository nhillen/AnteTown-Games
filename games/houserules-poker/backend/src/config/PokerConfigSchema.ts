/**
 * House Rules Poker - Configuration Schema
 *
 * Defines the configuration structure for poker tables with variant-specific rules.
 * This schema is used for:
 * - Runtime validation of table configs
 * - Type inference for TypeScript
 * - Backoffice UI generation
 * - Database storage validation
 */

import { z } from 'zod';
import {
  ConfigSchemaDefinition,
  GameConfigMetadata,
  ConfigFieldMetadata
} from '@antetown/game-sdk';
import { GameVariant } from '../rules/index.js';

/**
 * Base schema - common to all poker variants
 */
const pokerBaseSchema = z.object({
  // Table identity
  tableId: z.string().min(1),
  displayName: z.string().min(1).max(50),

  // Variant selection
  variant: z.enum(['holdem', 'squidz-game', 'omaha', 'seven-card-stud'] as const),

  // Game mode
  mode: z.enum(['PVP', 'PVE']).optional().default('PVP'),

  // Core table parameters
  smallBlind: z.number().int().positive(),
  bigBlind: z.number().int().positive(),
  minBuyIn: z.number().int().positive(),
  maxBuyIn: z.number().int().positive(),
  maxSeats: z.number().int().min(2).max(10),

  // Rake configuration
  rakePercentage: z.number().min(0).max(100).optional().default(5),
  rakeCap: z.number().int().positive().optional(),

  // Metadata
  emoji: z.string().emoji().optional().default('♠️'),
  description: z.string().max(200),
  difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced']).optional(),

  // State (runtime fields - not configurable)
  currentPlayers: z.number().int().min(0).optional().default(0),
  isActive: z.boolean().optional().default(true)
}).refine(data => data.maxBuyIn >= data.minBuyIn, {
  message: 'maxBuyIn must be >= minBuyIn'
}).refine(data => data.bigBlind >= data.smallBlind, {
  message: 'bigBlind must be >= smallBlind'
});

/**
 * Squidz Game variant-specific configuration
 */
const squidzGameSchema = z.object({
  rules: z.object({
    squidzConfig: z.object({
      // How to calculate squid value
      baseSquidValueType: z.enum(['flat', 'bigBlind']),
      baseSquidValue: z.number().positive(),

      // How many squidz total
      squidzFormula: z.string().optional(),
      squidzCount: z.number().int().positive().optional()
    }).refine(data => {
      // Must have either formula OR count, not both
      const hasFormula = !!data.squidzFormula;
      const hasCount = !!data.squidzCount;
      return hasFormula !== hasCount; // XOR
    }, {
      message: 'Must specify either squidzFormula OR squidzCount, not both'
    })
  })
});

/**
 * Hold'em variant (uses base schema, no additional fields)
 */
const holdemSchema = z.object({
  rules: z.object({}).optional()
});

/**
 * Omaha variant-specific configuration
 */
const omahaSchema = z.object({
  rules: z.object({
    holeCardCount: z.literal(4).default(4),
    mustUseExactly: z.literal(2).default(2),
    potLimit: z.boolean().optional().default(true)
  })
});

/**
 * Field metadata for UI generation
 */
const fieldMetadata: Record<string, ConfigFieldMetadata> = {
  // Table identity
  tableId: {
    label: 'Table ID',
    description: 'Unique identifier for this table',
    group: 'Identity',
    displayOrder: 1
  },
  displayName: {
    label: 'Display Name',
    description: 'Name shown to players in the lobby',
    group: 'Identity',
    displayOrder: 2
  },
  variant: {
    label: 'Game Variant',
    description: 'Type of poker game',
    group: 'Identity',
    displayOrder: 3
  },
  mode: {
    label: 'Game Mode',
    description: 'Player vs Player or Player vs Environment (bots)',
    group: 'Identity',
    displayOrder: 4
  },

  // Stakes
  smallBlind: {
    label: 'Small Blind',
    description: 'Small blind amount (pennies)',
    group: 'Betting',
    displayOrder: 10,
    unit: 'pennies',
    min: 1
  },
  bigBlind: {
    label: 'Big Blind',
    description: 'Big blind amount (pennies)',
    group: 'Betting',
    displayOrder: 11,
    unit: 'pennies',
    min: 1
  },
  minBuyIn: {
    label: 'Minimum Buy-in',
    description: 'Minimum chips to join (pennies)',
    group: 'Betting',
    displayOrder: 12,
    unit: 'pennies',
    min: 1
  },
  maxBuyIn: {
    label: 'Maximum Buy-in',
    description: 'Maximum chips to join (pennies)',
    group: 'Betting',
    displayOrder: 13,
    unit: 'pennies',
    min: 1
  },

  // Table settings
  maxSeats: {
    label: 'Maximum Seats',
    description: 'Number of seats at the table',
    group: 'Table',
    displayOrder: 20,
    unit: 'players',
    min: 2,
    max: 10,
    step: 1
  },

  // Rake configuration
  rakePercentage: {
    label: 'Rake Percentage',
    description: 'Percentage of pot taken as house rake',
    group: 'Betting',
    displayOrder: 14,
    unit: 'percentage',
    min: 0,
    max: 100,
    step: 0.1
  },
  rakeCap: {
    label: 'Rake Cap',
    description: 'Maximum rake amount in pennies (optional)',
    group: 'Betting',
    displayOrder: 15,
    unit: 'pennies',
    min: 0
  },

  // Metadata
  emoji: {
    label: 'Icon',
    description: 'Emoji icon for the table',
    group: 'Display',
    displayOrder: 30
  },
  description: {
    label: 'Description',
    description: 'Brief description shown in lobby',
    group: 'Display',
    displayOrder: 31
  },
  difficulty: {
    label: 'Difficulty',
    description: 'Skill level recommendation',
    group: 'Display',
    displayOrder: 32
  },

  // Squidz-specific
  'rules.squidzConfig.baseSquidValueType': {
    label: 'Squid Value Type',
    description: 'How to calculate squid bounty values',
    group: 'Squidz Rules',
    displayOrder: 100
  },
  'rules.squidzConfig.baseSquidValue': {
    label: 'Base Squid Value',
    description: 'Base amount per squid (either flat pennies or BB multiplier)',
    group: 'Squidz Rules',
    displayOrder: 101
  },
  'rules.squidzConfig.squidzFormula': {
    label: 'Squidz Formula',
    description: 'Formula for total squidz (e.g., "players + 3")',
    group: 'Squidz Rules',
    displayOrder: 102
  },
  'rules.squidzConfig.squidzCount': {
    label: 'Fixed Squidz Count',
    description: 'Alternative: fixed number of squidz',
    group: 'Squidz Rules',
    displayOrder: 103,
    unit: 'players'
  }
};

/**
 * Complete configuration schema definition
 */
export const POKER_CONFIG_SCHEMA: ConfigSchemaDefinition = {
  baseSchema: pokerBaseSchema,
  variantSchemas: {
    'holdem': holdemSchema,
    'squidz-game': squidzGameSchema,
    'omaha': omahaSchema
  },
  fieldMetadata
};

/**
 * Game metadata for platform registration
 */
export const POKER_CONFIG_METADATA: GameConfigMetadata = {
  gameType: 'houserules-poker',
  displayName: 'House Rules Poker',
  configSchema: POKER_CONFIG_SCHEMA,
  variants: [
    {
      id: 'holdem',
      displayName: "Texas Hold'em",
      description: 'Classic no-limit poker'
    },
    {
      id: 'squidz-game',
      displayName: 'Squidz Game',
      description: 'High stakes bounty poker with squid collection'
    },
    {
      id: 'omaha',
      displayName: 'Omaha',
      description: 'Four hole cards, must use exactly two'
    }
  ]
};

/**
 * Type inference - TypeScript type for PokerTableConfig
 */
export type ValidatedPokerConfig = z.infer<typeof pokerBaseSchema> & {
  rules?: {
    squidzConfig?: z.infer<typeof squidzGameSchema>['rules']['squidzConfig'];
    holeCardCount?: number;
    mustUseExactly?: number;
    potLimit?: boolean;
  };
};

/**
 * Helper function to validate a poker config
 */
export function validatePokerConfig(
  config: unknown,
  variant?: GameVariant
): ValidatedPokerConfig {
  const result = pokerBaseSchema.safeParse(config);

  if (!result.success) {
    throw new Error(`Invalid poker config: ${result.error.message}`);
  }

  // Validate variant-specific rules if present
  if (variant === 'squidz-game' && (config as any).rules?.squidzConfig) {
    const variantResult = squidzGameSchema.safeParse(config);
    if (!variantResult.success) {
      throw new Error(`Invalid squidz config: ${variantResult.error.message}`);
    }
  } else if (variant === 'omaha' && (config as any).rules) {
    const variantResult = omahaSchema.safeParse(config);
    if (!variantResult.success) {
      throw new Error(`Invalid omaha config: ${variantResult.error.message}`);
    }
  }

  return result.data as ValidatedPokerConfig;
}
