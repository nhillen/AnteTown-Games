/**
 * Shared Run Types
 *
 * Architecture: Multiple players experience the SAME run together
 * - All players see the same rooms, events, hazards (like bingo balls)
 * - Each player makes individual decisions (advance/exfiltrate)
 * - Players can bust out independently
 * - Run continues until all players are out or max depth reached
 */

import type { GameEvent } from './index.js';

/**
 * Individual player state within a shared run
 */
export interface PlayerRunState {
  playerId: string;
  playerName: string;
  active: boolean;           // Still playing or busted/exfiltrated
  exfiltrated: boolean;      // Cashed out successfully
  bustReason?: 'oxygen' | 'suit' | 'hazard';
  bustDepth?: number;        // What depth they busted at
  exfiltrateDepth?: number;  // What depth they exfiltrated at
  payout?: number;           // Final payout
  joinedAtDepth: number;     // What depth they joined the run
}

/**
 * Shared run state - ONE run with multiple players
 */
export interface SharedRunState {
  runId: string;
  tableId: string;

  // Shared deterministic state (same for all players)
  seed: number;
  depth: number;
  O2: number;
  Suit: number;
  Corruption: number;
  DataMultiplier: number;
  rngCount: number;

  // Run status
  active: boolean;
  phase: 'lobby' | 'descending' | 'completed';

  // Events (same for all players)
  currentEvents: GameEvent[];
  eventHistory: GameEvent[];

  // Player tracking
  players: Map<string, PlayerRunState>;

  // Timing
  createdAt: number;
  startedAt?: number;
  completedAt?: number;

  // Waiting for player decisions
  awaitingDecisions: Set<string>; // Player IDs who need to decide advance/exfiltrate
  autoAdvanceAt?: number;         // Timestamp when run will auto-advance
}

/**
 * Player decision
 */
export type PlayerDecision = 'advance' | 'exfiltrate';

/**
 * Result of a shared advance (all players move together)
 */
export interface SharedAdvanceResult {
  success: boolean;
  newState: SharedRunState;
  events: GameEvent[];
  hazardOccurred: boolean;
  playerResults: Map<string, {
    survived: boolean;
    failureReason: 'oxygen' | 'suit' | 'hazard' | null;
  }>;
}
