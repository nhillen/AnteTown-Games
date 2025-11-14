/**
 * Pirate Plunder - Configuration Schema
 *
 * Defines the configuration structure for Pirate Plunder tables.
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

/**
 * Base schema - common to all Pirate Plunder tables
 */
const piratePlunderBaseSchema = z.object({
  // Table identity
  tableId: z.string().min(1),
  displayName: z.string().min(1).max(50),

  // Game mode
  mode: z.enum(['PVP', 'PVE']).optional().default('PVP'),

  // Currency
  currency: z.enum(['TC', 'SC', 'VT']).optional().default('TC'),

  // Core betting parameters
  ante: z.number().int().positive(),
  minBuyIn: z.number().int().positive(),
  maxSeats: z.number().int().min(2).max(8).default(8),

  // Rake configuration
  rake: z.number().min(0).max(100).optional().default(5),
  rakeCap: z.number().int().nonnegative().optional(),

  // Metadata
  emoji: z.string().optional().default('🏴‍☠️'),
  description: z.string().max(200).optional(),
  difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced']).optional(),

  // State (runtime fields - not configurable)
  currentPlayers: z.number().int().min(0).optional().default(0),
  isActive: z.boolean().optional().default(true)
}).refine(data => data.minBuyIn >= data.ante, {
  message: 'minBuyIn must be >= ante'
});

/**
 * Full configuration schema (includes nested config sections)
 */
