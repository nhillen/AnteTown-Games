import { SideGameDefinition, SideGameRegistry, SideGameContext } from './SideGameDefinition.js';
import { Card, SideGamePayout } from '../types.js';

/**
 * Configuration for 7-2 Game
 */
export interface SevenTwoConfig {
  contributionPerHand: number;  // Amount each player contributes per hand
  payoutType: 'immediate' | 'progressive';  // Immediate payout or build progressive pot
  requireOffsuit?: boolean;      // Must be offsuit to win (default: true)
}

/**
 * Check if cards form 7-2 (offsuit optional)
 */
function isSevenTwo(holeCards: Card[], requireOffsuit: boolean = true): boolean {
  if (holeCards.length !== 2) return false;

  const ranks = holeCards.map(c => c.rank).sort();
  const is72Ranks = ranks[0] === '2' && ranks[1] === '7';

  if (!is72Ranks) return false;

  if (requireOffsuit) {
    const suits = holeCards.map(c => c.suit);
    return suits[0] !== suits[1];
  }

  return true;
}

/**
 * 7-2 Game Definition
 *
 * Rules:
 * - Each participating player contributes a small amount (default: $1) per hand
 * - If a player wins the hand with 7-2 (offsuit), they collect from all participants
 * - Contributions come from side pot, paid from committed funds
 */
export const SEVEN_TWO_GAME: SideGameDefinition = {
  type: 'seven-two-game',
  displayName: '7-2 Game',
  description: 'Win a hand with 7-2 offsuit and collect from all participants',
  isOptional: true,
  requiresUpfrontBuyIn: false,  // Per-hand contribution

  // Defaults
  defaultContributionPerHand: 100,  // $1
  defaultConfig: {
    contributionPerHand: 100,
    payoutType: 'immediate',
    requireOffsuit: true
  },

  // Validation
  minParticipants: 2,

  /**
   * Hook: Called at end of hand when winner is determined
   */
  onHandComplete: (context: SideGameContext): SideGamePayout[] => {
    const { winner, sideGame } = context;
    const config: SevenTwoConfig = {
      ...SEVEN_TWO_GAME.defaultConfig,
      ...sideGame.config
    };

    // Check if winner won with 7-2
    const is72 = isSevenTwo(winner.holeCards, config.requireOffsuit);

    if (!is72) {
      return [];  // No payout this hand
    }

    console.log(`💰 7-2 Game: ${winner.name} wins with 7-2!`);

    // Winner collects from all participants
    const payouts: SideGamePayout[] = [];
    const participants = sideGame.participants.filter((p: any) => p.opted === 'in');

    for (const participant of participants) {
      if (participant.playerId === winner.playerId) continue;

      payouts.push({
        fromPlayerId: participant.playerId,
        toPlayerId: winner.playerId,
        amount: config.contributionPerHand,
        reason: '7-2 Game jackpot'
      });
    }

    console.log(`💰 7-2 Game: ${winner.name} collects ${payouts.length * config.contributionPerHand} from ${payouts.length} players`);

    return payouts;
  },

  /**
   * Validate configuration
   */
  validateConfig: (config: SevenTwoConfig): { valid: boolean; error?: string } => {
    if (!config.contributionPerHand || config.contributionPerHand <= 0) {
      return { valid: false, error: 'Contribution per hand must be positive' };
    }

    if (config.payoutType !== 'immediate' && config.payoutType !== 'progressive') {
      return { valid: false, error: 'Invalid payout type' };
    }

    return { valid: true };
  }
};

// Auto-register
SideGameRegistry.register(SEVEN_TWO_GAME);
