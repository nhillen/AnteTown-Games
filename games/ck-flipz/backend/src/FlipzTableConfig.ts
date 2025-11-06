/**
 * FlipzTableConfig - Configuration for Flipz game tables
 *
 * Defines available table types and their settings
 */

export type FlipzGameVariant = 'coin-flip' | 'card-flip';

export type FlipzGameMode = 'pvp' | 'pve';

export type FlipzTableConfig = {
  tableId: string;
  displayName: string;
  variant: FlipzGameVariant;
  mode: FlipzGameMode;
  ante: number; // in pennies
  maxSeats: number;
  description: string;
  emoji: string;
  rakePercentage?: number; // default 5%
  minBuyInMultiplier?: number; // default 5 (5x ante)
};

/**
 * Available Flipz tables
 * Layout: PVP (Player vs Player) on left, PVE (Player vs Bot) on right
 *         Row 1: Coin Flip $1
 *         Row 2: Coin Flip $5
 *         Row 3: Card Flip $1
 *         Row 4: Card Flip $5
 */
export const FLIPZ_TABLES: FlipzTableConfig[] = [
  // PVP Tables - Wait for another player
  {
    tableId: 'flipz-coin-pvp-1',
    displayName: 'Coin Flip PVP - $1',
    variant: 'coin-flip',
    mode: 'pvp',
    ante: 100, // $1.00
    maxSeats: 2,
    description: 'Player vs Player. Classic heads or tails!',
    emoji: '🪙',
    rakePercentage: 5,
    minBuyInMultiplier: 5,
  },
  {
    tableId: 'flipz-coin-pvp-5',
    displayName: 'Coin Flip PVP - $5',
    variant: 'coin-flip',
    mode: 'pvp',
    ante: 500, // $5.00
    maxSeats: 2,
    description: 'Player vs Player. Higher stakes!',
    emoji: '🪙',
    rakePercentage: 5,
    minBuyInMultiplier: 5,
  },
  {
    tableId: 'flipz-card-pvp-1',
    displayName: 'Card Flip PVP - $1',
    variant: 'card-flip',
    mode: 'pvp',
    ante: 100, // $1.00
    maxSeats: 2,
    description: 'Player vs Player. Red vs Black, 3 cards!',
    emoji: '🃏',
    rakePercentage: 5,
    minBuyInMultiplier: 5,
  },
  {
    tableId: 'flipz-card-pvp-5',
    displayName: 'Card Flip PVP - $5',
    variant: 'card-flip',
    mode: 'pvp',
    ante: 500, // $5.00
    maxSeats: 2,
    description: 'Player vs Player. Red vs Black, higher stakes!',
    emoji: '🎴',
    rakePercentage: 5,
    minBuyInMultiplier: 5,
  },

  // PVE Tables - Instant bot pairing
  {
    tableId: 'flipz-coin-pve-1',
    displayName: 'Coin Flip PVE - $1',
    variant: 'coin-flip',
    mode: 'pve',
    ante: 100, // $1.00
    maxSeats: 2,
    description: 'Play against a bot. Instant action!',
    emoji: '🪙',
    rakePercentage: 5,
    minBuyInMultiplier: 5,
  },
  {
    tableId: 'flipz-coin-pve-5',
    displayName: 'Coin Flip PVE - $5',
    variant: 'coin-flip',
    mode: 'pve',
    ante: 500, // $5.00
    maxSeats: 2,
    description: 'Play against a bot. Higher stakes!',
    emoji: '🪙',
    rakePercentage: 5,
    minBuyInMultiplier: 5,
  },
  {
    tableId: 'flipz-card-pve-1',
    displayName: 'Card Flip PVE - $1',
    variant: 'card-flip',
    mode: 'pve',
    ante: 100, // $1.00
    maxSeats: 2,
    description: 'Play against a bot. Red vs Black!',
    emoji: '🃏',
    rakePercentage: 5,
    minBuyInMultiplier: 5,
  },
  {
    tableId: 'flipz-card-pve-5',
    displayName: 'Card Flip PVE - $5',
    variant: 'card-flip',
    mode: 'pve',
    ante: 500, // $5.00
    maxSeats: 2,
    description: 'Play against a bot. Red vs Black, higher stakes!',
    emoji: '🎴',
    rakePercentage: 5,
    minBuyInMultiplier: 5,
  },
];
