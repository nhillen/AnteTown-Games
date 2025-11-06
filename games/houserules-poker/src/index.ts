/**
 * @pirate/game-houserules
 *
 * Multi-table Poker game package with pluggable rules engine
 * - Backend: HouseRules (extends GameBase)
 * - Frontend: PokerClient (React component) + PokerLobby (Multi-table lobby)
 * - Rules Engine: Support for multiple poker variants
 * - Lobby System: Multi-table management
 */

// Export backend game logic
export { HouseRules } from './HouseRules.js';

// Export frontend React components
export { default as PokerClient } from './PokerClient.js';
export { PokerLobby } from './PokerLobby.js';
export { PokerLobbyList } from './PokerLobbyList.js';
export { GameCreator } from './GameCreator.js';
export { TablePreview } from './TablePreview.js';
export type { GameCreatorConfig } from './GameCreator.js';

// Export lobby system
export * from './lobby/index.js';

// Export rules engine
export * from './rules/index.js';

// Export types
export type { Card, Suit, Rank, HandRank, HandEvaluation, PokerPhase, PokerAction } from './types.js';
