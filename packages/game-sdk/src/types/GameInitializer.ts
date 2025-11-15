/**
 * GameInitializer Interface
 *
 * Defines the contract for game-level table management integration with the platform's TableManager.
 * All games must implement this interface to support dynamic table creation and lifecycle management.
 */

import type { Server as SocketIOServer } from 'socket.io';

export interface GameInitializer {
  /**
   * Create a new game instance from configuration
   * @param config - Game configuration object (can be platform GameConfig or game-specific format)
   * @param io - Optional Socket.IO server instance
   * @returns Game instance
   */
  createInstance(config: any, io?: SocketIOServer): any;

  /**
   * Destroy a game instance and clean up resources
   * @param instance - Game instance to destroy
   */
  destroyInstance(instance: any): void;

  /**
   * Validate configuration before creating instance
   * @param config - Configuration to validate
   * @returns Validation result with optional error message
   */
  validateConfig(config: any): { valid: boolean; error?: string };

  /**
   * Get default configuration for this game type
   * @returns Default configuration object
   */
  getDefaultConfig(): any;
}
