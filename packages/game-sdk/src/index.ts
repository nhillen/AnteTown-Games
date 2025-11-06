/**
 * @pirate/game-sdk
 *
 * SDK for building games on the Pirate Platform.
 * Provides base classes, types, and utilities for game development.
 */

// Export base classes
export { GameBase } from './GameBase.js';
export { GameRegistry, gameRegistry } from './GameRegistry.js';

// Export components
export { MultiTableLobby } from './components/MultiTableLobby.js';

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
