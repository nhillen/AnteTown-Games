/**
 * Tournament Manager
 *
 * Registry and lifecycle management for all tournaments.
 * Handles tournament creation, discovery, and cleanup.
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { Player } from '@antetown/game-sdk';
import { TournamentInstance } from './TournamentInstance.js';
import { BlindSchedule } from './BlindSchedule.js';
import { PayoutStructure } from './PayoutStructure.js';
import type {
  TournamentConfig,
  TournamentStatus,
  TournamentEvent,
  TournamentEventCallback,
} from './TournamentConfig.js';

/**
 * Summary info about a tournament for listing
 */
export interface TournamentSummary {
  tournamentId: string;
  displayName: string;
  type: 'sng' | 'mtt';
  mode: 'pvp' | 'pve';
  status: TournamentStatus;
  buyIn: number;
  startingStack: number;
  maxEntrants: number;
  currentEntrants: number;
  prizePool: number;
  variant: string;
}

/**
 * Manages all tournaments in the system
 */
export class TournamentManager {
  private tournaments: Map<string, TournamentInstance> = new Map();
  private io: SocketIOServer | null = null;
  private globalEventListeners: TournamentEventCallback[] = [];

  /**
   * Set the Socket.IO server for all tournaments
   */
  setSocketServer(io: SocketIOServer): void {
    this.io = io;

    // Update existing tournaments
    for (const tournament of this.tournaments.values()) {
      tournament.setSocketServer(io);
    }
  }

  /**
   * Add a global event listener for all tournaments
   */
  addGlobalEventListener(callback: TournamentEventCallback): void {
    this.globalEventListeners.push(callback);
  }

  /**
   * Remove a global event listener
   */
  removeGlobalEventListener(callback: TournamentEventCallback): void {
    const index = this.globalEventListeners.indexOf(callback);
    if (index !== -1) {
      this.globalEventListeners.splice(index, 1);
    }
  }

  // ============================================================================
  // Tournament Lifecycle
  // ============================================================================

  /**
   * Create a new tournament
   */
  createTournament(config: TournamentConfig): TournamentInstance {
    if (this.tournaments.has(config.tournamentId)) {
      throw new Error(`Tournament ${config.tournamentId} already exists`);
    }

    const tournament = new TournamentInstance(config);

    // Set up Socket.IO if available
    if (this.io) {
      tournament.setSocketServer(this.io);
    }

    // Forward events to global listeners
    tournament.addEventListener((event) => {
      for (const listener of this.globalEventListeners) {
        try {
          listener(event);
        } catch (err) {
          console.error('Error in global tournament event listener:', err);
        }
      }
    });

    this.tournaments.set(config.tournamentId, tournament);

    console.log(`🏆 Tournament created: ${config.displayName} (${config.tournamentId})`);

    return tournament;
  }

  /**
   * Get a tournament by ID
   */
  getTournament(tournamentId: string): TournamentInstance | undefined {
    return this.tournaments.get(tournamentId);
  }

  /**
   * Delete a tournament (only if finished or cancelled)
   */
  deleteTournament(tournamentId: string): boolean {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      return false;
    }

    const status = tournament.getStatus();
    if (status !== 'finished' && status !== 'cancelled') {
      console.warn(`🏆 Cannot delete tournament ${tournamentId} - status is ${status}`);
      return false;
    }

