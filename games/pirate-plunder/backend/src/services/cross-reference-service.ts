import { MoneyTransaction, moneyFlowService, logger } from '@pirate/core-engine';

export interface ValidationDiscrepancy {
  type: 'missing_transaction' | 'extra_transaction' | 'amount_mismatch' | 'account_mismatch' | 'timing_mismatch';
  severity: 'low' | 'medium' | 'high' | 'critical';
  handId: string;
  playerId?: string;
  playerName?: string;
  description: string;
  expected?: any;
  actual?: any;
  transactionId?: string;
  handAction?: any;
}

export interface CrossReferenceReport {
  handId: string;
  timestamp: string;
  isValid: boolean;
  discrepancies: ValidationDiscrepancy[];
  summary: {
    totalHandActions: number;
    totalMoneyTransactions: number;
    matchedActions: number;
    unmatchedActions: number;
    extraTransactions: number;
    totalAmountDiscrepancy: number;
  };
}

export class CrossReferenceService {
  private static instance: CrossReferenceService;

  private constructor() {}

  public static getInstance(): CrossReferenceService {
    if (!CrossReferenceService.instance) {
      CrossReferenceService.instance = new CrossReferenceService();
    }
    return CrossReferenceService.instance;
  }

  /**
   * Validate a single hand by cross-referencing hand history with money flow
   */
  public validateHand(handHistory: any): CrossReferenceReport {
    const handId = handHistory.handId;
    const discrepancies: ValidationDiscrepancy[] = [];

    // Get all money transactions for this hand
    const moneyTransactions = moneyFlowService.getHandTransactions(handId);

    let totalHandActions = 0;
    let matchedActions = 0;
    let totalAmountDiscrepancy = 0;

    // Validate ante transactions
    this.validateAnteTransactions(handHistory, moneyTransactions, discrepancies);

    // Validate betting actions
    for (const round of handHistory.rounds || []) {
      if (round.bettingPhase?.actions) {
        totalHandActions += round.bettingPhase.actions.length;
        const { matched, discrepancy } = this.validateBettingRound(
          round.bettingPhase,
          moneyTransactions,
          handId,
          round.roundNumber,
          discrepancies
        );
        matchedActions += matched;
        totalAmountDiscrepancy += discrepancy;
      }
    }

    // Validate payout transactions
    if (handHistory.showdown?.payouts) {
      const { matched, discrepancy } = this.validatePayouts(
        handHistory.showdown.payouts,
        moneyTransactions,
        handId,
        discrepancies
      );
      matchedActions += matched;
      totalAmountDiscrepancy += discrepancy;
    }

    // Check for extra transactions not accounted for in hand history
    const expectedTransactionTypes = ['ANTE', 'BET', 'CALL', 'RAISE', 'PAYOUT_ROLE', 'PAYOUT_CARGO', 'BUST_FEE'];
    const extraTransactions = moneyTransactions.filter(tx =>
      expectedTransactionTypes.includes(tx.type) &&
      !this.isTransactionAccountedFor(tx, handHistory)
    );

    extraTransactions.forEach(tx => {
      discrepancies.push({
        type: 'extra_transaction',
        severity: 'medium',
        handId,
        playerId: tx.playerId,
        playerName: tx.playerName,
        description: `Extra money transaction not found in hand history: ${tx.type} ${tx.amount} pennies`,
        transactionId: tx.id,
        actual: tx
      });
    });

    const isValid = discrepancies.length === 0;

    return {
      handId,
      timestamp: handHistory.timestamp,
      isValid,
      discrepancies,
      summary: {
        totalHandActions,
        totalMoneyTransactions: moneyTransactions.filter(tx =>
          expectedTransactionTypes.includes(tx.type)
        ).length,
        matchedActions,
        unmatchedActions: totalHandActions - matchedActions,
        extraTransactions: extraTransactions.length,
        totalAmountDiscrepancy: Math.abs(totalAmountDiscrepancy)
      }
    };
  }

