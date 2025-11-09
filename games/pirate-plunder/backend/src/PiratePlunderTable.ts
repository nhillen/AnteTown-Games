/**
 * PiratePlunderTable - Manages a single table instance for Pirate Plunder
 *
 * This class encapsulates all the game state and logic for one table.
 * Multiple instances can run simultaneously on the platform.
 */

import { Socket } from 'socket.io';

export interface PiratePlunderTableConfig {
  tableId: string;
  displayName: string;
  ante: number;           // In cents/pennies
  minBuyIn: number;       // In cents/pennies
  maxSeats: number;
  rake: number;           // Percentage (e.g., 5 for 5%)
}

export interface Player {
  id: string;
  name: string;
  isAI: boolean;
  bankroll: number;       // Player's total bankroll
  tableStack?: number;    // Money at the table when seated
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

  constructor(config: PiratePlunderTableConfig) {
    this.config = config;
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

    // Validate buy-in amount
    if (buyInAmount < this.config.minBuyIn) {
      socket.emit('error', `Minimum buy-in is $${(this.config.minBuyIn / 100).toFixed(2)}`);
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

    // Update player's bankroll (TODO: integrate with money flow service)
    player.bankroll -= buyInAmount;

    console.log(`[${this.config.tableId}] ${player.name} sat at seat ${targetSeat} with ${buyInAmount}`);

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
    // Broadcast lobby state to all connected players
    const players = Array.from(this.socketIdToPlayer.values());
    const lobbyState = { players };

    // TODO: Emit to all connected sockets in this table's room
    console.log(`[${this.config.tableId}] Broadcasting lobby state with ${players.length} players`);
  }

  private broadcastTableState() {
    // Broadcast table state (seats) to all connected players
    const tableState = {
      seats: this.tableState.seats,
      cargoChest: this.tableState.cargoChest,
      config: this.config
    };

    // TODO: Emit to all connected sockets in this table's room
    console.log(`[${this.config.tableId}] Broadcasting table state`);
  }

  private checkStartGame() {
    // Check if we have enough players to start
    const seatedPlayers = this.tableState.seats.filter(s => s !== null).length;
    if (seatedPlayers >= 2 && !this.gameState) {
      console.log(`[${this.config.tableId}] Starting game with ${seatedPlayers} players`);
      // TODO: Initialize game state and start first round
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
