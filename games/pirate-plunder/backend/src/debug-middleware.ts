import { Server as SocketIOServer } from 'socket.io';

interface DebugState {
  lobbyState: any;
  gameState: any;
  connections: Map<string, any>;
  eventLog: Array<{
    timestamp: string;
    event: string;
    socketId: string;
    data?: any;
  }>;
}

export class GameDebugger {
  private debugState: DebugState;
  private io: SocketIOServer;

  constructor(io: SocketIOServer) {
    this.io = io;
    this.debugState = {
      lobbyState: null,
      gameState: null,
      connections: new Map(),
      eventLog: [],
    };
    this.setupDebugEndpoints();
  }

  logEvent(event: string, socketId: string, data?: any) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      socketId,
      data: data ? JSON.parse(JSON.stringify(data)) : undefined,
    };
    
    this.debugState.eventLog.push(logEntry);
    
    // Keep only last 100 events to prevent memory issues
    if (this.debugState.eventLog.length > 100) {
      this.debugState.eventLog.shift();
    }

    // Emit to debug clients
    this.io.to('debug-room').emit('debug-event', logEntry);
    
    console.log(`[DEBUG] ${event} from ${socketId}`, data ? JSON.stringify(data, null, 2) : '');
  }

  updateLobbyState(lobbyState: any) {
    this.debugState.lobbyState = JSON.parse(JSON.stringify(lobbyState));
    this.io.to('debug-room').emit('debug-lobby-update', this.debugState.lobbyState);
  }

  updateGameState(gameState: any) {
    this.debugState.gameState = JSON.parse(JSON.stringify(gameState));
    this.io.to('debug-room').emit('debug-game-update', this.debugState.gameState);
  }

  addConnection(socketId: string, playerInfo: any) {
    this.debugState.connections.set(socketId, {
      ...playerInfo,
      connectedAt: new Date().toISOString(),
    });
    this.io.to('debug-room').emit('debug-connections-update', 
      Array.from(this.debugState.connections.entries()));
  }

  removeConnection(socketId: string) {
    this.debugState.connections.delete(socketId);
    this.io.to('debug-room').emit('debug-connections-update', 
      Array.from(this.debugState.connections.entries()));
  }

  private setupDebugEndpoints() {
    this.io.on('connection', (socket) => {
      socket.on('debug-subscribe', () => {
        socket.join('debug-room');
        socket.emit('debug-full-state', {
          lobbyState: this.debugState.lobbyState,
          gameState: this.debugState.gameState,
          connections: Array.from(this.debugState.connections.entries()),
          recentEvents: this.debugState.eventLog.slice(-20),
        });
      });

      socket.on('debug-unsubscribe', () => {
        socket.leave('debug-room');
      });

      socket.on('debug-get-state', () => {
        socket.emit('debug-full-state', {
          lobbyState: this.debugState.lobbyState,
          gameState: this.debugState.gameState,
          connections: Array.from(this.debugState.connections.entries()),
          recentEvents: this.debugState.eventLog.slice(-20),
        });
      });

      socket.on('debug-clear-log', () => {
        this.debugState.eventLog = [];
        this.io.to('debug-room').emit('debug-log-cleared');
      });
    });
  }

  getDebugState() {
    return {
      lobbyState: this.debugState.lobbyState,
      gameState: this.debugState.gameState,
      connections: Array.from(this.debugState.connections.entries()),
      eventLog: this.debugState.eventLog,
    };
  }

  // Helper to validate game state consistency
  validateGameState(): string[] {
    const errors: string[] = [];
    
    if (!this.debugState.gameState) {
      return errors;
    }
    
    const gameState = this.debugState.gameState;
    
    // Check seat consistency
    if (gameState.seats) {
      gameState.seats.forEach((seat: any, index: number) => {
        if (!seat.playerId) {
          errors.push(`Seat ${index}: Missing playerId`);
        }
        
        if (seat.dice && seat.dice.length !== 5) {
          errors.push(`Seat ${index}: Invalid dice count (${seat.dice.length}, expected 5)`);
        }
        
        if (seat.bankroll < 0) {
          errors.push(`Seat ${index}: Negative bankroll (${seat.bankroll})`);
        }
        
        if (seat.dice) {
          seat.dice.forEach((die: any, dieIndex: number) => {
            if (die.value < 0 || die.value > 6) {
              errors.push(`Seat ${index}, Die ${dieIndex}: Invalid die value (${die.value})`);
            }
          });
        }
      });
    }
    
    // Check pot consistency
    if (gameState.pot < 0) {
      errors.push(`Negative pot value: ${gameState.pot}`);
    }
    
    // Check phase progression
    const validPhases = ['Lobby', 'PreHand', 'Ante', 'Roll1', 'Lock1', 'Bet1', 
                         'Roll2', 'Lock2', 'Bet2', 'Roll3', 'Lock3', 'Bet3', 
                         'Showdown', 'Payout', 'HandEnd'];
    if (!validPhases.includes(gameState.phase)) {
      errors.push(`Invalid game phase: ${gameState.phase}`);
    }
    
    return errors;
  }
}