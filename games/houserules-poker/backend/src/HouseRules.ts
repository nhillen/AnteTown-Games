import { GameBase, GameState, Seat, Player, WinnerResult, GameMetadata } from '@antetown/game-sdk';
import { Card, PokerPhase, PokerAction, PokerSeat, AIPersonality, AIPersonalityProfile } from './types.js';
import { createDeck, shuffleDeck, dealCards } from './deck.js';
import { evaluateHand, handRankToString } from './hand-evaluator.js';
import { loadRulesEngine, PokerRulesEngine, GameVariant } from './rules/index.js';

interface HouseRulesGameState extends GameState {
  phase: PokerPhase;
  seats: (Seat & PokerSeat)[];
  communityCards: Card[];
  deck: Card[];
  dealerSeatIndex: number;
  smallBlind: number;
  bigBlind: number;
  turnEndsAtMs?: number;

  // Squidz Game specific fields
  totalSquidz?: number;            // Total squidz in play for the round
  squidzDistributed?: number;      // Number of squidz distributed so far
  isSquidzRound?: boolean;         // Whether this is a Squidz Game round
  roundLocked?: boolean;           // Prevent new players joining mid-round
}

// AI Personality Profiles
const AI_PERSONALITIES: Record<AIPersonality, AIPersonalityProfile> = {
  GTO: {
    name: 'GTO Player',
    style: 'Tight-Aggressive',
    tightness: 0.75,      // Plays top 25% of hands
    aggression: 0.70,     // Raises 70% of the time when playing
    bluffFrequency: 0.25, // Bluffs occasionally
    foldThreshold: 0.40   // Folds to bets > 40% of stack without strong hand
  },
  Grinder: {
    name: 'Grinder',
    style: 'Ultra-Tight',
    tightness: 0.90,      // Only plays top 10% of hands
    aggression: 0.50,     // Raises 50% of the time
    bluffFrequency: 0.05, // Rarely bluffs
    foldThreshold: 0.25   // Folds to bets > 25% of stack
  },
  Donkey: {
    name: 'Calling Station',
    style: 'Loose-Passive',
    tightness: 0.30,      // Plays 70% of hands
    aggression: 0.20,     // Rarely raises (20%)
    bluffFrequency: 0.10, // Occasionally bluffs
    foldThreshold: 0.80   // Almost never folds (only to huge bets)
  }
};

export class HouseRules extends GameBase {
  gameType = 'houserules-poker';
  declare gameState: HouseRulesGameState | null;

  private variant: GameVariant;
  private rulesEngine: PokerRulesEngine;
  private smallBlindAmount = 50;  // $0.50 in pennies
  private bigBlindAmount = 100;   // $1.00 in pennies
  private minBuyIn = 2000;  // $20
  private maxBuyIn = 10000; // $100
  private turnTimer: NodeJS.Timeout | null = null;
  private turnTimeoutMs = 30000; // 30 seconds per turn

  constructor(tableConfig: any) {
    super(tableConfig);
    this.variant = tableConfig.variant || 'holdem'; // Default to Hold'em for backward compatibility
    this.rulesEngine = loadRulesEngine(this.variant);
    this.tableConfig.maxSeats = tableConfig.maxSeats || 7; // 7-max poker table

    // Override defaults from table config
    this.minBuyIn = tableConfig.minBuyIn || this.minBuyIn;
    this.maxBuyIn = tableConfig.maxBuyIn || this.maxBuyIn;
    this.smallBlindAmount = tableConfig.smallBlind || this.smallBlindAmount;
    this.bigBlindAmount = tableConfig.bigBlind || this.bigBlindAmount;

    console.log(`🎰 Initialized ${this.variant} poker table`);
    this.initializeGameState('Lobby');
  }

  /**
   * Get game metadata for platform integration
   */
  getMetadata(): GameMetadata {
    return {
      emoji: '♠️',
      botNamePrefix: 'PokerBot',
      defaultBuyIn: 5000 // $50 in pennies
    };
  }

