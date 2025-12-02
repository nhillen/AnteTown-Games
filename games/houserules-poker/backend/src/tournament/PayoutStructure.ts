/**
 * Payout Structure Management
 *
 * Calculates and manages prize distribution for tournaments.
 */

import type { PayoutConfig, TournamentPayout } from './TournamentConfig.js';

/**
 * Manages payout calculations for a tournament
 */
export class PayoutStructure {
  private readonly percentages: number[];
  private readonly prizePool: number;
  private readonly payouts: TournamentPayout[];

  constructor(config: PayoutConfig, prizePool: number) {
    this.percentages = config.percentages;
    this.prizePool = prizePool;
    this.payouts = this.calculatePayouts();
  }

  /**
   * Calculate all payouts based on prize pool and percentages
   */
  private calculatePayouts(): TournamentPayout[] {
    return this.percentages.map((percentage, index) => ({
      position: index + 1,
      amount: Math.floor(this.prizePool * (percentage / 100)),
    }));
  }

  /**
   * Get payout for a specific finishing position
   * @param position 1-indexed finishing position (1 = winner)
   */
  getPayoutForPosition(position: number): number {
    if (position <= 0 || position > this.percentages.length) {
      return 0;
    }
    return this.payouts[position - 1]?.amount ?? 0;
  }

  /**
   * Get all payouts
   */
  getAllPayouts(): TournamentPayout[] {
    return [...this.payouts];
  }

  /**
   * Get the number of paid positions
   */
  getPaidPositions(): number {
    return this.percentages.length;
  }

  /**
   * Check if a position is in the money
   */
  isInTheMoney(position: number): boolean {
    return position > 0 && position <= this.percentages.length;
  }

  /**
   * Get the total prize pool
   */
  getPrizePool(): number {
    return this.prizePool;
  }

  /**
   * Get payout percentages
   */
  getPercentages(): number[] {
    return [...this.percentages];
  }

  /**
   * Get formatted payout string for display
   */
  getPayoutDisplay(position: number): string {
    const amount = this.getPayoutForPosition(position);
    if (amount === 0) {
      return 'No payout';
    }
    // Convert from pennies to dollars
    return `$${(amount / 100).toFixed(2)}`;
  }

  // ============================================================================
  // Static Factory Methods - Standard Payout Structures
  // ============================================================================

  /**
   * Standard 6-max SNG payout (top 2 paid)
   * 1st: 65%, 2nd: 35%
   */
  static standard6Max(): PayoutConfig {
    return {
      percentages: [65, 35],
    };
  }

  /**
   * Standard 9-max SNG payout (top 3 paid)
   * 1st: 50%, 2nd: 30%, 3rd: 20%
   */
  static standard9Max(): PayoutConfig {
    return {
      percentages: [50, 30, 20],
    };
  }

  /**
   * Standard 10-max SNG payout (top 3 paid)
   * 1st: 50%, 2nd: 30%, 3rd: 20%
   */
  static standard10Max(): PayoutConfig {
    return {
      percentages: [50, 30, 20],
    };
  }

  /**
   * Winner-take-all payout
   * 1st: 100%
   */
  static winnerTakeAll(): PayoutConfig {
    return {
      percentages: [100],
    };
  }

  /**
   * Heads-up payout (2 players, top heavy)
   * 1st: 70%, 2nd: 30%
   */
  static headsUp(): PayoutConfig {
    return {
      percentages: [70, 30],
    };
  }

  /**
   * Flat top 3 payout (equal split)
   * 1st: 34%, 2nd: 33%, 3rd: 33%
   */
  static flatTop3(): PayoutConfig {
    return {
      percentages: [34, 33, 33],
    };
  }

  /**
   * Get standard payout structure based on number of entrants
   */
  static forEntrantCount(entrants: number): PayoutConfig {
    if (entrants <= 2) {
      return PayoutStructure.headsUp();
    }
    if (entrants <= 6) {
      return PayoutStructure.standard6Max();
    }
    if (entrants <= 10) {
      return PayoutStructure.standard9Max();
    }
    // For larger tournaments (MTT), pay more positions
    if (entrants <= 18) {
      return {
        percentages: [40, 25, 18, 12, 5], // Top 5
      };
    }
    if (entrants <= 27) {
      return {
        percentages: [35, 22, 16, 12, 8, 4, 3], // Top 7
      };
    }
    // 28+ players - pay about 15% of field
    const paidPositions = Math.max(3, Math.floor(entrants * 0.15));
    return PayoutStructure.generatePayout(paidPositions);
  }

  /**
   * Generate a payout structure for a given number of paid positions
   * Uses a standard decay formula
   */
  static generatePayout(paidPositions: number): PayoutConfig {
    if (paidPositions <= 0) {
      return { percentages: [100] };
    }
    if (paidPositions === 1) {
      return { percentages: [100] };
    }
    if (paidPositions === 2) {
      return { percentages: [65, 35] };
    }
    if (paidPositions === 3) {
      return { percentages: [50, 30, 20] };
    }

    // For 4+ positions, use decay formula
    const percentages: number[] = [];
    let remaining = 100;

    for (let i = 0; i < paidPositions; i++) {
      // First place gets more, then decay
      let share: number;
      if (i === 0) {
        share = Math.floor(100 / (1 + paidPositions * 0.4));
      } else if (i === paidPositions - 1) {
        // Last paid position gets remaining
        share = remaining;
      } else {
        // Decay formula: each position gets less
        const factor = 1 - (i / paidPositions) * 0.6;
        share = Math.floor(remaining * factor / (paidPositions - i));
      }

      share = Math.max(1, share); // At least 1%
      percentages.push(share);
      remaining -= share;
    }

    // Normalize to ensure sum is exactly 100
    const sum = percentages.reduce((a, b) => a + b, 0);
    if (sum !== 100) {
      percentages[0] += 100 - sum;
    }

    return { percentages };
  }
}