  private validateAnteTransactions(
    handHistory: any,
    moneyTransactions: MoneyTransaction[],
    discrepancies: ValidationDiscrepancy[]
  ): void {
    // Check if antes should exist based on table config
    const tableConfig = handHistory.tableConfig;
    if (!tableConfig?.betting?.ante || tableConfig.betting.ante.mode === 'none') {
      return; // No antes expected
    }

    const anteTransactions = moneyTransactions.filter(tx => tx.type === 'ANTE');
    const expectedPlayerIds = handHistory.players?.map((p: any) => p.playerId) || [];

    // Progressive antes: check if multiple ante transactions per player exist
    if (tableConfig.betting.ante.progressive) {
      // Each player might have up to 3 ante transactions (one per street)
      for (const playerId of expectedPlayerIds) {
        const playerAntes = anteTransactions.filter(tx => tx.playerId === playerId);

        if (playerAntes.length === 0) {
          discrepancies.push({
            type: 'missing_transaction',
            severity: 'high',
            handId: handHistory.handId,
            playerId,
            description: `Missing ante transaction for player (progressive antes enabled)`
          });
        }

        // Validate ante amounts for progressive system
        if (playerAntes.length > 1) {
          this.validateProgressiveAnteAmounts(playerAntes, tableConfig.betting.ante, discrepancies, handHistory.handId);
        }
      }
    } else {
      // Standard ante: one transaction per player
      for (const playerId of expectedPlayerIds) {
        const playerAnte = anteTransactions.find(tx => tx.playerId === playerId);

        if (!playerAnte) {
          discrepancies.push({
            type: 'missing_transaction',
            severity: 'high',
            handId: handHistory.handId,
            playerId,
            description: `Missing ante transaction for player`
          });
        }
      }
    }
  }

  private validateProgressiveAnteAmounts(
    anteTransactions: MoneyTransaction[],
    anteConfig: any,
    discrepancies: ValidationDiscrepancy[],
    handId: string
  ): void {
    // Sort by timestamp to check progression
    const sortedAntes = anteTransactions.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const baseAmount = anteConfig.amount; // Already in pennies
    const multiplier = anteConfig.street_multiplier;
    const expectedAmounts = [
      baseAmount,
      baseAmount + multiplier,
      baseAmount + 2 * multiplier
    ];

    sortedAntes.forEach((ante, index) => {
      if (index < expectedAmounts.length) {
        const expected = expectedAmounts[index];
        if (ante.amount !== expected) {
          discrepancies.push({
            type: 'amount_mismatch',
            severity: 'medium',
            handId,
            playerId: ante.playerId,
            playerName: ante.playerName,
            description: `Progressive ante amount mismatch for street ${index + 1}`,
            expected,
            actual: ante.amount,
            transactionId: ante.id
          });
        }
      }
    });
  }

  private validateBettingRound(
    bettingPhase: any,
    moneyTransactions: MoneyTransaction[],
    handId: string,
    roundNumber: number,
    discrepancies: ValidationDiscrepancy[]
  ): { matched: number; discrepancy: number } {
    let matched = 0;
    let totalDiscrepancy = 0;

    const bettingTransactions = moneyTransactions.filter(tx =>
      ['BET', 'CALL', 'RAISE'].includes(tx.type)
    );

    for (const action of bettingPhase.actions) {
      if (['bet', 'call', 'raise'].includes(action.action) && action.amount) {
        // Find corresponding money transaction
        const correspondingTx = this.findCorrespondingTransaction(
          action,
          bettingTransactions,
          roundNumber
        );

        if (!correspondingTx) {
          discrepancies.push({
            type: 'missing_transaction',
            severity: 'high',
            handId,
            playerId: action.playerId,
            playerName: action.playerName,
            description: `Missing money transaction for ${action.action} ${action.amount}`,
            handAction: action
          });
        } else {
          matched++;

          // Validate amount (convert action amount to pennies)
          const expectedAmount = action.amount * 100;
          if (correspondingTx.amount !== expectedAmount) {
            const discrepancy = Math.abs(correspondingTx.amount - expectedAmount);
            totalDiscrepancy += discrepancy;

            discrepancies.push({
              type: 'amount_mismatch',
              severity: 'medium',
              handId,
              playerId: action.playerId,
              playerName: action.playerName,
              description: `Amount mismatch for ${action.action}`,
              expected: expectedAmount,
              actual: correspondingTx.amount,
              transactionId: correspondingTx.id,
              handAction: action
            });
          }

          // Validate transaction type
          const expectedType = action.action.toUpperCase();
          if (correspondingTx.type !== expectedType) {
            discrepancies.push({
              type: 'account_mismatch',
              severity: 'medium',
              handId,
              playerId: action.playerId,
              playerName: action.playerName,
              description: `Transaction type mismatch for ${action.action}`,
              expected: expectedType,
              actual: correspondingTx.type,
              transactionId: correspondingTx.id,
              handAction: action
            });
          }
        }
      }
    }

    return { matched, discrepancy: totalDiscrepancy };
  }

