/**
 * Tournament Configuration Types
 *
 * Defines all types and interfaces for the Sit-and-Go tournament system.
 */

import type { RuleModifiers, GameVariant } from '../rules/RulesEngine.js';
import type { RoguelikeConfig, RoguelikeState, PlayerRelic, RelicDefinition } from '../relics/types.js';

// ============================================================================
// Tournament Classification
// ============================================================================

/**
 * Tournament type - how the tournament is structured
 */
export type TournamentType = 'sng' | 'mtt';

/**
 * Tournament status - lifecycle state
 */
export type TournamentStatus =
  | 'registering'  // Accepting players
  | 'starting'     // About to start (brief countdown)
  | 'running'      // Tournament in progress
  | 'paused'       // MTT break between levels
  | 'finalTable'   // MTT: down to last table
  | 'headsUp'      // Down to 2 players
  | 'finished'     // Tournament complete
  | 'cancelled';   // Cancelled before start

/**
 * Player mode - who can play
 */
export type TournamentMode = 'pvp' | 'pve';

/**
 * How blinds increase
 */
export type BlindProgression = 'time' | 'hands';

// ============================================================================
// Blind Schedule
// ============================================================================

/**
 * A single blind level in the tournament structure
 */
export interface BlindLevel {
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante?: number;
  duration?: number;  // Override default duration for this level (ms)
}

/**
 * Blind schedule configuration
 */
export interface BlindScheduleConfig {
  levels: BlindLevel[];
  progression: BlindProgression;
  levelDuration?: number;    // Default duration in ms (time-based)
  handsPerLevel?: number;    // Default hands per level (hand-based)
}

// ============================================================================
// Payout Structure
// ============================================================================

/**
 * Payout configuration
 */
export interface PayoutConfig {
  /**
   * Payout percentages for each finishing position (1-indexed)
   * e.g., [50, 30, 20] means 1st gets 50%, 2nd gets 30%, 3rd gets 20%
   */
  percentages: number[];
}

/**
 * Calculated payout for a position
 */
export interface TournamentPayout {
  position: number;
  amount: number;
  playerId?: string;  // Set when someone finishes here
}

// ============================================================================
// Level Modifiers (Roguelike)
// ============================================================================

/**
 * A modifier that activates at a specific blind level
 */
export interface LevelModifierConfig {
  level: number;
  name: string;
  description: string;
  announcement?: string;      // Message shown when activated
  modifier: Partial<RuleModifiers>;
}

// ============================================================================
// Tournament Configuration
// ============================================================================

/**
 * Full tournament configuration
 */
export interface TournamentConfig {
  // Identity
  tournamentId: string;
  displayName: string;

  // Structure
  type: TournamentType;
  mode: TournamentMode;
  variant: GameVariant;

  // Entry
  buyIn: number;              // Entry fee in currency (pennies)
  startingStack: number;      // Starting chip count
  maxEntrants: number;        // Maximum players (SNG: usually 6, 9, or 10)
  minEntrants?: number;       // Minimum to start (SNG: usually maxEntrants)

  // Blinds
  blindSchedule: BlindScheduleConfig;

  // Payouts
  payouts: PayoutConfig;

  // Rule modifiers (base rules for the tournament)
  rules?: RuleModifiers;

  // Roguelike level modifiers (table-wide rules changes)
  levelModifiers?: LevelModifierConfig[];

  // Roguelike relic system (per-player powers)
  roguelikeConfig?: Partial<RoguelikeConfig>;

  // MTT-specific (for future)
  playersPerTable?: number;   // Players per table (default: 9)
  tableBalancing?: 'immediate' | 'onBreak';
  breakDuration?: number;     // Break duration in ms
  breakInterval?: number;     // Levels between breaks
}

// ============================================================================
// Tournament State
// ============================================================================

/**
 * A registered player in the tournament
 */
export interface TournamentEntrant {
  playerId: string;
  name: string;
  isAI: boolean;
  registeredAt: number;       // Timestamp

  // Current status
  chipStack: number;          // Current chip count
  tableId?: string;           // Which table (for MTT)
  seatIndex?: number;         // Their seat

  // Elimination
  isEliminated: boolean;
  finishPosition?: number;
  eliminatedAt?: number;
  eliminatedBy?: string;      // Player ID who knocked them out
}

/**
 * Record of an eliminated player
 */
export interface EliminatedPlayer {
  playerId: string;
  name: string;
  finishPosition: number;
  eliminatedAt: number;
  eliminatedBy?: string;
  payout: number;
}

/**
 * A table in the tournament (for MTT support)
 */
export interface TournamentTable {
  tableId: string;
  seatCount: number;
  activePlayers: number;
  // gameInstance reference stored separately to avoid circular deps
}

/**
 * Full tournament state
 */
export interface TournamentState {
  status: TournamentStatus;

  // Registration
  entrants: TournamentEntrant[];
  registrationOpens?: number;
  registrationCloses?: number;

  // Current game progress
  currentLevel: number;
  levelStartedAt: number;
  handsThisLevel: number;
  totalHandsPlayed: number;

