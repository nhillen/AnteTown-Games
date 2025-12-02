/**
 * Tournament Instance
 *
 * Manages a single tournament lifecycle. Wraps HouseRules for hand-level poker logic
 * and handles tournament-specific concerns: blind levels, eliminations, payouts.
 */

import type { Player } from '@antetown/game-sdk';
import type { Server as SocketIOServer, Socket } from 'socket.io';
import { HouseRules } from '../HouseRules.js';
import { BlindSchedule } from './BlindSchedule.js';
import { PayoutStructure } from './PayoutStructure.js';
import type {
  TournamentConfig,
  TournamentState,
  TournamentStatus,
  TournamentEntrant,
  EliminatedPlayer,
  TournamentEvent,
  TournamentEventCallback,
  HandCompletionInfo,
  LevelModifierConfig,
  BlindLevel,
} from './TournamentConfig.js';

/**
 * Manages a single tournament from registration through completion
 */
export class TournamentInstance {
  private readonly config: TournamentConfig;
  private readonly blindSchedule: BlindSchedule;
  private payoutStructure: PayoutStructure;  // Not readonly - recalculated when tournament starts
  private state: TournamentState;

  private game: HouseRules | null = null;
  private io: SocketIOServer | null = null;
  private levelTimer: NodeJS.Timeout | null = null;
  private eventListeners: TournamentEventCallback[] = [];

