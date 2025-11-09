/**
 * PiratePlunderTable - Manages a single table instance for Pirate Plunder
 *
 * Extends GameBase SDK for:
 * - Player management (seating, standing, reconnection)
 * - Bankroll operations
 * - Socket event broadcasting
 * - Standardized types
 */

import { Namespace, Socket } from 'socket.io';
import { GameBase, Player, Seat, GameMetadata, GameState, WinnerResult, TableConfig } from '@antetown/game-sdk';

export interface PiratePlunderTableConfig {
  tableId: string;
  displayName: string;
  ante: number;           // In base currency units
  minBuyIn: number;       // In base currency units
  maxSeats: number;
  rake: number;           // Percentage (e.g., 5 for 5%)
  mode?: string;          // 'PVE' or 'PVP'
  currency?: string;      // Currency symbol (e.g., 'TC', 'SC') - defaults to 'TC'
}

export interface PiratePlunderGameState extends GameState {
  cargoChest: number;
  // Add Pirate Plunder specific state here as game develops
  dice?: any[];
  roles?: any;
}

export class PiratePlunderTable extends GameBase {
  private config: PiratePlunderTableConfig;
  private namespace: Namespace;

  constructor(config: PiratePlunderTableConfig, namespace: Namespace) {
    // Convert to GameBase TableConfig format
    const tableConfig: TableConfig = {
      minHumanPlayers: config.mode?.toUpperCase() === 'PVE' ? 1 : 2,
      targetTotalPlayers: config.mode?.toUpperCase() === 'PVE' ? 2 : 4,
      maxSeats: config.maxSeats,
      currency: config.currency || 'TC',
      betting: {
        ante: {
          mode: 'fixed',
          amount: config.ante
        }
      }
    };

    super(tableConfig);
    this.config = config;
    this.namespace = namespace;
    this.gameType = 'pirate-plunder';

    // Initialize game state with Pirate Plunder specifics
    this.initializeGameState('Lobby');
    if (this.gameState) {
      (this.gameState as PiratePlunderGameState).cargoChest = 0;
    }
  }

  // ============================================================
  // REQUIRED GAMEBASE ABSTRACT METHODS
  // ============================================================

  getMetadata(): GameMetadata {
    return {
      emoji: '🎲',
      botNamePrefix: 'PirateBot',
      defaultBuyIn: this.config.minBuyIn
    };
  }

  startHand(): void {
    if (!this.gameState) return;

    console.log(`[${this.config.tableId}] Starting hand`);

    // Reset for new hand
    this.gameState.phase = 'Betting';
    this.gameState.pot = 0;
    this.gameState.currentBet = this.config.ante;

    // Reset all seats
    for (const seat of this.gameState.seats) {
      if (seat) {
        seat.hasFolded = false;
        seat.currentBet = 0;
        seat.hasActed = false;
        seat.isAllIn = false;
      }
    }

    // Collect antes
    this.collectAntes(this.config.ante);

    // Broadcast updated state
    this.broadcastGameState();
  }

  handlePlayerAction(playerId: string, action: string, data?: any): void {
    // TODO: Implement Pirate Plunder specific actions
    // For now, just log
    console.log(`[${this.config.tableId}] Player ${playerId.slice(0, 6)} action: ${action}`, data);

    // Placeholder implementation
    const seat = this.findSeat(playerId);
    if (!seat) return;

    switch (action) {
      case 'bet':
      case 'raise':
      case 'call':
      case 'fold':
        // Handle betting actions
        break;
      case 'lock_dice':
        // Handle dice locking
        break;
      default:
        console.warn(`[${this.config.tableId}] Unknown action: ${action}`);
    }
  }

  evaluateWinners(): WinnerResult[] {
    // TODO: Implement Pirate Plunder win evaluation
    // For now, return empty array
    return [];
  }

