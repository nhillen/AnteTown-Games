/**
 * CardFlipGame - Red vs Black card flip game
 *
 * Rules:
 * - One player picks red, one picks black
 * - Flip 3 cards one by one
 * - Each card is worth $1 (ante amount) normally
 * - If all 3 cards match, each card is worth $2 (double ante)
 * - Net payout: (winning color cards × value) - (losing color cards × value)
 *
 * Examples with $1 ante:
 * - RRR (all red): Red wins $6 (3 × $2)
 * - BBB (all black): Black wins $6 (3 × $2)
 * - RRB (2 red, 1 black): Red wins $1 (2×$1 - 1×$1)
 * - RBB (1 red, 2 black): Black wins $1 (2×$1 - 1×$1)
 * - Tie is not possible with 3 cards
 */

import { GameBase, GameState, Seat, WinnerResult, TableConfig, Player } from '@antetown/game-sdk';

type CardFlipPhase = 'Lobby' | 'Ante' | 'PickSide' | 'FlipCard1' | 'FlipCard2' | 'FlipCard3' | 'Payout' | 'HandEnd';
type CardColor = 'red' | 'black';
type Card = { color: CardColor; suit: string; rank: string };

type CardFlipGameState = GameState & {
  phase: CardFlipPhase;
  pickedSide?: CardColor;
  pickerPlayerId?: string;
  opponentSide?: CardColor;
  opponentPlayerId?: string;
  flippedCards: Card[];
  redCount: number;
  blackCount: number;
};

