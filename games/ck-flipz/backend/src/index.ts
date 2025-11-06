/**
 * @pirate/game-ck-flipz - Backend
 *
 * CK Flipz: Simple coin and card flip betting games
 * This is a reference implementation showing minimal game package structure
 */

import type { Server as SocketIOServer } from 'socket.io';
import { CoinFlipGame } from './CoinFlipGame.js';
import { CardFlipGame } from './CardFlipGame.js';
import { FLIPZ_TABLES, type FlipzTableConfig, type FlipzGameVariant } from './FlipzTableConfig.js';

export { CoinFlipGame, CardFlipGame };
export { FLIPZ_TABLES, type FlipzTableConfig, type FlipzGameVariant };

export const GAME_METADATA = {
  id: 'ck-flipz',
  name: 'CK Flipz',
  description: 'Lightning fast. Pick, bet, flip.',
  icon: '🪙',
  minPlayers: 2,
  maxPlayers: 2,
  tags: ['Chance'] as const,
  version: '0.1.0',
  path: '/ck-flipz'
};

/**
 * Initialize CK Flipz games (multi-table support)
 *
 * Note: CK Flipz uses a multi-table architecture where each table is a separate
 * game instance. Unlike PiratePlunder which has one game with multiple seats,
 * Flipz creates multiple game instances from FLIPZ_TABLES configuration.
 *
 * @param io - Socket.IO server instance
 * @param options - Initialization options
 * @returns Map of tableId -> game instance
 */
export function initializeCKFlipz(io: SocketIOServer, options?: {
  namespace?: string;
  tables?: FlipzTableConfig[];
}) {
  const namespace = options?.namespace || '/';
  const tables = options?.tables || FLIPZ_TABLES;

  console.log(`🪙 Initializing CK Flipz with ${tables.length} tables...`);

  const gameInstances = new Map();

  // Create a game instance for each table
  for (const tableConfig of tables) {
    let game;

    const config = {
      maxSeats: tableConfig.maxSeats,
      minHumanPlayers: 1,
      targetTotalPlayers: 2,
      betting: {
        ante: {
          mode: 'fixed',
          amount: tableConfig.ante
        }
      }
    };

    if (tableConfig.variant === 'coin-flip') {
      game = new CoinFlipGame(config, {
        rakePercentage: tableConfig.rakePercentage,
        minBuyInMultiplier: tableConfig.minBuyInMultiplier
      });
    } else {
      game = new CardFlipGame(config, {
        rakePercentage: tableConfig.rakePercentage,
        minBuyInMultiplier: tableConfig.minBuyInMultiplier
      });
    }

    gameInstances.set(tableConfig.tableId, {
      game,
      config: tableConfig,
      io  // Store io reference for socket handling
    });

    console.log(`   ✅ ${tableConfig.displayName} (${tableConfig.tableId})`);
  }

  return {
    gameId: GAME_METADATA.id,
    namespace,
    tables: gameInstances,
    metadata: GAME_METADATA
  };
}
