import { TableRegistry } from './TableRegistry.js';
import { HouseRules } from '../HouseRules.js';
import { Player } from '@antetown/game-sdk';
import { PokerTableInfo, PokerTableConfig } from './TableConfig.js';
import { GameVariant } from '../rules/index.js';

/**
 * Server-side table manager
 * Handles player routing, table lifecycle, and state management
 */
export class TableManager {
  private registry: TableRegistry;
  private playerTableMap: Map<string, string> = new Map(); // playerId -> tableId

  constructor(registry: TableRegistry) {
    this.registry = registry;
  }

  /**
   * Get list of all active tables
   */
  getActiveTables(): PokerTableInfo[] {
    return this.registry.getActiveTablesInfo();
  }

  /**
   * Get a specific table
   */
  getTable(tableId: string): HouseRules | undefined {
    return this.registry.getTable(tableId);
  }

  /**
   * Route player to a specific table
   */
  routePlayerToTable(player: Player, tableId: string, seatIndex?: number, buyInAmount?: number): {
    success: boolean;
    error?: string;
    seatIndex?: number;
  } {
    const table = this.registry.getTable(tableId);

    if (!table) {
      return { success: false, error: 'Table not found' };
    }

    // Check if player is already at a different table
    const currentTableId = this.playerTableMap.get(player.id);
    if (currentTableId && currentTableId !== tableId) {
      return {
        success: false,
        error: 'Player is already seated at another table. Please leave that table first.'
      };
    }

    // Attempt to sit player at table
    const result = table.sitPlayer(player, seatIndex, buyInAmount);

    if (result.success) {
      // Track player's table
      this.playerTableMap.set(player.id, tableId);
      console.log(`🎰 Player ${player.name} routed to table ${tableId}, seat ${result.seatIndex}`);
    }

    return result;
  }

  /**
   * Remove player from table tracking
   * Note: Actual player removal from game state is handled at server level
   */
  removePlayerFromTable(playerId: string): boolean {
    const tableId = this.playerTableMap.get(playerId);

    if (!tableId) {
      return false;
    }

    this.playerTableMap.delete(playerId);
    console.log(`🎰 Player ${playerId} removed from table tracking for ${tableId}`);

    return true;
  }

  /**
   * Get the table a player is currently at
   */
  getPlayerTable(playerId: string): HouseRules | undefined {
    const tableId = this.playerTableMap.get(playerId);

    if (!tableId) {
      return undefined;
    }

    return this.registry.getTable(tableId);
  }

  /**
   * Get the table ID a player is currently at
   */
  getPlayerTableId(playerId: string): string | undefined {
    return this.playerTableMap.get(playerId);
  }

  /**
   * Handle player action at their current table
   */
  handlePlayerAction(playerId: string, action: string, data?: any): boolean {
    const table = this.getPlayerTable(playerId);

    if (!table) {
      console.log(`🎰 Player ${playerId} not seated at any table`);
      return false;
    }

    // Forward action to the table's handlePlayerAction method
    table.handlePlayerAction(playerId, action as any, data);
    return true;
  }

  /**
   * Broadcast table state to all players at a table
   */
  broadcastTableState(tableId: string, callback: (table: HouseRules) => void): void {
    const table = this.registry.getTable(tableId);

    if (table) {
      callback(table);
    }
  }

  /**
   * Get stats about all tables
   */
  getTableStats(): {
    totalTables: number;
    activeTables: number;
    totalPlayers: number;
    tablesByVariant: Record<string, number>;
  } {
    const tables = this.registry.getActiveTablesInfo();

    const stats = {
      totalTables: tables.length,
      activeTables: tables.filter(t => t.isActive).length,
      totalPlayers: tables.reduce((sum, t) => sum + t.currentPlayers, 0),
      tablesByVariant: {} as Record<string, number>
    };

    tables.forEach(table => {
      stats.tablesByVariant[table.variant] = (stats.tablesByVariant[table.variant] || 0) + 1;
    });

    return stats;
  }

  /**
   * Clean up empty tables (optional maintenance)
   */
  cleanupEmptyTables(): number {
    let removed = 0;
    const tables = this.registry.getActiveTablesInfo();

    tables.forEach(tableInfo => {
      if (tableInfo.currentPlayers === 0 && !tableInfo.isActive) {
        this.registry.removeTable(tableInfo.tableId);
        removed++;
      }
    });

    return removed;
  }

  /**
   * Create a new table dynamically from game creator config
   */
  createDynamicTable(config: {
    variant: GameVariant;
    displayName: string;
    smallBlind: number;
    bigBlind: number;
    ante?: number;
    minBuyIn: number;
    maxBuyIn: number;
    maxSeats: number;
    squidValue?: number;
  }): string {
    // Generate unique table ID
    const tableId = `${config.variant}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Get emoji for variant
    const variantEmojis: Record<GameVariant, string> = {
      'holdem': '♠️',
      'squidz-game': '🦑',
      'omaha': '🎲',
      'seven-card-stud': '🃏'
    };

    const tableConfig: PokerTableConfig = {
      tableId,
      displayName: config.displayName,
      variant: config.variant,
      rules: {}, // Rules modifiers (for future use)
      minBuyIn: config.minBuyIn,
      maxBuyIn: config.maxBuyIn,
      smallBlind: config.smallBlind,
      bigBlind: config.bigBlind,
      maxSeats: config.maxSeats,
      emoji: variantEmojis[config.variant] || '🎰',
      description: `Player-created ${config.variant} table`,
      currentPlayers: 0,
      isActive: true
    };

    // Add squidValue to table config if it's a Squidz Game
    if (config.variant === 'squidz-game' && config.squidValue) {
      (tableConfig as any).squidValue = config.squidValue;
    }

    this.registry.addTable(tableConfig);

    console.log(`🎰 Created dynamic table: ${config.displayName} (${tableId})`);

    return tableId;
  }
}
