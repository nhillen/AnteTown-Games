/**
 * PiratePlunderTable - Manages a single table instance for Pirate Plunder
 *
 * Extends GameBase SDK for:
 * - Player management (seating, standing, reconnection)
 * - Bankroll operations
 * - Socket event broadcasting
 * - Standardized types
 */

import { Namespace, Socket } from 'socket.io';
import { GameBase, Player, Seat as SDKSeat, GameMetadata, GameState, WinnerResult, TableConfig } from '@antetown/game-sdk';

export interface PiratePlunderTableConfig {
  tableId: string;
  displayName: string;
  ante: number;           // In base currency units
  minBuyIn: number;       // In base currency units
  maxSeats: number;
  rake: number;           // Percentage (e.g., 5 for 5%)
  mode?: string;          // 'PVE' or 'PVP'
  currency?: string;      // Currency symbol (e.g., 'TC', 'SC') - defaults to 'TC'
}

// Pirate Plunder specific game phases
export type PiratePlunderPhase =
  | 'Lobby'
  | 'PreHand'
  | 'Ante'
  | 'Roll1'
  | 'Lock1'
  | 'Bet1'
  | 'Roll2'
  | 'Lock2'
  | 'Bet2'
  | 'Roll3'
  | 'Lock3'
  | 'Roll4'
  | 'Bet3'
  | 'Showdown'
  | 'Payout'
  | 'HandEnd';

// Die state
export type Die = {
  value: number;
  locked: boolean;
  isPublic?: boolean;  // Visible to other players
};

// Hand evaluation result
export type HandResult = {
  sixCount: number;    // Ship (6s)
  fiveCount: number;   // Captain (5s)
  fourCount: number;   // Crew (4s)
  oneCount: number;    // Cargo (1s, 2s, 3s)
  twoCount: number;
  threeCount: number;
};

// Showdown result for a player
export type ShowdownResult = {
  playerId: string;
  name: string;
  handResult: HandResult;
  roles: string[];      // Roles won (Ship, Captain, Crew)
  payout: number;
  isActive: boolean;
};

// Side pot for all-in scenarios
export type SidePot = {
  amount: number;
  eligiblePlayers: string[];  // playerIds who can win this pot
};

// Extend SDK Seat with Pirate Plunder specific fields
export interface PiratePlunderSeat extends SDKSeat {
  dice: Die[];
  lockAllowance: number;      // Locks remaining for current phase
  minLocksRequired?: number;  // Minimum locks required
  lockingDone: boolean;       // Player confirmed locks
}

// Extend SDK GameState with Pirate Plunder specific fields
export interface PiratePlunderGameState extends GameState {
  phase: PiratePlunderPhase;
  seats: PiratePlunderSeat[];
  cargoChest: number;
  bettingRoundComplete?: boolean;
  bettingRoundCount?: number;
  showdownResults?: ShowdownResult[];
  allLockingComplete?: boolean;
  roleAssignments?: {
    ship?: string;
    captain?: string;
    crew?: string;
    cargoEffect?: '1s' | '2s' | '3s' | 'tie';
  };
  sidePots?: SidePot[];
}

export class PiratePlunderTable extends GameBase {
  private config: PiratePlunderTableConfig;
  private namespace: Namespace;
  public gameState: PiratePlunderGameState | null = null;
  private phaseTimer: NodeJS.Timeout | null = null;