  /**
   * Create an AI player for the poker table
   */
  public createAIPlayer(): Player {
    const botNames = ['CardShark', 'BluffMaster', 'ChipLeader', 'PokerFace', 'AllInAnnie', 'FoldEmFredy', 'RiverRat', 'TightTommy'];
    const randomName = botNames[Math.floor(Math.random() * botNames.length)];
    const uniqueId = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Give AI players enough bankroll for multiple buy-ins (100 big blinds worth)
    const aiBankroll = this.bigBlindAmount * 100;

    return {
      id: uniqueId,
      name: randomName,
      isAI: true,
      bankroll: aiBankroll,
      googleId: undefined
    };
  }

  protected initializeGameState(phase: PokerPhase): void {
    const seats: (Seat & PokerSeat)[] = Array(this.tableConfig.maxSeats).fill(null);

    this.gameState = {
      phase,
      seats,
      pot: 0,
      currentBet: 0,
      ante: 0,
      dealerSeatIndex: 0,
      handCount: 0,
      communityCards: [],
      deck: [],
      smallBlind: this.smallBlindAmount,
      bigBlind: this.bigBlindAmount
    };
  }

  /**
   * Override sitPlayer to enforce buy-in requirements for poker
   */
  public sitPlayer(player: Player, seatIndex?: number, buyInAmount?: number): { success: boolean; error?: string; seatIndex?: number } {
    if (!this.gameState) {
      return { success: false, error: 'Game not initialized' };
    }

    // Check with rules engine if player can join
    if (this.rulesEngine.hooks.canPlayerJoin) {
      const joinCheck = this.rulesEngine.hooks.canPlayerJoin(this.gameState, player);
      if (!joinCheck.allowed) {
        return {
          success: false,
          error: joinCheck.reason || 'Cannot join table at this time'
        };
      }
    }

    // Poker requires buy-in
    if (!buyInAmount || buyInAmount < this.minBuyIn || buyInAmount > this.maxBuyIn) {
      return {
        success: false,
        error: `Buy-in must be between $${this.minBuyIn / 100} and $${this.maxBuyIn / 100}`
      };
    }

    // Check player has sufficient bankroll
    if (!player.bankroll || player.bankroll < buyInAmount) {
      return { success: false, error: 'Insufficient bankroll' };
    }

    // Find empty seat
    let targetSeat = seatIndex;
    if (targetSeat === undefined) {
      targetSeat = this.gameState.seats.findIndex(s => s === null);
      if (targetSeat === -1) {
        return { success: false, error: 'No empty seats' };
      }
    }

    // Check if seat is empty
    if (this.gameState.seats[targetSeat] !== null) {
      return { success: false, error: 'Seat already taken' };
    }

    // Create seat with poker-specific fields
    const seat: Seat & PokerSeat = {
      playerId: player.id,
      name: player.name,
      isAI: player.isAI,
      tableStack: buyInAmount,
      hasFolded: false,
      currentBet: 0,
      hasActed: false,
      totalContribution: 0,
      holeCards: [],
      ...(player.cosmetics && { cosmetics: player.cosmetics }),
      ...(player.googleId && { googleId: player.googleId }),
    };

    // Assign random personality to AI players
    if (player.isAI) {
      const personalities: AIPersonality[] = ['GTO', 'Grinder', 'Donkey'];
      seat.personality = personalities[Math.floor(Math.random() * personalities.length)];
      console.log(`🤖 Assigned personality "${seat.personality}" to ${player.name}`);
    }

    this.gameState.seats[targetSeat] = seat;

    // Deduct buy-in from player's bankroll
    player.bankroll -= buyInAmount;
    player.tableStack = buyInAmount;

    console.log(`🎰 ${player.name} sat down at seat ${targetSeat} with $${buyInAmount / 100}`);

    // Auto-start hand if we have 2+ players and game is in Lobby phase
    const seatedPlayers = this.gameState.seats.filter(s => s !== null && s.tableStack > 0);
    if (this.gameState.phase === 'Lobby' && seatedPlayers.length >= 2) {
      console.log(`🎰 Auto-starting poker hand with ${seatedPlayers.length} players`);
      // Delay slightly to ensure broadcast of seating happens first
      setTimeout(() => this.startHand(), 100);
    }

    return { success: true, seatIndex: targetSeat };
  }

