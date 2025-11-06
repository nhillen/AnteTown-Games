/**
 * Rules Engine exports
 * All poker variant rules are registered and exported from here
 */

import { HOLDEM_RULES } from './holdem.js';
import { SQUIDZ_GAME_RULES } from './squidz-game.js';
import { RulesEngineRegistry, GameVariant, PokerRulesEngine } from './RulesEngine.js';

// Register all available variants
RulesEngineRegistry.register('holdem', HOLDEM_RULES);
RulesEngineRegistry.register('squidz-game', SQUIDZ_GAME_RULES);

/**
 * Load a rules engine for a specific variant
 */
export function loadRulesEngine(variant: GameVariant): PokerRulesEngine {
  const engine = RulesEngineRegistry.get(variant);

  if (!engine) {
    console.warn(`Unknown variant "${variant}", falling back to Hold'em`);
    return HOLDEM_RULES;
  }

  return engine;
}

// Re-export types and registry
export * from './RulesEngine.js';
export { HOLDEM_RULES } from './holdem.js';
export * from './squidz-game.js';
