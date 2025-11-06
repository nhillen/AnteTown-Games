/**
 * CoinFlipGame - Simple Flipz betting game
 *
 * Rules:
 * - 2 players minimum
 * - Fixed ante (configurable, default $5)
 * - One player calls "heads" or "tails"
 * - Coin flips
 * - Winner takes pot (minus rake if configured)
 * - Fast rounds, minimal complexity
 */

import { GameBase, GameState, Seat, WinnerResult, TableConfig, Player } from '@antetown/game-sdk';

type CoinFlipPhase = 'Lobby' | 'Ante' | 'CallSide' | 'Flip' | 'Payout' | 'HandEnd';

type CoinFlipGameState = GameState & {
  phase: CoinFlipPhase;
  calledSide?: 'heads' | 'tails';
  callerPlayerId?: string;
  flipResult?: 'heads' | 'tails';
};

export class CoinFlipGame extends GameBase {
  public gameType = 'flipz';
  public gameState: CoinFlipGameState | null = null;
  private defaultAnteAmount = 500; // $5.00 in pennies
  private phaseTimer: NodeJS.Timeout | null = null;
  private rakePercentage: number = 5; // default 5%
  private minBuyInMultiplier: number = 5; // default 5x ante
  private inactivityTimeoutMs: number = 60000; // 60 seconds of inactivity
  private playerLastActivity: Map<string, number> = new Map(); // Track last activity time
  private inactivityChecker: NodeJS.Timeout | null = null;

  constructor(config: TableConfig & { rakePercentage?: number; minBuyInMultiplier?: number }) {
    super(config);
    this.rakePercentage = config.rakePercentage ?? 5;
    this.minBuyInMultiplier = config.minBuyInMultiplier ?? 5;
    this.initializeGameState('Lobby');

    // Start inactivity checker
    this.startInactivityChecker();
  }

  /**
   * Override sitPlayer to enforce minimum buy-in based on ante
   */
  public sitPlayer(player: Player, seatIndex?: number, buyInAmount?: number): { success: boolean; error?: string; seatIndex?: number } {
    const anteAmount = this.getAnteAmount();
    const minimumBuyIn = anteAmount * this.minBuyInMultiplier;

    // Enforce minimum buy-in
    if (buyInAmount && buyInAmount < minimumBuyIn) {
      const minDollars = (minimumBuyIn / 100).toFixed(2);
      const anteDollars = (anteAmount / 100).toFixed(2);
      return {
        success: false,
        error: `Minimum buy-in is $${minDollars} (${this.minBuyInMultiplier}x the $${anteDollars} ante)`
      };
    }

    // Use the minimum if no buy-in specified
    const actualBuyIn = buyInAmount || minimumBuyIn;

    // Check if player has enough bankroll for the minimum
    if (player.bankroll < minimumBuyIn) {
      const minDollars = (minimumBuyIn / 100).toFixed(2);
      return {
        success: false,
        error: `Insufficient bankroll. Need at least $${minDollars} to sit at this table`
      };
    }

    const result = super.sitPlayer(player, seatIndex, actualBuyIn);
    if (result.success) {
      // Track initial activity when player sits down
      this.trackActivity(player.id);
    }
    return result;
  }

  // ============================================================
  // GAME LIFECYCLE
  // ============================================================

  /**
   * Start a new hand
   */
  public startHand(): void {
    if (!this.gameState) return;

    // Validate we have enough players
    const allSeatedPlayers = this.gameState.seats.filter(s => s);
    const activePlayers = this.getActivePlayers();
    console.log(`🪙 [Flipz] startHand: ${allSeatedPlayers.length} seated, ${activePlayers.length} active`);

    if (activePlayers.length < 2) {
      console.log(`🪙 [Flipz] ERROR: Not enough active players to start (need 2, have ${activePlayers.length})`);
      allSeatedPlayers.forEach(p => {
        console.log(`  - ${p.name}: stack=${p.tableStack}, folded=${p.hasFolded}, allIn=${p.isAllIn}`);
      });
      this.broadcast('error', 'Need at least 2 players to start');
      return;
    }

    console.log(`🪙 [Flipz] Starting new hand with ${activePlayers.length} players`);

    // Reset hand state
    this.gameState.pot = 0;
    this.gameState.currentBet = 0;
    delete this.gameState.calledSide;
    delete this.gameState.callerPlayerId;
    delete this.gameState.flipResult;

    // Reset all seats
    for (const seat of this.gameState.seats) {
      if (!seat) continue;
      seat.hasFolded = false;
      seat.currentBet = 0;
      seat.hasActed = false;
      seat.isAllIn = false;
      seat.totalContribution = 0;
    }

    // Move to ante phase
    this.transitionToPhase('Ante');
  }