  startHand(): void {
    if (!this.gameState) return;

    const seatedPlayers = this.gameState.seats.filter(s => s !== null && s.tableStack > 0);
    if (seatedPlayers.length < 2) {
      console.log('🎰 Not enough players to start poker hand');
      return;
    }

    // Call rules engine round start hook
    if (this.rulesEngine.hooks.onRoundStart) {
      const result = this.rulesEngine.hooks.onRoundStart({
        playerCount: seatedPlayers.length,
        seatedPlayers,
        gameState: this.gameState
      });

      if (result) {
        // Apply custom data from rules engine
        if (result.customData) {
          Object.assign(this.gameState, result.customData);
        }

        // Lock table if requested
        if (result.lockTable) {
          this.gameState.roundLocked = true;
        }
      }
    }

    console.log('🎰 Starting poker hand...');

    // Reset hand state
    this.gameState.pot = 0;
    this.gameState.currentBet = this.bigBlindAmount;
    this.gameState.communityCards = [];
    this.gameState.deck = shuffleDeck(createDeck());
    this.gameState.handCount = (this.gameState.handCount || 0) + 1;

    // Move dealer button
    this.gameState.dealerSeatIndex = this.getNextActiveSeat(this.gameState.dealerSeatIndex);

    // Reset all seats
    this.gameState.seats.forEach((seat, idx) => {
      if (seat) {
        seat.hasFolded = false;
        seat.currentBet = 0;
        seat.hasActed = false;
        seat.totalContribution = 0;
        seat.holeCards = [];
        delete seat.lastAction;
        seat.isAllIn = false;
      }
    });

    // Post blinds
    const smallBlindSeat = this.getNextActiveSeat(this.gameState.dealerSeatIndex);
    const bigBlindSeat = this.getNextActiveSeat(smallBlindSeat);

    const sbSeat = this.gameState.seats[smallBlindSeat];
    const bbSeat = this.gameState.seats[bigBlindSeat];

    if (sbSeat) {
      const sbAmount = Math.min(sbSeat.tableStack, this.smallBlindAmount);
      sbSeat.currentBet = sbAmount;
      sbSeat.totalContribution = sbAmount;
      sbSeat.tableStack -= sbAmount;
      this.gameState.pot += sbAmount;
    }

    if (bbSeat) {
      const bbAmount = Math.min(bbSeat.tableStack, this.bigBlindAmount);
      bbSeat.currentBet = bbAmount;
      bbSeat.totalContribution = bbAmount;
      bbSeat.tableStack -= bbAmount;
      this.gameState.pot += bbAmount;
    }

    // Deal hole cards (use rules engine to determine count)
    const holeCardCount = this.rulesEngine.hooks.getHoleCardCount?.('PreFlop') || 2;
    let deck = this.gameState.deck;
    this.gameState.seats.forEach(seat => {
      if (seat && !seat.hasFolded && seat.tableStack > 0) {
        const { cards, remainingDeck } = dealCards(deck, holeCardCount);
        seat.holeCards = cards;
        deck = remainingDeck;
      }
    });
    this.gameState.deck = deck;

    // Set first to act (after big blind)
    const firstToActSeatIndex = this.getNextActiveSeat(bigBlindSeat);
    const firstToActSeat = this.gameState.seats[firstToActSeatIndex];
    this.gameState.currentTurnPlayerId = firstToActSeat?.playerId;

    console.log(`🎰 Blinds posted - SB: Seat ${smallBlindSeat}, BB: Seat ${bigBlindSeat}`);
    console.log(`🎰 First to act: Seat ${firstToActSeatIndex}, Player: ${firstToActSeat?.name}, ID: ${firstToActSeat?.playerId}`);
    console.log(`🎰 Current turn player ID: ${this.gameState.currentTurnPlayerId}`);

    this.gameState.phase = 'PreFlop';

    this.broadcastGameState();

    // Check if first player is AI
    this.processAITurns();
  }

