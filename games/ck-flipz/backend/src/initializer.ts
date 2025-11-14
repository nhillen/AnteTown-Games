/**
 * CK Flipz Game Initializer
 *
 * Implements GameInitializer interface for platform-level table management
 */

import type { Server as SocketIOServer } from 'socket.io';
import { CoinFlipGame } from './CoinFlipGame.js';
import { CardFlipGame } from './CardFlipGame.js';
import type { GameInitializer } from '@pirate/game-sdk';

export const ckFlipzInitializer: GameInitializer = {
  /**
   * Create a new CK Flipz game instance from config
   */
  createInstance(config: any, io?: SocketIOServer): any {
    // Build game config structure
    const gameConfig = {
      maxSeats: config.maxSeats || 2,
      minHumanPlayers: 1,
      targetTotalPlayers: 2,
      betting: {
        ante: {
          mode: 'fixed',
          amount: config.ante || config.anteAmount || 100
        }
      }
    };

    // Build game options
    const gameOptions = {
      rakePercentage: config.rakePercentage || 5,
      minBuyInMultiplier: config.minBuyInMultiplier || 5
    };

    // Create appropriate game variant
    if (config.variant === 'coin-flip') {
      return new CoinFlipGame(gameConfig, gameOptions);
    } else if (config.variant === 'card-flip') {
      return new CardFlipGame(gameConfig, gameOptions);
    } else {
      // Default to coin flip if variant not specified
      return new CoinFlipGame(gameConfig, gameOptions);
    }
  },

  /**
   * Destroy a game instance (cleanup)
   */
  destroyInstance(instance: any): void {
    // CK Flipz games don't have persistent state or timers to cleanup
    // But we should remove all event listeners
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
    if (config.maxSeats && config.maxSeats !== 2) {
      return { valid: false, error: 'CK Flipz only supports 2 seats' };
    }

    // Validate variant
    if (config.variant && !['coin-flip', 'card-flip'].includes(config.variant)) {
      return { valid: false, error: 'Invalid variant: must be "coin-flip" or "card-flip"' };
    }

    // Validate mode
    if (config.mode && !['pvp', 'pve'].includes(config.mode)) {
      return { valid: false, error: 'Invalid mode: must be "pvp" or "pve"' };
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
   * Get default config for CK Flipz
   */
  getDefaultConfig(): any {
    return {
      variant: 'coin-flip',
      mode: 'pvp',
      ante: 100,
      maxSeats: 2,
      rakePercentage: 5,
      minBuyInMultiplier: 5,
      currencyCode: 'TC'
    };
  }
};
