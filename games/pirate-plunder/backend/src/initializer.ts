/**
 * Pirate Plunder Game Initializer
 *
 * Implements GameInitializer interface for platform-level table management
 */

import type { Server as SocketIOServer } from 'socket.io';
import { PiratePlunderTable, type PiratePlunderTableConfig } from './PiratePlunderTable.js';
import type { GameInitializer } from '@antetown/game-sdk';

export const piratePlunderInitializer: GameInitializer = {
  /**
   * Create a new Pirate Plunder game instance from config
   */
  createInstance(config: any, io?: SocketIOServer): any {
    console.log(`🏴‍☠️ [Initializer] Creating Pirate Plunder instance for table ${config.tableId || config.gameId}`);

    // Map platform config to PiratePlunderTableConfig
    const tableConfig: PiratePlunderTableConfig = {
      tableId: config.tableId || config.gameId,
      displayName: config.displayName || `Pirate Plunder ${config.anteAmount || config.ante || 100}`,
      mode: config.mode || 'PVP',
      currency: config.currencyCode || config.currency || 'TC',

      // Simple fields (backwards compatible)
      ante: config.anteAmount || config.ante || 100,
      minBuyIn: config.minBuyIn || (config.anteAmount || config.ante || 100) * (config.minBuyInMultiplier || 10),
      maxSeats: config.maxSeats || 8,
      rake: config.rakePercentage || config.rake || 5,

      // Full config from paramOverrides
      fullConfig: config.paramOverrides ? JSON.parse(JSON.stringify(config.paramOverrides)) : undefined
    };

    console.log(`🏴‍☠️ [Initializer] Table config:`, {
      tableId: tableConfig.tableId,
      ante: tableConfig.ante,
      mode: tableConfig.mode,
      minBuyIn: tableConfig.minBuyIn
    });

    // Create game instance (no namespace needed - platform handles sockets)
    return new PiratePlunderTable(tableConfig);
  },

  /**
   * Destroy a game instance (cleanup)
   */
  destroyInstance(instance: any): void {
    console.log(`🏴‍☠️ [Initializer] Destroying Pirate Plunder instance`);

    // Cleanup game state, timers, etc.
    if (instance && typeof instance.destroy === 'function') {
      instance.destroy();
    }

    // Remove all event listeners
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

    // Validate maxSeats
    if (config.maxSeats && (config.maxSeats < 2 || config.maxSeats > 8)) {
      return { valid: false, error: 'Pirate Plunder supports 2-8 seats' };
    }

    // Validate mode
    if (config.mode && !['PVP', 'PVE', 'pvp', 'pve'].includes(config.mode)) {
      return { valid: false, error: 'Invalid mode: must be "PVP" or "PVE"' };
    }

    // Validate rake percentage
    if (config.rakePercentage !== undefined) {
      if (typeof config.rakePercentage !== 'number' || config.rakePercentage < 0 || config.rakePercentage > 100) {
        return { valid: false, error: 'Invalid rakePercentage: must be between 0 and 100' };
      }
    }

    // Validate minBuyInMultiplier
    if (config.minBuyInMultiplier !== undefined) {
      if (typeof config.minBuyInMultiplier !== 'number' || config.minBuyInMultiplier < 1) {
        return { valid: false, error: 'Invalid minBuyInMultiplier: must be at least 1' };
      }
    }

    return { valid: true };
  },

  /**
   * Get default config for Pirate Plunder
   */
  getDefaultConfig(): any {
    return {
      variant: 'standard',
      mode: 'PVP',
      ante: 100,
      maxSeats: 8,
      rakePercentage: 5,
      minBuyInMultiplier: 10,
      currencyCode: 'TC'
    };
  }
};