  getValidActions(playerId: string): string[] {
    // TODO: Implement based on game phase and player state
    const seat = this.findSeat(playerId);
    if (!seat || seat.hasFolded) return [];

    if (!this.gameState) return [];

    // Basic actions based on phase
    switch (this.gameState.phase) {
      case 'Betting':
        return ['fold', 'call', 'raise'];
      case 'DiceRoll':
        return ['lock_dice', 'roll'];
      default:
        return [];
    }
  }

  /**
   * Create an AI player for Pirate Plunder
   */
  createAIPlayer(): Player {
    const botNames = ['PirateBot', 'Captain Hook', 'Blackbeard', 'Anne Bonny', 'Calico Jack', 'Morgan'];
    const randomName = botNames[Math.floor(Math.random() * botNames.length)] || 'PirateBot';
    const uniqueId = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    return {
      id: uniqueId,
      name: randomName,
      isAI: true,
      bankroll: 10000 // AI starting bankroll
    };
  }

  // ============================================================
  // PIRATE PLUNDER SPECIFIC PUBLIC METHODS
  // ============================================================

  getTableId(): string {
    return this.config.tableId;
  }

  getConfig(): PiratePlunderTableConfig {
    return this.config;
  }

  /**
   * Handle player joining the table (lobby)
   * Uses GameBase's registerSocket
   */
  handleJoin(socket: Socket, payload: { name: string; bankroll?: number; googleId?: string }) {
    console.log(`[${this.config.tableId}] Player ${payload.name} joining`);

    const player: Player = {
      id: socket.id,
      name: payload.name,
      isAI: false,
      bankroll: payload.bankroll || 10000,
      ...(payload.googleId && { googleId: payload.googleId })
    };

    // Use GameBase's registerSocket
    this.registerSocket(socket, player);

    // Try to reconnect to existing seat if they have one
    const reconnected = this.reconnectPlayer(socket, player);

    // Send joined response (frontend expects { player, isAdmin })
    socket.emit('joined', {
      player: {
        id: player.id,
        name: player.name,
        isAI: player.isAI,
        bankroll: player.bankroll
      },
      isAdmin: false
    });

    // Broadcast updated lobby state
    this.broadcastLobbyState();

    // Broadcast table state if they reconnected
    if (reconnected) {
      this.broadcastTableState();
      if (this.gameState) {
        this.broadcastGameState();
      }
    }
  }

  /**
   * Handle player sitting down at a seat
   * Uses GameBase's sitPlayer
   */
  handleSitDown(socket: Socket, payload: { seatIndex?: number; buyInAmount?: number }) {
    console.log(`[${this.config.tableId}] sit_down from ${socket.id}:`, payload);

    const player = this.connectedPlayers.get(socket.id);
    if (!player) {
      socket.emit('error', 'Player not found. Please rejoin.');
      return;
    }

    const { seatIndex, buyInAmount = this.config.minBuyIn } = payload;

    // Validate buy-in amount
    if (buyInAmount < this.config.minBuyIn) {
      socket.emit('error', `Minimum buy-in is ${this.config.minBuyIn} ${this.currency}`);
      return;
    }

    // Use GameBase's sitPlayer method
    const result = this.sitPlayer(player, seatIndex, buyInAmount);

    if (!result.success) {
      socket.emit('error', result.error || 'Failed to sit down');
      return;
    }

    console.log(`[${this.config.tableId}] ${player.name} sat at seat ${result.seatIndex} with ${buyInAmount} ${this.currency}`);

    // In PVE mode, automatically add AI players to fill remaining seats
    if (this.config.mode?.toUpperCase() === 'PVE' && this.gameState) {
      const seatedCount = this.gameState.seats.filter(s => s !== null).length;
      const mode = this.config.mode?.toUpperCase() || 'PVP';
      const targetTotalPlayers = mode === 'PVE' ? 2 : 4;
      const neededPlayers = targetTotalPlayers - seatedCount;

      if (neededPlayers > 0) {
        console.log(`[${this.config.tableId}] PVE mode: Adding ${neededPlayers} AI players`);
        const added = this.addAIPlayers(neededPlayers, () => this.createAIPlayer(), this.config.minBuyIn);
        console.log(`[${this.config.tableId}] Added ${added} AI players`);
      }
    }

    // Broadcast updated state
    this.broadcastTableState();

    // Check if we can start the game
    if (this.canStartHand()) {
      this.startHand();
    }
  }

