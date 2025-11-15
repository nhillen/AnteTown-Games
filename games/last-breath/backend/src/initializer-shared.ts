/**
 * Last Breath Game Initializer (Shared Run Architecture)
 *
 * Multiple players experience the SAME descent together - creates FOMO!
 * - All players see the same rooms/events (like bingo balls)
 * - Players make individual decisions (advance/exfiltrate)
 * - Early exfiltrators watch others potentially go further (FOMO!)
 * - Busted players watch survivors continue (even more FOMO!)
 */

import type { Server as SocketIOServer } from 'socket.io';
import { SharedRunManager } from './SharedRunManager.js';
import type { GameInitializer } from '@antetown/game-sdk';
import type { LastBreathConfig } from './types/index.js';

const DEFAULT_CONFIG: LastBreathConfig = {
  start: { O2: 100, Suit: 1.0, M0: 1.00 },
  costs: { O2Base: 5 },
  rewards: {
    muMin: 0.008,
    muMax: 0.018,
    pSurge: 0.12,
    surgeMin: 0.18,
    surgeMax: 0.30
  },
  hazard: {
    q0: 0.02,
    a: 0.010,
    beta: 0.020,
    lambda: 0.008
  },
  events: {
    leakP: 0.10,
    canisterP: 0.07,
    stabilizeP: 0.05
  },
  patch: {
    enabled: false, // Disabled in shared runs (would complicate timing)
    qReduction: 0.03,
    rewardPenalty: 0.5
  },
  ante: 100
};

export const lastBreathInitializer: GameInitializer = {
  createInstance(config: any, io?: SocketIOServer): SharedRunManager {
    const gameConfig: LastBreathConfig = {
      ...DEFAULT_CONFIG,
      ante: config.ante || 100
    };

    // Each table gets its own SharedRunManager
    const tableId = config.tableId || `table-${Date.now()}`;
    const manager = new SharedRunManager(tableId, gameConfig);

    if (io) {
      setupSocketHandlers(manager, io, tableId);
    }

    return manager;
  },

  destroyInstance(instance: any): void {
    if (instance && typeof instance.removeAllListeners === 'function') {
      instance.removeAllListeners();
    }
  },

  validateConfig(config: any): { valid: boolean; error?: string } {
    const ante = config.ante || config.anteAmount;
    if (!ante || typeof ante !== 'number' || ante <= 0) {
      return { valid: false, error: 'Invalid ante amount: must be a positive number' };
    }
    return { valid: true };
  },

  getDefaultConfig(): any {
    return {
      ante: 100,
      maxSeats: 100, // Theoretical limit for spectators
      currencyCode: 'TC'
    };
  }
};

/**
 * Set up Socket.IO handlers for shared run gameplay
 */
function setupSocketHandlers(manager: SharedRunManager, io: SocketIOServer, tableId: string): void {
  const namespace = io.of('/last-breath');

  namespace.on('connection', (socket) => {
    console.log(`[Last Breath] Player connected: ${socket.id}`);

    // Player joins/creates a run
    socket.on('join_run', (data: { playerName: string }) => {
      try {
        const run = manager.joinOrCreateRun(socket.id, data.playerName);

        // Join socket room for this run
        socket.join(run.runId);

        // Send run state to player
        socket.emit('run_joined', {
          runId: run.runId,
          state: serializeRunState(run),
          config: manager.getConfig()
        });

        // Broadcast to all players in run
        namespace.to(run.runId).emit('player_joined_run', {
          playerId: socket.id,
          playerName: data.playerName,
          playerCount: run.players.size
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        socket.emit('error', { message: errorMessage });
      }
    });

    // Start the descent (move from lobby to active)
    socket.on('start_descent', () => {
      try {
        manager.startDescent();
        const run = manager.getCurrentRun();
        if (run) {
          namespace.to(run.runId).emit('descent_started', {
            state: serializeRunState(run)
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        socket.emit('error', { message: errorMessage });
      }
    });

    // Player decides: advance or exfiltrate
    socket.on('player_decision', (data: { decision: 'advance' | 'exfiltrate' }) => {
      try {
        manager.playerDecision(socket.id, data.decision);
        const run = manager.getCurrentRun();
        if (run) {
          // Broadcast updated state to all players (including spectators!)
          namespace.to(run.runId).emit('state_update', {
            state: serializeRunState(run)
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        socket.emit('error', { message: errorMessage });
      }
    });

    // Listen to run events and broadcast to all players
    manager.on('player_exfiltrated', (data) => {
      const run = manager.getCurrentRun();
      if (run) {
        namespace.to(run.runId).emit('player_exfiltrated', {
          playerId: data.playerId,
          depth: data.depth,
          payout: data.payout,
          state: serializeRunState(run)
        });
      }
    });

    manager.on('player_busted', (data) => {
      const run = manager.getCurrentRun();
      if (run) {
        namespace.to(run.runId).emit('player_busted', {
          playerId: data.playerId,
          reason: data.reason,
          depth: data.depth,
          state: serializeRunState(run)
        });
      }
    });

    manager.on('run_advanced', (result) => {
      namespace.to(result.newState.runId).emit('run_advanced', {
        depth: result.newState.depth,
        events: result.events,
        hazardOccurred: result.hazardOccurred,
        playerResults: Array.from(result.playerResults.entries()),
        state: serializeRunState(result.newState)
      });
    });

    manager.on('run_completed', (data) => {
      namespace.to(data.runId).emit('run_completed', {
        depth: data.depth,
        finalState: serializeRunState(manager.getCurrentRun()!)
      });
    });

    socket.on('disconnect', () => {
      console.log(`[Last Breath] Player disconnected: ${socket.id}`);
    });
  });
}

/**
 * Serialize run state for transmission (Map -> Object)
 */
function serializeRunState(run: any): any {
  return {
    ...run,
    players: Array.from(run.players.entries()).map((entry: unknown) => {
      const [id, player] = entry as [string, any];
      return {
        playerId: id,
        ...player
      };
    }),
    awaitingDecisions: Array.from(run.awaitingDecisions)
  };
}
