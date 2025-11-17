/**
 * @antetown/game-pirate-plunder - Backend Exports
 *
 * This file exports the game setup for Pirate Plunder so it can be imported
 * by host platforms (like AnteTown).
 */

import { PiratePlunderTable, type PiratePlunderTableConfig } from './PiratePlunderTable.js';
import { piratePlunderInitializer } from './initializer.js';

// Export game class and types
export { PiratePlunderTable, type PiratePlunderTableConfig };

// Export initializer for platform integration
export { piratePlunderInitializer };

// Game metadata for platform integration
export const GAME_METADATA = {
  id: 'pirate-plunder',
  name: 'Pirate Plunder',
  description: 'Roll to be Captain or Crew',
  icon: '🏴‍☠️',
  minPlayers: 2,
  maxPlayers: 8,
  tags: ['Skill', 'Chance'] as const,
  version: '0.2.0', // Version bump for platform socket migration
  path: '/pirate-plunder' // URL path for this game
};

// Export config types and utilities if needed
export type {
  ValidatedPiratePlunderConfig,
  ValidatedFullPiratePlunderConfig,
  PlatformGameConfig
} from './config/index.js';

export {
  PIRATE_PLUNDER_CONFIG_SCHEMA,
  PIRATE_PLUNDER_CONFIG_METADATA,
  validatePiratePlunderConfig
} from './config/PiratePlunderConfigSchema.js';

export {
  gameConfigToPiratePlunderConfig,
  piratePlunderConfigToGameConfig
} from './config/GameConfigMapper.js';
