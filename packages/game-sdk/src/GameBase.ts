/**
 * GameBase - Abstract base class for all game implementations
 *
 * Provides infrastructure for:
 * - Player management (seating, standing, reconnection)
 * - Bankroll operations (pots, rake, payouts)
 * - Phase transitions and turn management
 * - Socket event broadcasting
 *
 * Games must implement:
 * - Game-specific phases and rules
 * - Player action handlers
 * - Win condition evaluation
 */

import { Socket } from 'socket.io';

export type GamePhase = string; // 'Lobby' | 'PreHand' | game-specific phases

export type Die = { value: number; locked: boolean; isPublic?: boolean };

export type PlayerCosmetics = {
  banner?: string;
  emblem?: string;
  title?: string;
  diceSkin?: string;
  pipStyle?: string;
  highGlow?: string;
  lowGlow?: string;
  highSkin?: string;
  lowSkin?: string;
};

export type Player = {
  id: string; // socket.id
  name: string;
  isAI: boolean;
  bankroll: number; // pennies
  tableStack?: number;
  googleId?: string;
  cosmetics?: PlayerCosmetics;
};

export type Seat = {
  playerId: string;
  name: string;
  isAI: boolean;
  tableStack: number;
  hasFolded: boolean;
  currentBet: number;
  hasActed: boolean;
  isAllIn?: boolean;
  totalContribution?: number;
  cosmetics?: PlayerCosmetics;
  standingUp?: boolean;
  // Game-specific data can be added by subclasses
  [key: string]: any;
};

export type TableConfig = {
  minHumanPlayers: number;
  targetTotalPlayers: number;
  maxSeats: number;
  betting?: {
    ante?: {
      mode: string;
      amount: number;
    };
  };
};

export type GameState = {
  phase: GamePhase;
  seats: Seat[];
  pot: number;
  currentBet: number;
  ante: number;
  dealerSeatIndex?: number;
  currentTurnPlayerId?: string;
  turnEndsAtMs?: number;
  phaseEndsAtMs?: number;
  handCount?: number;
  // Game-specific state can be added by subclasses
  [key: string]: any;
};

export type WinnerResult = {
  playerId: string;
  name: string;
  payout: number;
  description?: string;
};

/**
 * Metadata that each game must provide to the platform
 * This allows the platform to be completely generic
 */
export interface GameMetadata {
  emoji: string;           // Display emoji for the game (e.g., "♠️", "🎪")
  botNamePrefix: string;   // Prefix for bot names (e.g., "PokerBot", "WarBot")
  defaultBuyIn: number;    // Default buy-in amount in pennies
}

/**
 * Abstract base class for game implementations
 */
export abstract class GameBase {
  public gameType: string = 'unknown';
  public gameState: GameState | null = null;
  protected sockets: Map<string, Socket> = new Map();
  protected tableConfig: TableConfig;
  protected connectedPlayers: Map<string, Player> = new Map(); // playerId -> Player

  constructor(config: TableConfig) {
    this.tableConfig = config;
  }

  // ============================================================
  // ABSTRACT METHODS - Must be implemented by game subclasses
  // ============================================================

  /**
   * Get game metadata for platform integration
   * This allows the platform to be completely generic
   */
  abstract getMetadata(): GameMetadata;

  /**
   * Initialize a new hand/round
   */
  abstract startHand(): void;

  /**
   * Handle game-specific player actions
   */
  abstract handlePlayerAction(playerId: string, action: string, data?: any): void;

  /**
   * Evaluate winners at end of hand
   */
  abstract evaluateWinners(): WinnerResult[];

  /**
   * Get valid actions for a player in current phase
   */
  abstract getValidActions(playerId: string): string[];

  // ============================================================
  // INFRASTRUCTURE METHODS - Provided by base class
  // ============================================================

  /**
   * Register a socket connection
   */
  public registerSocket(socket: Socket, player: Player): void {
    this.sockets.set(player.id, socket);
    this.connectedPlayers.set(player.id, player);
  }

