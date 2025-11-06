/**
 * @pirate/game-ck-flipz - Backend
 *
 * CK Flipz: Simple coin and card flip betting games
 * This is a reference implementation showing minimal game package structure
 */

import type { Server as SocketIOServer } from 'socket.io';

export { CoinFlipGame } from './CoinFlipGame.js';
export { CardFlipGame } from './CardFlipGame.js';
export { FLIPZ_TABLES, type FlipzTableConfig, type FlipzGameVariant } from './FlipzTableConfig.js';

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

  // TODO: Create game instances for each table configuration
  // This requires integrating with AnteTown's multi-table system

  return {
    gameId: GAME_METADATA.id,
    namespace,
    tables: gameInstances
  };
}
