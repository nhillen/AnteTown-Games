import { GameBase, GameState, Seat, Player, WinnerResult, GameMetadata } from '@antetown/game-sdk';
import { Card, PokerPhase, PokerAction, PokerSeat, AIPersonality, AIPersonalityProfile, ActiveSideGame, SideGameParticipant, SidePotCommitment } from './types.js';
import { createDeck, shuffleDeck, dealCards } from './deck.js';
import { evaluateHand, handRankToString } from './hand-evaluator.js';
import { loadRulesEngine, PokerRulesEngine, GameVariant } from './rules/index.js';
import { SideGameRegistry, SideGameDefinition } from './side-games/index.js';

interface HouseRulesGameState extends GameState {
  phase: PokerPhase;
  seats: (Seat & PokerSeat)[];
  communityCards: Card[];
  deck: Card[];
  dealerSeatIndex: number;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;                // Minimum buy-in amount
  maxBuyIn: number;                // Maximum buy-in amount
  pot: number;                     // Current pot size
  currentBet: number;              // Current bet to match
  ante: number;                    // Ante amount (if applicable)
  handCount: number;               // Number of hands played
  currentTurnPlayerId?: string;    // Player whose turn it is
  propBets?: any[];                // Active prop bets
  turnEndsAtMs?: number;

  // Squidz Game specific fields
  totalSquidz?: number;            // Total squidz in play for the round
  squidzDistributed?: number;      // Number of squidz distributed so far
  isSquidzRound?: boolean;         // Whether this is a Squidz Game round
  roundLocked?: boolean;           // Prevent new players joining mid-round

  // Side games
  activeSideGames?: ActiveSideGame[];  // Player-proposed side games
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
  private ruleModifiers: any; // Store rule modifiers from table config
  private smallBlindAmount = 50;  // Default small blind in currency units
  private bigBlindAmount = 100;   // Default big blind in currency units
  private minBuyIn = 2000;  // Default minimum buy-in in currency units
  private maxBuyIn = 10000; // Default maximum buy-in in currency units
  private turnTimer: NodeJS.Timeout | null = null;
  private turnTimeoutMs = 30000; // 30 seconds per turn

