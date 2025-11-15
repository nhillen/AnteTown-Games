/**
 * Type definitions for Last Breath game
 */

export * from './SharedRun.js';

/**
 * Game configuration parameters (balancing)
 */
export interface LastBreathConfig {
  /** Starting values */
  start: {
    O2: number;          // Starting oxygen (default: 100)
    Suit: number;        // Starting suit integrity (default: 1.0)
    M0: number;          // Starting data multiplier (default: 1.00)
  };

  /** Resource costs */
  costs: {
    O2Base: number;      // Base O2 cost per advance (default: 5)
  };

  /** Reward parameters */
  rewards: {
    muMin: number;       // Min baseline reward gain (default: 0.008)
    muMax: number;       // Max baseline reward gain (default: 0.018)
    pSurge: number;      // Probability of surge event (default: 0.12)
    surgeMin: number;    // Min surge reward (default: 0.18)
    surgeMax: number;    // Max surge reward (default: 0.30)
  };

  /** Hazard parameters */
  hazard: {
    q0: number;          // Base hazard probability (default: 0.02)
    a: number;           // Hazard increase per depth (default: 0.010)
    beta: number;        // Hazard increase per corruption (default: 0.020)
    lambda: number;      // Reward boost per corruption (default: 0.008)
  };

  /** Event probabilities */
  events: {
    leakP: number;       // Micro-leak probability (default: 0.10)
    canisterP: number;   // Air canister probability (default: 0.07)
    stabilizeP: number;  // Structural brace probability (default: 0.05)
  };

  /** Patch action parameters */
  patch: {
    enabled: boolean;           // Whether patch action is available
    qReduction: number;         // Hazard reduction from patch (default: 0.03)
    rewardPenalty: number;      // Reward multiplier when patching (default: 0.5)
  };

  /** Ante/Wager */
  ante: number;  // Base wager amount
}

/**
 * Event that can occur during a room
 */
export interface GameEvent {
  type: 'micro-leak' | 'air-canister' | 'structural-brace' | 'surge';
  description: string;
  effects: {
    O2?: number;
    Suit?: number;
    Corruption?: number;
    DataMultiplier?: number;
  };
}

/**
 * Current state of a run
 */
export interface RunState {
  /** Run identifier */
  runId: string;

  /** Player ID */
  playerId: string;

  /** RNG seed for this run */
  seed: number;

  /** Number of RNG calls made (for replay) */
  rngCount: number;

  /** Current depth (room number) */
  depth: number;

  /** Current oxygen level */
  O2: number;

  /** Current suit integrity */
  Suit: number;

  /** Current corruption level */
  Corruption: number;

  /** Current data multiplier */
  DataMultiplier: number;

  /** Whether the run is active */
  active: boolean;

  /** Whether the run ended in success (exfiltrated) */
  exfiltrated: boolean;

  /** Events that occurred this room */
  currentEvents: GameEvent[];

  /** History of all events */
  eventHistory: GameEvent[];

  /** Action history for replay */
  actionHistory: ('advance' | 'exfiltrate' | 'patch')[];

  /** Final payout (only set when run ends) */
  payout?: number;

  /** Failure reason (only set if failed) */
  failureReason?: 'oxygen' | 'suit' | 'hazard';
}

/**
 * Result of an advance action
 */
export interface AdvanceResult {
  success: boolean;
  newState: RunState;
  events: GameEvent[];
  hazardOccurred: boolean;
  failureReason?: 'oxygen' | 'suit' | 'hazard';
}

/**
 * Result of an exfiltrate action
 */
export interface ExfiltrateResult {
  success: boolean;
  payout: number;
  finalMultiplier: number;
  finalState: RunState;
}

/**
 * Game metadata
 */
export interface LastBreathMetadata {
  id: string;
  name: string;
  description: string;
  icon: string;
  minPlayers: number;
  maxPlayers: number;
  tags: readonly string[];
  version: string;
  path: string;
}
