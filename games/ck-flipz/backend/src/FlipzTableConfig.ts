/**
 * FlipzTableConfig - Configuration for Flipz game tables
 *
 * Defines available table types and their settings
 */

export type FlipzGameVariant = 'coin-flip' | 'card-flip';

export type FlipzTableConfig = {
  tableId: string;
  displayName: string;
  variant: FlipzGameVariant;
  ante: number; // in pennies
  maxSeats: number;
  description: string;
  emoji: string;
  rakePercentage?: number; // default 5%
  minBuyInMultiplier?: number; // default 5 (5x ante)
};

/**
 * Available Flipz tables
 * Layout: Row 1: Coin Flip $1 & $5
 *         Row 2: Card Flip $1 & $5
 */
export const FLIPZ_TABLES: FlipzTableConfig[] = [
  {
    tableId: 'flipz-coin-1',
    displayName: 'Coin Flip - $1',
    variant: 'coin-flip',
    ante: 100, // $1.00
    maxSeats: 2,
    description: 'Classic heads or tails. Winner takes all!',
    emoji: '🪙',
    rakePercentage: 5,
    minBuyInMultiplier: 5,
  },
  {
    tableId: 'flipz-coin-5',
    displayName: 'Coin Flip - $5',
    variant: 'coin-flip',
    ante: 500, // $5.00
    maxSeats: 2,
    description: 'Classic heads or tails. Higher stakes!',
    emoji: '🪙',
    rakePercentage: 5,
    minBuyInMultiplier: 5,
  },
  {
    tableId: 'flipz-card-1',
    displayName: 'Card Flip - $1',
    variant: 'card-flip',
    ante: 100, // $1.00
    maxSeats: 2,
    description: 'Red vs Black. 3 cards flipped, net payout.',
    emoji: '🃏',
    rakePercentage: 5,
    minBuyInMultiplier: 5,
  },
  {
    tableId: 'flipz-card-5',
    displayName: 'Card Flip - $5',
    variant: 'card-flip',
    ante: 500, // $5.00
    maxSeats: 2,
    description: 'Red vs Black. 3 cards flipped, net payout.',
    emoji: '🎴',
    rakePercentage: 5,
    minBuyInMultiplier: 5,
  },
];
