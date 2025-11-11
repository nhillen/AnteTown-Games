/**
 * Frontend types for HouseRules Poker
 */

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type HandRank =
  | 'high-card'
  | 'pair'
  | 'two-pair'
  | 'three-of-a-kind'
  | 'straight'
  | 'flush'
  | 'full-house'
  | 'four-of-a-kind'
  | 'straight-flush'
  | 'royal-flush';

export interface HandEvaluation {
  rank: HandRank;
  value: number;
  cards: Card[];
  kickers: Card[];
}

export type PokerPhase =
  | 'Lobby'
  | 'PreHand'
  | 'PreFlop'
  | 'Flop'
  | 'Turn'
  | 'River'
  | 'Showdown';

export type PokerAction =
  | 'fold'
  | 'check'
  | 'call'
  | 'bet'
  | 'raise'
  | 'all-in';

/**
 * Side game participant
 */
export interface SideGameParticipant {
  playerId: string;
  buyInAmount?: number;
  opted: 'in' | 'out';
  skippedHands?: number;
}

/**
 * Active side game at the table
 */
export interface ActiveSideGame {
  id: string;
  type: string;
  displayName: string;
  description: string;
  config: any;
  participants: SideGameParticipant[];
  proposedBy: string;
  proposedAt: number;
  status: 'proposed' | 'active' | 'completed';
  isOptional: boolean;
  requiresUpfrontBuyIn: boolean;
  minBuyIn?: number;
  contributionPerHand?: number;
  potBalance?: number;
  handsPlayed?: number;
  totalPayouts?: number;
}

/**
 * Flipz prop bet specific config
 */
export interface FlipzPropBetConfig {
  amountPerCard: number;
  proposerColor: 'red' | 'black';
  proposerPlayerId: string;
  acceptorPlayerId?: string;
  acceptorColor?: 'red' | 'black';
}
