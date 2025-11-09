/**
 * PiratePlunderTable - Manages a single table instance for Pirate Plunder
 *
 * This class encapsulates all the game state and logic for one table.
 * Multiple instances can run simultaneously on the platform.
 */

import { Server as SocketIOServer, Namespace, Socket } from 'socket.io';

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

export interface Player {
  id: string;
  name: string;
  isAI: boolean;
  bankroll: number;       // Player's total bankroll in base currency units
  tableStack?: number;    // Money at the table when seated in base currency units
  googleId?: string;
  cosmetics?: any;
}

export interface TableState {
  seats: (Player | null)[];
  cargoChest?: number;
}

export interface GameState {
  phase: string;
  seats: any[];
  pot: number;
  currentBet: number;
  // ... more game state fields
}

export class PiratePlunderTable {
  private config: PiratePlunderTableConfig;
  private tableState: TableState;
  private gameState: GameState | null = null;
  private socketIdToPlayer: Map<string, Player> = new Map();
  private namespace: Namespace;

  constructor(config: PiratePlunderTableConfig, namespace: Namespace) {
    this.config = config;
    this.namespace = namespace;
    this.tableState = {
      seats: new Array(config.maxSeats).fill(null),
      cargoChest: 0
    };
  }

  getTableId(): string {
    return this.config.tableId;
  }

  getConfig(): PiratePlunderTableConfig {
    return this.config;
  }

  // Handle player joining the table
  handleJoin(socket: Socket, payload: { name: string; bankroll?: number; googleId?: string }) {
    console.log(`[${this.config.tableId}] Player ${payload.name} joining`);

    const player: Player = {
      id: socket.id,
      name: payload.name,
      isAI: false,
      bankroll: payload.bankroll || 10000,
      ...(payload.googleId && { googleId: payload.googleId })
    };

    this.socketIdToPlayer.set(socket.id, player);

    // Send current state to player
    socket.emit('joined', {
      player: player,
      isAdmin: false // TODO: Check if player is admin
    });

    // Broadcast lobby state to all players
    this.broadcastLobbyState();
  }

  // Handle player sitting down at a seat
  handleSitDown(socket: Socket, payload: { seatIndex?: number; buyInAmount?: number }) {
    console.log(`[${this.config.tableId}] sit_down from ${socket.id}:`, payload);

    const player = this.socketIdToPlayer.get(socket.id);
    if (!player) {
      socket.emit('error', 'Player not found. Please rejoin.');
      return;
    }

    const { seatIndex, buyInAmount = this.config.minBuyIn } = payload;

    // Validate buy-in amount (all values in base currency - no conversion)
    if (buyInAmount < this.config.minBuyIn) {
      const currency = this.config.currency || 'TC';
      socket.emit('error', `Minimum buy-in is ${this.config.minBuyIn} ${currency}`);
      return;
    }

    if (buyInAmount > player.bankroll) {
      socket.emit('error', 'Insufficient bankroll');
      return;
    }

    // Find an empty seat (use specified index or find first available)
    let targetSeat = seatIndex;
    if (targetSeat === undefined || this.tableState.seats[targetSeat] !== null) {
      targetSeat = this.tableState.seats.findIndex(s => s === null);
      if (targetSeat === -1) {
        socket.emit('error', 'Table is full');
        return;
      }
    }

    // Sit the player down
    const seatedPlayer = { ...player, tableStack: buyInAmount };
    this.tableState.seats[targetSeat] = seatedPlayer;

    // Update player's bankroll
    player.bankroll -= buyInAmount;

    const currency = this.config.currency || 'TC';
    console.log(`[${this.config.tableId}] ${player.name} sat at seat ${targetSeat} with ${buyInAmount} ${currency}`);

    // Broadcast updated state
    this.broadcastTableState();

    // Start game if enough players
    this.checkStartGame();
  }