  constructor(tableConfig: any) {
    super(tableConfig);
    this.variant = tableConfig.variant || 'holdem'; // Default to Hold'em for backward compatibility
    this.rulesEngine = loadRulesEngine(this.variant);
    this.ruleModifiers = tableConfig.rules || {}; // Store rule modifiers
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
      defaultBuyIn: 5000 // Default buy-in in currency units
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
      bigBlind: this.bigBlindAmount,
      minBuyIn: this.minBuyIn,
      maxBuyIn: this.maxBuyIn,
      propBets: [],  // Active prop bets
      activeSideGames: []  // Active side games
    };
  }

  /**
   * Override sitPlayer to enforce buy-in requirements for poker
   */
  public sitPlayer(player: Player, seatIndex?: number, buyInAmount?: number, sidePotBuyIn?: number): { success: boolean; error?: string; seatIndex?: number } {
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
        error: `Buy-in must be between ${this.minBuyIn} and ${this.maxBuyIn} ${this.currency}`
      };
    }

    // For Squidz Game, side pot is required
    if (this.variant === 'squidz-game' && !sidePotBuyIn) {
      const suggestedSidePot = this.bigBlindAmount * 20;
      return {
        success: false,
        error: `Side pot required for Squidz Game (suggested: ${suggestedSidePot} ${this.currency})`
      };
    }

    // Calculate total cost
    const totalCost = buyInAmount + (sidePotBuyIn || 0);

    // Check player has sufficient bankroll
    if (!player.bankroll || player.bankroll < totalCost) {
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

    // Add side pot if provided
    if (sidePotBuyIn && sidePotBuyIn > 0) {
      seat.sidePot = {
        balance: sidePotBuyIn,
        committed: 0,
        commitments: []
      };
    }

    // Assign random personality to AI players
    if (player.isAI) {
      const personalities: AIPersonality[] = ['GTO', 'Grinder', 'Donkey'];
      seat.personality = personalities[Math.floor(Math.random() * personalities.length)];
      console.log(`🤖 Assigned personality "${seat.personality}" to ${player.name}`);
    }

    this.gameState.seats[targetSeat] = seat;

    // Deduct total cost from player's bankroll
    player.bankroll -= totalCost;
    player.tableStack = buyInAmount;

    console.log(`🎰 ${player.name} sat down at seat ${targetSeat} with ${buyInAmount} ${this.currency}`);

    // Auto-start hand if we have 2+ players and game is in Lobby phase
    const seatedPlayers = this.gameState.seats.filter(s => s !== null && s.tableStack > 0);
    if (this.gameState.phase === 'Lobby' && seatedPlayers.length >= 2) {
      console.log(`🎰 Auto-starting poker hand with ${seatedPlayers.length} players`);
      // Delay slightly to ensure broadcast of seating happens first
      setTimeout(() => this.startHand(), 100);
    }

    return { success: true, seatIndex: targetSeat };
  }

  /**
   * Add funds to a player's side pot
   */
  public addToSidePot(playerId: string, amount: number): { success: boolean; error?: string } {
    if (!this.gameState) {
      return { success: false, error: 'Game not initialized' };
    }

    const player = this.getPlayer(playerId);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    const seat = this.findSeat(playerId);
    if (!seat) {
      return { success: false, error: 'Player not seated' };
    }

    // Check player has sufficient bankroll
    if (!player.bankroll || player.bankroll < amount) {
      return { success: false, error: 'Insufficient bankroll' };
    }

    // Deduct from bankroll
    player.bankroll -= amount;

    // Add to side pot (or create if doesn't exist)
    if (!seat.sidePot) {
      seat.sidePot = {
        balance: amount,
        committed: 0,
        commitments: []
      };
    } else {
      seat.sidePot.balance += amount;
    }

    console.log(`💰 ${player.name} added ${amount} ${this.currency} to side pot (new balance: ${seat.sidePot.balance})`);

    this.broadcastGameState();
    return { success: true };
  }

  /**
   * Commit side pot funds for Squidz Game before hand starts
   */
  private commitSquidzFunds(): void {
    if (!this.gameState) return;

    // Import calculateMaxSquidzLiability from squidz-game module
    const { calculateMaxSquidzLiability, DEFAULT_SQUIDZ_CONFIG } = require('./rules/squidz-game.js');

    const seatedPlayers = this.gameState.seats.filter((s: any) => s !== null && s.tableStack > 0);
    const playerCount = seatedPlayers.length;

    // Get squidz config from table rules or use defaults
    const squidzConfig = this.ruleModifiers.squidzConfig
      ? { ...DEFAULT_SQUIDZ_CONFIG, ...this.ruleModifiers.squidzConfig }
      : DEFAULT_SQUIDZ_CONFIG;

    for (const seat of seatedPlayers) {
      if (!seat.sidePot) {
        // No side pot - kick from squidz game
        seat.squidzEligible = false;
        console.log(`🦑 ${seat.name} has no side pot - excluded from Squidz Game`);
        continue;
      }

      // Calculate max liability for this player
      const currentSquidCount = seat.squidCount || 0;
      const maxLiability = calculateMaxSquidzLiability(
        seat.playerId,
        playerCount,
        currentSquidCount,
        squidzConfig,
        this.bigBlindAmount
      );

      const available = seat.sidePot.balance - seat.sidePot.committed;

      if (available < maxLiability) {
        // Can't cover worst case - try to top up from bankroll
        const shortfall = maxLiability - available;
        const player = this.getPlayer(seat.playerId);

        if (player && player.bankroll >= shortfall) {
          // Auto top-up from bankroll
          player.bankroll -= shortfall;
          seat.sidePot.balance += shortfall;
          console.log(`💰 Auto-topped up ${seat.name}'s side pot by ${shortfall} ${this.currency}`);
        } else {
          // Can't cover - kick from squidz game
          seat.squidzEligible = false;
          console.log(`🦑 ${seat.name} has insufficient side pot funds - excluded from Squidz Game`);
          continue;
        }
      }

      // Commit the funds
      seat.sidePot.committed += maxLiability;

      if (!seat.sidePot.commitments) {
        seat.sidePot.commitments = [];
      }

      seat.sidePot.commitments.push({
        amount: maxLiability,
        reason: `Squidz Game - Round max liability`,
        type: 'squidz-game',
        metadata: {
          playerCount,
          currentSquidCount
        }
      });

      // Mark player as eligible for squidz
      seat.squidzEligible = true;

      console.log(`🦑 ${seat.name} committed ${maxLiability} ${this.currency} to side pot (available: ${available - maxLiability})`);
    }

    this.broadcastGameState();
  }

  /**
   * Update Squidz commitments based on current squid counts
   * When a player gets squids, their liability drops to 0, so release funds
   */
  private updateSquidzCommitments(): void {
    if (!this.gameState || this.variant !== 'squidz-game') return;

    // Import calculateMaxSquidzLiability from squidz-game module
    const { calculateMaxSquidzLiability, DEFAULT_SQUIDZ_CONFIG } = require('./rules/squidz-game.js');

    const seatedPlayers = this.gameState.seats.filter((s: any) => s !== null && s.tableStack > 0);
    const playerCount = seatedPlayers.length;

    // Get squidz config from table rules or use defaults
    const squidzConfig = this.ruleModifiers.squidzConfig
      ? { ...DEFAULT_SQUIDZ_CONFIG, ...this.ruleModifiers.squidzConfig }
      : DEFAULT_SQUIDZ_CONFIG;

    for (const seat of seatedPlayers) {
      if (!seat.sidePot || !seat.squidzEligible) continue;

      // Recalculate liability with current squid counts
      const currentSquidCount = seat.squidCount || 0;
      const newLiability = calculateMaxSquidzLiability(
        seat.playerId,
        playerCount,
        currentSquidCount,
        squidzConfig,
        this.bigBlindAmount
      );

      // Find existing squidz commitment
      const commitmentIndex = seat.sidePot.commitments?.findIndex(
        (c: any) => c.type === 'squidz-game'
      );

      if (commitmentIndex !== undefined && commitmentIndex >= 0 && seat.sidePot.commitments) {
        const oldCommitment = seat.sidePot.commitments[commitmentIndex];
        const difference = oldCommitment.amount - newLiability;

        if (difference > 0) {
          // Liability decreased (player got squids!) - release some funds
          seat.sidePot.committed -= difference;
          seat.sidePot.commitments[commitmentIndex].amount = newLiability;

          console.log(`🦑 ${seat.name} liability reduced by ${difference} ${this.currency} (got squids!)`);

          // If liability is now 0 (player has squids), they can make prop bets
          if (newLiability === 0) {
            const available = seat.sidePot.balance - seat.sidePot.committed;
            console.log(`🦑 ${seat.name} has squids! Side pot funds available: ${available} ${this.currency}`);
          }
        }
      }
    }

    this.broadcastGameState();
  }

  /**
   * Process side pot payments from rules engine results
   */
  private processSidePotPayments(payments: any[]): void {
    if (!this.gameState) return;

    console.log(`💰 Processing ${payments.length} side pot payments...`);

    for (const payment of payments) {
      const fromSeat = this.findSeat(payment.fromPlayerId);
      const toSeat = this.findSeat(payment.toPlayerId);

      if (!fromSeat?.sidePot || !toSeat?.sidePot) {
        console.log(`⚠️ Cannot process payment: ${payment.fromPlayerId} → ${payment.toPlayerId} (missing side pot)`);
        continue;
      }

      // Transfer from committed funds
      const transferAmount = Math.min(payment.amount, fromSeat.sidePot.committed, fromSeat.sidePot.balance);

      if (transferAmount > 0) {
        fromSeat.sidePot.balance -= transferAmount;
        fromSeat.sidePot.committed -= transferAmount;

        toSeat.sidePot.balance += transferAmount;

        console.log(`💰 ${fromSeat.name} pays ${transferAmount} ${this.currency} from side pot to ${toSeat.name} (${payment.reason})`);
      } else {
        console.log(`⚠️ ${fromSeat.name} has insufficient side pot funds to pay ${payment.amount} to ${toSeat.name}`);
      }
    }

    // Release all squidz commitments for the round
    const seatedPlayers = this.gameState.seats.filter((s: any) => s !== null && s.tableStack > 0);
    for (const seat of seatedPlayers) {
      if (!seat.sidePot?.commitments) continue;

      const initialCommitted = seat.sidePot.committed;

      seat.sidePot.commitments = seat.sidePot.commitments.filter((c: any) => {
        if (c.type === 'squidz-game') {
          // Release this commitment
          seat.sidePot!.committed -= c.amount;
          return false;  // Remove from array
        }
        return true;  // Keep other commitments
      });

      if (initialCommitted !== seat.sidePot.committed) {
        console.log(`🦑 Released ${initialCommitted - seat.sidePot.committed} ${this.currency} from ${seat.name}'s commitments`);
      }
    }

    this.broadcastGameState();
  }

  /**
   * Create a new prop bet
   */
  public createPropBet(playerId: string, description: string, amount: number, position: 'for' | 'against'): { success: boolean; error?: string; propBetId?: string } {
    if (!this.gameState) {
      return { success: false, error: 'Game not initialized' };
    }

    const seat = this.findSeat(playerId);
    if (!seat?.sidePot) {
      return { success: false, error: 'No side pot account' };
    }

    const available = seat.sidePot.balance - seat.sidePot.committed;
    if (available < amount) {
      return { success: false, error: `Insufficient available funds. Have ${available}, need ${amount}` };
    }

    // Generate prop bet ID
    const propBetId = `propbet-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Commit funds
    seat.sidePot.committed += amount;

    const propBet: any = {
      id: propBetId,
      description,
      amount,
      initiator: {
        playerId,
        position,
        committed: amount
      },
      status: 'open'
    };

    if (!seat.sidePot.commitments) {
      seat.sidePot.commitments = [];
    }

    seat.sidePot.commitments.push({
      amount,
      reason: `Prop bet: ${description}`,
      type: 'prop-bet',
      metadata: { propBetId }
    });

    if (!this.gameState.propBets) {
      this.gameState.propBets = [];
    }

    this.gameState.propBets.push(propBet);

    console.log(`🎲 ${seat.name} created prop bet: ${description} (${amount} ${this.currency})`);

    this.broadcastGameState();
    return { success: true, propBetId };
  }

  /**
   * Accept an open prop bet
   */
  public acceptPropBet(playerId: string, propBetId: string): { success: boolean; error?: string } {
    if (!this.gameState) {
      return { success: false, error: 'Game not initialized' };
    }

    const propBet = this.gameState.propBets?.find((pb: any) => pb.id === propBetId);
    if (!propBet) {
      return { success: false, error: 'Prop bet not found' };
    }

    if (propBet.status !== 'open') {
      return { success: false, error: 'Prop bet is not open' };
    }

    if (propBet.initiator.playerId === playerId) {
      return { success: false, error: 'Cannot accept your own prop bet' };
    }

    const seat = this.findSeat(playerId);
    if (!seat?.sidePot) {
      return { success: false, error: 'No side pot account' };
    }

    const available = seat.sidePot.balance - seat.sidePot.committed;
    if (available < propBet.amount) {
      return { success: false, error: `Insufficient available funds. Have ${available}, need ${propBet.amount}` };
    }

    // Commit funds
    seat.sidePot.committed += propBet.amount;

    // Opposite position of initiator
    const position = propBet.initiator.position === 'for' ? 'against' : 'for';

    propBet.acceptor = {
      playerId,
      position,
      committed: propBet.amount
    };

    propBet.status = 'matched';

    if (!seat.sidePot.commitments) {
      seat.sidePot.commitments = [];
    }

    seat.sidePot.commitments.push({
      amount: propBet.amount,
      reason: `Prop bet: ${propBet.description}`,
      type: 'prop-bet',
      metadata: { propBetId }
    });

    console.log(`🎲 ${seat.name} accepted prop bet: ${propBet.description}`);

    this.broadcastGameState();
    return { success: true };
  }

  /**
   * Resolve a prop bet
   */
  public resolvePropBet(propBetId: string, winner: 'for' | 'against'): { success: boolean; error?: string } {
    if (!this.gameState) {
      return { success: false, error: 'Game not initialized' };
    }

    const propBet = this.gameState.propBets?.find((pb: any) => pb.id === propBetId);
    if (!propBet) {
      return { success: false, error: 'Prop bet not found' };
    }

    if (propBet.status !== 'matched') {
      return { success: false, error: 'Prop bet is not matched' };
    }

    // Determine winner and loser
    const winnerParticipant = propBet.initiator.position === winner ? propBet.initiator : propBet.acceptor;
    const loserParticipant = propBet.initiator.position !== winner ? propBet.initiator : propBet.acceptor;

    if (!winnerParticipant || !loserParticipant) {
      return { success: false, error: 'Invalid prop bet participants' };
    }

    const winnerSeat = this.findSeat(winnerParticipant.playerId);
    const loserSeat = this.findSeat(loserParticipant.playerId);

    if (!winnerSeat?.sidePot || !loserSeat?.sidePot) {
      return { success: false, error: 'Missing side pot accounts' };
    }

    // Transfer funds
    const totalPayout = propBet.amount * 2;

    // Release both commitments
    this.releasePropBetCommitment(winnerSeat, propBetId);
    this.releasePropBetCommitment(loserSeat, propBetId);

    // Loser pays, winner receives
    loserSeat.sidePot.balance -= propBet.amount;
    winnerSeat.sidePot.balance += totalPayout;

    propBet.status = 'resolved';
    propBet.resolution = {
      winner,
      payout: [{ playerId: winnerParticipant.playerId, amount: totalPayout }]
    };

    console.log(`🎲 Prop bet resolved: ${propBet.description} - ${winnerSeat.name} wins ${totalPayout} ${this.currency}`);

    this.broadcastGameState();
    return { success: true };
  }

  /**
   * Release commitment for a specific prop bet
   */
  private releasePropBetCommitment(seat: any, propBetId: string): void {
    if (!seat.sidePot?.commitments) return;

    const commitmentIndex = seat.sidePot.commitments.findIndex(
      (c: any) => c.type === 'prop-bet' && c.metadata?.propBetId === propBetId
    );

    if (commitmentIndex >= 0) {
      const commitment = seat.sidePot.commitments[commitmentIndex];
      seat.sidePot.committed -= commitment.amount;
      seat.sidePot.commitments.splice(commitmentIndex, 1);
    }
  }

  // ============================================================
  // SIDE GAME PROPOSAL & MANAGEMENT
  // ============================================================

  /**
   * Propose a new side game mid-session
   */
  public proposeSideGame(playerId: string, sideGameType: string, config?: any): { success: boolean; error?: string; sideGameId?: string } {
    if (!this.gameState) {
      return { success: false, error: 'Game not initialized' };
    }

    // Get side game definition
    const definition = SideGameRegistry.get(sideGameType);
    if (!definition) {
      return { success: false, error: 'Unknown side game type' };
    }

    if (!definition.isOptional) {
      return { success: false, error: 'This side game cannot be proposed mid-game (table-level only)' };
    }

    // Validate config
    const finalConfig = { ...definition.defaultConfig, ...config };
    if (definition.validateConfig) {
      const validation = definition.validateConfig(finalConfig);
      if (!validation.valid) {
        return { success: false, error: validation.error || 'Invalid configuration' };
      }
    }

    const proposer = this.findSeat(playerId);
    if (!proposer) {
      return { success: false, error: 'Player not seated' };
    }

    // Generate side game ID
    const sideGameId = `sidegame-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const sideGame: ActiveSideGame = {
      id: sideGameId,
      type: sideGameType,
      displayName: definition.displayName,
      description: definition.description,
      config: finalConfig,
      participants: [{
        playerId,
        opted: 'in',
        buyInAmount: definition.requiresUpfrontBuyIn ? finalConfig.buyIn : undefined
      }],
      proposedBy: playerId,
      proposedAt: Date.now(),
      status: 'proposed',
      isOptional: definition.isOptional,
      requiresUpfrontBuyIn: definition.requiresUpfrontBuyIn,
      contributionPerHand: !definition.requiresUpfrontBuyIn ? finalConfig.contributionPerHand : undefined,
      potBalance: 0,
      handsPlayed: 0,
      totalPayouts: 0
    };

    // Special handling for Flipz prop bet - commit proposer's funds
    if (sideGameType === 'flipz-prop-bet') {
      const maxRisk = finalConfig.amountPerCard * 6;

      if (!proposer.sidePot) {
        return { success: false, error: 'No side pot account' };
      }

      const available = proposer.sidePot.balance - proposer.sidePot.committed;
      if (available < maxRisk) {
        return { success: false, error: `Insufficient side pot funds. Need ${maxRisk}, have ${available}` };
      }

      // Commit proposer's funds
      proposer.sidePot.committed += maxRisk;
      proposer.sidePot.commitments.push({
        amount: maxRisk,
        reason: `Flipz prop bet (proposer)`,
        type: 'side-game',
        metadata: { sideGameId }
      });

      sideGame.participants[0].buyInAmount = maxRisk;
      console.log(`🎴 ${proposer.name} proposed Flipz for ${finalConfig.proposerColor} (max risk: ${maxRisk})`);
    }

    if (!this.gameState.activeSideGames) {
      this.gameState.activeSideGames = [];
    }

    this.gameState.activeSideGames.push(sideGame);

    console.log(`🎲 ${proposer.name} proposed side game: ${definition.displayName}`);

    this.broadcastGameState();
    return { success: true, sideGameId };
  }

  /**
   * Respond to a side game proposal (opt in or out)
   */
  public respondToSideGame(playerId: string, sideGameId: string, response: 'in' | 'out', config?: any): { success: boolean; error?: string } {
    if (!this.gameState) {
      return { success: false, error: 'Game not initialized' };
    }

    const sideGame = this.gameState.activeSideGames?.find(sg => sg.id === sideGameId);
    if (!sideGame) {
      return { success: false, error: 'Side game not found' };
    }

    if (sideGame.status !== 'proposed') {
      return { success: false, error: 'Side game is not open for responses' };
    }

    const seat = this.findSeat(playerId);
    if (!seat) {
      return { success: false, error: 'Player not seated' };
    }

    // Check if already responded
    const existingResponse = sideGame.participants.find(p => p.playerId === playerId);
    if (existingResponse) {
      return { success: false, error: 'Already responded to this side game' };
    }

    if (response === 'in') {
      // Special handling for Flipz prop bet
      if (sideGame.type === 'flipz-prop-bet') {
        // Set acceptor in config
        sideGame.config.acceptorPlayerId = playerId;
        sideGame.config.acceptorColor = sideGame.config.proposerColor === 'red' ? 'black' : 'red';

        // Calculate max risk (6x amountPerCard)
        const maxRisk = sideGame.config.amountPerCard * 6;

        if (!seat.sidePot) {
          return { success: false, error: 'No side pot account' };
        }

        const available = seat.sidePot.balance - seat.sidePot.committed;
        if (available < maxRisk) {
          return { success: false, error: `Insufficient side pot funds. Need ${maxRisk}, have ${available}` };
        }

        // Commit funds (will be resolved on flop)
        seat.sidePot.committed += maxRisk;
        seat.sidePot.commitments.push({
          amount: maxRisk,
          reason: `Flipz prop bet`,
          type: 'side-game',
          metadata: { sideGameId: sideGame.id }
        });

        sideGame.participants.push({
          playerId,
          opted: 'in',
          buyInAmount: maxRisk
        });

        console.log(`🎴 ${seat.name} accepted Flipz prop bet for ${sideGame.config.acceptorColor} (max risk: ${maxRisk})`);
      } else if (sideGame.requiresUpfrontBuyIn) {
        // Standard upfront buy-in handling
        if (!seat.sidePot) {
          return { success: false, error: 'No side pot account' };
        }

        const buyIn = config?.buyIn || sideGame.config.buyIn;
        const available = seat.sidePot.balance - seat.sidePot.committed;

        if (available < buyIn) {
          return { success: false, error: `Insufficient side pot funds. Need ${buyIn}, have ${available}` };
        }

        // Deduct from side pot
        seat.sidePot.balance -= buyIn;
        sideGame.potBalance = (sideGame.potBalance || 0) + buyIn;

        sideGame.participants.push({
          playerId,
          opted: 'in',
          buyInAmount: buyIn
        });

        console.log(`🎲 ${seat.name} opted into ${sideGame.displayName} (buy-in: ${buyIn})`);
      } else {
        // Per-hand contribution - just mark as opted in
        sideGame.participants.push({
          playerId,
          opted: 'in'
        });

        console.log(`🎲 ${seat.name} opted into ${sideGame.displayName}`);
      }
    } else {
      // Opting out
      sideGame.participants.push({
        playerId,
        opted: 'out'
      });

      console.log(`🎲 ${seat.name} declined ${sideGame.displayName}`);
    }

    this.broadcastGameState();
    return { success: true };
  }

  /**
   * Activate a side game (start playing it)
   */
  public activateSideGame(sideGameId: string): { success: boolean; error?: string } {
    if (!this.gameState) {
      return { success: false, error: 'Game not initialized' };
    }

    const sideGame = this.gameState.activeSideGames?.find(sg => sg.id === sideGameId);
    if (!sideGame) {
      return { success: false, error: 'Side game not found' };
    }

    if (sideGame.status !== 'proposed') {
      return { success: false, error: 'Side game is not in proposed state' };
    }

    // Check minimum participants
    const definition = SideGameRegistry.get(sideGame.type);
    const optedIn = sideGame.participants.filter(p => p.opted === 'in');

    if (definition?.minParticipants && optedIn.length < definition.minParticipants) {
      return { success: false, error: `Need at least ${definition.minParticipants} participants` };
    }

    sideGame.status = 'active';

    console.log(`🎲 Side game activated: ${sideGame.displayName} (${optedIn.length} participants)`);

    this.broadcastGameState();
    return { success: true };
  }

  /**
   * Allow new players joining to opt into active side games
   */
  public optIntoActiveSideGame(playerId: string, sideGameId: string, config?: any): { success: boolean; error?: string } {
    if (!this.gameState) {
      return { success: false, error: 'Game not initialized' };
    }

    const sideGame = this.gameState.activeSideGames?.find(sg => sg.id === sideGameId);
    if (!sideGame || sideGame.status !== 'active') {
      return { success: false, error: 'Side game not found or not active' };
    }

    // Check if already participating
    if (sideGame.participants.find(p => p.playerId === playerId)) {
      return { success: false, error: 'Already participating in this side game' };
    }

    const seat = this.findSeat(playerId);
    if (!seat) {
      return { success: false, error: 'Player not seated' };
    }

    if (sideGame.requiresUpfrontBuyIn) {
      // Need to deduct buy-in from side pot
      if (!seat.sidePot) {
        return { success: false, error: 'No side pot account' };
      }

      const buyIn = config?.buyIn || sideGame.config.buyIn;
      const available = seat.sidePot.balance - seat.sidePot.committed;

      if (available < buyIn) {
        return { success: false, error: `Insufficient side pot funds. Need ${buyIn}, have ${available}` };
      }

      // Deduct from side pot
      seat.sidePot.balance -= buyIn;
      sideGame.potBalance = (sideGame.potBalance || 0) + buyIn;

      sideGame.participants.push({
        playerId,
        opted: 'in',
        buyInAmount: buyIn
      });

      console.log(`🎲 ${seat.name} joined ${sideGame.displayName} (buy-in: ${buyIn})`);
    } else {
      // Per-hand contribution - just mark as opted in
      sideGame.participants.push({
        playerId,
        opted: 'in'
      });

      console.log(`🎲 ${seat.name} joined ${sideGame.displayName}`);
    }

    this.broadcastGameState();
    return { success: true };
  }

  /**
   * Commit funds for active side games at start of hand
   */
  private commitSideGameFunds(): void {
    if (!this.gameState || !this.gameState.activeSideGames) return;

    for (const sideGame of this.gameState.activeSideGames) {
      if (sideGame.status !== 'active') continue;
      if (!sideGame.contributionPerHand) continue;  // Skip upfront buy-in games

      const amount = sideGame.contributionPerHand;

      for (const participant of sideGame.participants) {
        if (participant.opted !== 'in') continue;

        const seat = this.findSeat(participant.playerId);
        if (!seat?.sidePot) continue;

        const available = seat.sidePot.balance - seat.sidePot.committed;
        if (available < amount) {
          // Can't cover - skip this hand
          participant.skippedHands = (participant.skippedHands || 0) + 1;
          console.log(`🎲 ${seat.name} can't cover ${sideGame.displayName} contribution this hand (skipped ${participant.skippedHands} hands)`);
          continue;
        }

        // Commit funds
        seat.sidePot.committed += amount;

        if (!seat.sidePot.commitments) {
          seat.sidePot.commitments = [];
        }

        seat.sidePot.commitments.push({
          amount,
          reason: `${sideGame.displayName} - Hand contribution`,
          type: 'side-game',
          metadata: { sideGameId: sideGame.id }
        });
      }
    }
  }

  /**
   * Resolve prop bets that trigger when flop is dealt
   */
  private resolveSideGamesOnFlop(): void {
    if (!this.gameState || !this.gameState.activeSideGames) return;

    for (const sideGame of this.gameState.activeSideGames) {
      if (sideGame.status !== 'active') continue;

      const definition = SideGameRegistry.get(sideGame.type);
      if (!definition?.onFlop) continue;

      // Call side game hook to determine payouts
      const payouts = definition.onFlop({
        communityCards: this.gameState.communityCards,
        sideGame,
        participants: sideGame.participants,
        allSeats: this.gameState.seats.filter((s): s is Seat & PokerSeat => s !== null),
        gameState: this.gameState
      });

      if (payouts.length === 0) {
        // No payout - release commitments
        this.releaseSideGameCommitments(sideGame.id);
        continue;
      }

      // Process payouts from committed funds
      for (const payout of payouts) {
        const fromSeat = this.findSeat(payout.fromPlayerId);
        const toSeat = this.findSeat(payout.toPlayerId);

        if (!fromSeat?.sidePot || !toSeat?.sidePot) continue;

        // Transfer from committed funds
        const transferAmount = Math.min(payout.amount, fromSeat.sidePot.committed, fromSeat.sidePot.balance);

        if (transferAmount > 0) {
          fromSeat.sidePot.balance -= transferAmount;
          fromSeat.sidePot.committed -= transferAmount;
          toSeat.sidePot.balance += transferAmount;

          sideGame.totalPayouts = (sideGame.totalPayouts || 0) + transferAmount;

          console.log(`🎴 ${fromSeat.name} pays ${transferAmount} ${this.currency} to ${toSeat.name} (${payout.reason})`);

          // Remove commitment
          fromSeat.sidePot.commitments = fromSeat.sidePot.commitments?.filter(
            (c: SidePotCommitment) => !(c.type === 'side-game' && c.metadata?.sideGameId === sideGame.id)
          );
        }
      }

      // Release all other commitments for this side game
      this.releaseSideGameCommitments(sideGame.id);

      // Mark prop bet as completed (one-time resolution)
      sideGame.status = 'completed';
      console.log(`🎴 ${sideGame.displayName} prop bet completed`);
    }
  }

  /**
   * Resolve active side games after hand completes
   */
  private resolveSideGames(winner: Seat & PokerSeat, winningHand?: any): void {
    if (!this.gameState || !this.gameState.activeSideGames) return;

    for (const sideGame of this.gameState.activeSideGames) {
      if (sideGame.status !== 'active') continue;

      const definition = SideGameRegistry.get(sideGame.type);
      if (!definition?.onHandComplete) continue;

      // Call side game hook to determine payouts
      const payouts = definition.onHandComplete({
        winner,
        winningHand,
        sideGame,
        participants: sideGame.participants,
        allSeats: this.gameState.seats.filter((s): s is Seat & PokerSeat => s !== null),
        gameState: this.gameState
      });

      if (payouts.length === 0) {
        // No payout this hand - release commitments
        this.releaseSideGameCommitments(sideGame.id);
        continue;
      }

      // Process payouts from committed funds
      for (const payout of payouts) {
        const fromSeat = this.findSeat(payout.fromPlayerId);
        const toSeat = this.findSeat(payout.toPlayerId);

        if (!fromSeat?.sidePot || !toSeat?.sidePot) continue;

        // Transfer from committed funds
        const transferAmount = Math.min(payout.amount, fromSeat.sidePot.committed, fromSeat.sidePot.balance);

        if (transferAmount > 0) {
          fromSeat.sidePot.balance -= transferAmount;
          fromSeat.sidePot.committed -= transferAmount;
          toSeat.sidePot.balance += transferAmount;

          sideGame.totalPayouts = (sideGame.totalPayouts || 0) + transferAmount;

          console.log(`🎲 ${fromSeat.name} pays ${transferAmount} ${this.currency} to ${toSeat.name} (${payout.reason})`);

          // Remove commitment
          fromSeat.sidePot.commitments = fromSeat.sidePot.commitments?.filter(
            (c: SidePotCommitment) => !(c.type === 'side-game' && c.metadata?.sideGameId === sideGame.id)
          );
        }
      }

      // Release all other commitments for this side game
      this.releaseSideGameCommitments(sideGame.id);

      sideGame.handsPlayed = (sideGame.handsPlayed || 0) + 1;
    }
  }

  /**
   * Release all commitments for a specific side game
   */
  private releaseSideGameCommitments(sideGameId: string): void {
    if (!this.gameState) return;

    const seatedPlayers = this.gameState.seats.filter((s): s is Seat & PokerSeat => s !== null);

    for (const seat of seatedPlayers) {
      if (!seat.sidePot?.commitments) continue;

      const commitment = seat.sidePot.commitments.find(
        c => c.type === 'side-game' && c.metadata?.sideGameId === sideGameId
      );

      if (commitment) {
        seat.sidePot.committed -= commitment.amount;
        seat.sidePot.commitments = seat.sidePot.commitments.filter(
          c => !(c.type === 'side-game' && c.metadata?.sideGameId === sideGameId)
        );
      }
    }
  }

  startHand(): void {
    if (!this.gameState) return;

    const seatedPlayers = this.gameState.seats.filter(s => s !== null && s.tableStack > 0);
    if (seatedPlayers.length < 2) {
      console.log('🎰 Not enough players to start poker hand');
      return;
    }

    // For Squidz Game, commit side pot funds before hand starts
    if (this.variant === 'squidz-game') {
      this.commitSquidzFunds();
    }

    // Commit funds for active side games
    this.commitSideGameFunds();

    // Call rules engine round start hook
    if (this.rulesEngine.hooks.onRoundStart) {
      const result = this.rulesEngine.hooks.onRoundStart({
        playerCount: seatedPlayers.length,
        seatedPlayers,
        gameState: this.gameState,
        tableConfig: {
          bigBlind: this.bigBlindAmount,
          smallBlind: this.smallBlindAmount,
          rules: this.ruleModifiers
        }
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

    console.log(`🎰 ${seat.name} action: ${action}${amount ? ` ${amount} ${this.currency}` : ''}`);

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

        // Resolve prop bets that trigger on flop (e.g., Flipz)
        this.resolveSideGamesOnFlop();
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
    let winningHand: any = undefined;

    if (activePlayers.length === 1) {
      // Only one player left
      winnerSeat = activePlayers[0];
      winnerSeat.tableStack += this.gameState.pot;
      console.log(`🎰 ${winnerSeat.name} wins ${this.gameState.pot} ${this.currency}`);
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
      winningHand = winner.hand;
      winnerSeat.tableStack += this.gameState.pot;

      console.log(`🎰 ${winnerSeat.name} wins ${this.gameState.pot} ${this.currency} with ${handRankToString(winner.hand.rank)}`);
    }

    // Call rules engine pot win hook
    if (this.rulesEngine.hooks.onPotWin) {
      const potAmount = this.gameState.pot;
      const result = this.rulesEngine.hooks.onPotWin({
        winner: winnerSeat,
        potAmount,
        gameState: this.gameState,
        tableConfig: {
          bigBlind: this.bigBlindAmount,
          smallBlind: this.smallBlindAmount,
          rules: this.ruleModifiers
        }
      });

      if (result) {
        // Check if round should end
        if (result.shouldEndRound) {
          console.log(`🎮 Round ending: ${result.customMessage || 'Rules engine triggered round end'}`);
          this.handleRoundEnd();
          return; // handleRoundEnd will handle next steps
        }
      }

      // Update squidz commitments if variant is squidz-game
      // (Pot win may have given player squids, reducing their liability)
      if (this.variant === 'squidz-game') {
        this.updateSquidzCommitments();
      }
    }

    // Resolve active side games (7-2 game, etc.)
    this.resolveSideGames(winnerSeat, winningHand);

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
        gameState: this.gameState,
        tableConfig: {
          bigBlind: this.bigBlindAmount,
          smallBlind: this.smallBlindAmount,
          rules: this.ruleModifiers
        }
      });

      if (result) {
        delayMs = result.delayNextRound || delayMs;
        shouldReset = result.shouldResetTable || false;

        if (result.customMessage) {
          console.log(`🎮 ${result.customMessage}`);
        }

        // Process side pot payments if any
        if (result.sidePotPayments && result.sidePotPayments.length > 0) {
          this.processSidePotPayments(result.sidePotPayments);
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

    console.log(`🤖 ${seat.name} (${personality}): strength=${handStrength.toFixed(2)}, call=${callAmount} ${this.currency}`);

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
        console.log(`🤖 ${seat.name} bets ${betAmount} ${this.currency}`);
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
          console.log(`🤖 ${seat.name} ${action} to ${raiseAmount} ${this.currency}`);
          this.handlePlayerAction(seat.playerId, 'raise', raiseAmount);
        } else {
          console.log(`🤖 ${seat.name} calls ${callAmount} ${this.currency}`);
          this.handlePlayerAction(seat.playerId, 'call');
        }
      } else {
        // Just call
        console.log(`🤖 ${seat.name} calls ${callAmount} ${this.currency}`);
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
