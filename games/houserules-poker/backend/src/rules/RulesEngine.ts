import { Card, HandEvaluation, PokerPhase, PokerAction } from '../types.js';
import { PokerSeat } from '../types.js';
import { Seat } from '@antetown/game-sdk';

/**
 * Game variant identifier
 */
export type GameVariant = 'holdem' | 'squidz-game' | 'omaha' | 'seven-card-stud';

/**
 * Rule modifiers for customizing game variants
 */
export interface RuleModifiers {
  // Card modifications
  wildCards?: string[];                    // ['2'] or ['J', 'joker']
  deckModifications?: DeckMod[];           // add jokers, remove cards

  // Hand ranking modifications
  handRankingOverride?: string;            // 'five-of-a-kind-enabled'
  customHandRanks?: string[];

  // Dealing modifications
  holeCardCount?: number;                  // 2 for Hold'em, 4 for Omaha
  communityCardOverride?: {
    flop?: number;
    turn?: number;
    river?: number;
  };

  // Betting modifications
  potLimit?: boolean;                      // PLO
  noLimit?: boolean;                       // NLHE (default true)
  fixedLimit?: number;

  // Special rules
  mustUseExactly?: number;                 // Omaha: must use exactly 2 hole cards
  highLowSplit?: boolean;                  // High-low games

  // Custom game mechanics
  customPhases?: PokerPhase[];             // Add or replace phases
  skipStandardPhases?: PokerPhase[];       // Skip certain phases

  // Roguelike additions (for future)
  relicsEnabled?: boolean;
  rogueBreaks?: boolean;
}

export interface DeckMod {
  type: 'add' | 'remove';
  cards: string[];
}

/**
 * Context for hand evaluation
 */
export interface HandContext {
  phase: PokerPhase;
  communityCards: Card[];
  pot: number;
  currentBet: number;
}

/**
 * Betting rules configuration
 */
export interface BettingRules {
  noLimit: boolean;
  potLimit: boolean;
  fixedLimit?: number;
  minRaise?: number;
  maxRaise?: number;
}

/**
 * Context for round lifecycle hooks
 */
export interface RoundContext {
  playerCount: number;
  seatedPlayers: (Seat & PokerSeat)[];
  gameState: any; // HouseRulesGameState
}

/**
 * Context for pot win hooks
 */
export interface PotWinContext {
  winner: Seat & PokerSeat;
  potAmount: number;
  gameState: any; // HouseRulesGameState
}

/**
 * Result from round start hook
 */
export interface RoundStartResult {
  lockTable?: boolean;           // Prevent new players from joining
  customData?: Record<string, any>; // Variant-specific data to store in game state
  minPlayers?: number;            // Override minimum players
  maxPlayers?: number;            // Override maximum players
}

/**
 * Result from pot win hook
 */
export interface PotWinResult {
  shouldRevealHands?: boolean;    // Whether to reveal winner's hole cards
  shouldEndRound?: boolean;       // Whether this win ends the round
  customMessage?: string;         // Custom message to log/display
}

/**
 * Result from round end hook
 */
export interface RoundEndResult {
  delayNextRound?: number;        // Milliseconds to delay before next round
  shouldResetTable?: boolean;     // Whether to reset table state
  customMessage?: string;         // Custom message to log/display
}

/**
 * Rules engine interface - provides hook points for game variants
 */
export interface PokerRulesEngine {
  variant: GameVariant;
  modifiers: RuleModifiers;

  // Hook points in game flow
  hooks: {
    // Card evaluation
    evaluateHand?: (holeCards: Card[], communityCards: Card[]) => HandEvaluation;
    isWildCard?: (card: Card) => boolean;
    substituteWildCard?: (wildCard: Card, context: HandContext) => Card;

    // Dealing modifications
    getHoleCardCount?: (phase: PokerPhase) => number;  // e.g., Omaha = 4 hole cards
    getCommunityCardCount?: (phase: PokerPhase) => number;

    // Betting modifications
    getBettingRules?: () => BettingRules;

    // Action modifications
    getValidActions?: (seat: Seat & PokerSeat, phase: PokerPhase, currentBet: number) => PokerAction[];

    // Phase transitions
    shouldSkipPhase?: (phase: PokerPhase) => boolean;
    getNextPhase?: (currentPhase: PokerPhase) => PokerPhase | null;

    // Showdown modifications
    compareHands?: (hand1: HandEvaluation, hand2: HandEvaluation) => number;

    // Round lifecycle hooks
    onRoundStart?: (context: RoundContext) => RoundStartResult | void;
    onPotWin?: (context: PotWinContext) => PotWinResult | void;
    onRoundEnd?: (context: RoundContext) => RoundEndResult | void;

    // Table restrictions
    shouldLockTable?: (gameState: any) => boolean;
    canPlayerJoin?: (gameState: any, player: any) => { allowed: boolean; reason?: string };

    // Pre-hand setup (deprecated in favor of onRoundStart)
    onHandStart?: () => void;

    // Post-hand cleanup (deprecated in favor of onRoundEnd)
    onHandEnd?: () => void;
  };
}

/**
 * Registry of all available rules engines
 */
export class RulesEngineRegistry {
  private static engines = new Map<GameVariant, PokerRulesEngine>();

  static register(variant: GameVariant, engine: PokerRulesEngine): void {
    this.engines.set(variant, engine);
  }

  static get(variant: GameVariant): PokerRulesEngine | undefined {
    return this.engines.get(variant);
  }

  static getAll(): Map<GameVariant, PokerRulesEngine> {
    return new Map(this.engines);
  }
}