const piratePlunderFullConfigSchema = z.object({
  // Table settings
  table: z.object({
    minHumanPlayers: z.number().int().min(1).max(8).default(2),
    targetTotalPlayers: z.number().int().min(1).max(8).default(4),
    maxSeats: z.number().int().min(2).max(8).default(8),
    cargoChestLearningMode: z.boolean().default(false),
    tableMinimumMultiplier: z.number().positive().default(2.0)
  }),

  // Betting configuration
  betting: z.object({
    streets: z.object({
      enabled: z.boolean().default(false),
      S1: z.number().positive().default(1),
      S2: z.number().positive().default(3),
      S3: z.number().positive().default(6),
      s3_multiplier: z.enum(['1x', '2x', '3x']).default('1x')
    }),
    ante: z.object({
      mode: z.enum(['none', 'per_player', 'button', 'every_nth']).default('per_player'),
      amount: z.number().int().nonnegative().default(100),
      every_nth: z.number().int().positive().default(5),
      progressive: z.boolean().default(false),
      street_multiplier: z.number().nonnegative().default(1.0)
    }),
    edge_tiers: z.object({
      enabled: z.boolean().default(false),
      behind: z.number().default(0.50),
      co: z.number().default(0.75),
      leader: z.number().default(1.00),
      dominant: z.number().default(1.25)
    }),
    dominant_threshold: z.number().default(2),
    rounding: z.number().int().positive().default(1)
  }),

  // Payout configuration
  payouts: z.object({
    role_payouts: z.object({
      ship: z.number().min(0).max(1).default(0.40),
      captain: z.number().min(0).max(1).default(0.30),
      crew: z.number().min(0).max(1).default(0.20)
    }),
    multi_role_allowed: z.boolean().default(true),
    combo_kicker: z.object({
      ship_captain: z.number().optional(),
      all_three: z.number().optional()
    }).nullable().default(null),
    role_requirements: z.object({
      ship: z.number().int().min(1).default(1),
      captain: z.number().int().min(1).default(1),
      crew: z.number().int().min(1).default(1)
    })
  }).refine(data => {
    const total = data.role_payouts.ship + data.role_payouts.captain + data.role_payouts.crew;
    return total <= 1.0;
  }, {
    message: 'Total role payouts must be <= 1.0'
  }),

  // House configuration
  house: z.object({
    rake_percent: z.number().min(0).max(1).default(0.05),
    rake_enabled: z.boolean().default(true),
    rake_cap: z.number().int().nonnegative().default(1000)
  }),

  // Cargo chest configuration
  chest: z.object({
    drip_percent: z.number().min(0).max(1).default(0.10),
    carryover: z.boolean().default(true),
    unfilled_role_to_chest: z.number().min(0).max(1).default(0.50),
    low_rank_triggers: z.object({
      trips: z.number().min(0).max(1).default(0.30),
      quads: z.number().min(0).max(1).default(0.60),
      yahtzee: z.number().min(0).max(1).default(1.00)
    }),
    trigger_tiebreak: z.enum(['rank_then_time', 'time_then_rank']).default('rank_then_time')
  }),

  // Bust fee configuration
  bust_fee: z.object({
    enabled: z.boolean().default(true),
    basis: z.enum(['S1', 'S2', 'S3', 'fixed']).default('S2'),
    fixed_amount: z.number().int().nonnegative().default(0),
    to: z.enum(['chest', 'burn']).default('chest')
  }),

  // Advanced configuration
  advanced: z.object({
    ties: z.enum(['split_share', 'reroll_one_die', 'earliest_leader_priority']).default('reroll_one_die'),
    declare_role: z.boolean().default(false),
    reveal_sequence: z.array(z.number().int().min(1).max(3)).default([1, 2, 3])
  }),

  // Timing configuration
  timing: z.object({
    phase_timers: z.object({
      lock_phase_seconds: z.number().int().positive().default(30),
      betting_phase_seconds: z.number().int().positive().default(30),
      turn_timeout_seconds: z.number().int().positive().default(30)
    }),
    delays: z.object({
      auto_start_seconds: z.number().int().nonnegative().default(3),
      payout_display_seconds: z.number().int().nonnegative().default(3),
      showdown_display_seconds: z.number().int().nonnegative().default(8),
      hand_end_seconds: z.number().int().nonnegative().default(3),
      countdown_seconds: z.number().int().nonnegative().default(5)
    }),
    session: z.object({
      max_age_days: z.number().int().positive().default(7),
      reconnect_timeout_minutes: z.number().int().positive().default(2),
      disconnect_action_timeout_seconds: z.number().int().positive().default(30),
      disconnect_fold_timeout_seconds: z.number().int().positive().default(30),
      disconnect_kick_timeout_minutes: z.number().int().positive().default(3)
    })
  }),

  // Display configuration
  display: z.object({
    history: z.object({
      max_hands_stored: z.number().int().positive().default(100),
      recent_display_count: z.number().int().positive().default(20)
    })
  }),

  // AI behavior configuration
  ai_behavior: z.object({
    hand_strength: z.object({
      ship_multiplier: z.number().default(2.0),
      captain_multiplier: z.number().default(1.5),
      crew_multiplier: z.number().default(1.2),
      cargo_multiplier: z.number().default(0.5),
      bet1_phase_modifier: z.number().default(0.8),
      bet3_phase_modifier: z.number().default(1.2)
    }),
    betting_thresholds: z.object({
      bluff_modifier: z.number().default(2.0),
      mistake_penalty: z.number().default(1.0),
      fold_threshold_offset: z.number().default(2.0),
      strong_hand_offset: z.number().default(3.0),
      max_raises_per_round: z.number().int().positive().default(4)
    }),
    stack_decisions: z.object({
      fold_stack_threshold: z.number().min(0).max(1).default(0.2),
      allin_stack_threshold: z.number().min(0).max(1).default(0.3),
      risk_adjustment: z.number().default(0.7)
    }),
    bet_sizing: z.object({
      bet_pot_multiplier: z.number().default(0.1),
      raise_pot_multiplier: z.number().default(0.15)
    })
  }),

  // Rules display configuration
  rules_display: z.object({
    sections: z.record(z.object({
      enabled: z.boolean(),
      weight: z.number(),
      type: z.enum(['static', 'dynamic']),
      span: z.union([z.literal(1), z.literal(2), z.literal(3)])
    })).default({
      role_hierarchy: { enabled: true, weight: 10, type: 'static' as const, span: 2 as const },
      cargo_chest: { enabled: true, weight: 20, type: 'dynamic' as const, span: 2 as const },
      locking_rules: { enabled: true, weight: 30, type: 'static' as const, span: 1 as const },
      betting: { enabled: true, weight: 40, type: 'static' as const, span: 1 as const },
      bust_fee: { enabled: true, weight: 50, type: 'dynamic' as const, span: 1 as const },
      edge_tiers: { enabled: true, weight: 60, type: 'dynamic' as const, span: 3 as const }
    })
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
  mode: {
    label: 'Game Mode',
    description: 'PVP (2+ players to start) or PVE (1 player vs bots)',
    group: 'Identity',
    displayOrder: 3
  },
  currency: {
    label: 'Currency',
    description: 'Token type (TC = Town Coins, SC = Silver Coins, VT = Virtual Tokens)',
    group: 'Identity',
    displayOrder: 4
  },

  // Betting
  ante: {
    label: 'Ante',
    description: 'Ante amount per hand (pennies)',
    group: 'Betting',
    displayOrder: 10,
    unit: 'pennies',
    min: 1
  },
  minBuyIn: {
    label: 'Minimum Buy-in',
    description: 'Minimum chips to join (pennies)',
    group: 'Betting',
    displayOrder: 11,
    unit: 'pennies',
    min: 1
  },
  maxSeats: {
    label: 'Max Seats',
    description: 'Maximum number of players (2-8)',
    group: 'Table',
    displayOrder: 20,
    min: 2,
    max: 8
  },

  // Rake
  rake: {
    label: 'Rake Percentage',
    description: 'House rake as percentage (0-100)',
    group: 'House',
    displayOrder: 30,
    unit: 'percentage',
    min: 0,
    max: 100
  },
  rakeCap: {
    label: 'Rake Cap',
    description: 'Maximum rake amount (pennies)',
    group: 'House',
    displayOrder: 31,
    unit: 'pennies',
    min: 0
  },

  // Metadata
  emoji: {
    label: 'Emoji',
    description: 'Icon shown in lobby',
    group: 'Display',
    displayOrder: 40
  },
  description: {
    label: 'Description',
    description: 'Short description of table rules',
    group: 'Display',
    displayOrder: 41
  },
  difficulty: {
    label: 'Difficulty',
    description: 'Skill level recommendation',
    group: 'Display',
    displayOrder: 42
  }
};

/**
 * Schema definition export
 */
export const PIRATE_PLUNDER_CONFIG_SCHEMA: ConfigSchemaDefinition = {
  baseSchema: piratePlunderBaseSchema,
  variantSchemas: {
    'standard': piratePlunderFullConfigSchema
  },
  fieldMetadata
};

/**
 * Game metadata export (for backoffice integration)
 */
export const PIRATE_PLUNDER_CONFIG_METADATA: GameConfigMetadata = {
  gameType: 'pirate-plunder',
  displayName: 'Pirate Plunder',
  configSchema: PIRATE_PLUNDER_CONFIG_SCHEMA,
  variants: [
    {
      id: 'standard',
      displayName: 'Standard',
      description: 'Classic Pirate Plunder gameplay'
    }
  ]
};

/**
 * Validation function with type inference
 */
export function validatePiratePlunderConfig(
  config: unknown,
  schema = piratePlunderBaseSchema
) {
  return schema.parse(config);
}

export type ValidatedPiratePlunderConfig = z.infer<typeof piratePlunderBaseSchema>;
export type ValidatedFullPiratePlunderConfig = z.infer<typeof piratePlunderFullConfigSchema>;