  constructor(config: TournamentConfig) {
    this.config = config;
    this.blindSchedule = new BlindSchedule(config.blindSchedule);
    // Payout structure is calculated when tournament starts (based on actual entrants)
    this.payoutStructure = new PayoutStructure(
      config.payouts,
      config.buyIn * config.maxEntrants // Max prize pool
    );
    this.state = this.initializeState();
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  private initializeState(): TournamentState {
    return {
      status: 'registering',
      entrants: [],
      currentLevel: 0,
      levelStartedAt: 0,
      handsThisLevel: 0,
      totalHandsPlayed: 0,
      activeModifiers: [],
      finishOrder: [],
      tables: [],
      prizePool: 0,
      payouts: [],
    };
  }

  /**
   * Set the Socket.IO server for broadcasting events
   */
  setSocketServer(io: SocketIOServer): void {
    this.io = io;
  }

  /**
   * Add an event listener for tournament events
   */
  addEventListener(callback: TournamentEventCallback): void {
    this.eventListeners.push(callback);
  }

  /**
   * Remove an event listener
   */
  removeEventListener(callback: TournamentEventCallback): void {
    const index = this.eventListeners.indexOf(callback);
    if (index !== -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  // ============================================================================
  // Registration Phase
  // ============================================================================

  /**
   * Register a player for the tournament
   */
  registerPlayer(player: Player): { success: boolean; error?: string } {
    if (this.state.status !== 'registering') {
      return { success: false, error: 'Registration is closed' };
    }

    if (this.state.entrants.length >= this.config.maxEntrants) {
      return { success: false, error: 'Tournament is full' };
    }

    // Check if player is already registered
    if (this.state.entrants.some(e => e.playerId === player.id)) {
      return { success: false, error: 'Player already registered' };
    }

    // Add entrant
    const entrant: TournamentEntrant = {
      playerId: player.id,
      name: player.name,
      isAI: player.isAI,
      registeredAt: Date.now(),
      chipStack: this.config.startingStack,
      isEliminated: false,
    };

    this.state.entrants.push(entrant);

    console.log(`🏆 ${player.name} registered for tournament ${this.config.displayName} (${this.state.entrants.length}/${this.config.maxEntrants})`);

    this.emitEvent({
      type: 'player_registered',
      tournamentId: this.config.tournamentId,
      timestamp: Date.now(),
      data: { playerId: player.id, name: player.name, entrantCount: this.state.entrants.length },
    });

    // Check if we should auto-start (SNG behavior)
    if (this.state.entrants.length >= this.config.maxEntrants) {
      this.startTournament();
    }

    return { success: true };
  }

  /**
   * Unregister a player from the tournament
   */
  unregisterPlayer(playerId: string): { success: boolean; error?: string } {
    if (this.state.status !== 'registering') {
      return { success: false, error: 'Cannot unregister after tournament starts' };
    }

    const index = this.state.entrants.findIndex(e => e.playerId === playerId);
    if (index === -1) {
      return { success: false, error: 'Player not registered' };
    }

    const entrant = this.state.entrants[index];
    this.state.entrants.splice(index, 1);

    console.log(`🏆 ${entrant.name} unregistered from tournament ${this.config.displayName}`);

    this.emitEvent({
      type: 'player_unregistered',
      tournamentId: this.config.tournamentId,
      timestamp: Date.now(),
      data: { playerId, name: entrant.name, entrantCount: this.state.entrants.length },
    });

    return { success: true };
  }

  /**
   * Fill remaining seats with AI players (for PVE mode)
   */
  fillWithAI(createAIPlayer: () => Player): void {
    if (this.config.mode !== 'pve') {
      console.log('🏆 AI fill only available in PVE mode');
      return;
    }

    while (this.state.entrants.length < this.config.maxEntrants) {
      const aiPlayer = createAIPlayer();
      this.registerPlayer(aiPlayer);
    }
  }

  // ============================================================================
  // Tournament Lifecycle
  // ============================================================================

  /**
   * Start the tournament
   */
  private startTournament(): void {
    if (this.state.status !== 'registering') {
      console.log('🏆 Tournament already started');
      return;
    }

    const minEntrants = this.config.minEntrants ?? this.config.maxEntrants;
    if (this.state.entrants.length < minEntrants) {
      console.log(`🏆 Not enough players to start (${this.state.entrants.length}/${minEntrants})`);
      return;
    }

    console.log(`🏆 Starting tournament ${this.config.displayName} with ${this.state.entrants.length} players`);

    this.state.status = 'starting';

    // Calculate actual prize pool
    this.state.prizePool = this.config.buyIn * this.state.entrants.length;
    this.payoutStructure = new PayoutStructure(this.config.payouts, this.state.prizePool);
    this.state.payouts = this.payoutStructure.getAllPayouts();

    this.emitEvent({
      type: 'tournament_starting',
      tournamentId: this.config.tournamentId,
      timestamp: Date.now(),
      data: { entrantCount: this.state.entrants.length, prizePool: this.state.prizePool },
    });

    // Create the HouseRules game instance
    this.createGameInstance();

    // Seat all players
    this.seatAllPlayers();

    // Start the tournament
    this.state.status = 'running';
    this.state.startedAt = Date.now();
    this.state.levelStartedAt = Date.now();

    // Start level timer if time-based progression
    if (this.config.blindSchedule.progression === 'time') {
      this.startLevelTimer();
    }

    this.emitEvent({
      type: 'tournament_started',
      tournamentId: this.config.tournamentId,
      timestamp: Date.now(),
      data: {
        entrantCount: this.state.entrants.length,
        prizePool: this.state.prizePool,
        startingLevel: this.state.currentLevel,
        blinds: this.blindSchedule.getBlinds(0),
      },
    });

    console.log(`🏆 Tournament started! Prize pool: ${this.state.prizePool}, Starting blinds: ${this.blindSchedule.getBlinds(0).smallBlind}/${this.blindSchedule.getBlinds(0).bigBlind}`);
  }

  /**
   * Create the HouseRules game instance for this tournament
   */
  private createGameInstance(): void {
    const blinds = this.blindSchedule.getBlinds(0);

    const gameConfig = {
      tableId: `tournament-${this.config.tournamentId}`,
      variant: this.config.variant,
      mode: this.config.mode.toUpperCase(),
      maxSeats: this.config.maxEntrants,
      smallBlind: blinds.smallBlind,
      bigBlind: blinds.bigBlind,
      minBuyIn: this.config.startingStack,
      maxBuyIn: this.config.startingStack,
      rules: this.config.rules || {},
      // Tournament-specific flags
      format: 'tournament' as const,
      // Callback for hand completion
      onHandComplete: (info: HandCompletionInfo) => this.handleHandComplete(info),
    };

    this.game = new HouseRules(gameConfig);
    // Note: Socket handling is done per-player via registerSocket, not via a server reference
  }

  /**
   * Seat all registered players at the table
   */
  private seatAllPlayers(): void {
    if (!this.game) return;

    for (let i = 0; i < this.state.entrants.length; i++) {
      const entrant = this.state.entrants[i];
      const player: Player = {
        id: entrant.playerId,
        name: entrant.name,
        isAI: entrant.isAI,
        bankroll: 0, // Not used in tournament
      };

      const result = this.game.sitPlayer(player, i, this.config.startingStack);
      if (result.success) {
        entrant.seatIndex = result.seatIndex;
        console.log(`🏆 ${entrant.name} seated at position ${result.seatIndex}`);
      } else {
        console.error(`🏆 Failed to seat ${entrant.name}: ${result.error}`);
      }
    }
  }

  // ============================================================================
  // Hand Completion Handling
  // ============================================================================

  /**
   * Called when a hand completes in the underlying HouseRules game
   */
  private handleHandComplete(info: HandCompletionInfo): void {
    this.state.totalHandsPlayed++;
    this.state.handsThisLevel++;

    console.log(`🏆 Hand ${info.handNumber} complete. Winner: ${info.winnerId}, Pot: ${info.potAmount}`);

    // Update entrant chip counts from seat info
    this.syncChipCounts(info);

    // Check for eliminations
    this.checkEliminations();

    // Check for level advancement (hand-based)
    if (this.config.blindSchedule.progression === 'hands') {
      this.checkLevelAdvancement();
    }

    // Check for tournament completion
    this.checkTournamentComplete();

    // Emit hand completion event
    this.emitEvent({
      type: 'hand_completed',
      tournamentId: this.config.tournamentId,
      timestamp: Date.now(),
      data: {
        handNumber: info.handNumber,
        winnerId: info.winnerId,
        potAmount: info.potAmount,
        level: this.state.currentLevel,
        handsThisLevel: this.state.handsThisLevel,
      },
    });
  }

  /**
   * Sync chip counts from game state to tournament entrants
   */
  private syncChipCounts(info: HandCompletionInfo): void {
    for (const seatInfo of info.seats) {
      const entrant = this.state.entrants.find(e => e.playerId === seatInfo.playerId);
      if (entrant) {
        entrant.chipStack = seatInfo.chipStack;
      }
    }
  }

  /**
   * Check for and process eliminated players
   */
  private checkEliminations(): void {
    const newlyEliminated = this.state.entrants.filter(
      e => !e.isEliminated && e.chipStack <= 0
    );

    for (const entrant of newlyEliminated) {
      this.eliminatePlayer(entrant);
    }
  }

  /**
   * Eliminate a player from the tournament
   */
  private eliminatePlayer(entrant: TournamentEntrant): void {
    entrant.isEliminated = true;
    entrant.eliminatedAt = Date.now();

    // Calculate finish position (remaining players + 1)
    const remainingPlayers = this.state.entrants.filter(e => !e.isEliminated).length;
    const finishPosition = remainingPlayers + 1;
    entrant.finishPosition = finishPosition;

    // Calculate payout
    const payout = this.payoutStructure.getPayoutForPosition(finishPosition);

    // Record elimination
    const eliminated: EliminatedPlayer = {
      playerId: entrant.playerId,
      name: entrant.name,
      finishPosition,
      eliminatedAt: entrant.eliminatedAt,
      eliminatedBy: undefined, // TODO: Track who knocked them out
      payout,
    };

    this.state.finishOrder.push(eliminated);

    console.log(`🏆 ${entrant.name} eliminated in ${finishPosition}${this.getOrdinalSuffix(finishPosition)} place! Payout: ${payout}`);

    this.emitEvent({
      type: 'player_eliminated',
      tournamentId: this.config.tournamentId,
      timestamp: Date.now(),
      data: {
        playerId: entrant.playerId,
        name: entrant.name,
        finishPosition,
        payout,
      },
    });

    // Check for heads-up
    if (remainingPlayers === 2 && this.state.status !== 'headsUp') {
      this.state.status = 'headsUp';
      this.emitEvent({
        type: 'heads_up',
        tournamentId: this.config.tournamentId,
        timestamp: Date.now(),
        data: {
          players: this.state.entrants.filter(e => !e.isEliminated).map(e => ({
            playerId: e.playerId,
            name: e.name,
            chipStack: e.chipStack,
          })),
        },
      });
    }
  }

  // ============================================================================
  // Blind Level Management
  // ============================================================================

  /**
   * Start the level timer (for time-based progression)
   */
  private startLevelTimer(): void {
    if (this.levelTimer) {
      clearTimeout(this.levelTimer);
    }

    const duration = this.blindSchedule.getLevelDuration(this.state.currentLevel);
    this.levelTimer = setTimeout(() => this.advanceLevel(), duration);
  }

  /**
   * Check if we should advance to the next level (hand-based)
   */
  private checkLevelAdvancement(): void {
    if (this.blindSchedule.shouldAdvanceLevel(
      this.state.currentLevel,
      this.state.levelStartedAt,
      this.state.handsThisLevel
    )) {
      this.advanceLevel();
    }
  }

  /**
   * Advance to the next blind level
   */
  private advanceLevel(): void {
    const previousLevel = this.state.currentLevel;
    this.state.currentLevel++;
    this.state.levelStartedAt = Date.now();
    this.state.handsThisLevel = 0;

    const newBlinds = this.blindSchedule.getBlinds(this.state.currentLevel);

    // Update the game's blinds
    if (this.game) {
      this.game.updateBlinds(newBlinds.smallBlind, newBlinds.bigBlind, newBlinds.ante);
    }

    console.log(`🏆 Level ${this.state.currentLevel}: Blinds now ${newBlinds.smallBlind}/${newBlinds.bigBlind}${newBlinds.ante ? ` + ${newBlinds.ante} ante` : ''}`);

    this.emitEvent({
      type: 'level_changed',
      tournamentId: this.config.tournamentId,
      timestamp: Date.now(),
      data: {
        previousLevel,
        newLevel: this.state.currentLevel,
        blinds: newBlinds,
      },
    });

    // Check for level modifiers (roguelike)
    this.checkLevelModifiers();

    // Restart level timer if time-based
    if (this.config.blindSchedule.progression === 'time') {
      this.startLevelTimer();
    }
  }

  /**
   * Check for and apply level modifiers (roguelike mechanics)
   */
  private checkLevelModifiers(): void {
    if (!this.config.levelModifiers) return;

    const newModifiers = this.config.levelModifiers.filter(
      m => m.level === this.state.currentLevel &&
        !this.state.activeModifiers.some(am => am.level === m.level && am.name === m.name)
    );

    for (const modifier of newModifiers) {
      this.activateLevelModifier(modifier);
    }
  }

  /**
   * Activate a level modifier
   */
  private activateLevelModifier(modifier: LevelModifierConfig): void {
    this.state.activeModifiers.push(modifier);

    console.log(`🏆 Level ${modifier.level} modifier activated: ${modifier.name} - ${modifier.description}`);

    // TODO: Apply modifier to game rules
    // This would involve updating the rules engine or game config

    this.emitEvent({
      type: 'level_modifier_activated',
      tournamentId: this.config.tournamentId,
      timestamp: Date.now(),
      data: {
        level: modifier.level,
        modifier,
      },
    });
  }

  // ============================================================================
  // Tournament Completion
  // ============================================================================

  /**
   * Check if the tournament is complete
   */
  private checkTournamentComplete(): void {
    const remainingPlayers = this.state.entrants.filter(e => !e.isEliminated);

    if (remainingPlayers.length === 1) {
      this.finishTournament(remainingPlayers[0]);
    }
  }

  /**
   * Finish the tournament with a winner
   */
  private finishTournament(winner: TournamentEntrant): void {
    if (this.state.status === 'finished') return;

    this.state.status = 'finished';
    this.state.finishedAt = Date.now();

    // Clear level timer
    if (this.levelTimer) {
      clearTimeout(this.levelTimer);
      this.levelTimer = null;
    }

    // Record winner
    winner.finishPosition = 1;
    const payout = this.payoutStructure.getPayoutForPosition(1);

    this.state.finishOrder.push({
      playerId: winner.playerId,
      name: winner.name,
      finishPosition: 1,
      eliminatedAt: Date.now(),
      payout,
    });

    const duration = this.state.finishedAt - (this.state.startedAt || this.state.finishedAt);

    console.log(`🏆 Tournament complete! Winner: ${winner.name}, Payout: ${payout}`);
    console.log(`🏆 Duration: ${Math.floor(duration / 60000)} minutes, Hands played: ${this.state.totalHandsPlayed}`);

    this.emitEvent({
      type: 'tournament_finished',
      tournamentId: this.config.tournamentId,
      timestamp: Date.now(),
      data: {
        results: this.state.finishOrder,
        duration,
        handsPlayed: this.state.totalHandsPlayed,
      },
    });
  }

  // ============================================================================
  // Public Getters
  // ============================================================================

  /**
   * Get the tournament configuration
   */
  getConfig(): TournamentConfig {
    return this.config;
  }

  /**
   * Get the current tournament state
   */
  getState(): TournamentState {
    return { ...this.state };
  }

  /**
   * Get the tournament status
   */
  getStatus(): TournamentStatus {
    return this.state.status;
  }

  /**
   * Get the underlying HouseRules game instance
   */
  getGame(): HouseRules | null {
    return this.game;
  }

  /**
   * Get current blind level info
   */
  getCurrentBlinds(): BlindLevel {
    const blinds = this.blindSchedule.getBlinds(this.state.currentLevel);
    return {
      level: this.state.currentLevel,
      smallBlind: blinds.smallBlind,
      bigBlind: blinds.bigBlind,
      ante: blinds.ante,
    };
  }

  /**
   * Get remaining players count
   */
  getRemainingPlayers(): number {
    return this.state.entrants.filter(e => !e.isEliminated).length;
  }

  /**
   * Get time remaining in current level (time-based only)
   */
  getTimeRemaining(): number {
    return this.blindSchedule.getTimeRemaining(this.state.currentLevel, this.state.levelStartedAt);
  }

  /**
   * Get hands remaining in current level (hand-based only)
   */
  getHandsRemaining(): number {
    return this.blindSchedule.getHandsRemaining(this.state.handsThisLevel);
  }

  // ============================================================================
  // Socket Handling
  // ============================================================================

  /**
   * Handle a socket connection to the tournament
   * The socket must be associated with a registered player
   */
  handleSocketConnection(socket: Socket, player: Player): void {
    if (!this.game) {
      socket.emit('error', { message: 'Tournament not started' });
      return;
    }

    // Check if player is registered
    const entrant = this.state.entrants.find(e => e.playerId === player.id);
    if (!entrant) {
      socket.emit('error', { message: 'Player not registered for this tournament' });
      return;
    }

    // Register the socket with the underlying game
    this.game.registerSocket(socket, player);

    // Emit tournament-specific info
    socket.emit('tournament_info', {
      config: this.config,
      state: this.getState(),
      currentBlinds: this.getCurrentBlinds(),
    });
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
   * Emit a tournament event to all listeners
   */
  private emitEvent(event: TournamentEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in tournament event listener:', err);
      }
    }

    // Also broadcast via Socket.IO if available
    if (this.io) {
      this.io.to(`tournament-${this.config.tournamentId}`).emit('tournament_event', event);
    }
  }

  /**
   * Get ordinal suffix for a number (1st, 2nd, 3rd, etc.)
   */
  private getOrdinalSuffix(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }
}