  constructor(config: PiratePlunderTableConfig, namespace: Namespace) {
    // Convert to GameBase TableConfig format
    const tableConfig: TableConfig = {
      minHumanPlayers: config.mode?.toUpperCase() === 'PVE' ? 1 : 2,
      targetTotalPlayers: config.mode?.toUpperCase() === 'PVE' ? 2 : 4,
      maxSeats: config.maxSeats,
      currency: config.currency || 'TC',
      betting: {
        ante: {
          mode: 'fixed',
          amount: config.ante
        }
      }
    };

    super(tableConfig);
    this.config = config;
    this.namespace = namespace;
    this.gameType = 'pirate-plunder';

    // Initialize game state with Pirate Plunder specifics
    this.initializeGameState('Lobby');
    if (this.gameState) {
      this.gameState.cargoChest = 0;
      // Initialize seats with Pirate Plunder fields
      this.gameState.seats = this.gameState.seats.map(seat => {
        if (!seat) return null;
        return {
          ...seat,
          dice: [],
          lockAllowance: 0,
          lockingDone: false
        } as PiratePlunderSeat;
      }) as PiratePlunderSeat[];
    }
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  private rollDie(): number {
    return Math.floor(Math.random() * 6) + 1;
  }

  private nextPhase(current: PiratePlunderPhase): PiratePlunderPhase {
    const order: PiratePlunderPhase[] = [
      'Ante', 'Roll1', 'Lock1', 'Bet1', 'Roll2', 'Lock2', 'Bet2',
      'Roll3', 'Lock3', 'Roll4', 'Bet3', 'Showdown', 'Payout', 'HandEnd'
    ];
    const idx = order.indexOf(current);
    if (idx < 0) return 'PreHand';
    const next = order[Math.min(order.length - 1, idx + 1)];
    return next || 'HandEnd';
  }

  private evaluateHand(dice: Die[]): HandResult {
    const counts = [0, 0, 0, 0, 0, 0, 0]; // Index 1-6 for die values
    dice.forEach(d => {
      if (d.value >= 1 && d.value <= 6) {
        counts[d.value] = (counts[d.value] || 0) + 1;
      }
    });

    return {
      sixCount: counts[6] || 0,
      fiveCount: counts[5] || 0,
      fourCount: counts[4] || 0,
      oneCount: counts[1] || 0,
      twoCount: counts[2] || 0,
      threeCount: counts[3] || 0
    };
  }

  private advanceTurn(): void {
    if (!this.gameState) return;

    const activePlayers = this.gameState.seats.filter(
      s => s && !s.hasFolded && !s.isAllIn
    );

    if (activePlayers.length <= 1) {
      this.gameState.bettingRoundComplete = true;
      return;
    }

    const currentIndex = activePlayers.findIndex(
      s => s.playerId === this.gameState?.currentTurnPlayerId
    );

    let nextIndex = (currentIndex + 1) % activePlayers.length;
    let attempts = 0;

    while (attempts < activePlayers.length) {
      const nextPlayer = activePlayers[nextIndex];
      if (nextPlayer) {
        const amountOwed = this.gameState.currentBet - (nextPlayer.currentBet || 0);
        const needsToAct = !nextPlayer.hasActed || amountOwed > 0;

        if (needsToAct) {
          this.gameState.currentTurnPlayerId = nextPlayer.playerId;
          this.gameState.phaseEndsAtMs = Date.now() + 30000; // 30 seconds
          return;
        }
      }
      nextIndex = (nextIndex + 1) % activePlayers.length;
      attempts++;
    }

    // All players have acted and matched the bet
    this.gameState.bettingRoundComplete = true;
  }

  // ============================================================
  // REQUIRED GAMEBASE ABSTRACT METHODS
  // ============================================================

  getMetadata(): GameMetadata {
    return {
      emoji: '🎲',
      botNamePrefix: 'PirateBot',
      defaultBuyIn: this.config.minBuyIn
    };
  }

  startHand(): void {
    if (!this.gameState) return;

    console.log(`[${this.config.tableId}] Starting hand`);

    // Reset for new hand
    this.gameState.pot = 0;
    this.gameState.currentBet = 0;
    this.gameState.bettingRoundComplete = false;
    this.gameState.bettingRoundCount = 0;
    delete this.gameState.showdownResults;
    delete this.gameState.roleAssignments;
    delete this.gameState.currentTurnPlayerId;

    // Reset all seats and initialize dice
    for (const seat of this.gameState.seats) {
      if (seat) {
        seat.hasFolded = false;
        seat.currentBet = 0;
        seat.hasActed = false;
        seat.isAllIn = false;
        seat.totalContribution = 0;
        seat.dice = [
          { value: 1, locked: false },
          { value: 1, locked: false },
          { value: 1, locked: false },
          { value: 1, locked: false },
          { value: 1, locked: false }
        ];
        seat.lockAllowance = 0;
        seat.lockingDone = false;
      }
    }

    // Start with Ante phase
    this.gameState.phase = 'Ante';
    this.onEnterPhase();
  }

  private onEnterPhase(): void {
    if (!this.gameState) return;

    const phase = this.gameState.phase;
    console.log(`[${this.config.tableId}] Entering phase: ${phase}`);

    // Clear any existing phase timer
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }

    switch (phase) {
      case 'Ante':
        this.handleAntePhase();
        break;

      case 'Roll1':
      case 'Roll2':
      case 'Roll3':
        this.handleRollPhase();
        break;

      case 'Roll4':
        this.handleFinalRollPhase();
        break;

      case 'Lock1':
      case 'Lock2':
      case 'Lock3':
        this.handleLockPhase();
        break;

      case 'Bet1':
      case 'Bet2':
      case 'Bet3':
        this.handleBettingPhase();
        break;

      case 'Showdown':
        this.handleShowdownPhase();
        break;

      case 'Payout':
        this.handlePayoutPhase();
        break;

      case 'HandEnd':
        this.handleHandEndPhase();
        break;
    }
  }

