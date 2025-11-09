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
import * as fs from 'fs';
import * as path from 'path';

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

// AI Profile for personality-based decisions
export type AIProfile = {
  name: string;
  style: string;
  riskTolerance: number;
  bluffFrequency: number;
  foldThreshold: number;
  raiseMultiplier: number;
  rolePriority: string[];
  mistakeChance: number;
  cosmetics?: {
    highSkin?: string;
    lowSkin?: string;
  };
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
  aiProfile?: AIProfile;      // AI personality profile
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
  private aiProfiles: AIProfile[] = [];

  constructor(config: PiratePlunderTableConfig, namespace: Namespace) {
    // Convert to GameBase TableConfig format
    const tableConfig: TableConfig = {
      minHumanPlayers: config.mode?.toUpperCase() === 'PVE' ? 1 : 2,
      targetTotalPlayers: config.mode?.toUpperCase() === 'PVE' ? 5 : 4, // PVE: 1 human + 4 AI, PVP: 4 humans
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

    // Load AI profiles from JSON file
    try {
      const profilesPath = path.join(__dirname, 'ai-profiles.json');
      const profilesData = fs.readFileSync(profilesPath, 'utf8');
      this.aiProfiles = JSON.parse(profilesData);
      console.log(`[${this.config.tableId}] Loaded ${this.aiProfiles.length} AI profiles`);
    } catch (error) {
      console.warn(`[${this.config.tableId}] Failed to load AI profiles, using basic AI:`, error);
      // Fallback to basic profile
      this.aiProfiles = [{
        name: 'Basic AI',
        style: 'Balanced',
        riskTolerance: 0.5,
        bluffFrequency: 0.1,
        foldThreshold: 3,
        raiseMultiplier: 1.0,
        rolePriority: ['Ship', 'Captain', 'Crew', 'Cargo3', 'Cargo2', 'Cargo1'],
        mistakeChance: 0.1
      }];
    }

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

  private assignAIProfile(): AIProfile {
    // Randomly select an AI profile with some variance
    const profile = this.aiProfiles[Math.floor(Math.random() * this.aiProfiles.length)];
    if (!profile) {
      // Fallback profile
      return {
        name: 'Basic AI',
        style: 'Balanced',
        riskTolerance: 0.5,
        bluffFrequency: 0.1,
        foldThreshold: 3,
        raiseMultiplier: 1.0,
        rolePriority: ['Ship', 'Captain', 'Crew', 'Cargo3', 'Cargo2', 'Cargo1'],
        mistakeChance: 0.1
      };
    }

    // Add ±10% variance to numeric values to prevent robotic behavior
    const variance = () => 0.9 + Math.random() * 0.2; // 0.9 to 1.1 multiplier

    const result: AIProfile = {
      name: profile.name,
      style: profile.style,
      rolePriority: profile.rolePriority,
      riskTolerance: Math.max(0, Math.min(1, profile.riskTolerance * variance())),
      bluffFrequency: Math.max(0, Math.min(1, profile.bluffFrequency * variance())),
      foldThreshold: Math.max(1, profile.foldThreshold * variance()),
      raiseMultiplier: Math.max(0.1, profile.raiseMultiplier * variance()),
      mistakeChance: Math.max(0, Math.min(1, profile.mistakeChance * variance()))
    };

    if (profile.cosmetics) {
      result.cosmetics = profile.cosmetics;
    }

    return result;
  }

  private getRollsRemaining(phase: PiratePlunderPhase): number {
    if (phase.includes('Roll1') || phase.includes('Lock1')) return 2;
    if (phase.includes('Roll2') || phase.includes('Lock2')) return 1;
    if (phase.includes('Roll3') || phase.includes('Lock3')) return 1;
    if (phase.includes('Roll4')) return 0;
    return 0;
  }

  private updateDicePublicVisibility(seat: PiratePlunderSeat): void {
    // Don't reset dice that are already public from previous rounds
    // Only update visibility when all players have finished locking in this phase
    if (!this.gameState?.allLockingComplete) {
      return; // Keep existing visibility until everyone is done locking
    }

    // Get the minimum required locks for this round
    const minRequired = seat.minLocksRequired || 1;

    // Get locked dice sorted by value (descending) to show the highest values
    const lockedDice = seat.dice
      .map((die, index) => ({ die, index }))
      .filter(item => item.die.locked)
      .sort((a, b) => b.die.value - a.die.value);

    // Mark the top N locked dice as public (where N is minimum required)
    for (let i = 0; i < Math.min(minRequired, lockedDice.length); i++) {
      const lockedItem = lockedDice[i];
      if (lockedItem) {
        lockedItem.die.isPublic = true;
      }
    }
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

  private evaluateHandStrength(dice: Die[], phase: PiratePlunderPhase): number {
    const values = dice.map(d => d.value);

    // Count dice by value for role evaluation
    const counts = [0, 0, 0, 0, 0, 0, 0]; // index 0 unused, 1-6 for die values
    for (const value of values) {
      if (value >= 1 && value <= 6) {
        counts[value] = (counts[value] || 0) + 1;
      }
    }

    let strength = 0;

    // Role-based scoring (Ship/Captain/Crew)
    strength += (counts[6] || 0) * 2.0;  // Ship (6s) - most valuable
    strength += (counts[5] || 0) * 1.5;  // Captain (5s)
    strength += (counts[4] || 0) * 1.2;  // Crew (4s)

    // Cargo scoring (1s, 2s, 3s are valuable for cargo chest triggers)
    const lowDiceCount = (counts[1] || 0) + (counts[2] || 0) + (counts[3] || 0);
    const hasTripsOrBetter = lowDiceCount >= 3;

    if (hasTripsOrBetter) {
      strength += lowDiceCount * 0.5; // Bonus for low dice combinations
    }

    // Phase-based adjustments
    if (phase === 'Bet1') {
      // Early betting - be more conservative
      strength *= 0.8;
    } else if (phase === 'Bet3') {
      // Final betting - hand is locked in
      strength *= 1.2;
    }

    return strength;
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
          { value: 1, locked: false, isPublic: false },
          { value: 1, locked: false, isPublic: false },
          { value: 1, locked: false, isPublic: false },
          { value: 1, locked: false, isPublic: false },
          { value: 1, locked: false, isPublic: false }
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
          die.locked ? die : { value: this.rollDie(), locked: false, isPublic: false }
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
          die.locked ? die : { value: this.rollDie(), locked: false, isPublic: false }
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

    console.log(`[${this.config.tableId}] Lock${round} phase: require ${minLocksRequired} locks`);

    this.gameState.allLockingComplete = false;

    // Set phase timer for frontend progress bar
    this.gameState.phaseEndsAtMs = Date.now() + 30000; // 30 seconds

    // Set lock requirements for each player
    for (const seat of this.gameState.seats) {
      if (seat && !seat.hasFolded) {
        const currentLocked = seat.dice.filter(d => d.locked).length;
        seat.lockAllowance = Math.max(0, minLocksRequired - currentLocked);
        seat.minLocksRequired = minLocksRequired;
        seat.lockingDone = false;

        console.log(`[${seat.name}] dice=${seat.dice.length}, currentLocked=${currentLocked}, lockAllowance=${seat.lockAllowance}, isAI=${seat.isAI}, hasProfile=${!!seat.aiProfile}`);

        // AI players automatically lock their best dice
        if (seat.isAI) {
          this.makeAILockingDecision(seat, minLocksRequired);
          const afterLocked = seat.dice.filter(d => d.locked).length;
          console.log(`[${seat.name}] AI locked: before=${currentLocked}, after=${afterLocked}, lockingDone=${seat.lockingDone}`);
        }
      }
    }

    this.broadcastGameState();

    // Check if all players are done locking (every 1 second, 30 second timeout)
    const checkLockingComplete = () => {
      if (!this.gameState || this.gameState.phase !== `Lock${round}`) {
        console.log(`[${this.config.tableId}] checkLockingComplete bailed: phase changed`);
        return;
      }

      const seatStatuses = this.gameState.seats.map(seat => {
        if (!seat || seat.hasFolded) return 'folded/null';
        const locked = seat.dice.filter(d => d.locked).length;
        const minRequired = seat.minLocksRequired || 1;
        const isDone = locked >= minRequired && (seat.isAI || seat.lockingDone);
        return `${seat.name}: ${locked}/${minRequired} done=${seat.lockingDone} isAI=${seat.isAI} result=${isDone}`;
      });

      console.log(`[${this.config.tableId}] checkLockingComplete: ${seatStatuses.filter(s => s !== 'folded/null').join(' | ')}`);

      const allDone = this.gameState.seats.every(seat => {
        if (!seat || seat.hasFolded) return true;
        const locked = seat.dice.filter(d => d.locked).length;
        return locked >= (seat.minLocksRequired || 1) && (seat.isAI || seat.lockingDone);
      });

      console.log(`[${this.config.tableId}] allDone=${allDone}`);

      if (allDone) {
        console.log(`[${this.config.tableId}] All players done locking, advancing to next phase`);
        this.gameState.allLockingComplete = true;
        this.gameState.phase = this.nextPhase(this.gameState.phase);
        this.onEnterPhase();
      } else {
        console.log(`[${this.config.tableId}] Not all done, checking again in 1 second`);
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

  private makeAILockingDecision(seat: PiratePlunderSeat, minLocksRequired: number): void {
    if (!this.gameState) return;

    // Use basic logic if no AI profile
    if (!seat.aiProfile) {
      this.makeBasicAILockingDecision(seat);
      return;
    }

    const profile = seat.aiProfile;
    const rollsRemaining = this.getRollsRemaining(this.gameState.phase);

    // Get current dice counts
    const counts = [0, 0, 0, 0, 0, 0, 0]; // index 0 unused, 1-6 for die values
    for (const die of seat.dice) {
      if (die.value >= 1 && die.value <= 6) {
        counts[die.value] = (counts[die.value] || 0) + 1;
      }
    }

    // Analyze competition by checking other players' visible locked dice
    const competitionAnalysis = {
      6: 0, // Ship competition count
      5: 0, // Captain competition count
      4: 0, // Crew competition count
      3: 0, 2: 0, 1: 0 // Cargo competition counts
    };

    // Count visible locked dice from other players
    for (const otherSeat of this.gameState.seats) {
      if (!otherSeat || otherSeat.playerId === seat.playerId) continue; // Skip self
      for (const die of otherSeat.dice || []) {
        if (die.locked && die.isPublic && die.value >= 1 && die.value <= 6) {
          competitionAnalysis[die.value as keyof typeof competitionAnalysis]++;
        }
      }
    }

    // Determine target role based on priority, current dice, and competition
    let targetRole = '';
    let targetValue = 0;

    for (const role of profile.rolePriority) {
      let roleValue = 0;
      let hasRequiredDice = false;
      let competitorCount = 0;

      if (role === 'Ship') {
        roleValue = 6;
        hasRequiredDice = (counts[6] || 0) > 0;
        competitorCount = competitionAnalysis[6];
      } else if (role === 'Captain') {
        roleValue = 5;
        hasRequiredDice = (counts[5] || 0) > 0;
        competitorCount = competitionAnalysis[5];
      } else if (role === 'Crew') {
        roleValue = 4;
        hasRequiredDice = (counts[4] || 0) > 0;
        competitorCount = competitionAnalysis[4];
      } else if (role === 'Cargo3') {
        roleValue = 3;
        hasRequiredDice = (counts[3] || 0) > 0;
        competitorCount = competitionAnalysis[3];
      } else if (role === 'Cargo2') {
        roleValue = 2;
        hasRequiredDice = (counts[2] || 0) > 0;
        competitorCount = competitionAnalysis[2];
      } else if (role === 'Cargo1') {
        roleValue = 1;
        hasRequiredDice = (counts[1] || 0) > 0;
        competitorCount = competitionAnalysis[1];
      }

      // Strategy: prefer roles where we have dice AND low competition
      // OR if we're aggressive (high risk tolerance), pursue even without initial dice
      const shouldPursue = hasRequiredDice ||
        (profile.riskTolerance > 0.7 && competitorCount === 0 && rollsRemaining > 0);

      // Avoid heavily contested roles unless we're already committed
      const isHeavilyContested = competitorCount >= 2;
      const alreadyCommitted = seat.dice.filter(d => d.locked && d.value === roleValue).length > 0;

      if (shouldPursue && (!isHeavilyContested || alreadyCommitted)) {
        targetRole = role;
        targetValue = roleValue;
        break;
      }
    }

    const unlockedDice = seat.dice
      .map((die, index) => ({ die, index }))
      .filter(({ die }) => !die.locked);

    let locksToMake = seat.lockAllowance;
    const lockedIndices: number[] = [];

    // Strategy 1: Lock dice matching target role/cargo
    if (targetValue > 0) {
      const targetDice = unlockedDice.filter(({ die }) => die.value === targetValue);
      for (const { index } of targetDice) {
        if (locksToMake <= 0) break;
        seat.dice[index]!.locked = true;
        lockedIndices.push(index);
        locksToMake--;
      }
    }

    // Strategy 2: If we still need to lock more dice, use personality-based priority
    if (locksToMake > 0) {
      const remainingDice = unlockedDice
        .filter(({ index }) => !lockedIndices.includes(index))
        .sort((a, b) => {
          // Use the AI's role priority to determine value preferences
          const getPriorityFromProfile = (value: number) => {
            for (let i = 0; i < profile.rolePriority.length; i++) {
              const role = profile.rolePriority[i];
              if ((role === 'Ship' && value === 6) ||
                  (role === 'Captain' && value === 5) ||
                  (role === 'Crew' && value === 4) ||
                  (role === 'Cargo3' && value === 3) ||
                  (role === 'Cargo2' && value === 2) ||
                  (role === 'Cargo1' && value === 1)) {
                return profile.rolePriority.length - i; // Higher priority = higher score
              }
            }
            return 0;
          };

          // Factor in competition - reduce priority for heavily contested values
          const getCompetitionAdjustedPriority = (value: number) => {
            const basePriority = getPriorityFromProfile(value);
            const competition = competitionAnalysis[value as keyof typeof competitionAnalysis] || 0;

            // Conservative players avoid competition more
            const competitionPenalty = competition * (1 - profile.riskTolerance);
            return basePriority - competitionPenalty;
          };

          return getCompetitionAdjustedPriority(b.die.value) - getCompetitionAdjustedPriority(a.die.value);
        });

      for (const { index } of remainingDice) {
        if (locksToMake <= 0) break;
        seat.dice[index]!.locked = true;
        lockedIndices.push(index);
        locksToMake--;
      }
    }

    // Apply mistake chance - sometimes unlock a good die or lock a bad one
    if (Math.random() < profile.mistakeChance && lockedIndices.length > 0) {
      const mistakeIndex = Math.floor(Math.random() * lockedIndices.length);
      const dieIndex = lockedIndices[mistakeIndex];
      if (dieIndex !== undefined && seat.dice[dieIndex]) {
        seat.dice[dieIndex]!.locked = false;

        // Find a worse die to lock instead, if available
        const unlockedBadDice = seat.dice
          .map((die, index) => ({ die, index }))
          .filter(({ die, index }) => !die.locked && die.value <= 2);

        if (unlockedBadDice.length > 0) {
          const badDieIndex = unlockedBadDice[0]?.index;
          if (badDieIndex !== undefined && seat.dice[badDieIndex]) {
            seat.dice[badDieIndex]!.locked = true;
          }
        }

        console.log(`[${seat.name}] AI mistake: unlocked die value ${seat.dice[dieIndex]!.value}`);
      }
    }

    // Update dice visibility
    this.updateDicePublicVisibility(seat);

    // Update lock allowance
    const currentLocked = seat.dice.filter(d => d.locked).length;
    const minRequired = seat.minLocksRequired || 1;
    seat.lockAllowance = Math.max(0, minRequired - currentLocked);
    seat.lockingDone = true;

    console.log(`[${seat.name}] AI locked dice (target: ${targetRole}, locked: ${currentLocked}/${minRequired})`);
  }

  private makeBasicAILockingDecision(seat: PiratePlunderSeat): void {
    if (!this.gameState) return;

    // Fallback to simple logic: lock highest value dice
    const unlockedDice = seat.dice
      .map((die, index) => ({ die, index }))
      .filter(({ die }) => !die.locked)
      .sort((a, b) => b.die.value - a.die.value);

    let locksToMake = seat.lockAllowance;
    for (const { index } of unlockedDice) {
      if (locksToMake <= 0) break;
      seat.dice[index]!.locked = true;
      locksToMake--;
    }

    this.updateDicePublicVisibility(seat);

    const currentLocked = seat.dice.filter(d => d.locked).length;
    const minRequired = seat.minLocksRequired || 1;
    seat.lockAllowance = Math.max(0, minRequired - currentLocked);
    seat.lockingDone = true;

    console.log(`[${seat.name}] AI locked ${currentLocked} dice (basic logic)`);
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
    if (!this.gameState || !seat.aiProfile) {
      // Fallback to simple logic
      this.makeBasicAIBettingDecision(seat);
      return;
    }

    const profile = seat.aiProfile;
    let handStrength = this.evaluateHandStrength(seat.dice, this.gameState.phase);

    // Apply bluff modifier
    if (Math.random() < profile.bluffFrequency) {
      handStrength += 2; // Act stronger than actual hand
      console.log(`[${seat.name}] AI bluffing (strength ${handStrength.toFixed(1)})`);
    }

    // Apply mistake modifier
    if (Math.random() < profile.mistakeChance) {
      handStrength -= 1; // Act weaker than actual hand
      console.log(`[${seat.name}] AI mistake (strength ${handStrength.toFixed(1)})`);
    }

    const amountToCall = this.gameState.currentBet - (seat.currentBet || 0);

    // Decision logic based on profile
    if (handStrength < profile.foldThreshold) {
      // Weak hand - consider folding based on risk tolerance
      if (Math.random() > profile.riskTolerance || amountToCall > seat.tableStack * 0.2) {
        this.processFold(seat.playerId);
        console.log(`[${seat.name}] AI folded (strength ${handStrength.toFixed(1)} < threshold ${profile.foldThreshold})`);
        return;
      }
    }

    if (amountToCall === 0) {
      // No amount to call - decide between check and bet
      if (handStrength >= profile.foldThreshold + 2 && Math.random() < profile.riskTolerance) {
        // Strong hand - consider betting
        const betAmount = Math.round((this.gameState.pot || 100) * profile.raiseMultiplier * 0.1);
        const actualBet = Math.min(betAmount, seat.tableStack);

        seat.tableStack -= actualBet;
        seat.currentBet = actualBet;
        seat.totalContribution = (seat.totalContribution || 0) + actualBet;
        this.gameState.pot += actualBet;
        this.gameState.currentBet = actualBet;
        seat.hasActed = true;

        if (seat.tableStack === 0) seat.isAllIn = true;

        // Reset hasActed for other players since bet increased
        for (const s of this.gameState.seats) {
          if (s && s.playerId !== seat.playerId) s.hasActed = false;
        }

        console.log(`[${seat.name}] AI bet ${actualBet} ${this.currency} (strength ${handStrength.toFixed(1)})`);
      } else {
        // Check
        seat.hasActed = true;
        console.log(`[${seat.name}] AI checked`);
      }
    } else {
      // Amount to call - decide call vs raise vs fold
      const maxRaisesPerRound = 4;
      const currentRaises = this.gameState.bettingRoundCount || 0;

      if (handStrength >= profile.foldThreshold + 3 &&
          Math.random() < profile.riskTolerance * 0.7 &&
          amountToCall < seat.tableStack * 0.3 &&
          currentRaises < maxRaisesPerRound) {
        // Strong hand - consider raising
        const raiseAmount = Math.round((this.gameState.pot || 100) * profile.raiseMultiplier * 0.15);
        const totalAmount = amountToCall + raiseAmount;
        const actualAmount = Math.min(totalAmount, seat.tableStack);

        seat.tableStack -= actualAmount;
        seat.currentBet += actualAmount;
        seat.totalContribution = (seat.totalContribution || 0) + actualAmount;
        this.gameState.pot += actualAmount;
        this.gameState.currentBet = seat.currentBet;
        this.gameState.bettingRoundCount = (this.gameState.bettingRoundCount || 0) + 1;
        seat.hasActed = true;

        if (seat.tableStack === 0) seat.isAllIn = true;

        // Reset hasActed for other players
        for (const s of this.gameState.seats) {
          if (s && s.playerId !== seat.playerId) s.hasActed = false;
        }

        console.log(`[${seat.name}] AI raised to ${this.gameState.currentBet} ${this.currency} (strength ${handStrength.toFixed(1)})`);
      } else {
        // Call
        const callAmount = Math.min(amountToCall, seat.tableStack);
        seat.tableStack -= callAmount;
        seat.currentBet += callAmount;
        seat.totalContribution = (seat.totalContribution || 0) + callAmount;
        this.gameState.pot += callAmount;
        seat.hasActed = true;

        if (seat.tableStack === 0) seat.isAllIn = true;

        console.log(`[${seat.name}] AI called ${callAmount} ${this.currency} (strength ${handStrength.toFixed(1)})`);
      }
    }
  }

  private makeBasicAIBettingDecision(seat: PiratePlunderSeat): void {
    // Simple fallback AI: call or fold based on hand strength
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
   * Create an AI player for Pirate Plunder with personality profile
   */
  createAIPlayer(): Player {
    // Assign AI profile
    const profile = this.assignAIProfile();

    const uniqueId = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const player: Player = {
      id: uniqueId,
      name: profile.name,
      isAI: true,
      bankroll: 10000 // AI starting bankroll
    };

    if (profile.cosmetics) {
      player.cosmetics = profile.cosmetics;
    }

    return player;
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
      const targetTotalPlayers = this.tableConfig.targetTotalPlayers;
      const neededPlayers = targetTotalPlayers - seatedCount;

      if (neededPlayers > 0) {
        console.log(`[${this.config.tableId}] PVE mode: Adding ${neededPlayers} AI players`);
        const added = this.addAIPlayers(neededPlayers, () => this.createAIPlayer(), this.config.minBuyIn);
        console.log(`[${this.config.tableId}] Added ${added} AI players`);

        // Assign AI profiles to all AI seats
        for (const seat of this.gameState.seats) {
          if (seat && seat.isAI && !seat.aiProfile) {
            seat.aiProfile = this.assignAIProfile();
            console.log(`[${seat.name}] Assigned AI profile: ${seat.aiProfile.style} (risk: ${seat.aiProfile.riskTolerance.toFixed(2)})`);
          }
        }
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
   * Handle lock_select event - player toggling lock on a die
   */
  handleLockSelect(socket: Socket, payload: { index: number }) {
    console.log(`[${this.config.tableId}] lock_select from ${socket.id}:`, payload);

    if (!this.gameState) return;
    if (!['Lock1', 'Lock2', 'Lock3'].includes(this.gameState.phase)) {
      console.log(`[${this.config.tableId}] lock_select ignored - not in Lock phase (${this.gameState.phase})`);
      return;
    }

    const seat = this.gameState.seats.find((s) => s && s.playerId === socket.id);
    if (!seat || seat.hasFolded) {
      console.log(`[${this.config.tableId}] lock_select ignored - player not seated or has folded`);
      return;
    }

    const i = payload?.index ?? -1;
    if (i < 0 || i >= seat.dice.length) {
      console.log(`[${this.config.tableId}] lock_select ignored - invalid index ${i}`);
      return;
    }

    const die = seat.dice[i]!;

    if (die.locked) {
      // Unlocking: check if we can still meet minimum requirements
      const currentLocked = seat.dice.filter(d => d.locked).length;
      const minRequired = seat.minLocksRequired || 1;
      if (currentLocked > minRequired) {
        // Can unlock this die
        seat.dice[i] = { value: die.value, locked: false, isPublic: false };
        seat.lockAllowance = Math.max(0, minRequired - (currentLocked - 1));
        console.log(`[${this.config.tableId}] Unlocked die ${i} (value: ${die.value})`);
      } else {
        console.log(`[${this.config.tableId}] Cannot unlock - already at minimum locks (${minRequired})`);
      }
    } else {
      // Locking: always allowed
      const dieValue = die.value || this.rollDie();
      seat.dice[i] = { value: dieValue, locked: true, isPublic: false };
      const currentLocked = seat.dice.filter(d => d.locked).length;
      const minRequired = seat.minLocksRequired || 1;
      seat.lockAllowance = Math.max(0, minRequired - currentLocked);
      console.log(`[${this.config.tableId}] Locked die ${i} (value: ${dieValue}), ${currentLocked} total locked`);
    }

    // Update which dice are visible to other players
    this.updateDicePublicVisibility(seat);

    // Broadcast updated game state
    this.broadcastGameState();
  }

  /**
   * Handle lock_done event - player confirming their dice locks
   */
  handleLockDone(socket: Socket) {
    console.log(`[${this.config.tableId}] lock_done from ${socket.id}`);

    if (!this.gameState) return;
    if (!['Lock1', 'Lock2', 'Lock3'].includes(this.gameState.phase)) {
      console.log(`[${this.config.tableId}] lock_done ignored - not in Lock phase (${this.gameState.phase})`);
      return;
    }

    const seat = this.gameState.seats.find((s) => s && s.playerId === socket.id);
    if (!seat || seat.hasFolded) {
      console.log(`[${this.config.tableId}] lock_done ignored - player not seated or has folded`);
      return;
    }

    // Check if player has met minimum lock requirements
    const minRequired = seat.minLocksRequired || 1;
    const currentLocked = seat.dice.filter(d => d.locked).length;
    if (currentLocked < minRequired) {
      console.log(`[${this.config.tableId}] lock_done ignored - not enough locks (${currentLocked}/${minRequired})`);
      socket.emit('error', { message: `You must lock at least ${minRequired} dice` });
      return;
    }

    // Mark this player as done with locking
    seat.lockingDone = true;
    console.log(`[${this.config.tableId}] Player marked lock_done (${currentLocked} dice locked)`);

    // Broadcast updated state
    this.broadcastGameState();

    // Phase will advance automatically when all players are done or timer expires
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

    const minHumanPlayers = this.tableConfig.minHumanPlayers;
    const targetTotalPlayers = this.tableConfig.targetTotalPlayers;

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