  /**
   * Unregister a socket connection
   */
  public unregisterSocket(playerId: string): void {
    this.sockets.delete(playerId);
    // Don't remove from connectedPlayers - allow reconnection
  }

  /**
   * Get player by ID
   */
  protected getPlayer(playerId: string): Player | undefined {
    return this.connectedPlayers.get(playerId);
  }

  /**
   * Get player by Google ID
   */
  protected getPlayerByGoogleId(googleId: string): Player | undefined {
    for (const player of this.connectedPlayers.values()) {
      if (player.googleId === googleId) {
        return player;
      }
    }
    return undefined;
  }

  /**
   * Find seat by player ID
   */
  protected findSeat(playerId: string): Seat | undefined {
    if (!this.gameState) return undefined;
    return this.gameState.seats.find(s => s && s.playerId === playerId);
  }

  /**
   * Find seat by Google ID
   */
  protected findSeatByGoogleId(googleId: string): Seat | undefined {
    if (!this.gameState) return undefined;

    // Find seat where the player has matching googleId
    for (const seat of this.gameState.seats) {
      if (!seat || seat.isAI) continue;
      const player = this.getPlayer(seat.playerId);
      if (player?.googleId === googleId) {
        return seat;
      }
    }
    return undefined;
  }

  /**
   * Check if a player is currently seated
   */
  public isPlayerSeated(playerId: string): boolean {
    return this.findSeat(playerId) !== undefined;
  }

  /**
   * Mark a player as disconnected (adds suffix to name)
   */
  public markPlayerDisconnected(playerId: string): void {
    const seat = this.findSeat(playerId);
    if (seat && !seat.name.includes('(disconnected)')) {
      seat.name = `${seat.name} (disconnected)`;
      console.log(`👋 [SDK] Marked ${seat.name} as disconnected`);
    }
  }

  /**
   * Clear disconnected flag from player name
   */
  public clearDisconnectedFlag(playerId: string): void {
    const seat = this.findSeat(playerId);
    if (seat) {
      seat.name = seat.name.replace(' (disconnected)', '');
      console.log(`✅ [SDK] Cleared disconnected flag for ${seat.name}`);
    }
  }

  /**
   * Reconnect a player to their existing seat
   * Returns true if reconnection succeeded, false if no seat found
   */
  public reconnectPlayer(socket: Socket, player: Player, oldSocket?: Socket): boolean {
    if (!this.gameState) return false;

    // Try to find existing seat by googleId first
    let existingSeat: Seat | undefined;
    if (player.googleId) {
      existingSeat = this.findSeatByGoogleId(player.googleId);
    }

    // Fallback: try to find by name matching
    if (!existingSeat) {
      existingSeat = this.gameState.seats.find(seat =>
        seat && !seat.isAI && (
          seat.name === player.name ||
          seat.name === `${player.name} (disconnected)` ||
          seat.name.startsWith(player.name)
        )
      );
    }

    if (!existingSeat) {
      return false; // No existing seat found
    }

    const oldPlayerId = existingSeat.playerId;
    console.log(`🔄 [SDK] Reconnecting ${player.name}: ${oldPlayerId.slice(0, 6)} -> ${player.id.slice(0, 6)}`);

    // Unregister old socket
    this.unregisterSocket(oldPlayerId);
    if (oldSocket && oldSocket.id !== socket.id) {
      oldSocket.disconnect(true);
      console.log(`🔌 [SDK] Disconnected old socket ${oldPlayerId.slice(0, 6)}`);
    }

    // Update seat with new player ID
    existingSeat.playerId = player.id;
    this.clearDisconnectedFlag(player.id);

    // Update currentTurnPlayerId if it was their turn
    if (this.gameState.currentTurnPlayerId === oldPlayerId) {
      this.gameState.currentTurnPlayerId = player.id;
      console.log(`🎯 [SDK] Updated currentTurnPlayerId to ${player.id.slice(0, 6)}`);
    }

    // Register new socket
    this.registerSocket(socket, player);

    console.log(`✅ [SDK] Successfully reconnected ${player.name}`);
    return true;
  }