  private handleAntePhase(): void {
    if (!this.gameState) return;

    // Collect antes from all players
    for (const seat of this.gameState.seats) {
      if (seat) {
        const amt = Math.min(seat.tableStack, this.config.ante);
        seat.tableStack -= amt;
        this.gameState.pot += amt;
        seat.totalContribution = amt;

        console.log(`[${seat.name}] Paid ante: ${amt} ${this.currency}`);

        if (seat.tableStack === 0) {
          seat.isAllIn = true;
        }
      }
    }

    // Immediately move to Roll1
    this.gameState.phase = 'Roll1';
    this.onEnterPhase();
  }

  private handleRollPhase(): void {
    if (!this.gameState) return;

    // Roll all unlocked dice for all players
    for (const seat of this.gameState.seats) {
      if (seat && !seat.hasFolded) {
        seat.dice = seat.dice.map(die =>
          die.locked ? die : { value: this.rollDie(), locked: false }
        );
      }
    }

    this.broadcastGameState();

    // Move to corresponding lock phase
    if (this.gameState.phase === 'Roll1') {
      this.gameState.phase = 'Lock1';
    } else if (this.gameState.phase === 'Roll2') {
      this.gameState.phase = 'Lock2';
    } else if (this.gameState.phase === 'Roll3') {
      this.gameState.phase = 'Lock3';
    }

    this.onEnterPhase();
  }

  private handleFinalRollPhase(): void {
    if (!this.gameState) return;

    // Final roll - roll all unlocked dice
    for (const seat of this.gameState.seats) {
      if (seat && !seat.hasFolded) {
        seat.dice = seat.dice.map(die =>
          die.locked ? die : { value: this.rollDie(), locked: false }
        );
      }
    }

    this.broadcastGameState();

    // Move to final betting
    this.gameState.phase = 'Bet3';
    this.onEnterPhase();
  }