  /**
   * Handle player action (fold, check, call, raise, etc.)
   */
  public handlePlayerAction(playerId: string, action: PokerAction, amount?: number): void {
    if (!this.gameState || this.gameState.currentTurnPlayerId !== playerId) {
      console.log('🎰 Not player\'s turn');
      return;
    }

    const seat = this.gameState.seats.find(s => s?.playerId === playerId);
    if (!seat || seat.hasFolded) {
      console.log('🎰 Player cannot act');
      return;
    }

    console.log(`🎰 ${seat.name} action: ${action}${amount ? ` $${amount/100}` : ''}`);

    switch (action) {
      case 'fold':
        seat.hasFolded = true;
        seat.lastAction = 'fold';
        break;

      case 'check':
        if (this.gameState.currentBet > seat.currentBet) {
          console.log('🎰 Cannot check, must call or fold');
          return;
        }
        seat.lastAction = 'check';
        break;

      case 'call': {
        const callAmount = Math.min(
          this.gameState.currentBet - seat.currentBet,
          seat.tableStack
        );
        seat.tableStack -= callAmount;
        seat.currentBet += callAmount;
        seat.totalContribution = (seat.totalContribution || 0) + callAmount;
        this.gameState.pot += callAmount;
        seat.lastAction = 'call';

        if (seat.tableStack === 0) {
          seat.isAllIn = true;
        }
        break;
      }

      case 'raise':
      case 'bet': {
        if (!amount || amount <= this.gameState.currentBet) {
          console.log('🎰 Invalid raise amount');
          return;
        }

        const raiseAmount = Math.min(amount - seat.currentBet, seat.tableStack);
        seat.tableStack -= raiseAmount;
        seat.currentBet += raiseAmount;
        seat.totalContribution = (seat.totalContribution || 0) + raiseAmount;
        this.gameState.pot += raiseAmount;
        this.gameState.currentBet = seat.currentBet;
        seat.lastAction = action;

        if (seat.tableStack === 0) {
          seat.isAllIn = true;
        }

        // Reset hasActed for other players
        this.gameState.seats.forEach(s => {
          if (s && s.playerId !== playerId && !s.hasFolded) {
            s.hasActed = false;
          }
        });
        break;
      }

      case 'all-in': {
        const allInAmount = seat.tableStack;
        seat.tableStack = 0;
        seat.currentBet += allInAmount;
        seat.totalContribution = (seat.totalContribution || 0) + allInAmount;
        this.gameState.pot += allInAmount;
        seat.isAllIn = true;
        seat.lastAction = 'all-in';

        if (seat.currentBet > this.gameState.currentBet) {
          this.gameState.currentBet = seat.currentBet;
        }
        break;
      }
    }

    seat.hasActed = true;

    // Check if betting round is complete
    if (this.isBettingRoundComplete()) {
      this.advancePhase();
      this.broadcastGameState();
      this.processAITurns(); // Check if next player is AI
    } else {
      // Move to next player
      const currentSeatIndex = this.gameState.seats.findIndex(s => s?.playerId === playerId);
      const nextSeatIndex = this.getNextActiveSeat(currentSeatIndex);
      this.gameState.currentTurnPlayerId = this.gameState.seats[nextSeatIndex]?.playerId;
      this.broadcastGameState();
      this.processAITurns(); // Check if next player is AI
    }
  }

  private isBettingRoundComplete(): boolean {
    if (!this.gameState) return false;

    const activePlayers = this.gameState.seats.filter(s =>
      s !== null && !s.hasFolded && s.tableStack > 0
    );

    if (activePlayers.length === 0) return true;

    // All active players must have acted and matched the current bet (or be all-in)
    return activePlayers.every(s =>
      s.hasActed && (s.currentBet === this.gameState!.currentBet || s.isAllIn)
    );
  }