  // Handle player standing up
  handleStandUp(socket: Socket) {
    console.log(`[${this.config.tableId}] stand_up from ${socket.id}`);

    const seatIndex = this.tableState.seats.findIndex(s => s?.id === socket.id);
    if (seatIndex === -1) {
      socket.emit('error', 'Not seated');
      return;
    }

    const player = this.tableState.seats[seatIndex];
    if (!player) return;

    // Return table stack to bankroll
    const playerObj = this.socketIdToPlayer.get(socket.id);
    if (playerObj && player.tableStack) {
      playerObj.bankroll += player.tableStack;
    }

    // Remove from seat
    this.tableState.seats[seatIndex] = null;

    console.log(`[${this.config.tableId}] ${player.name} stood up from seat ${seatIndex}`);

    this.broadcastTableState();
  }

  // Handle player disconnect
  handleDisconnect(socket: Socket) {
    console.log(`[${this.config.tableId}] disconnect from ${socket.id}`);

    // Mark player as disconnected but keep their seat
    // They can reconnect and resume
    const seatIndex = this.tableState.seats.findIndex(s => s?.id === socket.id);
    if (seatIndex !== -1 && this.tableState.seats[seatIndex]) {
      const player = this.tableState.seats[seatIndex]!;
      player.name += ' (disconnected)';
    }

    // Clean up
    this.socketIdToPlayer.delete(socket.id);
  }

  // Helper methods
  private broadcastLobbyState() {
    // Broadcast lobby state to all connected players at this table
    const players = Array.from(this.socketIdToPlayer.values());
    const lobbyState = { players };

    console.log(`[${this.config.tableId}] Broadcasting lobby state with ${players.length} players`);

    // Emit to all players at this table
    for (const socketId of this.socketIdToPlayer.keys()) {
      const socket = this.namespace.sockets.get(socketId);
      if (socket) {
        socket.emit('lobby_state', lobbyState);
      }
    }
  }

  private broadcastTableState() {
    // Broadcast table state (seats) to all connected players at this table
    const tableState = {
      seats: this.tableState.seats,
      cargoChest: this.tableState.cargoChest,
      config: {
        minHumanPlayers: 1,
        targetTotalPlayers: 2,
        maxSeats: this.config.maxSeats,
        cargoChestLearningMode: false
      }
    };

    console.log(`[${this.config.tableId}] Broadcasting table state - ${this.tableState.seats.filter(s => s).length} seated`);

    // Emit to all players at this table
    for (const socketId of this.socketIdToPlayer.keys()) {
      const socket = this.namespace.sockets.get(socketId);
      if (socket) {
        socket.emit('table_state', tableState);
      }
    }
  }

  private checkStartGame() {
    // Check if we have enough players to start
    const seatedPlayers = this.tableState.seats.filter(s => s !== null).length;
    const mode = this.config.mode?.toUpperCase() || 'PVP';

    // Determine minimum players based on mode
    const minPlayers = mode === 'PVE' ? 1 : 2;

    if (seatedPlayers >= minPlayers && !this.gameState) {
      console.log(`[${this.config.tableId}] Starting ${mode} game with ${seatedPlayers} players`);

      // Initialize basic game state
      this.gameState = {
        phase: 'betting',
        seats: this.tableState.seats.map((player, index) => ({
          player,
          bet: 0,
          status: player ? 'active' : 'empty'
        })),
        pot: 0,
        currentBet: this.config.ante
      };

      // Broadcast game state to all players
      this.broadcastGameState();
    }
  }

  private broadcastGameState() {
    if (!this.gameState) return;

    console.log(`[${this.config.tableId}] Broadcasting game state - phase: ${this.gameState.phase}`);

    // Emit to all players at this table
    for (const socketId of this.socketIdToPlayer.keys()) {
      const socket = this.namespace.sockets.get(socketId);
      if (socket) {
        socket.emit('game_state', this.gameState);
      }
    }
  }

  // Get current stats for this table
  getStats() {
    const seatedPlayers = this.tableState.seats.filter(s => s !== null).length;
    const humanPlayers = this.tableState.seats.filter(s => s && !s.isAI).length;

    return {
      seatedPlayers,
      humanPlayers,
      waitingForPlayers: seatedPlayers < 2,
      phase: this.gameState?.phase || 'Lobby'
    };
  }
}
