/**
 * Configuration exports for House Rules Poker
 *
 * This module provides everything needed for:
 * - Schema validation
 * - Config mapping (DB ↔ Game)
 * - Backoffice integration
 */

export {
  POKER_CONFIG_SCHEMA,
  POKER_CONFIG_METADATA,
  validatePokerConfig,
  type ValidatedPokerConfig
} from './PokerConfigSchema.js';

export {
  gameConfigToPokerConfig,
  pokerConfigToGameConfig,
  updateParamOverrides,
  getVariantSchema,
  extractVariantOverrides,
  type PlatformGameConfig,
} from './GameConfigMapper.js';
