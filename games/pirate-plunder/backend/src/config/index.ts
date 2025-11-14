/**
 * Configuration exports for Pirate Plunder
 *
 * This module provides everything needed for:
 * - Schema validation
 * - Config mapping (DB ↔ Game)
 * - Backoffice integration
 */

export {
  PIRATE_PLUNDER_CONFIG_SCHEMA,
  PIRATE_PLUNDER_CONFIG_METADATA,
  validatePiratePlunderConfig,
  type ValidatedPiratePlunderConfig,
  type ValidatedFullPiratePlunderConfig
} from './PiratePlunderConfigSchema.js';

export {
  gameConfigToPiratePlunderConfig,
  piratePlunderConfigToGameConfig,
  updateParamOverrides,
  extractFullConfigSection,
  type PlatformGameConfig
} from './GameConfigMapper.js';