  private validatePayouts(
    payouts: { [playerId: string]: number },
    moneyTransactions: MoneyTransaction[],
    handId: string,
    discrepancies: ValidationDiscrepancy[]
  ): { matched: number; discrepancy: number } {
    let matched = 0;
    let totalDiscrepancy = 0;

    const payoutTransactions = moneyTransactions.filter(tx =>
      ['PAYOUT_ROLE', 'PAYOUT_CARGO', 'BUST_FEE'].includes(tx.type)
    );

    for (const [playerId, payoutAmount] of Object.entries(payouts)) {
      if (payoutAmount !== 0) {
        const playerPayouts = payoutTransactions.filter(tx => tx.playerId === playerId);

        if (payoutAmount > 0) {
          // Positive payout - should have PAYOUT_ROLE or PAYOUT_CARGO transaction
          const positivePayout = playerPayouts.find(tx =>
            ['PAYOUT_ROLE', 'PAYOUT_CARGO'].includes(tx.type)
          );

          if (!positivePayout) {
            discrepancies.push({
              type: 'missing_transaction',
              severity: 'high',
              handId,
              playerId,
              description: `Missing payout transaction for ${payoutAmount} pennies`,
              expected: payoutAmount
            });
          } else {
            matched++;
            if (positivePayout.amount !== payoutAmount) {
              const discrepancy = Math.abs(positivePayout.amount - payoutAmount);
              totalDiscrepancy += discrepancy;

              discrepancies.push({
                type: 'amount_mismatch',
                severity: 'medium',
                handId,
                playerId,
                description: `Payout amount mismatch`,
                expected: payoutAmount,
                actual: positivePayout.amount,
                transactionId: positivePayout.id
              });
            }
          }
        } else {
          // Negative payout - should have BUST_FEE transaction
          const bustFee = playerPayouts.find(tx => tx.type === 'BUST_FEE');
          const expectedBustFeeAmount = Math.abs(payoutAmount);

          if (!bustFee) {
            discrepancies.push({
              type: 'missing_transaction',
              severity: 'high',
              handId,
              playerId,
              description: `Missing bust fee transaction for ${expectedBustFeeAmount} pennies`,
              expected: expectedBustFeeAmount
            });
          } else {
            matched++;
            if (bustFee.amount !== expectedBustFeeAmount) {
              const discrepancy = Math.abs(bustFee.amount - expectedBustFeeAmount);
              totalDiscrepancy += discrepancy;

              discrepancies.push({
                type: 'amount_mismatch',
                severity: 'medium',
                handId,
                playerId,
                description: `Bust fee amount mismatch`,
                expected: expectedBustFeeAmount,
                actual: bustFee.amount,
                transactionId: bustFee.id
              });
            }
          }
        }
      }
    }

    return { matched, discrepancy: totalDiscrepancy };
  }

  private findCorrespondingTransaction(
    action: any,
    transactions: MoneyTransaction[],
    roundNumber: number
  ): MoneyTransaction | undefined {
    // Find transaction that matches player, type, and is within reasonable time window
    const actionTime = new Date(action.timestamp).getTime();
    const actionType = action.action.toUpperCase();

    return transactions.find(tx => {
      const txTime = new Date(tx.timestamp).getTime();
      const timeDiff = Math.abs(txTime - actionTime);

      return (
        tx.playerId === action.playerId &&
        tx.type === actionType &&
        timeDiff < 60000 // Within 1 minute
      );
    });
  }