    this.tournaments.delete(tournamentId);
    console.log(`🏆 Tournament deleted: ${tournamentId}`);
    return true;
  }

  // ============================================================================
  // Tournament Discovery
  // ============================================================================

  /**
   * Get all tournaments
   */
  getAllTournaments(): TournamentInstance[] {
    return Array.from(this.tournaments.values());
  }

  /**
   * Get tournaments by status
   */
  getTournamentsByStatus(status: TournamentStatus): TournamentInstance[] {
    return this.getAllTournaments().filter(t => t.getStatus() === status);
  }

  /**
   * Get active tournaments (registering or running)
   */
  getActiveTournaments(): TournamentInstance[] {
    return this.getAllTournaments().filter(t => {
      const status = t.getStatus();
      return status !== 'finished' && status !== 'cancelled';
    });
  }

  /**
   * Get tournaments available for registration
   */
  getOpenTournaments(): TournamentInstance[] {
    return this.getTournamentsByStatus('registering');
  }

  /**
   * Get tournament summaries for listing
   */
  getTournamentSummaries(): TournamentSummary[] {
    return this.getAllTournaments().map(t => {
      const config = t.getConfig();
      const state = t.getState();
      return {
        tournamentId: config.tournamentId,
        displayName: config.displayName,
        type: config.type,
        mode: config.mode,
        status: state.status,
        buyIn: config.buyIn,
        startingStack: config.startingStack,
        maxEntrants: config.maxEntrants,
        currentEntrants: state.entrants.length,
        prizePool: state.prizePool,
        variant: config.variant,
      };
    });
  }

  // ============================================================================
  // Player Actions
  // ============================================================================

  /**
   * Register a player for a tournament
   */
  registerPlayer(tournamentId: string, player: Player): { success: boolean; error?: string } {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      return { success: false, error: 'Tournament not found' };
    }

    return tournament.registerPlayer(player);
  }

  /**
   * Unregister a player from a tournament
   */
  unregisterPlayer(tournamentId: string, playerId: string): { success: boolean; error?: string } {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      return { success: false, error: 'Tournament not found' };
    }

    return tournament.unregisterPlayer(playerId);
  }

  /**
   * Handle a socket connection for a tournament
   */
  handleSocketConnection(tournamentId: string, socket: Socket, player: Player): void {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      socket.emit('error', { message: 'Tournament not found' });
      return;
    }

    tournament.handleSocketConnection(socket, player);
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Clean up finished tournaments older than the specified age
   */
  cleanupOldTournaments(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, tournament] of this.tournaments.entries()) {
      const state = tournament.getState();
      if (
        (state.status === 'finished' || state.status === 'cancelled') &&
        state.finishedAt &&
        now - state.finishedAt > maxAgeMs
      ) {
        this.tournaments.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🏆 Cleaned up ${cleaned} old tournaments`);
    }

    return cleaned;
  }

  // ============================================================================
  // Factory Methods
  // ============================================================================

  /**
   * Create a standard SNG tournament with default settings
   */
  createStandardSNG(options: {
    displayName: string;
    buyIn: number;
    maxEntrants: 6 | 9 | 10;
    mode?: 'pvp' | 'pve';
    variant?: 'holdem' | 'omaha';
  }): TournamentInstance {
    const { displayName, buyIn, maxEntrants, mode = 'pvp', variant = 'holdem' } = options;

    const tournamentId = `sng-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startingStack = buyIn * 100; // 100 BB starting stack

    const config: TournamentConfig = {
      tournamentId,
      displayName,
      type: 'sng',
      mode,
      variant,
      buyIn,
      startingStack,
      maxEntrants,
      blindSchedule: BlindSchedule.createStandardSNG(startingStack, 'hands'),
      payouts: PayoutStructure.forEntrantCount(maxEntrants),
    };

    return this.createTournament(config);
  }

  /**
   * Create a turbo SNG tournament
   */
  createTurboSNG(options: {
    displayName: string;
    buyIn: number;
    maxEntrants: 6 | 9 | 10;
    mode?: 'pvp' | 'pve';
  }): TournamentInstance {
    const { displayName, buyIn, maxEntrants, mode = 'pvp' } = options;

    const tournamentId = `turbo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startingStack = buyIn * 50; // 50 BB starting stack (shorter)

    const config: TournamentConfig = {
      tournamentId,
      displayName,
      type: 'sng',
      mode,
      variant: 'holdem',
      buyIn,
      startingStack,
      maxEntrants,
      blindSchedule: BlindSchedule.createTurboSNG(startingStack, 'hands'),
      payouts: PayoutStructure.forEntrantCount(maxEntrants),
    };

    return this.createTournament(config);
  }

  /**
   * Create a roguelike SNG tournament with level modifiers
   */
  createRoguelikeSNG(options: {
    displayName: string;
    buyIn: number;
    maxEntrants: 6 | 9 | 10;
    mode?: 'pvp' | 'pve';
    modifierSet?: 'roguelike' | 'chaos' | 'highstakes';
  }): TournamentInstance {
    const { displayName, buyIn, maxEntrants, mode = 'pvp', modifierSet = 'roguelike' } = options;

    // Import modifier set
    const { getModifierSet } = require('./LevelModifiers.js');
    const levelModifiers = getModifierSet(modifierSet);

    const tournamentId = `rogue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startingStack = buyIn * 100;

    const config: TournamentConfig = {
      tournamentId,
      displayName,
      type: 'sng',
      mode,
      variant: 'holdem',
      buyIn,
      startingStack,
      maxEntrants,
      blindSchedule: BlindSchedule.createStandardSNG(startingStack, 'hands'),
      payouts: PayoutStructure.forEntrantCount(maxEntrants),
      levelModifiers,
    };

    return this.createTournament(config);
  }
}

// Singleton instance for convenience
let defaultManager: TournamentManager | null = null;

/**
 * Get the default tournament manager instance
 */
export function getDefaultTournamentManager(): TournamentManager {
  if (!defaultManager) {
    defaultManager = new TournamentManager();
  }
  return defaultManager;
}
