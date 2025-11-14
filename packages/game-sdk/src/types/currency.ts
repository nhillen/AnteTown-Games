/**
 * Currency System Types for Game SDK
 *
 * Games should NEVER hardcode currency codes (no 'TC', 'VT', etc. in game code).
 * Always use the currencyCode from your game config.
 */

/**
 * Currency information (read-only for games)
 */
export interface Currency {
  code: string;            // 'TC', 'VT', 'GEMS', etc.
  name: string;            // 'Town Chips', 'Voucher Tokens'
  displayName: string;     // 'TC', 'VT'
  symbol?: string;         // '⭐', '🔑', etc.
  iconUrl?: string;        // '/assets/currencies/tc.png'

  // Currency properties (games should respect these)
  isStakeable: boolean;    // Can this currency be used for game buy-ins?
  isTransferable: boolean; // Can players gift this currency?
  decimalPlaces: number;   // 0 = integers only, 2 = cents, etc.
}

/**
 * Options for currency operations
 */
export interface CurrencyOperationOptions {
  transactionType: string;   // 'game_buy_in', 'game_win', 'game_loss'
  reason?: string;           // Human-readable description
  referenceType?: string;    // 'game_table', 'game_session'
  referenceId?: string;      // Table ID, session ID, etc.
  metadata?: Record<string, any>;  // Additional context
  ipAddress?: string;
  createdBy?: string;        // For admin operations
}

/**
 * Result of a currency operation
 */
export interface CurrencyOperationResult {
  success: boolean;
  newBalance: number;
  transaction: {
    id: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    createdAt: Date;
  };
}

/**
 * Currency Manager Interface
 *
 * Games interact with currencies ONLY through this interface.
 * Never directly modify user balances.
 */
export interface ICurrencyManager {
  /**
   * Get user's balance for a specific currency
   */
  getBalance(userId: string, currencyCode: string): Promise<number>;

  /**
   * Adjust user's balance (positive = credit, negative = debit)
   *
   * @example
   * // Deduct buy-in
   * await currencyManager.adjustBalance(
   *   userId,
   *   gameConfig.currencyCode,  // ← From config, NOT hardcoded!
   *   -buyInAmount,
   *   {
   *     transactionType: 'game_buy_in',
   *     referenceType: 'game_table',
   *     referenceId: tableId
   *   }
   * );
   *
   * @example
   * // Award winnings
   * await currencyManager.adjustBalance(
   *   winnerId,
   *   gameConfig.currencyCode,
   *   winAmount,
   *   {
   *     transactionType: 'game_win',
   *     referenceType: 'game_session',
   *     referenceId: sessionId,
   *     metadata: { opponentIds: [...] }
   *   }
   * );
   */
  adjustBalance(
    userId: string,
    currencyCode: string,
    amount: number,
    options: CurrencyOperationOptions
  ): Promise<CurrencyOperationResult>;

  /**
   * Check if user has sufficient balance
   */
  canAfford(
    userId: string,
    currencyCode: string,
    amount: number
  ): Promise<boolean>;

  /**
   * Get currency details (for display purposes)
   */
  getCurrency(currencyCode: string): Promise<Currency | null>;
}

/**
 * Game configuration currency fields
 *
 * All games receive these fields from platform config
 */
export interface GameCurrencyConfig {
  /**
   * Currency code for this game table
   *
   * CRITICAL: Games must use this value for ALL currency operations.
   * NEVER hardcode 'TC' or 'VT' in game logic!
   *
   * @example
   * // ✅ CORRECT - Use from config
   * await currencyManager.adjustBalance(userId, this.config.currencyCode, amount, options);
   *
   * // ❌ WRONG - Hardcoded
   * await currencyManager.adjustBalance(userId, 'TC', amount, options);
   */
  currencyCode: string;
}

/**
 * Helper type for common game config with currency
 */
export interface BaseGameConfig extends GameCurrencyConfig {
  tableId: string;
  displayName: string;
  anteAmount?: number;      // In the currency specified by currencyCode
  minBuyIn?: number;        // In the currency specified by currencyCode
  maxBuyIn?: number;        // In the currency specified by currencyCode
}
