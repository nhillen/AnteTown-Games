/**
 * Last Breath Game Initializer
 *
 * Implements GameInitializer interface for platform-level table management
 */

import type { Server as SocketIOServer } from 'socket.io';
import { LastBreathGame } from './LastBreathGame.js';
import type { GameInitializer } from '@antetown/game-sdk';
import type { LastBreathConfig } from './types/index.js';

export const lastBreathInitializer: GameInitializer = {
  /**
   * Create a new Last Breath game instance from config
   */
  createInstance(config: any, io?: SocketIOServer): LastBreathGame {
    // Build game config from platform config
    const gameConfig: Partial<LastBreathConfig> = {
      ante: config.ante || config.anteAmount || 100
    };

    // Optional: allow platform to override game parameters
    if (config.startO2) {
      gameConfig.start = {
        O2: config.startO2,
        Suit: 1.0,
        M0: 1.00
      };
    }
    if (config.baseHazard) {
      gameConfig.hazard = {
        q0: config.baseHazard,
        a: 0.010,
        beta: 0.020,
        lambda: 0.008
      };
    }

    const game = new LastBreathGame(gameConfig);

    // Set up Socket.IO handlers if provided
    if (io) {
      setupSocketHandlers(game, io);
    }

    return game;
  },

  /**
   * Destroy a game instance (cleanup)
   */
  destroyInstance(instance: any): void {
    if (instance && typeof instance.removeAllListeners === 'function') {
      instance.removeAllListeners();
    }
  },

  /**
   * Validate config before creating instance
   */
  validateConfig(config: any): { valid: boolean; error?: string } {
    // Validate ante
    const ante = config.ante || config.anteAmount;
    if (!ante || typeof ante !== 'number' || ante <= 0) {
      return { valid: false, error: 'Invalid ante amount: must be a positive number' };
    }

    // Validate optional parameters
    if (config.startO2 !== undefined) {
      if (typeof config.startO2 !== 'number' || config.startO2 <= 0 || config.startO2 > 200) {
        return { valid: false, error: 'Invalid startO2: must be between 0 and 200' };
      }
    }

    if (config.baseHazard !== undefined) {
      if (typeof config.baseHazard !== 'number' || config.baseHazard < 0 || config.baseHazard > 0.5) {
        return { valid: false, error: 'Invalid baseHazard: must be between 0 and 0.5' };
      }
    }

    return { valid: true };
  },

  /**
   * Get default config for Last Breath
   */
  getDefaultConfig(): any {
    return {
      ante: 100,
      maxSeats: 1,  // Single player game
      currencyCode: 'TC',
      startO2: 100,
      baseHazard: 0.02
    };
  }
};

/**
 * Set up Socket.IO event handlers for Last Breath
 */
function setupSocketHandlers(game: LastBreathGame, io: SocketIOServer): void {
  io.on('connection', (socket) => {
    console.log(`[Last Breath] Player connected: ${socket.id}`);

    // Start a new run
    socket.on('start_run', () => {
      try {
        const runState = game.startRun(socket.id);
        socket.emit('run_started', {
          runId: runState.runId,
          seed: runState.seed,
          state: runState,
          config: game.getConfig()
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        socket.emit('error', { message: errorMessage });
      }
    });

    // Advance to next room
    socket.on('advance', (data: { runId: string }) => {
      try {
        const result = game.advance(data.runId);

        if (result.success) {
          socket.emit('advance_success', {
            state: result.newState,
            events: result.events,
            nextHazard: game.getNextHazard(data.runId)
          });
        } else {
          socket.emit('run_failed', {
            state: result.newState,
            reason: result.failureReason,
            events: result.events
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        socket.emit('error', { message: errorMessage });
      }
    });

    // Exfiltrate and cash out
    socket.on('exfiltrate', (data: { runId: string }) => {
      try {
        const result = game.exfiltrate(data.runId);
        socket.emit('exfiltrate_success', {
          payout: result.payout,
          multiplier: result.finalMultiplier,
          state: result.finalState
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        socket.emit('error', { message: errorMessage });
      }
    });

    // Get current run state
    socket.on('get_state', (data: { runId: string }) => {
      try {
        const state = game.getRunState(data.runId);
        if (state) {
          socket.emit('state_update', {
            state,
            nextHazard: game.getNextHazard(data.runId)
          });
        } else {
          socket.emit('error', { message: 'Run not found' });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        socket.emit('error', { message: errorMessage });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Last Breath] Player disconnected: ${socket.id}`);
    });
  });
}