  private handleLockPhase(): void {
    if (!this.gameState) return;

    const round = parseInt(this.gameState.phase.slice(-1)); // Lock1 -> 1, Lock2 -> 2, etc.
    const minLocksRequired = round;

    this.gameState.allLockingComplete = false;

    // Set lock requirements for each player
    for (const seat of this.gameState.seats) {
      if (seat && !seat.hasFolded) {
        const currentLocked = seat.dice.filter(d => d.locked).length;
        seat.lockAllowance = Math.max(0, minLocksRequired - currentLocked);
        seat.minLocksRequired = minLocksRequired;
        seat.lockingDone = false;
      }
    }

    this.broadcastGameState();

    // Check if all players are done locking (every 1 second, 30 second timeout)
    const checkLockingComplete = () => {
      if (!this.gameState || this.gameState.phase !== `Lock${round}`) return;

      const allDone = this.gameState.seats.every(seat => {
        if (!seat || seat.hasFolded) return true;
        const locked = seat.dice.filter(d => d.locked).length;
        return locked >= (seat.minLocksRequired || 1) && (seat.isAI || seat.lockingDone);
      });

      if (allDone) {
        this.gameState.allLockingComplete = true;
        this.gameState.phase = this.nextPhase(this.gameState.phase);
        this.onEnterPhase();
      } else {
        // Check again in 1 second
        this.phaseTimer = setTimeout(checkLockingComplete, 1000);
      }
    };

    // Start checking, and auto-advance after 30 seconds
    setTimeout(checkLockingComplete, 1000);
    this.phaseTimer = setTimeout(() => {
      if (!this.gameState) return;
      this.gameState.phase = this.nextPhase(this.gameState.phase);
      this.onEnterPhase();
    }, 30000);
  }

  private handleBettingPhase(): void {
    if (!this.gameState) return;

    // Reset betting state
    this.gameState.currentBet = 0;
    this.gameState.bettingRoundComplete = false;
    this.gameState.bettingRoundCount = 0;

    for (const seat of this.gameState.seats) {
      if (seat) {
        seat.currentBet = 0;
        seat.hasActed = false;
      }
    }

    // Set first player to act (after dealer)
    const dealerIndex = this.gameState.dealerSeatIndex || 0;
    const activePlayers = this.gameState.seats.filter(s => s && !s.hasFolded && !s.isAllIn);

    if (activePlayers.length > 0) {
      const nextPlayerIndex = (dealerIndex + 1) % this.gameState.seats.length;
      const firstPlayer = this.gameState.seats.find((s, i) => s && i === nextPlayerIndex && !s.hasFolded);

      if (firstPlayer) {
        this.gameState.currentTurnPlayerId = firstPlayer.playerId;
      }
    }

    this.gameState.phaseEndsAtMs = Date.now() + 30000; // 30 seconds

    this.broadcastGameState();

    // Check for betting completion periodically
    const checkBettingComplete = () => {
      if (!this.gameState) return;

      if (this.gameState.bettingRoundComplete) {
        if (this.phaseTimer) {
          clearTimeout(this.phaseTimer);
          this.phaseTimer = null;
        }
        delete this.gameState.phaseEndsAtMs;
        this.gameState.phase = this.nextPhase(this.gameState.phase);
        this.onEnterPhase();
        return;
      }

      // Handle AI turns
      const currentPlayer = this.gameState.seats.find(
        s => s && s.playerId === this.gameState?.currentTurnPlayerId
      );

      if (currentPlayer?.isAI && !currentPlayer.hasFolded) {
        this.makeAIBettingDecision(currentPlayer);
        this.advanceTurn();
        this.broadcastGameState();
      }

      setTimeout(checkBettingComplete, 1000);
    };

    setTimeout(checkBettingComplete, 1000);

    // Auto-advance after 30 seconds
    this.phaseTimer = setTimeout(() => {
      if (!this.gameState) return;
      this.gameState.phase = this.nextPhase(this.gameState.phase);
      this.onEnterPhase();
    }, 30000);
  }

  private makeAIBettingDecision(seat: PiratePlunderSeat): void {
    // Simple AI: call or fold based on hand strength
    const hand = this.evaluateHand(seat.dice);
    const handStrength = hand.sixCount + hand.fiveCount + hand.fourCount;

    if (handStrength >= 2 || Math.random() > 0.5) {
      // Call
      this.processBet(seat.playerId, 'call');
    } else {
      // Fold
      this.processFold(seat.playerId);
    }
  }

  private handleShowdownPhase(): void {
    if (!this.gameState) return;

    this.gameState.showdownResults = this.evaluateWinners() as ShowdownResult[];
    this.broadcastGameState();

    // Move to payout after 3 seconds
    setTimeout(() => {
      if (!this.gameState) return;
      this.gameState.phase = 'Payout';
      this.onEnterPhase();
    }, 3000);
  }