  /**
   * Handle player standing up
   * Uses GameBase's standPlayer
   */
  handleStandUp(socket: Socket) {
    console.log(`[${this.config.tableId}] stand_up from ${socket.id}`);

    const player = this.connectedPlayers.get(socket.id);
    if (!player) {
      socket.emit('error', 'Player not found');
      return;
    }

    // Use GameBase's standPlayer method
    const result = this.standPlayer(player.id, true); // immediate = true for now

    if (!result.success) {
      socket.emit('error', result.error || 'Failed to stand up');
      return;
    }

    console.log(`[${this.config.tableId}] ${player.name} stood up`);

    this.broadcastTableState();
  }

  /**
   * Handle player disconnect
   * For now, immediately remove from seat
   * TODO: Add reconnection timeout period
   */
  handleDisconnect(socket: Socket) {
    console.log(`[${this.config.tableId}] disconnect from ${socket.id}`);

    // Remove player from seat immediately
    const result = this.standPlayer(socket.id, true);

    if (result.success) {
      console.log(`[${this.config.tableId}] Removed disconnected player from seat`);
      this.broadcastTableState();
    }

    // Unregister socket (GameBase method)
    this.unregisterSocket(socket.id);
  }

  /**
   * Get current stats for this table
   */
  getStats() {
    if (!this.gameState) {
      return {
        seatedPlayers: 0,
        humanPlayers: 0,
        waitingForPlayers: true,
        phase: 'Lobby'
      };
    }

    const seatedPlayers = this.gameState.seats.filter(s => s !== null).length;
    const humanPlayers = this.gameState.seats.filter(s => s && !s.isAI).length;

    return {
      seatedPlayers,
      humanPlayers,
      waitingForPlayers: !this.canStartHand(),
      phase: this.gameState.phase
    };
  }

  // ============================================================
  // PRIVATE HELPER METHODS
  // ============================================================

  private broadcastLobbyState() {
    // Get all connected players
    const players = Array.from(this.connectedPlayers.values()).map(p => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      bankroll: p.bankroll
    }));

    const lobbyState = { players };

    console.log(`[${this.config.tableId}] Broadcasting lobby state with ${players.length} players`);

    // Emit to all connected sockets
    this.broadcast('lobby_state', lobbyState);
  }

  private broadcastTableState() {
    if (!this.gameState) return;

    const mode = this.config.mode?.toUpperCase() || 'PVP';
    const minHumanPlayers = mode === 'PVE' ? 1 : 2;
    const targetTotalPlayers = mode === 'PVE' ? 2 : 4;

    // Convert GameBase Seat[] to format frontend expects
    const seats = this.gameState.seats.map(seat => {
      if (!seat) return null;

      return {
        playerId: seat.playerId,
        name: seat.name,
        isAI: seat.isAI,
        tableStack: seat.tableStack,
        hasFolded: seat.hasFolded,
        currentBet: seat.currentBet,
        cosmetics: seat.cosmetics
      };
    });

    const tableState = {
      seats,
      cargoChest: (this.gameState as PiratePlunderGameState).cargoChest || 0,
      config: {
        minHumanPlayers,
        targetTotalPlayers,
        maxSeats: this.config.maxSeats,
        cargoChestLearningMode: false,
        currency: this.currency
      }
    };

    console.log(`[${this.config.tableId}] Broadcasting table state - ${seats.filter(s => s).length} seated`);

    this.broadcast('table_state', tableState);
  }
}
