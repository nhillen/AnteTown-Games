/**
 * GameRegistry - Manages game instances and routes players to games
 *
 * Responsibilities:
 * - Create and destroy game instances
 * - Route players to appropriate game instances
 * - Manage game lifecycle
 */

import { GameBase, TableConfig } from './GameBase.js';

export type GameType = string; // Extensible to any game type

export type GameInfo = {
  gameId: string;
  gameType: GameType;
  displayName: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  instance?: GameBase;
};

/**
 * Registry of all available games
 */
export class GameRegistry {
  private static instance: GameRegistry;
  private games: Map<string, GameBase> = new Map();
  private gameTypeRegistry: Map<GameType, typeof GameBase> = new Map();

  private constructor() {
    // Games will register themselves via registerGameType()
  }

  public static getInstance(): GameRegistry {
    if (!GameRegistry.instance) {
      GameRegistry.instance = new GameRegistry();
    }
    return GameRegistry.instance;
  }

  /**
   * Register a game type class
   */
  public registerGameType(type: GameType, gameClass: typeof GameBase): void {
    this.gameTypeRegistry.set(type, gameClass);
  }

  /**
   * Create a new game instance
   */
  public createGame(gameType: GameType, gameId: string, config: TableConfig): GameBase | undefined {
    const GameClass = this.gameTypeRegistry.get(gameType);
    if (!GameClass) {
      console.error(`Game type not registered: ${gameType}`);
      return undefined;
    }

    // Check if game already exists
    if (this.games.has(gameId)) {
      console.warn(`Game already exists: ${gameId}`);
      return this.games.get(gameId)!;
    }

    // Create new instance
    const game = new (GameClass as any)(config);
    this.games.set(gameId, game);

    console.log(`✅ Created game: ${gameId} (type: ${gameType})`);
    return game;
  }

  /**
   * Get game instance by ID
   */
  public getGame(gameId: string): GameBase | undefined {
    return this.games.get(gameId);
  }

  /**
   * Get all games of a specific type
   */
  public getGamesByType(gameType: GameType): GameBase[] {
    const games: GameBase[] = [];
    for (const game of this.games.values()) {
      if (game.gameType === gameType) {
        games.push(game);
      }
    }
    return games;
  }

  /**
   * Destroy a game instance
   */
  public destroyGame(gameId: string): boolean {
    const game = this.games.get(gameId);
    if (!game) {
      return false;
    }

    // Clean up game resources
    if ('destroy' in game && typeof game.destroy === 'function') {
      (game as any).destroy();
    }

    this.games.delete(gameId);
    console.log(`🗑️ Destroyed game: ${gameId}`);
    return true;
  }

  /**
   * Get list of available game types
   */
  public getAvailableGameTypes(): GameInfo[] {
    const gameInfos: GameInfo[] = [
      {
        gameId: 'flipz-1',
        gameType: 'flipz',
        displayName: 'Flipz',
        description: 'Simple heads or tails betting game. Winner takes all!',
        minPlayers: 2,
        maxPlayers: 6,
      },
      {
        gameId: 'pirate-plunder-1',
        gameType: 'pirate-plunder',
        displayName: 'Pirate Plunder',
        description: 'Dice poker with ship roles and cargo. The classic!',
        minPlayers: 2,
        maxPlayers: 6,
      },
    ];

    return gameInfos;
  }

  /**
   * Get or create a default game instance for a game type
   */
  public getOrCreateDefaultGame(gameType: GameType): GameBase | undefined {
    const defaultGameId = `${gameType}-default`;

    // Check if default game exists
    let game = this.games.get(defaultGameId);
    if (game) {
      return game;
    }

    // Create default game with standard config
    const defaultConfig: TableConfig = {
      minHumanPlayers: 1,
      targetTotalPlayers: 2,
      maxSeats: 6,
      betting: {
        ante: {
          mode: 'fixed',
          amount: 500, // $5
        },
      },
    };

    game = this.createGame(gameType, defaultGameId, defaultConfig);
    return game;
  }

  /**
   * Get all active games
   */
  public getAllGames(): Map<string, GameBase> {
    return new Map(this.games);
  }

  /**
   * Clean up all games
   */
  public destroyAllGames(): void {
    for (const gameId of this.games.keys()) {
      this.destroyGame(gameId);
    }
  }
}

/**
 * Singleton accessor
 */
export const gameRegistry = GameRegistry.getInstance();
