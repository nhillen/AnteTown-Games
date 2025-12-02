/**
 * Relic System Types
 *
 * Defines all types for the roguelike "House Rules" relic system.
 * Relics are rule-bending powers that players draft during Rogue Breaks.
 */

import type { Card, PokerPhase } from '../types.js';

// ============================================================================
// Relic Core Types
// ============================================================================

/**
 * Relic rarity tier - affects draft pool and visual effects
 */
export type RelicRarity = 'common' | 'rare' | 'epic';

/**
 * How the relic activates
 */
export type RelicActivationType =
  | 'passive'      // Always on once drafted
  | 'triggered'    // Single use or has cooldown, player chooses when
  | 'conditional'; // Auto-activates under certain conditions

/**
 * When the relic effect can be applied
 */
export type RelicTriggerPhase =
  | 'pre_deal'       // Before hole cards dealt
  | 'post_deal'      // After hole cards dealt
  | 'pre_flop'       // Before flop is dealt
  | 'post_flop'      // After flop is dealt
  | 'pre_turn'       // Before turn
  | 'post_turn'      // After turn
  | 'pre_river'      // Before river
  | 'post_river'     // After river
  | 'showdown'       // At showdown
  | 'pot_win'        // When winning a pot
  | 'pot_lose'       // When losing a pot
  | 'any_action'     // On any player action
  | 'own_action'     // On own action
  | 'all_in'         // When going all-in
  | 'manual';        // Player manually triggers

/**
 * Types of effects a relic can have
 */
export type RelicEffectType =
  | 'modify_pot'       // Change pot amount
  | 'modify_stack'     // Change player's stack
  | 'modify_cards'     // Change community or hole cards
  | 'peek_info'        // Reveal hidden information
  | 'redraw_cards'     // Redraw hole cards
  | 'reroll_community' // Reroll community cards
  | 'bonus_payout'     // Extra chips on win
  | 'protection'       // Reduce losses
  | 'reveal_opponent'  // See opponent info
  | 'custom';          // Custom effect handler

/**
 * Effect parameters based on type
 */
export interface RelicEffectParams {
  // modify_pot / modify_stack / bonus_payout
  amount?: number;           // Flat amount
  percentage?: number;       // Percentage modifier

  // modify_cards / redraw_cards
  cardCount?: number;        // How many cards affected
  cardSource?: 'hole' | 'community' | 'any';

  // peek_info / reveal_opponent
  infoType?: 'hole_cards' | 'mucked_cards' | 'next_community' | 'relic';

  // Conditions
  minPotSize?: number;       // Minimum pot to activate
  requiresStreak?: number;   // Requires N consecutive wins/losses
  requiresHandRank?: string; // Requires specific hand (e.g., 'pair', 'flush')

  // Custom
  customHandler?: string;    // Name of custom handler function
}

/**
 * Full relic effect definition
 */
export interface RelicEffect {
  type: RelicEffectType;
  params: RelicEffectParams;
  description: string;       // Human-readable effect description
}

/**
 * Relic definition (from relics.json)
 */
export interface RelicDefinition {
  id: string;
  name: string;
  rarity: RelicRarity;
  activationType: RelicActivationType;
  triggerPhase: RelicTriggerPhase;
  description: string;
  flavorText?: string;       // Latin or thematic quote
  effect: RelicEffect;

  // Triggered relic constraints
  usesPerOrbit?: number;     // How many times can be used per orbit (default: 1)
  usesPerMatch?: number;     // Total uses in match (default: unlimited)
  cooldownHands?: number;    // Hands between uses

  // Conditional relic requirements
  condition?: {
    type: 'streak' | 'stack_threshold' | 'hand_rank' | 'pot_size' | 'custom';
    value: any;
  };
}

/**
 * Player's instance of a relic (includes state)
 */
export interface PlayerRelic {
  definition: RelicDefinition;
  isRevealed: boolean;       // Has this relic been seen by others?
  usesRemaining?: number;    // For limited-use relics
  cooldownRemaining?: number; // Hands until usable again
  acquiredAtOrbit: number;   // When drafted
  lastUsedHand?: number;     // Hand number of last use
}

// ============================================================================
// Roguelike Session Configuration
// ============================================================================

/**
 * When Rogue Breaks occur
 */
export type RogueBreakTrigger =
  | 'hands'          // After N hands
  | 'orbits'         // After N orbits (dealer rotations)
  | 'blind_level'    // At blind level increases
  | 'time'           // After N minutes
  | 'manual';        // Host triggers manually

/**
 * Relic visibility mode
 */
