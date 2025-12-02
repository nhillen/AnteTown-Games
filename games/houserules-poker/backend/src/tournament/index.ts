/**
 * Tournament Module
 *
 * Sit-and-Go tournament system for HouseRules Poker.
 * Supports blind level progression, eliminations, payouts, and roguelike modifiers.
 */

// Core classes
export { TournamentInstance } from './TournamentInstance.js';
export { TournamentManager, getDefaultTournamentManager } from './TournamentManager.js';
export type { TournamentSummary } from './TournamentManager.js';

// Supporting classes
export { BlindSchedule } from './BlindSchedule.js';
export { PayoutStructure } from './PayoutStructure.js';
export {
  LevelModifierManager,
  ROGUELIKE_MODIFIERS,
  CHAOS_MODIFIERS,
  HIGHSTAKES_MODIFIERS,
  getModifierSet,
  combineModifierSets,
} from './LevelModifiers.js';

// Types
export type {
  // Tournament types
  TournamentType,
  TournamentStatus,
  TournamentMode,
  TournamentConfig,
  TournamentState,
  TournamentEntrant,
  EliminatedPlayer,
  TournamentTable,

  // Blind types
  BlindProgression,
  BlindLevel,
  BlindScheduleConfig,

  // Payout types
  PayoutConfig,
  TournamentPayout,

  // Level modifier types
  LevelModifierConfig,

  // Event types
  TournamentEvent,
  TournamentEventType,
  TournamentEventCallback,
  LevelChangedEvent,
  PlayerEliminatedEvent,
  LevelModifierActivatedEvent,
  TournamentFinishedEvent,

  // Callback types
  HandCompletionInfo,
} from './TournamentConfig.js';