  // Active level modifiers (roguelike)
  activeModifiers: LevelModifierConfig[];

  // Eliminations (in order of elimination, first out = first in array)
  finishOrder: EliminatedPlayer[];

  // Tables (MTT)
  tables: TournamentTable[];

  // Prizes
  prizePool: number;
  payouts: TournamentPayout[];

  // Timing
  startedAt?: number;
  finishedAt?: number;

  // Roguelike state (when roguelikeConfig is set)
  roguelikeState?: {
    currentOrbit: number;
    handsInCurrentOrbit: number;
    rogueBreaksCompleted: number;
    isInRogueBreak: boolean;
    playerRelics: Record<string, PlayerRelic[]>;  // playerId -> relics
  };
}

// ============================================================================
// Tournament Events
// ============================================================================

/**
 * Tournament event types
 */
export type TournamentEventType =
  | 'tournament_created'
  | 'player_registered'
  | 'player_unregistered'
  | 'tournament_starting'
  | 'tournament_started'
  | 'hand_completed'
  | 'level_changed'
  | 'level_modifier_activated'
  | 'player_eliminated'
  | 'heads_up'
  | 'table_broke'             // MTT: table closed
  | 'table_balanced'          // MTT: players moved
  | 'final_table'             // MTT: down to last table
  | 'break_started'           // MTT: break begins
  | 'break_ended'             // MTT: break ends
  | 'tournament_finished'
  | 'tournament_cancelled'
  // Roguelike events
  | 'rogue_break_triggered'   // Break is about to start
  | 'rogue_break_started'     // Draft phase started
  | 'rogue_break_ended'       // Draft complete, resuming play
  | 'relic_drafted'           // Player drafted a relic
  | 'relic_activated'         // Player activated a relic
  | 'relic_revealed'          // A hidden relic was revealed
  | 'orbit_started';          // New orbit (dealer rotation) began

/**
 * Base tournament event
 */
export interface TournamentEvent {
  type: TournamentEventType;
  tournamentId: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

/**
 * Event: Level changed
 */
export interface LevelChangedEvent extends TournamentEvent {
  type: 'level_changed';
  data: {
    previousLevel: number;
    newLevel: number;
    blinds: BlindLevel;
  };
}

/**
 * Event: Player eliminated
 */
export interface PlayerEliminatedEvent extends TournamentEvent {
  type: 'player_eliminated';
  data: {
    playerId: string;
    name: string;
    finishPosition: number;
    eliminatedBy?: string;
    payout: number;
  };
}

/**
 * Event: Level modifier activated
 */
export interface LevelModifierActivatedEvent extends TournamentEvent {
  type: 'level_modifier_activated';
  data: {
    level: number;
    modifier: LevelModifierConfig;
  };
}

/**
 * Event: Tournament finished
 */
export interface TournamentFinishedEvent extends TournamentEvent {
  type: 'tournament_finished';
  data: {
    results: EliminatedPlayer[];
    duration: number;
    handsPlayed: number;
  };
}

// ============================================================================
// Callback Types
// ============================================================================

/**
 * Callback for tournament events
 */
export type TournamentEventCallback = (event: TournamentEvent) => void;

/**
 * Callback for hand completion (from HouseRules)
 */
export interface HandCompletionInfo {
  handNumber: number;
  winnerId: string;
  potAmount: number;
  wasAllIn: boolean;
  winnerHandRank?: string;
  seats: Array<{
    playerId: string;
    chipStack: number;
    isEliminated: boolean;
  }>;
  eliminatedPlayerIds: string[];
}

// ============================================================================
// Roguelike Event Types
// ============================================================================

/**
 * Event: Rogue break triggered
 */
export interface RogueBreakTriggeredEvent extends TournamentEvent {
  type: 'rogue_break_triggered';
  data: {
    breakNumber: number;
    trigger: string;  // 'hands' | 'orbits' | 'blind_level' | 'time' | 'manual'
  };
}

/**
 * Event: Rogue break started (draft phase)
 */
export interface RogueBreakStartedEvent extends TournamentEvent {
  type: 'rogue_break_started';
  data: {
    breakNumber: number;
    draftTimeSeconds: number;
    deadline: number;
  };
}

/**
 * Event: Rogue break ended
 */
export interface RogueBreakEndedEvent extends TournamentEvent {
  type: 'rogue_break_ended';
  data: {
    breakNumber: number;
    draftResults: Array<{
      playerId: string;
      relicId: string | null;
      relicName?: string;
    }>;
  };
}

/**
 * Event: Relic drafted by player
 */
export interface RelicDraftedEvent extends TournamentEvent {
  type: 'relic_drafted';
  data: {
    playerId: string;
    relicId: string;
    relicName: string;
    rarity: string;
  };
}

/**
 * Event: Relic activated
 */
export interface RelicActivatedEvent extends TournamentEvent {
  type: 'relic_activated';
  data: {
    playerId: string;
    relicId: string;
    relicName: string;
    effectDescription: string;
    wasRevealed: boolean;
  };
}