  private advancePhase(): void {
    if (!this.gameState) return;

    // Reset for next round
    this.gameState.seats.forEach(s => {
      if (s) {
        s.currentBet = 0;
        s.hasActed = false;
        delete s.lastAction;
      }
    });
    this.gameState.currentBet = 0;

    // Get next phase from rules engine
    const nextPhase = this.rulesEngine.hooks.getNextPhase?.(this.gameState.phase);

    if (!nextPhase) {
      console.error(`No next phase defined for ${this.gameState.phase}`);
      return;
    }

    // Check if we should skip this phase
    if (this.rulesEngine.hooks.shouldSkipPhase?.(nextPhase)) {
      this.gameState.phase = nextPhase;
      this.advancePhase(); // Recursively advance to next non-skipped phase
      return;
    }

    // Deal community cards based on phase (use rules engine hook)
    const cardCount = this.rulesEngine.hooks.getCommunityCardCount?.(nextPhase) || 0;
    if (cardCount > 0) {
      const { cards, remainingDeck } = dealCards(this.gameState.deck, cardCount);

      if (nextPhase === 'Flop') {
        // Flop replaces community cards
        this.gameState.communityCards = cards;
      } else {
        // Turn/River add to existing community cards
        this.gameState.communityCards.push(...cards);
      }

      this.gameState.deck = remainingDeck;
    }

    this.gameState.phase = nextPhase;

    // Handle Showdown
    if (nextPhase === 'Showdown') {
      this.resolveShowdown();
      return;
    }

    // Set first to act
    const firstSeat = this.getNextActiveSeat(this.gameState.dealerSeatIndex);
    this.gameState.currentTurnPlayerId = this.gameState.seats[firstSeat]?.playerId;
  }

  private resolveShowdown(): void {
    if (!this.gameState) return;

    const activePlayers = this.gameState.seats.filter(s => s !== null && !s.hasFolded);

    let winnerSeat: Seat & PokerSeat;

    if (activePlayers.length === 1) {
      // Only one player left
      winnerSeat = activePlayers[0];
      winnerSeat.tableStack += this.gameState.pot;
      console.log(`🎰 ${winnerSeat.name} wins $${this.gameState.pot / 100}`);
    } else {
      // Evaluate hands (use rules engine hook)
      const evaluateFunc = this.rulesEngine.hooks.evaluateHand || evaluateHand;
      const evaluations = activePlayers.map(s => ({
        seat: s,
        hand: evaluateFunc(s.holeCards, this.gameState!.communityCards)
      }));

      // Sort using rules engine comparison (if provided)
      const compareFunc = this.rulesEngine.hooks.compareHands || ((h1, h2) => h1.value - h2.value);
      evaluations.sort((a, b) => compareFunc(b.hand, a.hand));

      const winner = evaluations[0];
      winnerSeat = winner.seat;
      winnerSeat.tableStack += this.gameState.pot;

      console.log(`🎰 ${winnerSeat.name} wins $${this.gameState.pot / 100} with ${handRankToString(winner.hand.rank)}`);
    }

    // Call rules engine pot win hook
    if (this.rulesEngine.hooks.onPotWin) {
      const potAmount = this.gameState.pot;
      const result = this.rulesEngine.hooks.onPotWin({
        winner: winnerSeat,
        potAmount,
        gameState: this.gameState
      });

      if (result) {
        // Check if round should end
        if (result.shouldEndRound) {
          console.log(`🎮 Round ending: ${result.customMessage || 'Rules engine triggered round end'}`);
          this.handleRoundEnd();
          return; // handleRoundEnd will handle next steps
        }
      }
    }

    this.gameState.phase = 'PreHand';
    this.gameState.pot = 0;
    delete this.gameState.currentTurnPlayerId;
    this.clearTurnTimer();

    // Broadcast the win
    this.broadcastGameState();

    // Auto-start next hand after delay if we still have 2+ players
    setTimeout(() => {
      const seatedPlayers = this.gameState!.seats.filter(s => s !== null && s.tableStack > 0);
      if (seatedPlayers.length >= 2) {
        console.log(`🎰 Auto-starting next hand with ${seatedPlayers.length} players`);
        this.startHand();
      } else {
        console.log(`🎰 Not enough players to continue (${seatedPlayers.length}), returning to Lobby`);
        this.gameState!.phase = 'Lobby';
        this.broadcastGameState();
      }
    }, 3000); // 3 second delay to show winner
  }