export type RelicVisibility =
  | 'hidden'         // Hidden until used (GDD default)
  | 'visible'        // Always visible to all
  | 'rarity_hint'    // Show rarity glow but not identity
  | 'owner_only';    // Only owner sees, others see nothing

/**
 * Full roguelike session configuration
 */
export interface RoguelikeConfig {
  // Rogue Break settings
  rogueBreakTrigger: RogueBreakTrigger;
  rogueBreakInterval: number;  // Interval based on trigger type
  maxRogueBreaks?: number;     // Limit number of breaks (default: 3)

  // Relic visibility
  relicVisibility: RelicVisibility;
  revealOnUse: boolean;        // Reveal when triggered? (default: true)
  finalOrbitReveal: boolean;   // Auto-reveal all in final orbit? (default: true)

  // Draft settings
  draftChoices: number;        // How many relics to choose from (default: 2)
  draftTimeSeconds: number;    // Time limit for draft (default: 30)
  startingRelics: number;      // Relics given at start (default: 1)
  startingRelicRarity: RelicRarity; // Rarity of starting relic (default: 'common')

  // Rarity pools per break
  rarityPoolsByBreak: {
    break1: RelicRarityWeights;
    break2: RelicRarityWeights;
    break3: RelicRarityWeights;
  };

  // Session limits
  maxOrbits: number;           // Max orbits before timed victory (default: 4)
  sessionTimeLimitMinutes?: number; // Optional hard time limit

  // Blind escalation
  blindEscalationPercent: number; // % increase per orbit (default: 25)

  // Optional features
  enableGhostPlayer: boolean;  // Convert disconnects to AI
  enableEscapeBuyout: boolean; // Allow early leave with 60% stack
  escapeBuyoutPercent: number; // Percentage returned on escape
}

/**
 * Rarity weights for draft pool
 */
export interface RelicRarityWeights {
  common: number;   // e.g., 60
  rare: number;     // e.g., 30
  epic: number;     // e.g., 10
}

/**
 * Default roguelike configuration
 */
export const DEFAULT_ROGUELIKE_CONFIG: RoguelikeConfig = {
  rogueBreakTrigger: 'hands',
  rogueBreakInterval: 12,      // Every 12 hands
  maxRogueBreaks: 3,

  relicVisibility: 'hidden',
  revealOnUse: true,
  finalOrbitReveal: true,

  draftChoices: 2,
  draftTimeSeconds: 30,
  startingRelics: 1,
  startingRelicRarity: 'common',

  rarityPoolsByBreak: {
    break1: { common: 70, rare: 25, epic: 5 },
    break2: { common: 50, rare: 40, epic: 10 },
    break3: { common: 30, rare: 45, epic: 25 },
  },

  maxOrbits: 4,
  sessionTimeLimitMinutes: 30,

  blindEscalationPercent: 25,

  enableGhostPlayer: true,
  enableEscapeBuyout: true,
  escapeBuyoutPercent: 60,
};

// ============================================================================
// Roguelike Game State
// ============================================================================

/**
 * Current state of a roguelike session
 */
export interface RoguelikeState {
  // Timing
  sessionStartedAt: number;
  currentOrbit: number;
  handsInCurrentOrbit: number;
  totalHandsPlayed: number;
  rogueBreaksCompleted: number;

  // Phase
  isInRogueBreak: boolean;
  rogueBreakStartedAt?: number;

  // Draft state (during Rogue Break)
  draftState?: {
    options: Map<string, RelicDefinition[]>; // playerId -> [relic choices]
    selections: Map<string, string>;          // playerId -> selected relic id
    deadline: number;                          // Timestamp when draft ends
  };

  // Relic tracking per player
  playerRelics: Map<string, PlayerRelic[]>;

  // Stats for victory conditions
  potsWonByPlayer: Map<string, number>;
  largestPotByPlayer: Map<string, number>;
}

// ============================================================================
// Events
// ============================================================================

/**
 * Relic-related events
 */
export type RelicEventType =
  | 'relic_drafted'
  | 'relic_activated'
  | 'relic_revealed'
  | 'relic_effect_applied'
  | 'rogue_break_started'
  | 'rogue_break_ended'
  | 'draft_started'
  | 'draft_completed';

export interface RelicEvent {
  type: RelicEventType;
  timestamp: number;
  playerId?: string;
  relicId?: string;
  data?: Record<string, unknown>;
}

// ============================================================================
// Effect Results
// ============================================================================

/**
 * Result of applying a relic effect
 */
export interface RelicEffectResult {
  success: boolean;
  message: string;
  changes?: {
    potDelta?: number;
    stackDeltas?: Map<string, number>;
    cardsChanged?: boolean;
    infoRevealed?: any;
  };
}
