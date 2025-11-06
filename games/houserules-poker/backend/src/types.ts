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

export interface PokerSeat {
  holeCards: Card[];
  lastAction?: PokerAction;
  personality?: AIPersonality;

  // Squidz Game specific fields
  squidCount?: number;           // Number of squidz this player has
  handsRevealed?: boolean;       // Whether this player's hands are revealed to all
}
