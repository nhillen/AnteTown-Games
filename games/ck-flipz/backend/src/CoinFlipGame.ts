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
  readyPlayers?: string[]; // Track who is ready to start
  lobbyTimerEndsAt?: number; // Timestamp when lobby timer expires
};

export class CoinFlipGame extends GameBase {
  public gameType = 'flipz';
  public gameState: CoinFlipGameState | null = null;
  private defaultAnteAmount = 5; // Default ante in currency units (5 TC)
  private phaseTimer: NodeJS.Timeout | null = null;
  private rakePercentage: number = 5; // default 5%
  private minBuyInMultiplier: number = 5; // default 5x ante
  private inactivityTimeoutMs: number = 60000; // 60 seconds of inactivity
  private playerLastActivity: Map<string, number> = new Map(); // Track last activity time
  private inactivityChecker: NodeJS.Timeout | null = null;
  private lastCallerPlayerId: string | null = null; // Track who called last hand for rotation
  private queuedStandUps: Set<string> = new Set(); // Players who want to stand after current hand

  constructor(config: TableConfig, options?: { rakePercentage?: number; minBuyInMultiplier?: number }) {
    super(config);
    this.rakePercentage = options?.rakePercentage ?? 5;
    this.minBuyInMultiplier = options?.minBuyInMultiplier ?? 5;
    this.initializeGameState('Lobby');

    // Start inactivity checker
    this.startInactivityChecker();
  }

  public getMetadata() {
    return {
      emoji: '🪙',
      botNamePrefix: 'FlipBot',
      defaultBuyIn: this.getAnteAmount() * 5  // 5x ante
    };
  }

  /**
   * Create an AI player for this game
   */
  public createAIPlayer(): Player {
    const botNames = ['FlipBot', 'CoinMaster', 'LuckyCoin', 'HeadsOrTails', 'FlipKing', 'TailsWinner'];
    const randomName = botNames[Math.floor(Math.random() * botNames.length)];
    const uniqueId = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    return {
      id: uniqueId,
      name: randomName,
      isAI: true,
      bankroll: 1000, // AI starting bankroll in currency units (1000 TC)
      googleId: undefined
    };
  }

