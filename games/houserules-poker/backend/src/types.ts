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

export type AIPersonality = 'GTO' | 'Grinder' | 'Donkey';

export interface AIPersonalityProfile {
  name: string;
  style: string;
  tightness: number;      // 0-1: probability of playing a hand
  aggression: number;     // 0-1: probability of raising vs calling
  bluffFrequency: number; // 0-1: probability of bluffing
  foldThreshold: number;  // 0-1: stack % threshold for folding to large bets
}

export interface SidePotCommitment {
  amount: number;
  reason: string;
  type: 'squidz-game' | 'prop-bet' | 'side-game';
  metadata?: any;
}

export interface SidePotAccount {
  balance: number;       // Total funds in side pot
  committed: number;     // Locked for active bets/games
  commitments?: SidePotCommitment[];  // Track what funds are committed to
}

export interface PropBet {
  id: string;
  description: string;
  amount: number;
  initiator: {
    playerId: string;
    position: 'for' | 'against';
    committed: number;
  };
  acceptor?: {
    playerId: string;
    position: 'for' | 'against';
    committed: number;
  };
  status: 'open' | 'matched' | 'resolved' | 'cancelled';
  resolution?: {
    winner: 'for' | 'against';
    payout: { playerId: string; amount: number }[];
  };
}

/**
 * Side game participant
 */
export interface SideGameParticipant {
  playerId: string;
  buyInAmount?: number;      // For upfront buy-in games
  opted: 'in' | 'out';
  skippedHands?: number;     // Count of hands skipped due to insufficient funds
}

/**
 * Active side game at the table
 */
export interface ActiveSideGame {
  id: string;
  type: string;              // 'seven-two-game', 'custom-prop', etc.
  displayName: string;
  description: string;
  config: any;               // Game-specific config
  participants: SideGameParticipant[];
  proposedBy: string;
  proposedAt: number;        // Timestamp
  status: 'proposed' | 'active' | 'completed';

  // Game rules
  isOptional: boolean;       // Can players opt out?
  requiresUpfrontBuyIn: boolean;  // Or per-hand contribution?
  minBuyIn?: number;
  contributionPerHand?: number;

  // State tracking
  potBalance?: number;       // For progressive pots
  handsPlayed?: number;
  totalPayouts?: number;
}

/**
 * Side game payout result
 */
export interface SideGamePayout {
  fromPlayerId: string;
  toPlayerId: string;
  amount: number;
  reason: string;
}

export interface PokerSeat {
  holeCards: Card[];
  lastAction?: PokerAction;
  personality?: AIPersonality;

  // Side pot account for bounties, prop bets, etc.
  sidePot?: SidePotAccount;

  // Squidz Game specific fields
  squidCount?: number;           // Number of squidz this player has
  handsRevealed?: boolean;       // Whether this player's hands are revealed to all
  squidzEligible?: boolean;      // Can participate in squidz this hand
}