  /**
   * Handle round end via rules engine
   */
  private handleRoundEnd(): void {
    if (!this.gameState) return;

    const seatedPlayers = this.gameState.seats.filter(s => s !== null && s.tableStack > 0);

    // Call rules engine round end hook
    let delayMs = 3000; // Default delay
    let shouldReset = false;

    if (this.rulesEngine.hooks.onRoundEnd) {
      const result = this.rulesEngine.hooks.onRoundEnd({
        playerCount: seatedPlayers.length,
        seatedPlayers,
        gameState: this.gameState
      });

      if (result) {
        delayMs = result.delayNextRound || delayMs;
        shouldReset = result.shouldResetTable || false;

        if (result.customMessage) {
          console.log(`🎮 ${result.customMessage}`);
        }
      }
    }

    // Reset table state if requested
    if (shouldReset) {
      this.gameState.roundLocked = false;
      delete this.gameState.isSquidzRound;
      delete this.gameState.squidzDistributed;
      delete this.gameState.totalSquidz;
    }

    this.gameState.phase = 'PreHand';
    this.gameState.pot = 0;
    delete this.gameState.currentTurnPlayerId;
    this.clearTurnTimer();

    // Broadcast final state
    this.broadcastGameState();

    // Auto-start next round after delay
    setTimeout(() => {
      const players = this.gameState!.seats.filter(s => s !== null && s.tableStack > 0);
      if (players.length >= 2) {
        console.log(`🎰 Starting next round with ${players.length} players`);
        this.startHand();
      } else {
        console.log(`🎰 Not enough players to continue (${players.length}), returning to Lobby`);
        this.gameState!.phase = 'Lobby';
        this.broadcastGameState();
      }
    }, delayMs);
  }

  private getNextActiveSeat(fromSeatIndex: number): number {
    if (!this.gameState) return 0;

    let seatIndex = (fromSeatIndex + 1) % this.tableConfig.maxSeats;
    let attempts = 0;

    while (attempts < this.tableConfig.maxSeats) {
      const seat = this.gameState.seats[seatIndex];
      if (seat && !seat.hasFolded && seat.tableStack > 0) {
        return seatIndex;
      }
      seatIndex = (seatIndex + 1) % this.tableConfig.maxSeats;
      attempts++;
    }

    return fromSeatIndex;
  }

  /**
   * Evaluate winners at showdown
   */
  evaluateWinners(): WinnerResult[] {
    if (!this.gameState) return [];

    const activePlayers = this.gameState.seats.filter(s => s !== null && !s.hasFolded);

    if (activePlayers.length === 0) return [];
    if (activePlayers.length === 1) {
      return [{
        playerId: activePlayers[0].playerId,
        name: activePlayers[0].name,
        payout: this.gameState.pot,
        description: 'Won by fold'
      }];
    }

    // Evaluate hands (use rules engine hook)
    const evaluateFunc = this.rulesEngine.hooks.evaluateHand || evaluateHand;
    const evaluations = activePlayers.map(s => ({
      seat: s,
      hand: evaluateFunc(s.holeCards, this.gameState!.communityCards)
    }));

    // Sort using rules engine comparison (if provided)
    const compareFunc = this.rulesEngine.hooks.compareHands || ((h1, h2) => h1.value - h2.value);
    evaluations.sort((a, b) => compareFunc(b.hand, a.hand));

    // Find all winners (handle ties)
    const bestValue = evaluations[0].hand.value;
    const winners = evaluations.filter(e => e.hand.value === bestValue);
    const payoutPerWinner = Math.floor(this.gameState.pot / winners.length);

    return winners.map(w => ({
      playerId: w.seat.playerId,
      name: w.seat.name,
      payout: payoutPerWinner,
      description: handRankToString(w.hand.rank)
    }));
  }

