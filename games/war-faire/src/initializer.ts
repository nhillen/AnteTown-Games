/**
 * War Faire Game Initializer
 *
 * Implements GameInitializer interface for platform-level table management
 */

import type { Server as SocketIOServer } from 'socket.io';
import { WarFaireGame } from './WarFaireGame.js';
import type { GameInitializer } from '@pirate/game-sdk';

export const warFaireInitializer: GameInitializer = {
  /**
   * Create a new War Faire game instance from config
   */
  createInstance(config: any, io?: SocketIOServer): any {
    // Build complete config with defaults
    const tableConfig = {
      tableId: config.tableId,
      displayName: config.displayName || 'War Faire Table',
      gameType: 'war-faire',
      mode: (config.mode || 'pvp').toLowerCase(),
      ante: config.ante || config.anteAmount || 5,
      maxSeats: config.maxSeats || 10,
      minSeats: config.minSeats || 4,
      minHumanPlayers: config.minHumanPlayers || 1,
      targetTotalPlayers: config.targetTotalPlayers || 4,
      description: config.description || config.notes || 'War Faire - State Fair card game',
      rakePercentage: config.rakePercentage || 0
    };

    return new WarFaireGame(tableConfig);
  },

  /**
   * Destroy a game instance (cleanup)
   */
  destroyInstance(instance: WarFaireGame): void {
    // War Faire has timers that need cleanup
    if (instance && typeof instance.removeAllListeners === 'function') {
      instance.removeAllListeners();
    }

    // Clear any pending timers (War Faire uses aiTurnTimer, groupSelectionTimer, etc.)
    // The game should handle its own cleanup, but we ensure listeners are removed
  },

  /**
   * Validate config before creating instance
   */
  validateConfig(config: any): { valid: boolean; error?: string } {
    // Validate ante
    const ante = config.ante || config.anteAmount;
    if (ante !== undefined && (typeof ante !== 'number' || ante < 0)) {
      return { valid: false, error: 'Invalid ante amount: must be a non-negative number' };
    }

    // Validate maxSeats
    if (config.maxSeats !== undefined) {
      if (typeof config.maxSeats !== 'number' || config.maxSeats < 4 || config.maxSeats > 10) {
        return { valid: false, error: 'Invalid maxSeats: War Faire supports 4-10 players' };
      }
    }

    // Validate minSeats
    if (config.minSeats !== undefined) {
      if (typeof config.minSeats !== 'number' || config.minSeats < 2 || config.minSeats > 10) {
        return { valid: false, error: 'Invalid minSeats: must be between 2 and 10' };
      }
    }

    // Validate mode
    if (config.mode && !['pvp', 'pve'].includes(config.mode.toLowerCase())) {
      return { valid: false, error: 'Invalid mode: must be "pvp" or "pve"' };
    }

    // Validate targetTotalPlayers
    if (config.targetTotalPlayers !== undefined) {
      const maxSeats = config.maxSeats || 10;
      if (typeof config.targetTotalPlayers !== 'number' ||
          config.targetTotalPlayers < 2 ||
          config.targetTotalPlayers > maxSeats) {
        return { valid: false, error: `Invalid targetTotalPlayers: must be between 2 and ${maxSeats}` };
      }
    }

    // Validate rake percentage
    if (config.rakePercentage !== undefined) {
      if (typeof config.rakePercentage !== 'number' || config.rakePercentage < 0 || config.rakePercentage > 100) {
        return { valid: false, error: 'Invalid rakePercentage: must be between 0 and 100' };
      }
    }

    return { valid: true };
  },

  /**
   * Get default config for War Faire
   */
  getDefaultConfig(): any {
    return {
      mode: 'pvp',
      ante: 5,
      maxSeats: 10,
      minSeats: 4,
      minHumanPlayers: 1,
      targetTotalPlayers: 4,
      rakePercentage: 0,
      description: 'War Faire - State Fair card game',
      currencyCode: 'TC'
    };
  }
};
