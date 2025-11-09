/**
 * @pirate/game-pirate-plunder - Backend Exports
 *
 * This file exports the game setup for Pirate Plunder so it can be imported
 * by host platforms (like AnteTown).
 */

import type { Server as SocketIOServer, Socket } from 'socket.io'
import { PiratePlunderTable, PiratePlunderTableConfig } from './PiratePlunderTable'

// Game metadata for platform integration
export const GAME_METADATA = {
  id: 'pirate-plunder',
  name: 'Pirate Plunder',
  description: 'Roll to be Captain or Crew',
  icon: '🎲',
  minPlayers: 2,
  maxPlayers: 8,
  tags: ['Skill', 'Chance'] as const,
  version: '0.1.0',
  path: '/pirate-plunder' // URL path for this game
}

export interface InitializePiratePlunderOptions {
  namespace?: string;
  tables?: PiratePlunderTableConfig[];
  enableDebugRoutes?: boolean;
}

/**
 * Initialize Pirate Plunder game on a Socket.IO server
 * Creates multiple table instances and registers all event handlers
 */
export function initializePiratePlunder(io: SocketIOServer, options: InitializePiratePlunderOptions = {}) {
  const namespace = options?.namespace || '/';
  const tableConfigs = options?.tables || [];

  console.log(`🏴‍☠️ Initializing Pirate Plunder on namespace: ${namespace}`);

  // Get the Socket.IO namespace
  const nsp = namespace === '/' ? io.of('/') : io.of(namespace);

  // Create table instances
  const tables = new Map<string, PiratePlunderTable>();
  for (const config of tableConfigs) {
    const table = new PiratePlunderTable(config, nsp);
    tables.set(config.tableId, table);
    console.log(`   📊 Created table: ${config.displayName} (${config.tableId})`);
  }

  // Socket ID to table ID mapping (which table is this player at?)
  const socketToTable = new Map<string, string>();

  // Register socket event handlers
  nsp.on('connection', (socket: Socket) => {
    console.log(`[Pirate Plunder] Client connected: ${socket.id}`);

    // Handle join - player connecting to the game
    socket.on('join', (payload: { name: string; bankroll?: number; tableId?: string }) => {
      console.log(`[Pirate Plunder] join from ${socket.id}:`, payload);

      // If no tableId specified, they're just connecting (will select table from frontend)
      // Send them list of available tables
      if (!payload.tableId) {
        const tableList = Array.from(tables.values()).map(t => ({
          tableId: t.getTableId(),
          config: t.getConfig(),
          stats: t.getStats()
        }));
        socket.emit('tables_available', tableList);
        return;
      }

      // Join specific table
      const table = tables.get(payload.tableId);
      if (!table) {
        socket.emit('error', `Table ${payload.tableId} not found`);
        return;
      }

      // Track which table this socket is at
      socketToTable.set(socket.id, payload.tableId);

      // Let the table handle the join
      table.handleJoin(socket, payload);
    });

    // Handle sit_down - player taking a seat at their current table
    socket.on('sit_down', (payload: { seatIndex?: number; buyInAmount?: number }) => {
      const tableId = socketToTable.get(socket.id);
      if (!tableId) {
        socket.emit('error', 'Not connected to a table. Join first.');
        return;
      }

      const table = tables.get(tableId);
      if (!table) {
        socket.emit('error', 'Table not found');
        return;
      }

      table.handleSitDown(socket, payload);
    });

    // Handle stand_up - player leaving their seat
    socket.on('stand_up', () => {
      const tableId = socketToTable.get(socket.id);
      if (!tableId) return;

      const table = tables.get(tableId);
      if (!table) return;

      table.handleStandUp(socket);
    });

    // Handle lock_select - player toggling lock on a die
    socket.on('lock_select', (payload: { index: number }) => {
      const tableId = socketToTable.get(socket.id);
      if (!tableId) return;

      const table = tables.get(tableId);
      if (!table) return;

      table.handleLockSelect(socket, payload);
    });

    // Handle lock_done - player confirming their dice locks
    socket.on('lock_done', () => {
      const tableId = socketToTable.get(socket.id);
      if (!tableId) return;

      const table = tables.get(tableId);
      if (!table) return;

      table.handleLockDone(socket);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`[Pirate Plunder] Client disconnected: ${socket.id}`);

      const tableId = socketToTable.get(socket.id);
      if (tableId) {
        const table = tables.get(tableId);
        if (table) {
          table.handleDisconnect(socket);
        }
        socketToTable.delete(socket.id);
      }
    });

    // TODO: Add more event handlers:
    // - player_action (for betting)
    // - ready
    // etc.
  });

  return {
    gameId: GAME_METADATA.id,
    namespace,
    tables
  };
}

// Export types and classes
export { PiratePlunderTable } from './PiratePlunderTable'
export type { PiratePlunderTableConfig } from './PiratePlunderTable'
