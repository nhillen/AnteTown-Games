import { SideGameDefinition, SideGameRegistry, SideGameContext } from './SideGameDefinition.js';
import { Card, SideGamePayout, Suit } from '../types.js';

/**
 * Configuration for Flipz Prop Bet
 */
export interface FlipzPropBetConfig {
  amountPerCard: number;           // Base amount per card (e.g., 500 = $5)
  proposerColor: 'red' | 'black';  // Color chosen by proposer
  proposerPlayerId: string;        // Who proposed the bet
  acceptorPlayerId?: string;       // Who accepted (set on acceptance)
  acceptorColor?: 'red' | 'black'; // Opposite of proposer color (set on acceptance)
}

/**
 * Determine if a card is red or black
 */
function getCardColor(card: Card): 'red' | 'black' {
  return (card.suit === 'hearts' || card.suit === 'diamonds') ? 'red' : 'black';
}

/**
 * Count red and black cards in the flop
 */
function countColors(cards: Card[]): { red: number; black: number } {
  const red = cards.filter(c => getCardColor(c) === 'red').length;
  const black = cards.length - red;
  return { red, black };
}

/**
 * Calculate payout based on CK Flipz rules
 * - If all 3 cards same color: cardValue = 2x amountPerCard
 * - If mixed colors: cardValue = 1x amountPerCard
 * - Payout = (winningCount × cardValue) - (losingCount × cardValue)
 */
function calculateFlipzPayout(
  communityCards: Card[],
  amountPerCard: number,
  winnerColor: 'red' | 'black'
): number {
  const { red, black } = countColors(communityCards);

  // Check if all same color
  const allSameColor = red === 3 || black === 3;
  const cardValue = allSameColor ? amountPerCard * 2 : amountPerCard;

  // Calculate net payout
  const winningCount = winnerColor === 'red' ? red : black;
  const losingCount = winnerColor === 'red' ? black : red;

  return (winningCount * cardValue) - (losingCount * cardValue);
}

/**
 * Flipz Prop Bet Definition
 *
 * Rules:
 * - Proposer picks red or black and sets amount per card
 * - Acceptor automatically gets opposite color
 * - When flop is dealt, settle based on red/black card counts:
 *   - If all 3 cards same color: 2x payout multiplier
 *   - If mixed: 1x payout multiplier
 *   - Winner gets: (their color count × multiplier) - (opponent count × multiplier)
 * - Max risk: 6x amountPerCard (if all 3 opponent's color with 2x multiplier)
 */
export const FLIPZ_PROP_BET: SideGameDefinition = {
  type: 'flipz-prop-bet',
  displayName: 'Flipz',
  description: 'Bet on red/black flop cards with CK Flipz payout rules',
  isOptional: true,
  requiresUpfrontBuyIn: true,

  // Defaults
  defaultBuyIn: 3000,  // $30 (max risk 6x $5 per card)
  defaultConfig: {
    amountPerCard: 500,  // $5 per card
    proposerColor: 'red',
    proposerPlayerId: '',
  },

  // Validation - exactly 2 players (proposer + acceptor)
  minParticipants: 2,
  maxParticipants: 2,

  /**
   * Hook: Called when flop is dealt
   */
  onFlop: (context: SideGameContext): SideGamePayout[] => {
    const { communityCards, sideGame } = context;

    if (!communityCards || communityCards.length !== 3) {
      console.error('❌ Flipz Prop Bet: Expected 3 community cards');
      return [];
    }

    const config: FlipzPropBetConfig = {
      ...FLIPZ_PROP_BET.defaultConfig,
      ...sideGame.config
    };

    // Ensure we have both participants
    if (!config.acceptorPlayerId) {
      console.error('❌ Flipz Prop Bet: No acceptor');
      return [];
    }

    // Count colors
    const { red, black } = countColors(communityCards);
    console.log(`🎴 Flipz: Flop has ${red} red, ${black} black cards`);

    // Determine winner
    let winnerPlayerId: string;
    let loserPlayerId: string;
    let winnerColor: 'red' | 'black';

    if (red > black) {
      // Red wins
      winnerColor = 'red';
      winnerPlayerId = config.proposerColor === 'red' ? config.proposerPlayerId : config.acceptorPlayerId;
      loserPlayerId = config.proposerColor === 'red' ? config.acceptorPlayerId : config.proposerPlayerId;
    } else if (black > red) {
      // Black wins
      winnerColor = 'black';
      winnerPlayerId = config.proposerColor === 'black' ? config.proposerPlayerId : config.acceptorPlayerId;
      loserPlayerId = config.proposerColor === 'black' ? config.acceptorPlayerId : config.proposerPlayerId;
    } else {
      // Tie - no payout
      console.log(`🎴 Flipz: Tie (${red}R - ${black}B), no payout`);
      return [];
    }

    // Calculate payout
    const payout = calculateFlipzPayout(communityCards, config.amountPerCard, winnerColor);

    if (payout <= 0) {
      console.log(`🎴 Flipz: No net payout`);
      return [];
    }

    console.log(`🎴 Flipz: ${winnerColor} wins ${payout} ${context.gameState?.currency || 'TC'}`);

    return [{
      fromPlayerId: loserPlayerId,
      toPlayerId: winnerPlayerId,
      amount: payout,
      reason: `Flipz prop bet (${red}R-${black}B)`
    }];
  },

  /**
   * Validate configuration
   */
  validateConfig: (config: FlipzPropBetConfig): { valid: boolean; error?: string } => {
    if (!config.amountPerCard || config.amountPerCard <= 0) {
      return { valid: false, error: 'Amount per card must be positive' };
    }

    if (config.proposerColor !== 'red' && config.proposerColor !== 'black') {
      return { valid: false, error: 'Proposer color must be red or black' };
    }

    if (!config.proposerPlayerId) {
      return { valid: false, error: 'Proposer player ID required' };
    }

    // Calculate max risk (6x amountPerCard)
    const maxRisk = config.amountPerCard * 6;
    if (maxRisk > 100000) {  // $1000 max risk sanity check
      return { valid: false, error: 'Amount per card too high (max risk exceeds $1000)' };
    }

    return { valid: true };
  }
};

// Auto-register
SideGameRegistry.register(FLIPZ_PROP_BET);
