/**
 * @antetown/game-houserules-backend
 *
 * Multi-table Poker game backend
 * - Backend: HouseRules (extends GameBase)
 * - Rules Engine: Support for multiple poker variants
 * - Lobby System: Multi-table management
 */

// Export backend game logic
export { HouseRules } from './HouseRules.js';

// Export lobby system
export * from './lobby/index.js';

// Export rules engine
export * from './rules/index.js';

// Export configuration system
export * from './config/index.js';

// Export types
export type { Card, Suit, Rank, HandRank, HandEvaluation, PokerPhase, PokerAction } from './types.js';