  /**
   * Add AI players to empty seats
   * @param count Number of AI players to add
   * @param aiFactory Function that creates AI player objects
   * @param buyInAmount Optional buy-in amount per AI player (defaults to 0)
   * @returns Number of AI players successfully added
   */
  public addAIPlayers(count: number, aiFactory: () => Player, buyInAmount?: number): number {
    if (!this.gameState) return 0;

    // Find empty seats
    const emptySeats = this.gameState.seats.filter(s => !s || !s.playerId);
    const maxToAdd = Math.min(count, emptySeats.length);

    let added = 0;
    for (let i = 0; i < maxToAdd; i++) {
      const aiPlayer = aiFactory();

      // Seat the AI player (let sitPlayer handle buy-in logic)
      const result = this.sitPlayer(aiPlayer, undefined, buyInAmount || 0);
      if (result.success) {
        added++;
        console.log(`🤖 [SDK] Added AI player: ${aiPlayer.name}`);
      }
    }

    console.log(`🤖 [SDK] Added ${added}/${count} AI players`);
    return added;
  }

  /**
   * Broadcast game state to all connected sockets
   */
  protected broadcastGameState(): void {
    if (!this.gameState) return;

    console.log(`📡 [SDK] Broadcasting game_state: phase="${this.gameState.phase}", sockets=${this.sockets.size}`);
    this.sockets.forEach((socket, playerId) => {
      const state = this.sanitizeGameStateForPlayer(playerId);
      console.log(`📡 [SDK] Emitting to ${playerId.slice(0, 6)}: phase="${state.phase}"`);
      socket.emit('game_state', state);
    });
    console.log(`📡 [SDK] Broadcast complete`);
  }

  /**
   * Sanitize game state for a specific player (hide opponent private info)
   * Can be overridden by subclasses for game-specific hiding
   */
  protected sanitizeGameStateForPlayer(playerId: string): GameState {
    // Base implementation - return full state
    // Subclasses can override to hide information
    return this.gameState!;
  }

  /**
   * Broadcast to all sockets
   */
  protected broadcast(event: string, data: any): void {
    this.sockets.forEach(socket => {
      socket.emit(event, data);
    });
  }

  /**
   * Emit to specific player
   */
  protected emitToPlayer(playerId: string, event: string, data: any): void {
    const socket = this.sockets.get(playerId);
    if (socket) {
      socket.emit(event, data);
    }
  }

  /**
   * Seat a player at the table
   */
  public sitPlayer(player: Player, seatIndex?: number, buyInAmount?: number): { success: boolean; error?: string; seatIndex?: number } {
    if (!this.gameState) {
      return { success: false, error: 'Game not initialized' };
    }

    // Validate buy-in amount
    const requiredBuyIn = buyInAmount || 1000; // Default $10
    if (player.bankroll < requiredBuyIn) {
      return { success: false, error: 'Insufficient bankroll' };
    }

    // Find empty seat
    let targetSeat = seatIndex;
    if (targetSeat === undefined) {
      targetSeat = this.gameState.seats.findIndex(s => s === null);
      if (targetSeat === -1) {
        return { success: false, error: 'No empty seats' };
      }
    }

    // Check if seat is empty
    if (this.gameState.seats[targetSeat] !== null) {
      return { success: false, error: 'Seat already taken' };
    }

    // Create seat
    const seat: Seat = {
      playerId: player.id,
      name: player.name,
      isAI: player.isAI,
      tableStack: requiredBuyIn,
      hasFolded: false,
      currentBet: 0,
      hasActed: false,
      totalContribution: 0,
      ...(player.cosmetics && { cosmetics: player.cosmetics }),
    };

    this.gameState.seats[targetSeat] = seat;

    // Deduct from player bankroll (would normally persist to DB)
    player.bankroll -= requiredBuyIn;
    player.tableStack = requiredBuyIn;

    return { success: true, seatIndex: targetSeat };
  }

