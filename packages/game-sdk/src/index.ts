/**
 * @antetown/game-sdk
 *
 * SDK for building games on the AnteTown Platform.
 * Provides base classes, types, and utilities for game development.
 */

// Export base classes
export { GameBase } from './GameBase.js';
export { GameRegistry, gameRegistry } from './GameRegistry.js';

// Export components
export { MultiTableLobby } from './components/MultiTableLobby.js';

// Export config schema system
export * from './ConfigSchema.js';

// Export currency types
export * from './types/index.js';

// Export types
export type {
  GamePhase,
  Die,
  Player,
  PlayerCosmetics,
  Seat,
  TableConfig,
  GameState,
  WinnerResult,
  GameMetadata
} from './GameBase';

export type {
  GameType,
  GameInfo
} from './GameRegistry';

export type {
  TableInfo,
  MultiTableLobbyProps
} from './components/MultiTableLobby';
