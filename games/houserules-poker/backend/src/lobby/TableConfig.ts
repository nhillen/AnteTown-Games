import { GameVariant, RuleModifiers } from '../rules/index.js';

/**
 * Configuration for a poker table
 */
export interface PokerTableConfig {
  tableId: string;           // unique identifier
  displayName: string;       // "High Stakes Hold'em"
  variant: GameVariant;      // 'holdem' | 'squidz-game' | 'omaha' | etc
  rules: RuleModifiers;      // variant-specific modifications

  // Table parameters
  minBuyIn: number;          // minimum buy-in in pennies
  maxBuyIn: number;          // maximum buy-in in pennies
  smallBlind: number;        // small blind in pennies
  bigBlind: number;          // big blind in pennies
  maxSeats: number;          // maximum number of seats at table

  // Metadata
  emoji: string;             // "♠️", "🃏", "🎲"
  description: string;       // "Classic Texas Hold'em"
  difficulty?: string;       // "Beginner", "Advanced"

  // State (managed by TableRegistry)
  currentPlayers: number;
  isActive: boolean;
}

/**
 * Public information about a table (sent to clients)
 */
export interface PokerTableInfo {
  tableId: string;
  displayName: string;
  variant: GameVariant;
  minBuyIn: number;
  maxBuyIn: number;
  smallBlind: number;
  bigBlind: number;
  maxSeats: number;
  currentPlayers: number;
  emoji: string;
  description: string;
  difficulty?: string;
  isActive: boolean;
}

/**
 * Default table configurations
 */
export const DEFAULT_TABLES: PokerTableConfig[] = [
  {
    tableId: 'classic-holdem-1',
    displayName: 'Classic Hold\'em',
    variant: 'holdem',
    rules: {},
    minBuyIn: 2000,     // $20
    maxBuyIn: 10000,    // $100
    smallBlind: 50,     // $0.50
    bigBlind: 100,      // $1.00
    maxSeats: 9,
    emoji: '♠️',
    description: 'Standard Texas Hold\'em poker',
    currentPlayers: 0,
    isActive: true
  },
  {
    tableId: 'classic-holdem-2',
    displayName: 'High Stakes Hold\'em',
    variant: 'holdem',
    rules: {},
    minBuyIn: 10000,    // $100
    maxBuyIn: 50000,    // $500
    smallBlind: 250,    // $2.50
    bigBlind: 500,      // $5.00
    maxSeats: 9,
    emoji: '💎',
    description: 'High stakes Texas Hold\'em',
    difficulty: 'Advanced',
    currentPlayers: 0,
    isActive: true
  },
  {
    tableId: 'beginner-holdem',
    displayName: 'Beginner Hold\'em',
    variant: 'holdem',
    rules: {},
    minBuyIn: 500,      // $5
    maxBuyIn: 2000,     // $20
    smallBlind: 10,     // $0.10
    bigBlind: 25,       // $0.25
    maxSeats: 6,
    emoji: '🌟',
    description: 'Low stakes table for beginners',
    difficulty: 'Beginner',
    currentPlayers: 0,
    isActive: true
  },
  {
    tableId: 'squidz-game-1',
    displayName: 'Squidz Game',
    variant: 'squidz-game',
    rules: {
      squidzConfig: {
        baseSquidValueType: 'bigBlind',  // Use big blind as base
        baseSquidValue: 1,               // 1x BB per squid (1-2 squidz = 1BB, 3-4 = 2BB, 5+ = 3BB)
        squidzFormula: 'players + 3',    // Total squidz = player count + 3
      }
    },
    minBuyIn: 10000,    // $100 (larger buy-in required)
    maxBuyIn: 10000,    // $100 (fixed buy-in for fairness)
    smallBlind: 100,    // $1.00
    bigBlind: 200,      // $2.00
    maxSeats: 8,
    emoji: '🦑',
    description: 'High stakes bounty poker with squid collection - Winner takes all!',
    difficulty: 'Advanced',
    currentPlayers: 0,
    isActive: true
  }
];
