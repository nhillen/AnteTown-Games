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
  readyPlayers?: string[]; // Track who is ready to start
  lobbyTimerEndsAt?: number; // Timestamp when lobby timer expires
};

const RED_SUITS = ['♥', '♦'];
const BLACK_SUITS = ['♣', '♠'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export class CardFlipGame extends GameBase {
  public gameType = 'card-flip';
  public gameState: CardFlipGameState | null = null;
  private defaultAnteAmount = 1; // Default ante in currency units (1 TC)
  private phaseTimer: NodeJS.Timeout | null = null;
  private rakePercentage: number = 5;
  private minBuyInMultiplier: number = 5;
  private inactivityTimeoutMs: number = 60000; // 60 seconds of inactivity
  private playerLastActivity: Map<string, number> = new Map(); // Track last activity time
  private inactivityChecker: NodeJS.Timeout | null = null;
  private lastPickerId: string | null = null; // Track who picked last to rotate
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
      emoji: '🎴',
      botNamePrefix: 'CardBot',
      defaultBuyIn: this.getAnteAmount() * 5  // 5x ante
    };
  }

  /**
   * Create an AI player for this game
   */
  public createAIPlayer(): Player {
    const botNames = ['CardBot', 'RedMaster', 'BlackJack', 'CardShark', 'DealerBot', 'ColorPicker'];
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
          console.log('🤖 [CardFlip] PvE mode detected - adding AI opponent');
          const aiPlayer = this.createAIPlayer();
          const aiResult = super.sitPlayer(aiPlayer, undefined, actualBuyIn);
          if (aiResult.success) {
            console.log(`🤖 [CardFlip] AI opponent ${aiPlayer.name} added`);
          }
        }
      }

      // Auto-start game when 2 players are seated
      if (this.gameState && this.gameState.phase === 'Lobby') {
        const activePlayers = this.getActivePlayers();
        if (activePlayers.length >= 2) {
          console.log('🎴 [CardFlip] 2 players seated, auto-starting game');
          // Small delay for UX
          setTimeout(() => {
            if (this.gameState && this.gameState.phase === 'Lobby') {
              this.startHand();
            }
          }, 1500);
        }
      }
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
    console.log(`🎴 [CardFlip] Collecting ${anteAmount} ante from each player`);

    // Check and handle players who can't cover ante
    for (let i = 0; i < this.gameState.seats.length; i++) {
      const seat = this.gameState.seats[i];
      if (seat && seat.tableStack < anteAmount) {
        const player = this.getPlayer(seat.playerId);

        // For AI players, replenish their stack instead of standing them
        if (player && player.isAI) {
          const replenishAmount = anteAmount * 10; // Give them 10x ante
          seat.tableStack += replenishAmount;
          player.bankroll += replenishAmount;
          console.log(`🤖 [CardFlip] AI ${seat.name} low on funds - replenished with ${replenishAmount} (new stack: ${seat.tableStack})`);
          this.broadcast('player_action', {
            playerName: seat.name,
            action: 'replenished',
            details: `Added ${replenishAmount} TC`,
            isAI: true,
          });
          continue;
        }

        // For human players, auto-stand them
        console.log(`🎴 [CardFlip] Auto-standing ${seat.name} - insufficient funds`);

        // Platform will credit tableStack back to database in stand_up handler
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

    // Collect antes from each player and add to pot
    let totalAntes = 0;
    for (const seat of this.gameState.seats) {
      if (seat && !seat.hasFolded) {
        seat.tableStack -= anteAmount;
        seat.currentBet = anteAmount;
        seat.totalContribution = anteAmount;
        totalAntes += anteAmount;
        console.log(`🎴 [CardFlip] Collected ${anteAmount} ante from ${seat.name} (stack now: ${seat.tableStack})`);
      }
    }
    this.gameState.pot = totalAntes;
    console.log(`🎴 [CardFlip] Total pot after antes: ${this.gameState.pot}, max payout is ${anteAmount * 6}`);

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

    // Side bet settlement: apply rake and transfer between players
    const winnersAfterRake = winnersBeforeRake.map(winner => {
      const rake = Math.floor(winner.payout * (this.rakePercentage / 100));
      const payoutAfterRake = winner.payout - rake;
      console.log(`🎴 [CardFlip] ${winner.name}: ${winner.payout} - ${this.rakePercentage}% rake (${rake}) = ${payoutAfterRake}`);
      return {
        ...winner,
        payout: payoutAfterRake,
        description: `${winner.description} (${this.rakePercentage}% rake: -${rake})`
      };
    });

    console.log(`🎴 [CardFlip] Winners after rake:`, winnersAfterRake);

    // Distribute pot and settle side bets
    for (const winner of winnersAfterRake) {
      const winnerSeat = this.findSeat(winner.playerId);
      if (!winnerSeat) continue;

      // Find the loser (the other active player)
      const loserSeat = this.gameState.seats.find(
        s => s && !s.hasFolded && s.playerId !== winner.playerId
      );

      if (loserSeat && winner.payout > 0) {
        // Winner gets their ante back from pot, plus net payout from loser
        const potContribution = Math.min(this.gameState.pot, winner.payout);
        const loserOwes = winner.payout - potContribution;

        // Distribute pot to winner
        winnerSeat.tableStack += potContribution;
        this.gameState.pot -= potContribution;

        // Loser pays remaining amount
        if (loserOwes > 0) {
          loserSeat.tableStack -= loserOwes;
          winnerSeat.tableStack += loserOwes;
        }

        console.log(`🎴 [CardFlip] Settlement: ${winnerSeat.name} gets ${potContribution} from pot + ${loserOwes} from ${loserSeat.name}`);
        console.log(`🎴 [CardFlip] New stacks - ${loserSeat.name}: ${loserSeat.tableStack}, ${winnerSeat.name}: ${winnerSeat.tableStack}`);
      }
    }

    // Any remaining pot goes to house as rake
    if (this.gameState.pot > 0) {
      console.log(`🎴 [CardFlip] Remaining pot ${this.gameState.pot} goes to house`);
      this.gameState.pot = 0;
    }

    this.broadcastGameState();

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
      console.log(`🎴 [CardFlip] Processing ${this.queuedStandUps.size} queued stand-ups`);
      for (const playerId of this.queuedStandUps) {
        const seat = this.findSeat(playerId);
        if (seat) {
          console.log(`🎴 [CardFlip] Standing ${seat.name} (queued)`);
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
        if (activePlayers.length >= 2) {
          console.log(`🎴 [CardFlip] HandEnd: Starting next hand`);
          this.startHand();
        } else {
          console.log(`🎴 [CardFlip] HandEnd: Not enough active players`);
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
      case 'pick_red':
        this.handlePickSide(playerId, 'red');
        break;

      case 'pick_black':
        this.handlePickSide(playerId, 'black');
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
      ? `All ${winningColor}! ${cardsStr} (3 × ${cardValue} = ${winningCount * cardValue})`
      : `${redCount} red, ${blackCount} black: ${cardsStr} (Net: ${winnings})`;

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
      ante: this.getAnteAmount(),  // Use configured ante amount
      handCount: 0,
      flippedCards: [],
      redCount: 0,
      blackCount: 0,
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
        console.log(`🎴 [CardFlip] Queueing stand for ${seat.name} after hand ends`);
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