  private isTransactionAccountedFor(
    transaction: MoneyTransaction,
    handHistory: any
  ): boolean {
    // Check if this transaction corresponds to any action in hand history

    // Check ante transactions
    if (transaction.type === 'ANTE') {
      return handHistory.tableConfig?.betting?.ante?.mode !== 'none';
    }

    // Check betting transactions
    if (['BET', 'CALL', 'RAISE'].includes(transaction.type)) {
      for (const round of handHistory.rounds || []) {
        if (round.bettingPhase?.actions) {
          const matchingAction = round.bettingPhase.actions.find((action: any) =>
            action.playerId === transaction.playerId &&
            action.action.toUpperCase() === transaction.type &&
            Math.abs(new Date(action.timestamp).getTime() - new Date(transaction.timestamp).getTime()) < 60000
          );
          if (matchingAction) return true;
        }
      }
    }

    // Check payout transactions
    if (['PAYOUT_ROLE', 'PAYOUT_CARGO', 'BUST_FEE'].includes(transaction.type)) {
      const payouts = handHistory.showdown?.payouts || {};
      return payouts.hasOwnProperty(transaction.playerId);
    }

    return false;
  }

  /**
   * Validate multiple hands and return summary report
   */
  public validateMultipleHands(handHistories: any[]): {
    totalHands: number;
    validHands: number;
    invalidHands: number;
    totalDiscrepancies: number;
    discrepanciesBySeverity: Record<string, number>;
    reports: CrossReferenceReport[];
  } {
    const reports = handHistories.map(hand => this.validateHand(hand));

    const discrepanciesBySeverity: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0
    };

    let totalDiscrepancies = 0;

    reports.forEach(report => {
      if (report?.discrepancies) {
        totalDiscrepancies += report.discrepancies.length;
        report.discrepancies.forEach(d => {
          if (d && d.severity) {
            switch (d.severity) {
              case 'low':
                discrepanciesBySeverity['low'] = (discrepanciesBySeverity['low'] || 0) + 1;
                break;
              case 'medium':
                discrepanciesBySeverity['medium'] = (discrepanciesBySeverity['medium'] || 0) + 1;
                break;
              case 'high':
                discrepanciesBySeverity['high'] = (discrepanciesBySeverity['high'] || 0) + 1;
                break;
              case 'critical':
                discrepanciesBySeverity['critical'] = (discrepanciesBySeverity['critical'] || 0) + 1;
                break;
            }
          }
        });
      }
    });

    return {
      totalHands: handHistories.length,
      validHands: reports.filter(r => r.isValid).length,
      invalidHands: reports.filter(r => !r.isValid).length,
      totalDiscrepancies,
      discrepanciesBySeverity,
      reports
    };
  }

  /**
   * Get real-time validation for current hand
   */
  public validateCurrentHand(currentHandHistory: any, currentGameState: any): ValidationDiscrepancy[] {
    if (!currentHandHistory) return [];

    const discrepancies: ValidationDiscrepancy[] = [];
    const handId = currentHandHistory.handId;
    const moneyTransactions = moneyFlowService.getHandTransactions(handId);

    // Real-time validation checks
    // 1. Verify pot matches sum of contributions
    const potTransactions = moneyTransactions.filter(tx => tx.toAccount === 'MAIN_POT');
    const calculatedPot = potTransactions.reduce((sum, tx) => sum + tx.amount, 0);

    if (currentGameState?.pot && Math.abs(currentGameState.pot - calculatedPot) > 1) {
      discrepancies.push({
        type: 'amount_mismatch',
        severity: 'high',
        handId,
        description: `Game state pot (${currentGameState.pot}) doesn't match transaction sum (${calculatedPot})`,
        expected: calculatedPot,
        actual: currentGameState.pot
      });
    }

    // 2. Verify player balances match transaction history
    if (currentGameState?.seats) {
      for (const seat of currentGameState.seats) {
        const playerTransactions = moneyTransactions.filter(tx => tx.playerId === seat.playerId);
        const balanceChanges = this.calculatePlayerBalanceChange(playerTransactions);

        // This would require knowing starting balance to validate current balance
        // For now, just check for major discrepancies in recent transactions
      }
    }

    return discrepancies;
  }

  private calculatePlayerBalanceChange(transactions: MoneyTransaction[]): number {
    return transactions.reduce((change, tx) => {
      if (tx.fromAccount === 'TABLE_STACK' || tx.fromAccount === 'PLAYER_BANKROLL') {
        change -= tx.amount;
      }
      if (tx.toAccount === 'TABLE_STACK' || tx.toAccount === 'PLAYER_BANKROLL') {
        change += tx.amount;
      }
      return change;
    }, 0);
  }
}

// Singleton instance
export const crossReferenceService = CrossReferenceService.getInstance();