  /**
   * Get valid actions for a player (use rules engine hook)
   */
  getValidActions(playerId: string): string[] {
    if (!this.gameState || this.gameState.currentTurnPlayerId !== playerId) {
      return [];
    }

    const seat = this.gameState.seats.find(s => s?.playerId === playerId);
    if (!seat || seat.hasFolded || seat.tableStack === 0) {
      return [];
    }

    // Use rules engine hook if available
    if (this.rulesEngine.hooks.getValidActions) {
      return this.rulesEngine.hooks.getValidActions(seat, this.gameState.phase, this.gameState.currentBet);
    }

    // Fallback to default logic
    const actions: string[] = ['fold'];

    if (this.gameState.currentBet === seat.currentBet) {
      actions.push('check');
    } else {
      actions.push('call');
    }

    if (seat.tableStack > 0) {
      actions.push('bet', 'raise', 'all-in');
    }

    return actions;
  }

  /**
   * Start turn timer for human players
   */
  private startTurnTimer(): void {
    this.clearTurnTimer();

    if (!this.gameState) return;

    const currentSeat = this.gameState.seats.find(s => s?.playerId === this.gameState!.currentTurnPlayerId);

    // Only start timer for human players
    if (!currentSeat || currentSeat.isAI) return;

    this.gameState.turnEndsAtMs = Date.now() + this.turnTimeoutMs;
    this.broadcastGameState();

    this.turnTimer = setTimeout(() => {
      if (!this.gameState) return;

      console.log(`⏰ Turn timeout for ${currentSeat.name}`);

      // Auto check or fold
      if (this.gameState.currentBet === currentSeat.currentBet) {
        this.handlePlayerAction(currentSeat.playerId, 'check');
      } else {
        this.handlePlayerAction(currentSeat.playerId, 'fold');
      }
    }, this.turnTimeoutMs);
  }

  /**
   * Clear turn timer
   */
  private clearTurnTimer(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    if (this.gameState) {
      delete this.gameState.turnEndsAtMs;
    }
  }

  /**
   * Process AI turns automatically
   */
  private processAITurns(): void {
    if (!this.gameState) return;

    const currentSeat = this.gameState.seats.find(s => s?.playerId === this.gameState!.currentTurnPlayerId);

    if (!currentSeat || !currentSeat.isAI || currentSeat.hasFolded) {
      // Start timer for human players
      this.startTurnTimer();
      return;
    }

    console.log(`🤖 AI turn: ${currentSeat.name} thinking...`);

    // Simple AI decision with slight delay for realism
    setTimeout(() => {
      if (!this.gameState) return;

      // Re-check that it's still this AI's turn
      if (this.gameState.currentTurnPlayerId !== currentSeat.playerId) return;

      this.makeAIDecision(currentSeat);
    }, 800); // 800ms thinking time
  }

