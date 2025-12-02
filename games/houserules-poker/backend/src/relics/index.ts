/**
 * Relic System Module
 *
 * Exports all relic-related functionality for the Roguelike "House Rules" mode.
 */

// Core types
export type {
  RelicRarity,
  RelicActivationType,
  RelicTriggerPhase,
  RelicEffectType,
  RelicEffectParams,
  RelicEffect,
  RelicDefinition,
  PlayerRelic,
  RogueBreakTrigger,
  RelicVisibility,
  RoguelikeConfig,
  RelicRarityWeights,
  RoguelikeState,
  RelicEventType,
  RelicEvent,
  RelicEffectResult,
} from './types.js';

// Default config
export { DEFAULT_ROGUELIKE_CONFIG } from './types.js';

// Core managers
export { RelicManager, type RelicContext } from './RelicManager.js';
export { RelicDrafter, type DraftState, type DraftResult, type DraftEvent, type DraftEventType } from './RelicDrafter.js';
export { RoguelikeSession, type SessionEvent, type SessionEventType } from './RoguelikeSession.js';

// Effect handlers
export {
  executeCustomEffect,
  registerEffectHandler,
  hasEffectHandler,
  handleMulliganEffect,
  handleWeightedFlopEffect,
  handleDealerEffect,
  handlePeekabooEffect,
  handleSecondSightEffect,
  handleEchoTellEffect,
  calculateInsuranceRecovery,
  calculatePotBonus,
  calculateStackModification,
  type EffectHandlerContext,
  type EffectHandlerResult,
  type EffectHandler,
} from './effects.js';