  private handlePayoutPhase(): void {
    if (!this.gameState || !this.gameState.showdownResults) return;

    // Distribute winnings
    for (const result of this.gameState.showdownResults) {
      const seat = this.gameState.seats.find(s => s?.playerId === result.playerId);
      if (seat && result.payout > 0) {
        seat.tableStack += result.payout;
        console.log(`[${seat.name}] Won ${result.payout} ${this.currency} for ${result.roles.join('/')}`);
      }
    }

    this.broadcastGameState();

    // Move to HandEnd
    this.gameState.phase = 'HandEnd';
    this.onEnterPhase();
  }

  private handleHandEndPhase(): void {
    if (!this.gameState) return;

    // Check if any players need to stand up (busted or requested)
    for (let i = 0; i < this.gameState.seats.length; i++) {
      const seat = this.gameState.seats[i];
      if (seat && (seat.tableStack === 0 || seat.standingUp)) {
        this.standPlayer(seat.playerId, true);
      }
    }

    this.broadcastGameState();

    // Start new hand if we still have enough players
    setTimeout(() => {
      if (this.canStartHand()) {
        this.startHand();
      }
    }, 2000);
  }

  private processBet(playerId: string, action: 'call' | 'raise' | 'check', raiseAmount?: number): void {
    if (!this.gameState) return;

    const seat = this.gameState.seats.find(s => s?.playerId === playerId);
    if (!seat || seat.hasFolded) return;

    const amountToCall = this.gameState.currentBet - (seat.currentBet || 0);

    if (action === 'call') {
      const betAmount = Math.min(amountToCall, seat.tableStack);
      seat.tableStack -= betAmount;
      seat.currentBet += betAmount;
      this.gameState.pot += betAmount;

      if (seat.tableStack === 0) seat.isAllIn = true;
      seat.hasActed = true;

      console.log(`[${seat.name}] Called ${betAmount} ${this.currency}`);
    } else if (action === 'raise' && raiseAmount) {
      const totalBet = amountToCall + raiseAmount;
      const betAmount = Math.min(totalBet, seat.tableStack);

      seat.tableStack -= betAmount;
      seat.currentBet += betAmount;
      this.gameState.pot += betAmount;
      this.gameState.currentBet = seat.currentBet;

      if (seat.tableStack === 0) seat.isAllIn = true;
      seat.hasActed = true;

      // Reset hasActed for other players since bet increased
      for (const s of this.gameState.seats) {
        if (s && s.playerId !== playerId) s.hasActed = false;
      }

      console.log(`[${seat.name}] Raised to ${this.gameState.currentBet} ${this.currency}`);
    }

    this.advanceTurn();
  }

  private processFold(playerId: string): void {
    if (!this.gameState) return;

    const seat = this.gameState.seats.find(s => s?.playerId === playerId);
    if (!seat) return;

    seat.hasFolded = true;
    seat.hasActed = true;

    console.log(`[${seat.name}] Folded`);

    // Check if only one player left
    const activePlayers = this.gameState.seats.filter(s => s && !s.hasFolded) as PiratePlunderSeat[];
    if (activePlayers.length === 1 && activePlayers[0]) {
      // Single winner, skip to payout
      const winner = activePlayers[0];
      this.gameState.phase = 'Payout';
      this.gameState.showdownResults = [{
        playerId: winner.playerId,
        name: winner.name,
        handResult: this.evaluateHand(winner.dice),
        roles: ['Winner'],
        payout: this.gameState.pot,
        isActive: true
      }];
      this.onEnterPhase();
      return;
    }

    this.advanceTurn();
  }

  private processLock(playerId: string, diceIndices: number[]): void {
    if (!this.gameState) return;

    const seat = this.gameState.seats.find(s => s?.playerId === playerId);
    if (!seat) return;

    // Toggle locks on specified dice
    diceIndices.forEach(idx => {
      if (idx >= 0 && idx < seat.dice.length && seat.dice[idx]) {
        seat.dice[idx].locked = !seat.dice[idx].locked;
      }
    });

    console.log(`[${seat.name}] Locked dice:`, diceIndices);
    this.broadcastGameState();
  }