  /**
   * Override sitPlayer to enforce minimum buy-in based on ante
   */
  public sitPlayer(player: Player, seatIndex?: number, buyInAmount?: number): { success: boolean; error?: string; seatIndex?: number } {
    const anteAmount = this.getAnteAmount();
    const minimumBuyIn = anteAmount * this.minBuyInMultiplier;

    // Enforce minimum buy-in
    if (buyInAmount && buyInAmount < minimumBuyIn) {
      return {
        success: false,
        error: `Minimum buy-in is ${minimumBuyIn} ${this.currency} (${this.minBuyInMultiplier}x the ${anteAmount} ${this.currency} ante)`
      };
    }

    // Use the minimum if no buy-in specified
    const actualBuyIn = buyInAmount || minimumBuyIn;

    // Platform validates bankroll via currencyManager.canAfford() before calling this
    // Games should not re-validate or modify player.bankroll

    const result = super.sitPlayer(player, seatIndex, actualBuyIn);
    if (result.success) {
      // Track initial activity when player sits down
      this.trackActivity(player.id);

      // Auto-add AI opponent for PvE mode
      if (!player.isAI && this.gameState) {
        const seatedCount = this.gameState.seats.filter(s => s !== null).length;
        const humanCount = this.gameState.seats.filter(s => s && !s.isAI).length;

        // If this is PvE mode and only 1 player seated, add an AI opponent
        if (humanCount === 1 && seatedCount === 1) {
          console.log('🤖 [CoinFlip] PvE mode detected - adding AI opponent');
          const aiPlayer = this.createAIPlayer();
          const aiResult = super.sitPlayer(aiPlayer, undefined, actualBuyIn);
          if (aiResult.success) {
            console.log(`🤖 [CoinFlip] AI opponent ${aiPlayer.name} added`);
            // Auto-mark AI as ready
            if (!this.gameState.readyPlayers) {
              this.gameState.readyPlayers = [];
            }
            if (!this.gameState.readyPlayers.includes(aiPlayer.id)) {
              this.gameState.readyPlayers.push(aiPlayer.id);
              console.log(`🤖 [CoinFlip] AI opponent auto-marked ready`);
            }
          }
        }
      }
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
    delete this.gameState.readyPlayers; // Clear ready state
    delete this.gameState.lobbyTimerEndsAt; // Clear lobby timer

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
    console.log(`🪙 [Flipz] Collecting ${anteAmount} ante from each player`);

    // Auto-stand players who can't cover ante
    for (let i = 0; i < this.gameState.seats.length; i++) {
      const seat = this.gameState.seats[i];
      if (seat && seat.tableStack < anteAmount) {
        console.log(`🪙 [Flipz] Auto-standing ${seat.name} - insufficient funds (${seat.tableStack} < ${anteAmount})`);

        // Platform will credit tableStack back to database in stand_up handler
        // For AI players, bankroll is tracked in-memory so update it here
        const player = this.getPlayer(seat.playerId);
        if (player && player.isAI) {
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

    // Collect antes from each player and add to pot
    let totalAntes = 0;
    for (const seat of this.gameState.seats) {
      if (seat && !seat.hasFolded) {
        seat.tableStack -= anteAmount;
        seat.currentBet = anteAmount;
        seat.totalContribution = anteAmount;
        totalAntes += anteAmount;
        console.log(`🪙 [Flipz] Collected ${anteAmount} ante from ${seat.name} (stack now: ${seat.tableStack})`);
      }
    }
    this.gameState.pot = totalAntes;
    console.log(`🪙 [Flipz] Total pot after antes: ${this.gameState.pot}`);

    // Move to call side phase after 1 second
    this.phaseTimer = setTimeout(() => {
      this.transitionToPhase('CallSide');
    }, 1000);
  }

  private handleCallSidePhase(): void {
    if (!this.gameState) return;

    // Rotate who gets to call
    const activePlayers = this.getActivePlayers();
    const allSeatedPlayers = this.gameState.seats.filter(s => s);
    console.log(`🪙 [Flipz] CallSide: ${allSeatedPlayers.length} seated, ${activePlayers.length} active`);
    console.log(`🪙 [Flipz] Seated players:`, allSeatedPlayers.map(s => `${s.name}: stack=${s.tableStack}, folded=${s.hasFolded}, allIn=${s.isAllIn}`));
    if (activePlayers.length < 2) {
      console.log(`🪙 [Flipz] Not enough players (need at least 2)`);
      this.transitionToPhase('HandEnd');
      return;
    }

    // Rotate caller: if lastCaller is set, pick the next player; otherwise pick first player
    let currentCaller = activePlayers[0];
    if (this.lastCallerPlayerId) {
      const lastCallerIndex = activePlayers.findIndex(p => p.playerId === this.lastCallerPlayerId);
      if (lastCallerIndex >= 0) {
        // Pick next player (wrap around if needed)
        const nextIndex = (lastCallerIndex + 1) % activePlayers.length;
        currentCaller = activePlayers[nextIndex];
        console.log(`🪙 [Flipz] Rotating caller from ${activePlayers[lastCallerIndex].name} to ${currentCaller.name}`);
      }
    }

    if (!currentCaller) return;

    this.gameState.currentTurnPlayerId = currentCaller.playerId;
    console.log(`🪙 [Flipz] ${currentCaller.name} can call heads or tails (${activePlayers.length} players total)`);

    // If AI player, auto-call immediately
    if (currentCaller.isAI) {
      const aiSide = Math.random() < 0.5 ? 'heads' : 'tails';
      console.log(`🪙 [Flipz] AI ${currentCaller.name} auto-calling ${aiSide}`);
      setTimeout(() => {
        this.handleCallSide(currentCaller.playerId, aiSide);
      }, 1000); // 1 second delay for realism
      return;
    }

    // Set 5 second timeout for human players
    this.gameState.turnEndsAtMs = Date.now() + 5000;

    this.phaseTimer = setTimeout(() => {
      // Auto-call random if player didn't act
      if (!this.gameState?.calledSide && currentCaller) {
        const randomSide = Math.random() < 0.5 ? 'heads' : 'tails';
        console.log(`🪙 [Flipz] Auto-calling ${randomSide} for ${currentCaller.name} (timer expired)`);
        this.handleCallSide(currentCaller.playerId, randomSide);
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

    // Side bet settlement: apply rake and transfer between players
    const winnersAfterRake = winnersBeforeRake.map(winner => {
      const rake = Math.floor(winner.payout * (this.rakePercentage / 100));
      const payoutAfterRake = winner.payout - rake;
      console.log(`🪙 [Flipz] ${winner.name}: ${winner.payout} - ${this.rakePercentage}% rake (${rake}) = ${payoutAfterRake}`);
      return {
        ...winner,
        payout: payoutAfterRake,
        description: `${winner.description} (${this.rakePercentage}% rake: -${rake})`
      };
    });

    console.log(`🪙 [Flipz] Winners after rake:`, winnersAfterRake);

    // Side bet: transfer money directly between players
    const activePlayers = this.getActivePlayers();
    for (const winner of winnersAfterRake) {
      const winnerSeat = this.findSeat(winner.playerId);
      if (!winnerSeat) continue;

      // Find losers (all other active players)
      const loserSeats = this.gameState.seats.filter(
        s => s && !s.hasFolded && s.playerId !== winner.playerId
      );

      if (loserSeats.length > 0 && winner.payout > 0) {
        // Split the winnings from all losers
        const amountPerLoser = Math.floor(winner.payout / loserSeats.length);

        for (const loserSeat of loserSeats) {
          loserSeat.tableStack -= amountPerLoser;
          console.log(`🪙 [Flipz] ${loserSeat.name} pays ${amountPerLoser} to ${winnerSeat.name}`);
        }

        winnerSeat.tableStack += winner.payout;
        console.log(`🪙 [Flipz] ${winnerSeat.name} receives ${winner.payout} total`);
        console.log(`🪙 [Flipz] New stack: ${winnerSeat.name}: ${winnerSeat.tableStack}`);
      }
    }

    this.broadcastGameState();

    // Broadcast winner announcement
    this.broadcast('player_action', {
      playerName: winnersAfterRake[0]?.name || 'Unknown',
      action: 'won',
      details: `${winnersAfterRake[0]?.payout || 0}`,
      isAI: false,
    });

    // Move to hand end after 5 seconds (more time to see results)
    this.phaseTimer = setTimeout(() => {
      this.transitionToPhase('HandEnd');
    }, 5000);
  }

  private handleHandEndPhase(): void {
    this.endHand();

    // Process queued stand-ups
    if (this.queuedStandUps.size > 0) {
      console.log(`🪙 [Flipz] Processing ${this.queuedStandUps.size} queued stand-ups`);
      for (const playerId of this.queuedStandUps) {
        const seat = this.findSeat(playerId);
        if (seat) {
          console.log(`🪙 [Flipz] Standing ${seat.name} (queued)`);
          this.standPlayer(playerId, true); // immediate stand
        }
      }
      this.queuedStandUps.clear();
    }

    this.broadcastGameState();

    // Auto-start next hand after 5 seconds if enough players (gives time to see results and stand up)
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
    }, 5000);
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
      case 'mark_ready':
        if (this.gameState.phase === 'Lobby' && this.canStartHand()) {
          this.handleMarkReady(playerId);
        }
        break;

      default:
        console.warn(`🪙 [Flipz] Unknown action: ${action}`);
    }
  }

  private handleMarkReady(playerId: string): void {
    if (!this.gameState || this.gameState.phase !== 'Lobby') return;

    // Initialize ready players array if not exists
    if (!this.gameState.readyPlayers) {
      this.gameState.readyPlayers = [];
    }

    // Add player to ready list if not already there
    if (!this.gameState.readyPlayers.includes(playerId)) {
      this.gameState.readyPlayers.push(playerId);
      const seat = this.findSeat(playerId);
      console.log(`🪙 [CoinFlip] ${seat?.name} marked ready (${this.gameState.readyPlayers.length}/2)`);
    }

    const activePlayers = this.getActivePlayers();

    // Start if both players are ready
    if (this.gameState.readyPlayers.length >= 2 && activePlayers.length >= 2) {
      console.log(`🪙 [CoinFlip] Both players ready, starting hand`);
      this.startHand();
    } else {
      // Set a lobby timer if not already set
      if (!this.gameState.lobbyTimerEndsAt) {
        this.gameState.lobbyTimerEndsAt = Date.now() + 10000; // 10 second timer
        console.log(`🪙 [CoinFlip] Starting lobby timer (10s)`);

        this.phaseTimer = setTimeout(() => {
          if (this.gameState && this.gameState.phase === 'Lobby' && this.canStartHand()) {
            console.log(`🪙 [CoinFlip] Lobby timer expired, starting hand`);
            this.startHand();
          }
        }, 10000);
      }

      // Broadcast updated state with ready players
      this.broadcast('game_state', this.gameState);
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

    // Save caller for rotation in next hand
    this.lastCallerPlayerId = playerId;

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
        return this.canStartHand() ? ['mark_ready'] : [];

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
      ante: this.getAnteAmount(),  // Use configured ante amount
      handCount: 0,
      gameType: this.gameType,  // Include game type in state
    };
  }

  /**
   * Override standPlayer to reset game when a player stands in 2-player game
   * If hand is in progress and not immediate, queue the stand for after hand ends
   */
  public standPlayer(playerId: string, immediate: boolean = false): { success: boolean; error?: string } {
    if (!this.gameState) {
      return super.standPlayer(playerId, immediate);
    }

    // If not immediate and hand is in progress, queue the stand
    const handInProgress = this.gameState.phase !== 'Lobby' && this.gameState.phase !== 'HandEnd';
    if (!immediate && handInProgress) {
      const seat = this.findSeat(playerId);
      if (seat) {
        console.log(`🪙 [Flipz] Queueing stand for ${seat.name} after hand ends`);
        this.queuedStandUps.add(playerId);

        // Notify player
        this.emitToPlayer(playerId, 'info', 'You will stand up after this hand ends');

        return { success: true };
      }
      return { success: false, error: 'Player not found' };
    }

    // Remove from queued stand-ups if standing immediately
    this.queuedStandUps.delete(playerId);

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
        delete this.gameState.readyPlayers; // Clear ready state
        delete this.gameState.lobbyTimerEndsAt; // Clear lobby timer

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
