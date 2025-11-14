/**
 * GameConfig Mapper for Pirate Plunder
 *
 * Handles conversion between platform's generic GameConfig (database)
 * and game-specific PiratePlunderTableConfig (game logic).
 *
 * Storage strategy:
 * - Common fields: Use GameConfig columns (anteAmount, mode, etc.)
 * - Game-specific fields: Store in paramOverrides JSON field
 * - Full config: Store in paramOverrides.fullConfig
 */

import { PiratePlunderTableConfig } from '../PiratePlunderTable.js';
import { validatePiratePlunderConfig, PIRATE_PLUNDER_CONFIG_SCHEMA } from './PiratePlunderConfigSchema.js';

/**
 * Platform's GameConfig model (from Prisma)
 * This is what's stored in the database
 */
export interface PlatformGameConfig {
  id: string;
  gameId: string;              // tableId
  gameType: string;            // 'pirate-plunder'
  displayName: string;

  // Generic fields
  anteAmount: number;          // Ante per hand
  variant?: string;            // Could be used for future variants
  mode: string;                // 'PVP', 'PVE'

  // Rake configuration
  rakePercentage?: number | null;
  rakeCap?: number | null;

  // Buy-in configuration
  minBuyInMultiplier?: number | null;  // Multiplier of ante

  // Game-specific overrides (JSON)
  paramOverrides?: string | null;  // Stringified JSON

  // Metadata
  status: string;              // 'draft', 'published', 'archived'
  environment: string;         // 'dev', 'staging', 'prod'
  currency?: string;           // 'TC', 'SC', 'VT'

  // ... other platform fields
}

/**
 * Structure of paramOverrides JSON for Pirate Plunder
 */
interface PiratePlunderParamOverrides {
  // Pirate Plunder specific fields
  ante?: number;
  minBuyIn?: number;
  maxSeats?: number;
  currency?: string;

  // Rake (can be stored in paramOverrides or platform fields)
  rake?: number;
  rakeCap?: number;

  // Metadata
  emoji?: string;
  description?: string;
  difficulty?: string;

  // Full nested configuration (27 sections)
  fullConfig?: {
    table?: any;
    betting?: any;
    payouts?: any;
    house?: any;
    chest?: any;
    bust_fee?: any;
    advanced?: any;
    timing?: any;
    display?: any;
    ai_behavior?: any;
    rules_display?: any;
  };
}

/**
 * Convert platform GameConfig to PiratePlunderTableConfig
 * Used when loading tables from database
 */
export function gameConfigToPiratePlunderConfig(
  dbConfig: PlatformGameConfig
): PiratePlunderTableConfig {
  // Parse paramOverrides JSON
  let overrides: PiratePlunderParamOverrides = {};
  if (dbConfig.paramOverrides) {
    try {
      overrides = JSON.parse(dbConfig.paramOverrides);
    } catch (error) {
      console.warn(`Failed to parse paramOverrides for ${dbConfig.gameId}:`, error);
    }
  }

  // Build PiratePlunderTableConfig
  const config: PiratePlunderTableConfig = {
    tableId: dbConfig.gameId,
    displayName: dbConfig.displayName,

    // Mode
    mode: (dbConfig.mode?.toUpperCase() as 'PVP' | 'PVE') || 'PVP',

    // Currency
    currency: overrides.currency || dbConfig.currency || 'TC',

    // Betting (prefer overrides, fallback to platform fields)
    ante: overrides.ante ?? dbConfig.anteAmount,
    minBuyIn: overrides.minBuyIn ?? (
      dbConfig.minBuyInMultiplier
        ? dbConfig.anteAmount * dbConfig.minBuyInMultiplier
        : dbConfig.anteAmount * 10  // Default 10x multiplier
    ),
    maxSeats: overrides.maxSeats ?? 8,

    // Rake
    rake: overrides.rake ?? dbConfig.rakePercentage ?? 5,

    // Full nested configuration (only include if defined)
    ...(overrides.fullConfig && { fullConfig: overrides.fullConfig })
  };

  return config;
}

/**
 * Convert PiratePlunderTableConfig to platform GameConfig
 * Used when creating/updating tables from backoffice
 */
export function piratePlunderConfigToGameConfig(
  tableConfig: PiratePlunderTableConfig,
  existingConfig?: Partial<PlatformGameConfig>
): Omit<PlatformGameConfig, 'id'> {
  // Calculate minBuyInMultiplier
  const minBuyInMultiplier = tableConfig.ante && tableConfig.minBuyIn
    ? Math.round(tableConfig.minBuyIn / tableConfig.ante)
    : 10;

  // Build paramOverrides (only include defined values)
  const overrides: PiratePlunderParamOverrides = {};

  if (tableConfig.ante !== undefined) overrides.ante = tableConfig.ante;
  if (tableConfig.minBuyIn !== undefined) overrides.minBuyIn = tableConfig.minBuyIn;
  if (tableConfig.maxSeats !== undefined) overrides.maxSeats = tableConfig.maxSeats;
  if (tableConfig.currency !== undefined) overrides.currency = tableConfig.currency;
  if (tableConfig.rake !== undefined) overrides.rake = tableConfig.rake;
  if (tableConfig.fullConfig !== undefined) overrides.fullConfig = tableConfig.fullConfig;

  // Build platform config
  const platformConfig: Omit<PlatformGameConfig, 'id'> = {
    gameId: tableConfig.tableId,
    gameType: 'pirate-plunder',
    displayName: tableConfig.displayName,

    // Map to platform fields
    anteAmount: tableConfig.ante || 100,
    mode: tableConfig.mode || 'PVP',

    // Rake (only include if defined)
    ...(tableConfig.rake !== undefined && { rakePercentage: tableConfig.rake }),

    // Buy-in
    minBuyInMultiplier,

    // Store game-specific config in paramOverrides
    paramOverrides: JSON.stringify(overrides),

    // Metadata (preserve existing or set defaults)
    status: existingConfig?.status || 'draft',
    environment: existingConfig?.environment || 'dev',

    // Include optional fields only if defined
    ...(tableConfig.currency && { currency: tableConfig.currency })
  };

  return platformConfig;
}

/**
 * Update paramOverrides without replacing entire config
 * Useful for partial updates (e.g., only updating fullConfig.chest)
 */
export function updateParamOverrides(
  existingConfig: PlatformGameConfig,
  updates: Partial<PiratePlunderParamOverrides>
): PlatformGameConfig {
  // Parse existing overrides
  let overrides: PiratePlunderParamOverrides = {};
  if (existingConfig.paramOverrides) {
    try {
      overrides = JSON.parse(existingConfig.paramOverrides);
    } catch (error) {
      console.warn('Failed to parse existing paramOverrides:', error);
    }
  }

  // Merge updates (deep merge for nested objects)
  const merged: PiratePlunderParamOverrides = {
    ...overrides,
    ...updates
  };

  // Deep merge fullConfig if both exist
  if (overrides.fullConfig && updates.fullConfig) {
    merged.fullConfig = {
      ...overrides.fullConfig,
      ...updates.fullConfig
    };
  }

  // Return updated config
  return {
    ...existingConfig,
    paramOverrides: JSON.stringify(merged)
  };
}

/**
 * Extract specific sections from fullConfig
 * Useful for backoffice views showing specific rule categories
 */
export function extractFullConfigSection(
  config: PiratePlunderTableConfig,
  section: 'table' | 'betting' | 'payouts' | 'house' | 'chest' | 'bust_fee' | 'advanced' | 'timing' | 'display' | 'ai_behavior' | 'rules_display'
): any {
  return config.fullConfig?.[section];
}