  private processLockingDone(playerId: string): void {
    if (!this.gameState) return;

    const seat = this.gameState.seats.find(s => s?.playerId === playerId);
    if (!seat) return;

    seat.lockingDone = true;
    console.log(`[${seat.name}] Finished locking`);
    this.broadcastGameState();
  }

  handlePlayerAction(playerId: string, action: string, data?: any): void {
    console.log(`[${this.config.tableId}] Player ${playerId.slice(0, 6)} action: ${action}`, data);

    if (!this.gameState) return;

    switch (action) {
      case 'call':
        this.processBet(playerId, 'call');
        break;

      case 'raise':
        this.processBet(playerId, 'raise', data?.amount);
        break;

      case 'check':
        this.processBet(playerId, 'check');
        break;

      case 'fold':
        this.processFold(playerId);
        break;

      case 'lock_dice':
        this.processLock(playerId, data?.diceIndices || []);
        break;

      case 'locking_done':
        this.processLockingDone(playerId);
        break;

      default:
        console.warn(`[${this.config.tableId}] Unknown action: ${action}`);
    }

    this.broadcastGameState();
  }

  evaluateWinners(): WinnerResult[] {
    if (!this.gameState) return [];

    const activePlayers = this.gameState.seats.filter(s => s && !s.hasFolded);
    const results: ShowdownResult[] = [];

    // Evaluate hands
    const evaluations = activePlayers.map(seat => ({
      seat,
      hand: this.evaluateHand(seat.dice)
    }));

    // Find Ship winner (most 6s)
    let shipWinner = evaluations.reduce((best, curr) =>
      curr.hand.sixCount > best.hand.sixCount ? curr : best
    );

    // Find Captain winner (most 5s)
    let captainWinner = evaluations.reduce((best, curr) =>
      curr.hand.fiveCount > best.hand.fiveCount ? curr : best
    );

    // Find Crew winner (most 4s)
    let crewWinner = evaluations.reduce((best, curr) =>
      curr.hand.fourCount > best.hand.fourCount ? curr : best
    );

    // Calculate cargo (1s, 2s, 3s)
    const cargoScores = evaluations.map(e => ({
      seat: e.seat,
      cargo: e.hand.oneCount + e.hand.twoCount + e.hand.threeCount
    }));

    // Simple payout: Ship/Captain/Crew each get 1/3 of pot, cargo winner gets remainder
    const potPerRole = Math.floor(this.gameState.pot / 4);

    // Assign payouts
    for (const seat of activePlayers) {
      let payout = 0;
      const roles: string[] = [];

      if (seat.playerId === shipWinner.seat.playerId && shipWinner.hand.sixCount > 0) {
        payout += potPerRole;
        roles.push('Ship');
      }

      if (seat.playerId === captainWinner.seat.playerId && captainWinner.hand.fiveCount > 0) {
        payout += potPerRole;
        roles.push('Captain');
      }

      if (seat.playerId === crewWinner.seat.playerId && crewWinner.hand.fourCount > 0) {
        payout += potPerRole;
        roles.push('Crew');
      }

      const seatCargo = cargoScores.find(c => c.seat.playerId === seat.playerId);
      const maxCargo = Math.max(...cargoScores.map(c => c.cargo));
      if (seatCargo && seatCargo.cargo === maxCargo && maxCargo > 0) {
        payout += potPerRole;
        roles.push('Cargo');
      }

      results.push({
        playerId: seat.playerId,
        name: seat.name,
        handResult: this.evaluateHand(seat.dice),
        roles,
        payout,
        isActive: true
      });
    }

    return results;
  }