const RED_SUITS = ['♥', '♦'];
const BLACK_SUITS = ['♣', '♠'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export class CardFlipGame extends GameBase {
  public gameType = 'card-flip';
  public gameState: CardFlipGameState | null = null;
  private defaultAnteAmount = 100; // $1.00 in pennies
  private phaseTimer: NodeJS.Timeout | null = null;
  private rakePercentage: number = 5;
  private minBuyInMultiplier: number = 5;
  private inactivityTimeoutMs: number = 60000; // 60 seconds of inactivity
  private playerLastActivity: Map<string, number> = new Map(); // Track last activity time
  private inactivityChecker: NodeJS.Timeout | null = null;
  private lastPickerId: string | null = null; // Track who picked last to rotate

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
      emoji: '🎴',
      botNamePrefix: 'CardBot',
      defaultBuyIn: this.getAnteAmount() * 5  // 5x ante
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

  public startHand(): void {
    if (!this.gameState) return;

    const activePlayers = this.getActivePlayers();
    console.log(`🎴 [CardFlip] startHand: ${activePlayers.length} active players`);

    if (activePlayers.length < 2) {
      console.log(`🎴 [CardFlip] ERROR: Not enough active players (need 2, have ${activePlayers.length})`);
      this.broadcast('error', 'Need exactly 2 players to start');
      return;
    }

    console.log(`🎴 [CardFlip] Starting new hand with ${activePlayers.length} players`);

    // Reset hand state
    this.gameState.pot = 0;
    this.gameState.currentBet = 0;
    delete this.gameState.pickedSide;
    delete this.gameState.pickerPlayerId;
    delete this.gameState.opponentSide;
    delete this.gameState.opponentPlayerId;
    this.gameState.flippedCards = [];
    this.gameState.redCount = 0;
    this.gameState.blackCount = 0;

    // Reset all seats
    for (const seat of this.gameState.seats) {
      if (!seat) continue;
      seat.hasFolded = false;
      seat.currentBet = 0;
      seat.hasActed = false;
      seat.isAllIn = false;
      seat.totalContribution = 0;
    }

    this.transitionToPhase('Ante');
  }

  private transitionToPhase(phase: CardFlipPhase): void {
    if (!this.gameState) return;

    console.log(`🎴 [CardFlip] Transitioning to phase: ${phase}`);
    this.gameState.phase = phase;

    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }

    switch (phase) {
      case 'Ante':
        this.handleAntePhase();
        break;
      case 'PickSide':
        this.handlePickSidePhase();
        break;
      case 'FlipCard1':
      case 'FlipCard2':
      case 'FlipCard3':
        this.handleFlipCardPhase();
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
    console.log(`🎴 [CardFlip] Collecting ${anteAmount} pennies ante from each player`);

    // Auto-stand players who can't cover ante
    for (let i = 0; i < this.gameState.seats.length; i++) {
      const seat = this.gameState.seats[i];
      if (seat && seat.tableStack < anteAmount) {
        console.log(`🎴 [CardFlip] Auto-standing ${seat.name} - insufficient funds`);
        const player = this.getPlayer(seat.playerId);
        if (player) {
          player.bankroll += seat.tableStack;
        }
        this.broadcast('player_action', {
          playerName: seat.name,
          action: 'stood up',
          details: 'Insufficient funds for ante',
          isAI: seat.isAI,
        });
        this.gameState.seats[i] = null as any;
      }
    }

    const remainingPlayers = this.getActivePlayers();
    if (remainingPlayers.length < 2) {
      console.log(`🎴 [CardFlip] Not enough players after auto-stand`);
      this.transitionToPhase('HandEnd');
      return;
    }

    this.collectAntes(anteAmount);
    console.log(`🎴 [CardFlip] Pot after antes: ${this.gameState.pot} pennies`);

    this.phaseTimer = setTimeout(() => {
      this.transitionToPhase('PickSide');
    }, 1000);
  }

  private handlePickSidePhase(): void {
    if (!this.gameState) return;

    const activePlayers = this.getActivePlayers();
    if (activePlayers.length < 2) {
      this.transitionToPhase('HandEnd');
      return;
    }

    // Rotate who picks - if we have a lastPickerId, pick the other player
    let pickerIndex = 0;
    if (this.lastPickerId) {
      const lastPickerIndex = activePlayers.findIndex(p => p.playerId === this.lastPickerId);
      // Pick the other player (in a 2 player game, it's always the other one)
      pickerIndex = lastPickerIndex === 0 ? 1 : 0;
    }

    const pickingPlayer = activePlayers[pickerIndex];
    if (!pickingPlayer) return;

    this.gameState.currentTurnPlayerId = pickingPlayer.playerId;
    this.lastPickerId = pickingPlayer.playerId; // Remember for next round
    console.log(`🎴 [CardFlip] ${pickingPlayer.name} can pick red or black`);

    // If AI player, auto-pick immediately
    if (pickingPlayer.isAI) {
      const aiSide: CardColor = Math.random() < 0.5 ? 'red' : 'black';
      console.log(`🎴 [CardFlip] AI ${pickingPlayer.name} auto-picking ${aiSide}`);
      setTimeout(() => {
        this.handlePickSide(pickingPlayer.playerId, aiSide);
      }, 1000);
      return;
    }

    // Set 5 second timeout for human players
    this.gameState.turnEndsAtMs = Date.now() + 5000;

    this.phaseTimer = setTimeout(() => {
      if (!this.gameState?.pickedSide && pickingPlayer) {
        const randomSide: CardColor = Math.random() < 0.5 ? 'red' : 'black';
        console.log(`🎴 [CardFlip] Auto-picking ${randomSide} for ${pickingPlayer.name} (timer expired)`);
        this.handlePickSide(pickingPlayer.playerId, randomSide);
      }
    }, 5000);
  }

  private handleFlipCardPhase(): void {
    if (!this.gameState) return;

    const card = this.flipRandomCard();
    this.gameState.flippedCards.push(card);

    if (card.color === 'red') {
      this.gameState.redCount++;
    } else {
      this.gameState.blackCount++;
    }

    console.log(`🎴 [CardFlip] Flipped ${card.rank}${card.suit} (${card.color}) - Red: ${this.gameState.redCount}, Black: ${this.gameState.blackCount}`);

    this.broadcastGameState();

    this.phaseTimer = setTimeout(() => {
      const cardNum = this.gameState!.flippedCards.length;
      if (cardNum === 1) {
        this.transitionToPhase('FlipCard2');
      } else if (cardNum === 2) {
        this.transitionToPhase('FlipCard3');
      } else {
        this.transitionToPhase('Payout');
      }
    }, 2000);
  }

  private handlePayoutPhase(): void {
    if (!this.gameState) return;

    const winnersBeforeRake = this.evaluateWinners();
    console.log(`🎴 [CardFlip] Winners before rake:`, winnersBeforeRake);

    const winnersAfterRake = winnersBeforeRake.map(winner => {
      const rake = Math.floor(winner.payout * (this.rakePercentage / 100));
      const payoutAfterRake = winner.payout - rake;
      console.log(`🎴 [CardFlip] ${winner.name}: $${winner.payout/100} - ${this.rakePercentage}% rake ($${rake/100}) = $${payoutAfterRake/100}`);
      return {
        ...winner,
        payout: payoutAfterRake,
        description: `${winner.description} (${this.rakePercentage}% rake: -$${(rake/100).toFixed(2)})`
      };
    });

    console.log(`🎴 [CardFlip] Winners after rake:`, winnersAfterRake);

    this.payoutWinners(winnersAfterRake);
    this.broadcastGameState();

    this.broadcast('player_action', {
      playerName: winnersAfterRake[0]?.name || 'Unknown',
      action: 'won',
      details: `$${((winnersAfterRake[0]?.payout || 0) / 100).toFixed(2)}`,
      isAI: false,
    });

    this.phaseTimer = setTimeout(() => {
      this.transitionToPhase('HandEnd');
    }, 3000);
  }

  private handleHandEndPhase(): void {
    this.endHand();
    this.broadcastGameState();

    this.phaseTimer = setTimeout(() => {
      if (this.canStartHand()) {
        const activePlayers = this.getActivePlayers();
        if (activePlayers.length >= 2) {
          console.log(`🎴 [CardFlip] HandEnd: Starting next hand`);
          this.startHand();
        } else {
          console.log(`🎴 [CardFlip] HandEnd: Not enough active players`);
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
      case 'pick_red':
        this.handlePickSide(playerId, 'red');
        break;

      case 'pick_black':
        this.handlePickSide(playerId, 'black');
        break;

      case 'start_hand':
        if (this.gameState.phase === 'Lobby' && this.canStartHand()) {
          this.startHand();
        }
        break;

      default:
        console.warn(`🎴 [CardFlip] Unknown action: ${action}`);
    }
  }

  private handlePickSide(playerId: string, side: CardColor): void {
    if (!this.gameState || this.gameState.phase !== 'PickSide') return;

    if (this.gameState.currentTurnPlayerId !== playerId) {
      this.emitToPlayer(playerId, 'error', 'Not your turn');
      return;
    }

    console.log(`🎴 [CardFlip] ${this.findSeat(playerId)?.name} picked ${side}`);

    this.gameState.pickedSide = side;
    this.gameState.pickerPlayerId = playerId;

    // Assign opponent the opposite side
    const activePlayers = this.getActivePlayers();
    const opponent = activePlayers.find(p => p.playerId !== playerId);
    if (opponent) {
      this.gameState.opponentSide = side === 'red' ? 'black' : 'red';
      this.gameState.opponentPlayerId = opponent.playerId;
      console.log(`🎴 [CardFlip] ${opponent.name} gets ${this.gameState.opponentSide}`);
    }

    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }

    this.broadcast('player_action', {
      playerName: this.findSeat(playerId)?.name || 'Unknown',
      action: `picked ${side}`,
      details: '',
      isAI: false,
    });

    this.transitionToPhase('FlipCard1');
  }

  // ============================================================
  // GAME LOGIC
  // ============================================================

  public evaluateWinners(): WinnerResult[] {
    if (!this.gameState) return [];

    const { pickedSide, pickerPlayerId, opponentSide, opponentPlayerId, redCount, blackCount, pot, flippedCards } = this.gameState;

    if (!pickedSide || !pickerPlayerId || !opponentSide || !opponentPlayerId || flippedCards.length !== 3) {
      return [];
    }

    const anteAmount = this.getAnteAmount();
    const allSameColor = redCount === 3 || blackCount === 3;
    const cardValue = allSameColor ? anteAmount * 2 : anteAmount; // Double value if all match

    let winningColor: CardColor;
    let winningCount: number;
    let losingCount: number;

    if (redCount > blackCount) {
      winningColor = 'red';
      winningCount = redCount;
      losingCount = blackCount;
    } else {
      winningColor = 'black';
      winningCount = blackCount;
      losingCount = redCount;
    }

    const winnerPlayerId = pickedSide === winningColor ? pickerPlayerId : opponentPlayerId;
    const winnerSeat = this.findSeat(winnerPlayerId);
    if (!winnerSeat) return [];

    const winnings = (winningCount * cardValue) - (losingCount * cardValue);

    const cardsStr = flippedCards.map(c => `${c.rank}${c.suit}`).join(' ');
    const description = allSameColor
      ? `All ${winningColor}! ${cardsStr} (3 × $${(cardValue/100).toFixed(2)} = $${(winningCount * cardValue/100).toFixed(2)})`
      : `${redCount} red, ${blackCount} black: ${cardsStr} (Net: $${(winnings/100).toFixed(2)})`;

    return [{
      playerId: winnerPlayerId,
      name: winnerSeat.name,
      payout: winnings,
      description,
    }];
  }

  public getValidActions(playerId: string): string[] {
    if (!this.gameState) return [];

    switch (this.gameState.phase) {
      case 'Lobby':
        return this.canStartHand() ? ['start_hand'] : [];

      case 'PickSide':
        if (this.gameState.currentTurnPlayerId === playerId) {
          return ['pick_red', 'pick_black'];
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

  private flipRandomCard(): Card {
    const isRed = Math.random() < 0.5;
    const suits = isRed ? RED_SUITS : BLACK_SUITS;
    const suit = suits[Math.floor(Math.random() * suits.length)];
    const rank = RANKS[Math.floor(Math.random() * RANKS.length)];

    return {
      color: isRed ? 'red' : 'black',
      suit,
      rank,
    };
  }

  protected initializeGameState(phase: CardFlipPhase = 'Lobby'): void {
    const emptySeats: Seat[] = Array(this.tableConfig.maxSeats).fill(null);

    this.gameState = {
      phase,
      seats: emptySeats,
      pot: 0,
      currentBet: 0,
      ante: 0,
      handCount: 0,
      flippedCards: [],
      redCount: 0,
      blackCount: 0,
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
        console.log('🎴 [CardFlip] Player stood, resetting to Lobby phase');

        // Reset game to lobby
        this.gameState.phase = 'Lobby';
        this.gameState.pot = 0;
        this.gameState.currentBet = 0;
        this.gameState.flippedCards = [];
        this.gameState.redCount = 0;
        this.gameState.blackCount = 0;
        delete this.gameState.pickedSide;
        delete this.gameState.pickerPlayerId;
        delete this.gameState.opponentSide;
        delete this.gameState.opponentPlayerId;

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
        console.log(`🎴 [CardFlip] Kicking inactive player ${seat.name} after ${this.inactivityTimeoutMs}ms`);

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
