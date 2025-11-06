import { PokerRulesEngine, GameVariant, BettingRules } from './RulesEngine.js';
import { Card, HandEvaluation, PokerPhase, PokerAction } from '../types.js';
import { PokerSeat } from '../types.js';
import { Seat } from '@pirate/game-sdk';
import { evaluateHand } from '../hand-evaluator.js';

/**
 * Standard Texas Hold'em Rules
 * This is the baseline implementation that all variants extend from
 */
export const HOLDEM_RULES: PokerRulesEngine = {
  variant: 'holdem' as GameVariant,
  modifiers: {
    holeCardCount: 2,
    noLimit: true,
  },

  hooks: {
    /**
     * Standard hand evaluation - no wild cards or special rules
     */
    evaluateHand: (holeCards: Card[], communityCards: Card[]): HandEvaluation => {
      return evaluateHand(holeCards, communityCards);
    },

    /**
     * No wild cards in standard Hold'em
     */
    isWildCard: (card: Card): boolean => {
      return false;
    },

    /**
     * Hold'em uses 2 hole cards
     */
    getHoleCardCount: (phase: PokerPhase): number => {
      return 2;
    },

    /**
     * Standard community card count
     */
    getCommunityCardCount: (phase: PokerPhase): number => {
      switch (phase) {
        case 'Flop':
          return 3;
        case 'Turn':
        case 'River':
          return 1;
        default:
          return 0;
      }
    },

    /**
     * No Limit Hold'em betting rules
     */
    getBettingRules: (): BettingRules => {
      return {
        noLimit: true,
        potLimit: false,
      };
    },

    /**
     * Standard valid actions based on bet state
     */
    getValidActions: (seat: Seat & PokerSeat, phase: PokerPhase, currentBet: number): PokerAction[] => {
      if (seat.hasFolded || seat.tableStack === 0) {
        return [];
      }

      const actions: PokerAction[] = ['fold'];

      if (currentBet === seat.currentBet) {
        actions.push('check');
      } else {
        actions.push('call');
      }

      if (seat.tableStack > 0) {
        actions.push('bet', 'raise', 'all-in');
      }

      return actions;
    },

    /**
     * Standard phase progression: PreFlop -> Flop -> Turn -> River -> Showdown
     */
    getNextPhase: (currentPhase: PokerPhase): PokerPhase | null => {
      const phaseOrder: PokerPhase[] = ['PreFlop', 'Flop', 'Turn', 'River', 'Showdown'];
      const currentIndex = phaseOrder.indexOf(currentPhase);

      if (currentIndex === -1 || currentIndex === phaseOrder.length - 1) {
        return null;
      }

      return phaseOrder[currentIndex + 1];
    },

    /**
     * No phases are skipped in standard Hold'em
     */
    shouldSkipPhase: (phase: PokerPhase): boolean => {
      return false;
    },

    /**
     * Standard hand comparison - higher value wins
     */
    compareHands: (hand1: HandEvaluation, hand2: HandEvaluation): number => {
      return hand1.value - hand2.value;
    },
  },
};