  getValidActions(playerId: string): string[] {
    if (!this.gameState) return [];

    const seat = this.gameState.seats.find(s => s?.playerId === playerId);
    if (!seat || seat.hasFolded) return [];

    const phase = this.gameState.phase;

    // Lock phases
    if (phase === 'Lock1' || phase === 'Lock2' || phase === 'Lock3') {
      return ['lock_dice', 'locking_done'];
    }

    // Betting phases
    if (phase === 'Bet1' || phase === 'Bet2' || phase === 'Bet3') {
      // Only current turn player can act
      if (this.gameState.currentTurnPlayerId !== playerId) return [];

      const amountOwed = this.gameState.currentBet - (seat.currentBet || 0);
      if (amountOwed > 0) {
        return ['fold', 'call', 'raise'];
      } else {
        return ['check', 'raise'];
      }
    }

    return [];
  }

  /**
   * Create an AI player for Pirate Plunder
   */
  createAIPlayer(): Player {
    const botNames = ['PirateBot', 'Captain Hook', 'Blackbeard', 'Anne Bonny', 'Calico Jack', 'Morgan'];
    const randomName = botNames[Math.floor(Math.random() * botNames.length)] || 'PirateBot';
    const uniqueId = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    return {
      id: uniqueId,
      name: randomName,
      isAI: true,
      bankroll: 10000 // AI starting bankroll
    };
  }

  // ============================================================
  // PIRATE PLUNDER SPECIFIC PUBLIC METHODS
  // ============================================================

  getTableId(): string {
    return this.config.tableId;
  }

  getConfig(): PiratePlunderTableConfig {
    return this.config;
  }

  /**
   * Handle player joining the table (lobby)
   * Uses GameBase's registerSocket
   */
  handleJoin(socket: Socket, payload: { name: string; bankroll?: number; googleId?: string }) {
    console.log(`[${this.config.tableId}] Player ${payload.name} joining`);

    const player: Player = {
      id: socket.id,
      name: payload.name,
      isAI: false,
      bankroll: payload.bankroll || 10000,
      ...(payload.googleId && { googleId: payload.googleId })
    };

    // Use GameBase's registerSocket
    this.registerSocket(socket, player);

    // Try to reconnect to existing seat if they have one
    const reconnected = this.reconnectPlayer(socket, player);

    // Send joined response (frontend expects { player, isAdmin })
    socket.emit('joined', {
      player: {
        id: player.id,
        name: player.name,
        isAI: player.isAI,
        bankroll: player.bankroll
      },
      isAdmin: false
    });

    // Broadcast updated lobby state
    this.broadcastLobbyState();

    // Broadcast table state if they reconnected
    if (reconnected) {
      this.broadcastTableState();
      if (this.gameState) {
        this.broadcastGameState();
      }
    }
  }

  /**
   * Handle player sitting down at a seat
   * Uses GameBase's sitPlayer
   */
  handleSitDown(socket: Socket, payload: { seatIndex?: number; buyInAmount?: number }) {
    console.log(`[${this.config.tableId}] sit_down from ${socket.id}:`, payload);

    const player = this.connectedPlayers.get(socket.id);
    if (!player) {
      socket.emit('error', 'Player not found. Please rejoin.');
      return;
    }

    const { seatIndex, buyInAmount = this.config.minBuyIn } = payload;

    // Validate buy-in amount
    if (buyInAmount < this.config.minBuyIn) {
      socket.emit('error', `Minimum buy-in is ${this.config.minBuyIn} ${this.currency}`);
      return;
    }

    // Use GameBase's sitPlayer method
    const result = this.sitPlayer(player, seatIndex, buyInAmount);

    if (!result.success) {
      socket.emit('error', result.error || 'Failed to sit down');
      return;
    }

    console.log(`[${this.config.tableId}] ${player.name} sat at seat ${result.seatIndex} with ${buyInAmount} ${this.currency}`);

    // In PVE mode, automatically add AI players to fill remaining seats
    if (this.config.mode?.toUpperCase() === 'PVE' && this.gameState) {
      const seatedCount = this.gameState.seats.filter(s => s !== null).length;
      const mode = this.config.mode?.toUpperCase() || 'PVP';
      const targetTotalPlayers = mode === 'PVE' ? 2 : 4;
      const neededPlayers = targetTotalPlayers - seatedCount;

      if (neededPlayers > 0) {
        console.log(`[${this.config.tableId}] PVE mode: Adding ${neededPlayers} AI players`);
        const added = this.addAIPlayers(neededPlayers, () => this.createAIPlayer(), this.config.minBuyIn);
        console.log(`[${this.config.tableId}] Added ${added} AI players`);
      }
    }

    // Broadcast updated state
    this.broadcastTableState();

    // Check if we can start the game
    if (this.canStartHand()) {
      this.startHand();
    }
  }