  /**
   * Transition to a new phase
   */
  private transitionToPhase(phase: CoinFlipPhase): void {
    if (!this.gameState) return;

    console.log(`🪙 [Flipz] Transitioning to phase: ${phase}`);
    this.gameState.phase = phase;

    // Clear any existing timer
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }

    // Execute phase logic
    switch (phase) {
      case 'Ante':
        this.handleAntePhase();
        break;

      case 'CallSide':
        this.handleCallSidePhase();
        break;

      case 'Flip':
        this.handleFlipPhase();
        break;

      case 'Payout':
        this.handlePayoutPhase();
        break;

      case 'HandEnd':
        this.handleHandEndPhase();
        break;
    }

    this.broadcastGameState();
  }

  // ============================================================
  // PHASE HANDLERS
  // ============================================================

  private handleAntePhase(): void {
    if (!this.gameState) return;

    const anteAmount = this.getAnteAmount();
    console.log(`🪙 [Flipz] Collecting ${anteAmount} pennies ante from each player`);

    // Auto-stand players who can't cover ante
    for (let i = 0; i < this.gameState.seats.length; i++) {
      const seat = this.gameState.seats[i];
      if (seat && seat.tableStack < anteAmount) {
        console.log(`🪙 [Flipz] Auto-standing ${seat.name} - insufficient funds (${seat.tableStack} < ${anteAmount})`);

        // Return remaining stack to player bankroll
        const player = this.getPlayer(seat.playerId);
        if (player) {
          player.bankroll += seat.tableStack;
        }

        // Broadcast notification
        this.broadcast('player_action', {
          playerName: seat.name,
          action: 'stood up',
          details: 'Insufficient funds for ante',
          isAI: seat.isAI,
        });

        // Remove from seat
        this.gameState.seats[i] = null as any;
      }
    }

    // Check if we still have enough players after auto-standing
    const remainingPlayers = this.getActivePlayers();
    if (remainingPlayers.length < 2) {
      console.log(`🪙 [Flipz] Not enough players after auto-stand, returning to Lobby`);
      this.transitionToPhase('HandEnd');
      return;
    }

    // Collect antes
    this.collectAntes(anteAmount);

    console.log(`🪙 [Flipz] Pot after antes: ${this.gameState.pot} pennies`);

    // Move to call side phase after 1 second
    this.phaseTimer = setTimeout(() => {
      this.transitionToPhase('CallSide');
    }, 1000);
  }

  private handleCallSidePhase(): void {
    if (!this.gameState) return;

    // First active player gets to call
    const activePlayers = this.getActivePlayers();
    const allSeatedPlayers = this.gameState.seats.filter(s => s);
    console.log(`🪙 [Flipz] CallSide: ${allSeatedPlayers.length} seated, ${activePlayers.length} active`);
    console.log(`🪙 [Flipz] Seated players:`, allSeatedPlayers.map(s => `${s.name}: stack=${s.tableStack}, folded=${s.hasFolded}, allIn=${s.isAllIn}`));
    if (activePlayers.length < 2) {
      console.log(`🪙 [Flipz] Not enough players (need at least 2)`);
      this.transitionToPhase('HandEnd');
      return;
    }

    const firstPlayer = activePlayers[0];
    if (!firstPlayer) return;

    this.gameState.currentTurnPlayerId = firstPlayer.playerId;
    console.log(`🪙 [Flipz] ${firstPlayer.name} can call heads or tails (${activePlayers.length} players total)`);

    // If AI player, auto-call immediately
    if (firstPlayer.isAI) {
      const aiSide = Math.random() < 0.5 ? 'heads' : 'tails';
      console.log(`🪙 [Flipz] AI ${firstPlayer.name} auto-calling ${aiSide}`);
      setTimeout(() => {
        this.handleCallSide(firstPlayer.playerId, aiSide);
      }, 1000); // 1 second delay for realism
      return;
    }

    // Set 5 second timeout for human players
    this.gameState.turnEndsAtMs = Date.now() + 5000;

    this.phaseTimer = setTimeout(() => {
      // Auto-call random if player didn't act
      if (!this.gameState?.calledSide && firstPlayer) {
        const randomSide = Math.random() < 0.5 ? 'heads' : 'tails';
        console.log(`🪙 [Flipz] Auto-calling ${randomSide} for ${firstPlayer.name} (timer expired)`);
        this.handleCallSide(firstPlayer.playerId, randomSide);
      }
    }, 5000);
  }

  private handleFlipPhase(): void {
    if (!this.gameState) return;

    // Flip the coin
    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    this.gameState.flipResult = result;

    console.log(`🪙 [Flipz] Coin landed on: ${result}`);

    // Show result for 3 seconds
    this.broadcastGameState();

    this.phaseTimer = setTimeout(() => {
      this.transitionToPhase('Payout');
    }, 3000);
  }

  private handlePayoutPhase(): void {
    if (!this.gameState) return;

    const winnersBeforeRake = this.evaluateWinners();
    console.log(`🪙 [Flipz] Winners before rake:`, winnersBeforeRake);

    // Apply rake
    const winnersAfterRake = winnersBeforeRake.map(winner => {
      const rake = Math.floor(winner.payout * (this.rakePercentage / 100));
      const payoutAfterRake = winner.payout - rake;
      console.log(`🪙 [Flipz] ${winner.name}: $${winner.payout/100} - ${this.rakePercentage}% rake ($${rake/100}) = $${payoutAfterRake/100}`);
      return {
        ...winner,
        payout: payoutAfterRake,
        description: `${winner.description} (${this.rakePercentage}% rake: -$${(rake/100).toFixed(2)})`
      };
    });

    console.log(`🪙 [Flipz] Winners after rake:`, winnersAfterRake);

    this.payoutWinners(winnersAfterRake);
    this.broadcastGameState();

    // Broadcast winner announcement
    this.broadcast('player_action', {
      playerName: winnersAfterRake[0]?.name || 'Unknown',
      action: 'won',
      details: `$${((winnersAfterRake[0]?.payout || 0) / 100).toFixed(2)}`,
      isAI: false,
    });

    // Move to hand end
    this.phaseTimer = setTimeout(() => {
      this.transitionToPhase('HandEnd');
    }, 3000);
  }

  private handleHandEndPhase(): void {
    this.endHand();
    this.broadcastGameState();

    // Auto-start next hand after 3 seconds if enough players (gives time to stand up)
    this.phaseTimer = setTimeout(() => {
      if (this.canStartHand()) {
        const activePlayers = this.getActivePlayers();
        console.log(`🪙 [Flipz] HandEnd: Checking if can start - ${activePlayers.length} active players`);
        if (activePlayers.length >= 2) {
          console.log(`🪙 [Flipz] HandEnd: Starting next hand`);
          this.startHand();
        } else {
          console.log(`🪙 [Flipz] HandEnd: Not enough active players, staying in Lobby`);
        }
      }
    }, 3000);
  }

  // ============================================================
  // PLAYER ACTIONS
  // ============================================================

  public handlePlayerAction(playerId: string, action: string, data?: any): void {
    if (!this.gameState) return;

    // Track activity on any player action
    this.trackActivity(playerId);

    switch (action) {
      case 'call_heads':
        this.handleCallSide(playerId, 'heads');
        break;

      case 'call_tails':
        this.handleCallSide(playerId, 'tails');
        break;

      case 'start_hand':
        if (this.gameState.phase === 'Lobby' && this.canStartHand()) {
          this.startHand();
        }
        break;

      default:
        console.warn(`🪙 [Flipz] Unknown action: ${action}`);
    }
  }

  private handleCallSide(playerId: string, side: 'heads' | 'tails'): void {
    if (!this.gameState || this.gameState.phase !== 'CallSide') return;

    if (this.gameState.currentTurnPlayerId !== playerId) {
      this.emitToPlayer(playerId, 'error', 'Not your turn');
      return;
    }

    console.log(`🪙 [Flipz] ${this.findSeat(playerId)?.name} called ${side}`);

    this.gameState.calledSide = side;
    this.gameState.callerPlayerId = playerId;

    // Clear turn timer
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }

    // Broadcast the call
    this.broadcast('player_action', {
      playerName: this.findSeat(playerId)?.name || 'Unknown',
      action: `called ${side}`,
      details: '',
      isAI: false,
    });

    // Move to flip
    this.transitionToPhase('Flip');
  }

  // ============================================================
  // GAME LOGIC
  // ============================================================

  public evaluateWinners(): WinnerResult[] {
    if (!this.gameState) return [];

    const { calledSide, callerPlayerId, flipResult, pot } = this.gameState;

    if (!calledSide || !callerPlayerId || !flipResult) {
      return [];
    }

    const didCallerWin = calledSide === flipResult;
    const callerSeat = this.findSeat(callerPlayerId);
    if (!callerSeat) return [];

    if (didCallerWin) {
      // Caller won
      return [
        {
          playerId: callerPlayerId,
          name: callerSeat.name,
          payout: pot,
          description: `Called ${calledSide} correctly!`,
        },
      ];
    } else {
      // Caller lost - all other active players split the pot
      const loserSeat = callerSeat;
      const winnerSeats = this.gameState.seats.filter(
        s => s && s.playerId !== callerPlayerId && !s.hasFolded
      );

      if (winnerSeats.length > 0) {
        // Split pot evenly among all winners
        const payoutPerWinner = Math.floor(pot / winnerSeats.length);
        return winnerSeats.map(seat => ({
          playerId: seat.playerId,
          name: seat.name,
          payout: payoutPerWinner,
          description: winnerSeats.length > 1
            ? `${loserSeat.name} called ${calledSide}, but coin was ${flipResult} (split ${winnerSeats.length} ways)`
            : `${loserSeat.name} called ${calledSide}, but coin was ${flipResult}`,
        }));
      }
    }

    return [];
  }

  public getValidActions(playerId: string): string[] {
    if (!this.gameState) return [];

    switch (this.gameState.phase) {
      case 'Lobby':
        return this.canStartHand() ? ['start_hand'] : [];

      case 'CallSide':
        if (this.gameState.currentTurnPlayerId === playerId) {
          return ['call_heads', 'call_tails'];
        }
        return [];

      default:
        return [];
    }
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  private getActivePlayers(): Seat[] {
    if (!this.gameState) return [];
    return this.gameState.seats.filter(s => s && !s.hasFolded && !s.isAllIn);
  }

  private getAnteAmount(): number {
    const configuredAnte = this.tableConfig.betting?.ante?.amount;
    return configuredAnte || this.defaultAnteAmount;
  }

  protected initializeGameState(phase: CoinFlipPhase = 'Lobby'): void {
    const emptySeats: Seat[] = Array(this.tableConfig.maxSeats).fill(null);

    this.gameState = {
      phase,
      seats: emptySeats,
      pot: 0,
      currentBet: 0,
      ante: 0,
      handCount: 0,
    };
  }

  /**
   * Override standPlayer to reset game when a player stands in 2-player game
   */
  public standPlayer(playerId: string, immediate: boolean = false): { success: boolean; error?: string } {
    const result = super.standPlayer(playerId, immediate);

    if (result.success && this.gameState) {
      // In a 2-player game, if one stands, game should end
      const remainingPlayers = this.gameState.seats.filter(s => s !== null);
      if (remainingPlayers.length < 2) {
        console.log('🪙 [Flipz] Player stood, resetting to Lobby phase');

        // Reset game to lobby
        this.gameState.phase = 'Lobby';
        this.gameState.pot = 0;
        this.gameState.currentBet = 0;
        delete this.gameState.calledSide;
        delete this.gameState.callerPlayerId;
        delete this.gameState.flipResult;

        // Clear any timers
        if (this.phaseTimer) {
          clearTimeout(this.phaseTimer);
          this.phaseTimer = null;
        }

        // Broadcast the updated state
        this.broadcast('game_state', this.gameState);
      }
    }

    return result;
  }

  /**
   * Track player activity
   */
  private trackActivity(playerId: string): void {
    this.playerLastActivity.set(playerId, Date.now());
  }

  /**
   * Start the inactivity checker
   */
  private startInactivityChecker(): void {
    this.inactivityChecker = setInterval(() => {
      this.checkInactivePlayers();
    }, 10000) as any; // Check every 10 seconds
  }

  /**
   * Check for and remove inactive players
   */
  private checkInactivePlayers(): void {
    if (!this.gameState || this.gameState.phase !== 'Lobby') {
      // Only kick inactive players during lobby phase
      return;
    }

    const now = Date.now();
    const seatsToRemove: number[] = [];

    for (let i = 0; i < this.gameState.seats.length; i++) {
      const seat = this.gameState.seats[i];
      if (!seat) continue;

      const lastActivity = this.playerLastActivity.get(seat.playerId);
      if (!lastActivity) {
        // Track initial activity
        this.playerLastActivity.set(seat.playerId, now);
        continue;
      }

      const timeSinceActivity = now - lastActivity;
      if (timeSinceActivity > this.inactivityTimeoutMs) {
        seatsToRemove.push(i);
      }
    }

    // Remove inactive players
    for (const seatIndex of seatsToRemove) {
      const seat = this.gameState.seats[seatIndex];
      if (seat) {
        console.log(`🪙 [Flipz] Kicking inactive player ${seat.name} after ${this.inactivityTimeoutMs}ms`);

        // Return chips to bankroll (would normally persist to DB)
        // this would be handled by the backend in the actual implementation

        this.gameState.seats[seatIndex] = null as any;
        this.playerLastActivity.delete(seat.playerId);

        this.broadcast('player_action', {
          playerName: seat.name,
          action: 'kicked for inactivity',
          details: 'Inactive for 60 seconds',
          isAI: seat.isAI,
        });
      }
    }

    if (seatsToRemove.length > 0) {
      this.broadcast('game_state', this.gameState);
    }
  }

  /**
   * Clean up timers
   */
  public destroy(): void {
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
    if (this.inactivityChecker) {
      clearInterval(this.inactivityChecker);
      this.inactivityChecker = null;
    }
  }
}