  /**
   * Personality-based AI decision making
   */
  private makeAIDecision(seat: Seat & PokerSeat): void {
    if (!this.gameState) return;

    const personality = seat.personality || 'GTO';
    const profile = AI_PERSONALITIES[personality];
    const callAmount = this.gameState.currentBet - seat.currentBet;
    const potSize = this.gameState.pot;

    // Evaluate hand strength (0-1 scale)
    const handStrength = this.evaluateHandStrength(seat.holeCards, this.gameState.phase);

    console.log(`🤖 ${seat.name} (${personality}): strength=${handStrength.toFixed(2)}, call=$${callAmount/100}`);

    // Check if we should even play this hand (based on tightness)
    // Tight players fold more weak hands
    if (handStrength < (1 - profile.tightness)) {
      // Hand too weak for this personality's tightness
      if (callAmount === 0) {
        console.log(`🤖 ${seat.name} checks (weak hand)`);
        this.handlePlayerAction(seat.playerId, 'check');
      } else {
        console.log(`🤖 ${seat.name} folds (hand too weak for ${personality})`);
        this.handlePlayerAction(seat.playerId, 'fold');
      }
      return;
    }

    // Check if call amount exceeds fold threshold
    const callPercentOfStack = callAmount / seat.tableStack;
    if (callAmount > 0 && callPercentOfStack > profile.foldThreshold && handStrength < 0.7) {
      console.log(`🤖 ${seat.name} folds (bet too large: ${(callPercentOfStack * 100).toFixed(0)}% of stack)`);
      this.handlePlayerAction(seat.playerId, 'fold');
      return;
    }

    // Decide action based on personality and hand strength
    if (callAmount === 0) {
      // Can check or bet
      const shouldBet = handStrength > 0.6 && Math.random() < profile.aggression;
      if (shouldBet) {
        const betSize = Math.floor(potSize * (0.5 + Math.random() * 0.5)); // 50-100% pot
        const betAmount = Math.min(betSize, seat.tableStack);
        console.log(`🤖 ${seat.name} bets $${betAmount / 100}`);
        this.handlePlayerAction(seat.playerId, 'bet', betAmount);
      } else {
        console.log(`🤖 ${seat.name} checks`);
        this.handlePlayerAction(seat.playerId, 'check');
      }
    } else {
      // Must call or raise
      const shouldRaise = handStrength > 0.75 && Math.random() < profile.aggression;
      const shouldBluff = handStrength < 0.5 && Math.random() < profile.bluffFrequency;

      if (shouldRaise || shouldBluff) {
        const raiseSize = this.gameState.currentBet + Math.floor(potSize * (0.5 + Math.random() * 0.5));
        const raiseAmount = Math.min(raiseSize, seat.tableStack);

        if (raiseAmount > this.gameState.currentBet) {
          const action = shouldBluff ? 'raise (bluff)' : 'raise';
          console.log(`🤖 ${seat.name} ${action} to $${raiseAmount / 100}`);
          this.handlePlayerAction(seat.playerId, 'raise', raiseAmount);
        } else {
          console.log(`🤖 ${seat.name} calls $${callAmount / 100}`);
          this.handlePlayerAction(seat.playerId, 'call');
        }
      } else {
        // Just call
        console.log(`🤖 ${seat.name} calls $${callAmount / 100}`);
        this.handlePlayerAction(seat.playerId, 'call');
      }
    }
  }

  /**
   * Evaluate hand strength on 0-1 scale
   * Simple preflop evaluation based on card ranks
   */
  private evaluateHandStrength(holeCards: Card[], phase: PokerPhase): number {
    if (holeCards.length !== 2) return 0.5;

    const rankValues: Record<string, number> = {
      '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
      '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
    };

    const card1Value = rankValues[holeCards[0].rank];
    const card2Value = rankValues[holeCards[1].rank];
    const isPair = card1Value === card2Value;
    const isSuited = holeCards[0].suit === holeCards[1].suit;
    const highCard = Math.max(card1Value, card2Value);
    const lowCard = Math.min(card1Value, card2Value);
    const gap = highCard - lowCard;

    // Premium pairs (AA, KK, QQ, JJ)
    if (isPair && highCard >= 11) return 0.95;

    // High pairs (TT-88)
    if (isPair && highCard >= 8) return 0.85;

    // Medium pairs (77-22)
    if (isPair) return 0.70;

    // High cards with ace (AK, AQ, AJ)
    if (highCard === 14 && lowCard >= 11) {
      return isSuited ? 0.90 : 0.80;
    }

    // High broadway cards (KQ, KJ, QJ)
    if (highCard >= 12 && lowCard >= 11) {
      return isSuited ? 0.75 : 0.65;
    }

    // Suited connectors (good drawing hands)
    if (isSuited && gap <= 2) return 0.60;

    // High card + medium card
    if (highCard >= 11 && lowCard >= 9) return 0.55;

    // Medium suited cards
    if (isSuited && highCard >= 9) return 0.50;

    // Trash hands
    return 0.30 + (highCard / 30); // 0.30-0.77 based on high card
  }
}
