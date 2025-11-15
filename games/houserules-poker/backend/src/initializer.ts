/**
 * HouseRules Poker Game Initializer
 *
 * Implements GameInitializer interface for platform-level table management
 */

import type { Server as SocketIOServer } from 'socket.io';
import { HouseRules } from './HouseRules.js';
import { gameConfigToPokerConfig } from './config/GameConfigMapper.js';
import { validatePokerConfig } from './config/PokerConfigSchema.js';
import type { GameInitializer } from '@antetown/game-sdk';

export const pokerInitializer: GameInitializer = {
  /**
   * Create a new HouseRules Poker game instance from config
   */
  createInstance(config: any, io?: SocketIOServer): any {
    // If config is already a PokerTableConfig (has tableId, bigBlind, etc.), use it directly
    // Otherwise, convert from platform GameConfig format
    let pokerConfig;

    if (config.bigBlind !== undefined && config.tableId !== undefined) {
      // Already a PokerTableConfig
      pokerConfig = config;
    } else {
      // Convert from platform GameConfig format
      pokerConfig = gameConfigToPokerConfig({
        id: config.id || '',
        gameId: config.tableId || config.gameId || `poker-${Date.now()}`,
        gameType: 'houserules-poker',
        displayName: config.displayName || 'Poker Table',
        anteAmount: config.anteAmount || config.bigBlind || 10,
        variant: config.variant || 'holdem',
        mode: config.mode || 'PVP',
        rakePercentage: config.rakePercentage,
        rakeCap: config.rakeCap,
        paramOverrides: config.paramOverrides,
        status: config.status || 'published',
        environment: config.environment || 'dev'
      });
    }

    return new HouseRules(pokerConfig);
  },

  /**
   * Destroy a game instance (cleanup)
   */
  destroyInstance(instance: HouseRules): void {
    // HouseRules cleanup is handled internally via game state management
    // No explicit cleanup needed - sockets are managed by platform
    // Game timers are cleared when game state resets
  },

  /**
   * Validate config before creating instance
   */
  validateConfig(config: any): { valid: boolean; error?: string } {
    try {
      // If it's already a PokerTableConfig, validate directly
      if (config.bigBlind !== undefined && config.tableId !== undefined) {
        const variant = config.variant || 'holdem';
        validatePokerConfig(config, variant);
        return { valid: true };
      }

      // Otherwise, convert to PokerTableConfig first, then validate
      const pokerConfig = gameConfigToPokerConfig({
        id: config.id || '',
        gameId: config.tableId || config.gameId || `poker-${Date.now()}`,
        gameType: 'houserules-poker',
        displayName: config.displayName || 'Poker Table',
        anteAmount: config.anteAmount || config.bigBlind || 10,
        variant: config.variant || 'holdem',
        mode: config.mode || 'PVP',
        rakePercentage: config.rakePercentage,
        rakeCap: config.rakeCap,
        paramOverrides: config.paramOverrides,
        status: config.status || 'published',
        environment: config.environment || 'dev'
      });

      // Validation happens inside gameConfigToPokerConfig
      return { valid: true };
    } catch (error: any) {
      return { valid: false, error: error.message || 'Invalid poker config' };
    }
  },

  /**
   * Get default config for HouseRules Poker
   */
  getDefaultConfig(): any {
    return {
      variant: 'holdem',
      mode: 'PVP',
      anteAmount: 10, // Will be used as bigBlind
      bigBlind: 10,
      smallBlind: 5,
      minBuyIn: 200, // 20 BB
      maxBuyIn: 1000, // 100 BB
      maxSeats: 9,
      rakePercentage: 5,
      rakeCap: null,
      emoji: '♠️',
      description: 'Texas Hold\'em poker table',
      currencyCode: 'TC',
      rules: {}
    };
  }
};