  /**
   * Remove player from seat
   */
  public standPlayer(playerId: string, immediate: boolean = false): { success: boolean; error?: string } {
    if (!this.gameState) {
      return { success: false, error: 'Game not initialized' };
    }

    const seatIndex = this.gameState.seats.findIndex(s => s && s.playerId === playerId);
    if (seatIndex === -1) {
      return { success: false, error: 'Player not seated' };
    }

    const seat = this.gameState.seats[seatIndex];
    if (!seat) {
      return { success: false, error: 'Seat is empty' };
    }

    if (immediate || this.gameState.phase === 'Lobby') {
      // Return table stack to bankroll
      const player = this.getPlayer(playerId);
      if (player) {
        player.bankroll += seat.tableStack;
      }

      // Remove from seat
      this.gameState.seats[seatIndex] = null as any; // Type cast for now
      return { success: true };
    } else {
      // Mark for standing after hand
      seat.standingUp = true;
      seat.hasFolded = true;
      return { success: true };
    }
  }

  /**
   * Initialize game state with empty seats
   */
  protected initializeGameState(phase: GamePhase = 'Lobby'): void {
    const emptySeats: Seat[] = Array(this.tableConfig.maxSeats).fill(null);

    this.gameState = {
      phase,
      seats: emptySeats,
      pot: 0,
      currentBet: 0,
      ante: 0,
      handCount: 0,
    };
  }

  /**
   * Get current game state
   */
  public getGameState(): GameState | null {
    return this.gameState;
  }

  /**
   * Get table configuration
   */
  public getTableConfig(): TableConfig {
    return this.tableConfig;
  }

  /**
   * Check if game can start
   */
  protected canStartHand(): boolean {
    if (!this.gameState) return false;

    const seatedPlayers = this.gameState.seats.filter(s => s !== null);
    const humanPlayers = seatedPlayers.filter(s => !s.isAI);

    return (
      humanPlayers.length >= this.tableConfig.minHumanPlayers &&
      seatedPlayers.length >= this.tableConfig.targetTotalPlayers
    );
  }

  /**
   * Collect antes from all seated players
   */
  protected collectAntes(anteAmount: number): void {
    if (!this.gameState) return;

    this.gameState.ante = anteAmount;

    for (const seat of this.gameState.seats) {
      if (!seat || seat.hasFolded || seat.isAllIn) continue;

      const actualAnte = Math.min(anteAmount, seat.tableStack);
      seat.tableStack -= actualAnte;
      seat.totalContribution = (seat.totalContribution || 0) + actualAnte;
      this.gameState.pot += actualAnte;

      if (seat.tableStack === 0) {
        seat.isAllIn = true;
      }
    }
  }

  /**
   * Payout winners
   */
  protected payoutWinners(winners: WinnerResult[]): void {
    if (!this.gameState) return;

    for (const winner of winners) {
      const seat = this.findSeat(winner.playerId);
      if (seat) {
        seat.tableStack += winner.payout;

        // Also update player bankroll for reconnection
        const player = this.getPlayer(winner.playerId);
        if (player) {
          player.tableStack = seat.tableStack;
        }
      }
    }
  }

  /**
   * Clean up after hand ends
   */
  protected endHand(): void {
    if (!this.gameState) return;

    // Remove players marked for standing
    for (let i = 0; i < this.gameState.seats.length; i++) {
      const seat = this.gameState.seats[i];
      if (seat && seat.standingUp) {
        const player = this.getPlayer(seat.playerId);
        if (player) {
          player.bankroll += seat.tableStack;
        }
        this.gameState.seats[i] = null as any;
      }
    }

    // Reset game state for next hand
    this.gameState.phase = 'Lobby';
    this.gameState.pot = 0;
    this.gameState.currentBet = 0;
    this.gameState.handCount = (this.gameState.handCount || 0) + 1;
  }
}
