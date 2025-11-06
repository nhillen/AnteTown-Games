import { HouseRules } from '../HouseRules.js';
import { PokerTableConfig, PokerTableInfo, DEFAULT_TABLES } from './TableConfig.js';

/**
 * Manages all active poker tables
 */
export class TableRegistry {
  private tables: Map<string, HouseRules> = new Map();
  private tableConfigs: Map<string, PokerTableConfig> = new Map();

  constructor(configs: PokerTableConfig[] = DEFAULT_TABLES) {
    this.initializeTables(configs);
  }

  /**
   * Initialize tables from configurations
   */
  private initializeTables(configs: PokerTableConfig[]): void {
    configs.forEach(config => {
      // Store config
      this.tableConfigs.set(config.tableId, config);

      // Create game instance
      const game = new HouseRules({
        tableId: config.tableId,
        variant: config.variant,
        rules: config.rules,
        maxSeats: config.maxSeats,
        minBuyIn: config.minBuyIn,
        maxBuyIn: config.maxBuyIn,
        smallBlind: config.smallBlind,
        bigBlind: config.bigBlind,
      });

      this.tables.set(config.tableId, game);
      console.log(`🎰 Initialized table: ${config.displayName} (${config.tableId})`);
    });
  }

  /**
   * Get a specific table by ID
   */
  getTable(tableId: string): HouseRules | undefined {
    return this.tables.get(tableId);
  }

  /**
   * Get all active tables
   */
  getAllTables(): HouseRules[] {
    return Array.from(this.tables.values());
  }

  /**
   * Get table configuration
   */
  getTableConfig(tableId: string): PokerTableConfig | undefined {
    return this.tableConfigs.get(tableId);
  }

  /**
   * Get public information about all active tables
   */
  getActiveTablesInfo(): PokerTableInfo[] {
    return Array.from(this.tables.entries()).map(([tableId, game]) => {
      const config = this.tableConfigs.get(tableId);

      if (!config) {
        throw new Error(`Config not found for table ${tableId}`);
      }

      // Update current player count from game state
      const currentPlayers = game.gameState?.seats.filter(s => s !== null).length || 0;

      const info: PokerTableInfo = {
        tableId: config.tableId,
        displayName: config.displayName,
        variant: config.variant,
        minBuyIn: config.minBuyIn,
        maxBuyIn: config.maxBuyIn,
        smallBlind: config.smallBlind,
        bigBlind: config.bigBlind,
        maxSeats: config.maxSeats,
        currentPlayers,
        emoji: config.emoji,
        description: config.description,
        isActive: config.isActive,
      };

      // Only add difficulty if defined
      if (config.difficulty !== undefined) {
        info.difficulty = config.difficulty;
      }

      return info;
    });
  }

  /**
   * Add a new table dynamically
   */
  addTable(config: PokerTableConfig): void {
    if (this.tables.has(config.tableId)) {
      throw new Error(`Table ${config.tableId} already exists`);
    }

    this.tableConfigs.set(config.tableId, config);

    const game = new HouseRules({
      tableId: config.tableId,
      variant: config.variant,
      rules: config.rules,
      maxSeats: config.maxSeats,
      minBuyIn: config.minBuyIn,
      maxBuyIn: config.maxBuyIn,
      smallBlind: config.smallBlind,
      bigBlind: config.bigBlind,
    });

    this.tables.set(config.tableId, game);
    console.log(`🎰 Added new table: ${config.displayName} (${config.tableId})`);
  }

  /**
   * Remove a table
   */
  removeTable(tableId: string): boolean {
    const removed = this.tables.delete(tableId);
    if (removed) {
      this.tableConfigs.delete(tableId);
      console.log(`🎰 Removed table: ${tableId}`);
    }
    return removed;
  }

  /**
   * Check if a table exists
   */
  hasTable(tableId: string): boolean {
    return this.tables.has(tableId);
  }

  /**
   * Get number of active tables
   */
  getTableCount(): number {
    return this.tables.size;
  }
}