  /**
   * Handle player standing up
   * Uses GameBase's standPlayer
   */
  handleStandUp(socket: Socket) {
    console.log(`[${this.config.tableId}] stand_up from ${socket.id}`);

    const player = this.connectedPlayers.get(socket.id);
    if (!player) {
      socket.emit('error', 'Player not found');
      return;
    }

    // Use GameBase's standPlayer method
    const result = this.standPlayer(player.id, true); // immediate = true for now

    if (!result.success) {
      socket.emit('error', result.error || 'Failed to stand up');
      return;
    }

    console.log(`[${this.config.tableId}] ${player.name} stood up`);

    this.broadcastTableState();
  }

  /**
   * Handle player disconnect
   * For now, immediately remove from seat
   * TODO: Add reconnection timeout period
   */
  handleDisconnect(socket: Socket) {
    console.log(`[${this.config.tableId}] disconnect from ${socket.id}`);

    // Remove player from seat immediately
    const result = this.standPlayer(socket.id, true);

    if (result.success) {
      console.log(`[${this.config.tableId}] Removed disconnected player from seat`);
      this.broadcastTableState();
    }

    // Unregister socket (GameBase method)
    this.unregisterSocket(socket.id);
  }

  /**
   * Get current stats for this table
   */
  getStats() {
    if (!this.gameState) {
      return {
        seatedPlayers: 0,
        humanPlayers: 0,
        waitingForPlayers: true,
        phase: 'Lobby'
      };
    }

    const seatedPlayers = this.gameState.seats.filter(s => s !== null).length;
    const humanPlayers = this.gameState.seats.filter(s => s && !s.isAI).length;

    return {
      seatedPlayers,
      humanPlayers,
      waitingForPlayers: !this.canStartHand(),
      phase: this.gameState.phase
    };
  }

  // ============================================================
  // PRIVATE HELPER METHODS
  // ============================================================

  private broadcastLobbyState() {
    // Get all connected players
    const players = Array.from(this.connectedPlayers.values()).map(p => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      bankroll: p.bankroll
    }));

    const lobbyState = { players };

    console.log(`[${this.config.tableId}] Broadcasting lobby state with ${players.length} players`);

    // Emit to all connected sockets
    this.broadcast('lobby_state', lobbyState);
  }

  private broadcastTableState() {
    if (!this.gameState) return;

    const mode = this.config.mode?.toUpperCase() || 'PVP';
    const minHumanPlayers = mode === 'PVE' ? 1 : 2;
    const targetTotalPlayers = mode === 'PVE' ? 2 : 4;

    // Convert GameBase Seat[] to format frontend expects
    const seats = this.gameState.seats.map(seat => {
      if (!seat) return null;

      return {
        playerId: seat.playerId,
        name: seat.name,
        isAI: seat.isAI,
        tableStack: seat.tableStack,
        hasFolded: seat.hasFolded,
        currentBet: seat.currentBet,
        cosmetics: seat.cosmetics
      };
    });

    const tableState = {
      seats,
      cargoChest: (this.gameState as PiratePlunderGameState).cargoChest || 0,
      config: {
        minHumanPlayers,
        targetTotalPlayers,
        maxSeats: this.config.maxSeats,
        cargoChestLearningMode: false,
        currency: this.currency
      }
    };

    console.log(`[${this.config.tableId}] Broadcasting table state - ${seats.filter(s => s).length} seated`);

    this.broadcast('table_state', tableState);
  }
}
