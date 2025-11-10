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

// ============================================================
// CONFIGURATION INTERFACES (matching table-config.ts)
// ============================================================

export interface TableSettings {
  minHumanPlayers: number;
  targetTotalPlayers: number;
  maxSeats: number;
  cargoChestLearningMode: boolean;
  tableMinimumMultiplier: number;
}

export interface BettingStreets {
  enabled: boolean;
  S1: number;
  S2: number;
  S3: number;
  s3_multiplier: '1x' | '2x' | '3x';
}

export interface AnteConfig {
  mode: 'none' | 'per_player' | 'button' | 'every_nth';
  amount: number;
  every_nth: number;
  progressive: boolean;
  street_multiplier: number;
}

export interface EdgeTiers {
  enabled: boolean;
  behind: number;
  co: number;
  leader: number;
  dominant: number;
}

export interface BettingConfig {
  streets: BettingStreets;
  ante: AnteConfig;
  edge_tiers: EdgeTiers;
  dominant_threshold: number;
  rounding: number;
}

export interface RolePayouts {
  ship: number;
  captain: number;
  crew: number;
}

export interface RoleRequirements {
  ship: number;
  captain: number;
  crew: number;
}

export interface ComboKicker {
  ship_captain?: number;
  all_three?: number;
}

export interface PayoutsConfig {
  role_payouts: RolePayouts;
  multi_role_allowed: boolean;
  combo_kicker: ComboKicker | null;
  role_requirements: RoleRequirements;
}

export interface LowRankTriggers {
  trips: number;
  quads: number;
  yahtzee: number;
}

export interface HouseConfig {
  rake_percent: number;
  rake_enabled: boolean;
  rake_cap: number;
}

export interface ChestConfig {
  drip_percent: number;
  carryover: boolean;
  unfilled_role_to_chest: number;
  low_rank_triggers: LowRankTriggers;
  trigger_tiebreak: 'rank_then_time' | 'time_then_rank';
}

export interface BustFeeConfig {
  enabled: boolean;
  basis: 'S1' | 'S2' | 'S3' | 'fixed';
  fixed_amount: number;
  to: 'chest' | 'burn';
}

export interface AdvancedConfig {
  ties: 'split_share' | 'reroll_one_die' | 'earliest_leader_priority';
  declare_role: boolean;
  reveal_sequence: number[];
}

export interface PhaseTimers {
  lock_phase_seconds: number;
  betting_phase_seconds: number;
  turn_timeout_seconds: number;
}

export interface GameDelays {
  auto_start_seconds: number;
  payout_display_seconds: number;
  showdown_display_seconds: number;
  hand_end_seconds: number;
  countdown_seconds: number;
}

export interface SessionConfig {
  max_age_days: number;
  reconnect_timeout_minutes: number;
  disconnect_action_timeout_seconds: number;
  disconnect_fold_timeout_seconds: number;
  disconnect_kick_timeout_minutes: number;
}

export interface TimingConfig {
  phase_timers: PhaseTimers;
  delays: GameDelays;
  session: SessionConfig;
}

export interface HistoryConfig {
  max_hands_stored: number;
  recent_display_count: number;
}

export interface DisplayConfig {
  history: HistoryConfig;
}

export interface RulesSectionConfig {
  enabled: boolean;
  weight: number;
  type: 'static' | 'dynamic';
  span: 1 | 2 | 3;
}

export interface RulesDisplayConfig {
  sections: Record<string, RulesSectionConfig>;
}

// Full game configuration
export interface PiratePlunderConfig {
  table: TableSettings;
  betting: BettingConfig;
  payouts: PayoutsConfig;
  house: HouseConfig;
  chest: ChestConfig;
  bust_fee: BustFeeConfig;
  advanced: AdvancedConfig;
  timing: TimingConfig;
  display: DisplayConfig;
  rules_display: RulesDisplayConfig;
}

// Table instance configuration
export interface PiratePlunderTableConfig {
  tableId: string;
  displayName: string;
  mode?: string;          // 'PVE' or 'PVP'
  currency?: string;      // Currency symbol (defaults to 'TC')

  // Backwards-compatible simple fields (deprecated - use fullConfig instead)
  ante?: number;
  minBuyIn?: number;
  maxSeats?: number;
  rake?: number;

  // Full game configuration
  fullConfig?: Partial<PiratePlunderConfig>;
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

// ============================================================
// DEFAULT CONFIGURATION FACTORY
// ============================================================

export function createDefaultPiratePlunderConfig(): PiratePlunderConfig {
  return {
    table: {
      minHumanPlayers: 2,
      targetTotalPlayers: 4,
      maxSeats: 8,
      cargoChestLearningMode: false,
      tableMinimumMultiplier: 2.0
    },
    betting: {
      streets: {
        enabled: false,
        S1: 1,
        S2: 3,
        S3: 6,
        s3_multiplier: '1x'
      },
      ante: {
        mode: 'per_player',
        amount: 1,
        every_nth: 5,
        progressive: false,
        street_multiplier: 1.0
      },
      edge_tiers: {
        enabled: false,
        behind: 0.50,
        co: 0.75,
        leader: 1.00,
        dominant: 1.25
      },
      dominant_threshold: 2,
      rounding: 1
    },
    payouts: {
      role_payouts: {
        ship: 0.40,
        captain: 0.30,
        crew: 0.20
      },
      multi_role_allowed: true,
      combo_kicker: null,
      role_requirements: {
        ship: 1,
        captain: 1,
        crew: 1
      }
    },
    house: {
      rake_percent: 0.05,
      rake_enabled: true,
      rake_cap: 1000
    },
    chest: {
      drip_percent: 0.10,
      carryover: true,
      unfilled_role_to_chest: 0.50,
      low_rank_triggers: {
        trips: 0.30,
        quads: 0.60,
        yahtzee: 1.00
      },
      trigger_tiebreak: 'rank_then_time'
    },
    bust_fee: {
      enabled: true,
      basis: 'S2',
      fixed_amount: 0,
      to: 'chest'
    },
    advanced: {
      ties: 'reroll_one_die',
      declare_role: false,
      reveal_sequence: [1, 2, 3]
    },
    timing: {
      phase_timers: {
        lock_phase_seconds: 30,
        betting_phase_seconds: 30,
        turn_timeout_seconds: 30
      },
      delays: {
        auto_start_seconds: 3,
        payout_display_seconds: 3,
        showdown_display_seconds: 8,
        hand_end_seconds: 3,
        countdown_seconds: 5
      },
      session: {
        max_age_days: 7,
        reconnect_timeout_minutes: 2,
        disconnect_action_timeout_seconds: 30,
        disconnect_fold_timeout_seconds: 30,
        disconnect_kick_timeout_minutes: 3
      }
    },
    display: {
      history: {
        max_hands_stored: 100,
        recent_display_count: 20
      }
    },
    rules_display: {
      sections: {
        role_hierarchy: { enabled: true, weight: 10, type: 'static', span: 2 },
        cargo_chest: { enabled: true, weight: 20, type: 'dynamic', span: 2 },
        locking_rules: { enabled: true, weight: 30, type: 'static', span: 1 },
        betting: { enabled: true, weight: 40, type: 'static', span: 1 },
        bust_fee: { enabled: true, weight: 50, type: 'dynamic', span: 1 },
        edge_tiers: { enabled: true, weight: 60, type: 'dynamic', span: 3 }
      }
    }
  };
}

// Helper function to merge partial config with defaults
function mergeConfig(partial: Partial<PiratePlunderConfig> | undefined): PiratePlunderConfig {
  const defaults = createDefaultPiratePlunderConfig();
  if (!partial) return defaults;

  return {
    table: { ...defaults.table, ...partial.table },
    betting: {
      streets: { ...defaults.betting.streets, ...partial.betting?.streets },
      ante: { ...defaults.betting.ante, ...partial.betting?.ante },
      edge_tiers: { ...defaults.betting.edge_tiers, ...partial.betting?.edge_tiers },
      dominant_threshold: partial.betting?.dominant_threshold ?? defaults.betting.dominant_threshold,
      rounding: partial.betting?.rounding ?? defaults.betting.rounding
    },
    payouts: {
      role_payouts: { ...defaults.payouts.role_payouts, ...partial.payouts?.role_payouts },
      multi_role_allowed: partial.payouts?.multi_role_allowed ?? defaults.payouts.multi_role_allowed,
      combo_kicker: partial.payouts?.combo_kicker ?? defaults.payouts.combo_kicker,
      role_requirements: { ...defaults.payouts.role_requirements, ...partial.payouts?.role_requirements }
    },
    house: { ...defaults.house, ...partial.house },
    chest: {
      ...defaults.chest,
      low_rank_triggers: { ...defaults.chest.low_rank_triggers, ...partial.chest?.low_rank_triggers },
      ...partial.chest
    },
    bust_fee: { ...defaults.bust_fee, ...partial.bust_fee },
    advanced: { ...defaults.advanced, ...partial.advanced },
    timing: {
      phase_timers: { ...defaults.timing.phase_timers, ...partial.timing?.phase_timers },
      delays: { ...defaults.timing.delays, ...partial.timing?.delays },
      session: { ...defaults.timing.session, ...partial.timing?.session }
    },
    display: {
      history: { ...defaults.display.history, ...partial.display?.history }
    },
    rules_display: {
      sections: { ...defaults.rules_display.sections, ...partial.rules_display?.sections }
    }
  };
}

export class PiratePlunderTable extends GameBase {
  private config: PiratePlunderTableConfig;
  private fullConfig: PiratePlunderConfig;  // Merged full configuration
  private namespace: Namespace;
  public gameState: PiratePlunderGameState | null = null;
  private phaseTimer: NodeJS.Timeout | null = null;
  private aiProfiles: AIProfile[] = [];

  constructor(config: PiratePlunderTableConfig, namespace: Namespace) {
    // Merge incoming config with defaults
    const fullConfig = mergeConfig(config.fullConfig);

    // Override with backwards-compatible fields if provided
    if (config.maxSeats !== undefined) fullConfig.table.maxSeats = config.maxSeats;
    if (config.ante !== undefined) fullConfig.betting.ante.amount = config.ante;
    if (config.rake !== undefined) fullConfig.house.rake_percent = config.rake / 100; // Convert percentage to decimal

    // Store full config
    const storedFullConfig = fullConfig;

    // Convert to GameBase TableConfig format
    const tableConfig: TableConfig = {
      minHumanPlayers: config.mode?.toUpperCase() === 'PVE' ? 1 : fullConfig.table.minHumanPlayers,
      targetTotalPlayers: config.mode?.toUpperCase() === 'PVE' ? 5 : fullConfig.table.targetTotalPlayers,
      maxSeats: fullConfig.table.maxSeats,
      currency: config.currency || 'TC',
      betting: {
        ante: {
          mode: fullConfig.betting.ante.mode,
          amount: fullConfig.betting.ante.amount
        }
      }
    };

    super(tableConfig);
    this.config = config;
    this.fullConfig = storedFullConfig;
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

  // ============================================================
  // CONFIG-DEPENDENT HELPER METHODS
  // ============================================================

  /**
   * Process chest drip from wager amount
   * Ported from server.ts:215-262
   */
  private processDripFromWager(wagerAmount: number): { mainPot: number; chestDrip: number } {
    if (!this.gameState) return { mainPot: wagerAmount, chestDrip: 0 };

    const exactDrip = wagerAmount * this.fullConfig.chest.drip_percent;
    const accumulatedDrip = ((this.gameState as any).dripAccumulator || 0) + exactDrip;

    const integerDrip = Math.floor(accumulatedDrip);
    (this.gameState as any).dripAccumulator = accumulatedDrip - integerDrip;

    const mainPotAmount = wagerAmount - integerDrip;
    this.gameState.cargoChest = (this.gameState.cargoChest || 0) + integerDrip;

    console.log(`[${this.config.tableId}] Chest drip: ${integerDrip} from ${wagerAmount} wager (${this.fullConfig.chest.drip_percent * 100}%)`);

    return { mainPot: mainPotAmount, chestDrip: integerDrip };
  }

  /**
   * Calculate house rake with cap
   * Ported from server.ts:5783-5824
   */
  private calculateRake(pot: number): number {
    if (!this.fullConfig.house.rake_enabled) return 0;
    const calculatedRake = Math.floor(pot * this.fullConfig.house.rake_percent);
    return Math.min(calculatedRake, this.fullConfig.house.rake_cap);
  }

  /**
   * Calculate chest award based on low dice trigger
   * Ported from server.ts:5798-5823
   */
  private calculateChestAward(chestAmount: number, lowDiceAnalysis: { type: string; value: number; count: number }): { award: number; carry: number } {
    const triggers = this.fullConfig.chest.low_rank_triggers;
    let percentage = 0;

    if (lowDiceAnalysis.type === 'yahtzee') percentage = triggers.yahtzee;
    else if (lowDiceAnalysis.type === 'quads') percentage = triggers.quads;
    else if (lowDiceAnalysis.type === 'trips') percentage = triggers.trips;

    const award = Math.floor(chestAmount * percentage);
    const carry = chestAmount - award;
    return { award, carry };
  }

  /**
   * Calculate bust fee amount based on configuration
   * Ported from server.ts:5551-5574
   */
  private calculateBustFee(): number {
    if (!this.fullConfig.bust_fee.enabled) return 0;

    let amount = 0;
    switch (this.fullConfig.bust_fee.basis) {
      case 'S1':
        amount = this.fullConfig.betting.streets.S1 * 100;
        break;
      case 'S2':
        amount = this.fullConfig.betting.streets.S2 * 100;
        break;
      case 'S3':
        amount = this.fullConfig.betting.streets.S3 * 100;
        break;
      case 'fixed':
        amount = this.fullConfig.bust_fee.fixed_amount * 100;
        break;
    }

    return amount;
  }

  /**
   * Apply bust fee to player when they fold
   * Fee can go to chest or be burned based on config
   */
  private applyBustFee(playerId: string): void {
    if (!this.gameState) return;

    const fee = this.calculateBustFee();
    if (fee === 0) return;

    const seat = this.gameState.seats.find(s => s?.playerId === playerId);
    if (!seat) return;

    const actualFee = Math.min(fee, seat.tableStack);
    seat.tableStack -= actualFee;

    if (this.fullConfig.bust_fee.to === 'chest') {
      this.gameState.cargoChest = (this.gameState.cargoChest || 0) + actualFee;
      console.log(`[${seat.name}] Bust fee ${actualFee} → Cargo Chest (now ${this.gameState.cargoChest})`);
    } else {
      // 'burn' - just remove from game
      console.log(`[${seat.name}] Bust fee ${actualFee} burned`);
    }
  }

  /**
   * Calculate base bet amount (used as multiplier base for streets)
   * Ported from server.ts:5719-5731
   */
  private calculateBaseBet(): number {
    const anteAmount = this.fullConfig.betting.ante.amount;
    if (anteAmount > 0) return anteAmount;

    // Fallback: 1% of pot or 1 minimum
    if (!this.gameState) return 1;
    return Math.max(1, Math.floor(this.gameState.pot * 0.01));
  }

  /**
   * Get street multiplier for current betting phase
   * Ported from server.ts:5733-5752
   */
  private getStreetMultiplier(): number {
    if (!this.fullConfig.betting.streets.enabled || !this.gameState) return 1;

    switch (this.gameState.phase) {
      case 'Bet1':
        return this.fullConfig.betting.streets.S1;
      case 'Bet2':
        return this.fullConfig.betting.streets.S2;
      case 'Bet3':
        const s3Multiplier = parseInt(this.fullConfig.betting.streets.s3_multiplier.replace('x', ''));
        return this.fullConfig.betting.streets.S3 * s3Multiplier;
      default:
        return 1; // No limits outside betting phases
    }
  }

  /**
   * Apply street limits to bet amount
   * Ported from server.ts:5754-5772
   */
  private applyStreetLimits(requestedAmount: number, seatName: string): number {
    if (!this.fullConfig.betting.streets.enabled) return requestedAmount;

    const baseBet = this.calculateBaseBet();
    const streetMultiplier = this.getStreetMultiplier();
    const streetLimit = baseBet * streetMultiplier;

    const limitedAmount = Math.min(requestedAmount, streetLimit);

    if (limitedAmount !== requestedAmount && this.gameState) {
      console.log(`[${seatName}] Street limit applied: ${requestedAmount} → ${limitedAmount} (${this.gameState.phase} limit: ${streetLimit})`);
    }

    return limitedAmount;
  }

  /**
   * Calculate edge tier for player based on hand strength relative to leader
   * Ported from server.ts:5654-5730
   */
  private calculateEdgeTier(seat: PiratePlunderSeat): 'behind' | 'co' | 'leader' | 'dominant' {
    if (!this.gameState) return 'co';

    const activePlayers = this.gameState.seats.filter(s => s && !s.hasFolded) as PiratePlunderSeat[];
    if (activePlayers.length <= 1) return 'leader';

    // Evaluate all hands
    const handStrengths = activePlayers.map(s => {
      const hand = this.evaluateHand(s.dice);
      return {
        playerId: s.playerId,
        strength: hand.sixCount * 10000 + hand.fiveCount * 1000 + hand.fourCount * 100 + hand.threeCount * 10 + hand.twoCount * 1 + hand.oneCount * 0.1
      };
    });

    const playerStrength = handStrengths.find(h => h.playerId === seat.playerId)?.strength || 0;
    const maxStrength = Math.max(...handStrengths.map(h => h.strength));
    const leadersCount = handStrengths.filter(h => h.strength === maxStrength).length;

    // Leader or co-leader
    if (playerStrength === maxStrength) {
      if (leadersCount === 1) {
        // Check if dominant (ahead by threshold)
        const secondBest = Math.max(...handStrengths.filter(h => h.strength < maxStrength).map(h => h.strength));
        const dominantThreshold = this.fullConfig.betting.dominant_threshold;
        if (playerStrength >= secondBest + dominantThreshold) {
          return 'dominant';
        }
        return 'leader';
      } else {
        return 'co'; // Tied for lead
      }
    }

    // Behind
    return 'behind';
  }

  /**
   * Apply edge tier multiplier to bet amount (discount for weaker hands)
   * Ported from server.ts:5706-5717
   */
  private applyEdgeTierMultiplier(baseAmount: number, seat: PiratePlunderSeat): number {
    if (!this.fullConfig.betting.edge_tiers.enabled) return baseAmount;

    const tier = this.calculateEdgeTier(seat);
    const multiplier = this.fullConfig.betting.edge_tiers[tier];

    return Math.floor(baseAmount * multiplier);
  }

  /**
   * Apply betting rounding to amount
   * Ported from server.ts:5582-5592
   */
  private applyBettingRounding(amount: number): number {
    const rounding = this.fullConfig.betting.rounding;
    if (rounding <= 1) return amount;

    return Math.round(amount / rounding) * rounding;
  }

  /**
   * Calculate comprehensive showdown results with all config features
   * Ported from server.ts:5825-6050
   */
  private calculateShowdownResults(): ShowdownResult[] {
    if (!this.gameState) return [];

    const activePlayers = this.gameState.seats.filter(s => s && !s.hasFolded);
    const grossPot = this.gameState.pot;

    // Calculate rake
    const rake = this.calculateRake(grossPot);
    const netPot = grossPot - rake;

    console.log(`[${this.config.tableId}] Showdown: Gross pot ${grossPot}, Rake ${rake}, Net ${netPot}`);

    // Initialize results
    const results: ShowdownResult[] = activePlayers.map(seat => ({
      playerId: seat.playerId,
      name: seat.name,
      handResult: this.evaluateHand(seat.dice),
      roles: [],
      payout: 0,
      isActive: true
    }));

    // Step 1: Assign roles with requirements
    const roleReqs = this.fullConfig.payouts.role_requirements;
    const maxSixes = Math.max(...results.map(r => r.handResult.sixCount));
    const maxFives = Math.max(...results.map(r => r.handResult.fiveCount));
    const maxFours = Math.max(...results.map(r => r.handResult.fourCount));

    // Ship = Most 6s (unique) AND meets minimum requirement
    const shipCandidates = results.filter(r =>
      r.handResult.sixCount === maxSixes && maxSixes >= roleReqs.ship
    );
    const shipWinner = shipCandidates.length === 1 ? shipCandidates[0] : null;
    if (shipWinner) shipWinner.roles.push('Ship');

    // Captain = Most 5s (unique, not Ship) AND meets minimum requirement
    const captainCandidates = results.filter(r =>
      r.handResult.fiveCount === maxFives && maxFives >= roleReqs.captain && r !== shipWinner
    );
    const captainWinner = captainCandidates.length === 1 ? captainCandidates[0] : null;
    if (captainWinner) captainWinner.roles.push('Captain');

    // Crew = Most 4s (unique, not Ship/Captain) AND meets minimum requirement
    const crewCandidates = results.filter(r =>
      r.handResult.fourCount === maxFours && maxFours >= roleReqs.crew && r !== shipWinner && r !== captainWinner
    );
    const crewWinner = crewCandidates.length === 1 ? crewCandidates[0] : null;
    if (crewWinner) crewWinner.roles.push('Crew');

    // Step 2: Check for chest triggers (trips/quads/yahtzee of low dice)
    if (this.gameState.cargoChest > 0) {
      const chestCandidates = results.map(result => {
        const seat = activePlayers.find(s => s.playerId === result.playerId);
        return {
          result,
          lowDiceAnalysis: this.analyzeLowDice(seat?.dice || []),
          timestamp: Date.now()
        };
      }).filter(c => c.lowDiceAnalysis !== null);

      // Find best chest trigger (using tiebreak mode)
      if (chestCandidates.length > 0) {
        const tiebreakMode = this.fullConfig.chest.trigger_tiebreak;
        const chestWinner = this.resolveChestTriggerWinner(chestCandidates, tiebreakMode);

        if (chestWinner && chestWinner.lowDiceAnalysis) {
          const { award } = this.calculateChestAward(this.gameState.cargoChest, chestWinner.lowDiceAnalysis);
          chestWinner.result.payout += award;
          this.gameState.cargoChest -= award;
          if (this.gameState.cargoChest < 0) this.gameState.cargoChest = 0;

          console.log(`[${chestWinner.result.name}] Won ${award} from chest for ${chestWinner.lowDiceAnalysis.type}`);
        }
      }
    }

    // Step 3: Calculate role payouts
    const rolePayouts = this.fullConfig.payouts.role_payouts;
    let shipPayout = Math.floor(netPot * rolePayouts.ship);
    let captainPayout = Math.floor(netPot * rolePayouts.captain);
    let crewPayout = Math.floor(netPot * rolePayouts.crew);

    // Handle vacant roles with chest funnel
    if (!crewWinner) {
      const toChest = Math.floor(crewPayout * this.fullConfig.chest.unfilled_role_to_chest);
      this.gameState.cargoChest = (this.gameState.cargoChest || 0) + toChest;
      const remainder = crewPayout - toChest;
      // Remainder goes to carryover for next hand
      crewPayout = 0;
      console.log(`[Vacant Crew] ${toChest} to chest, ${remainder} to carryover`);
    }

    if (!captainWinner) {
      const toChest = Math.floor(captainPayout * this.fullConfig.chest.unfilled_role_to_chest);
      this.gameState.cargoChest = (this.gameState.cargoChest || 0) + toChest;
      const remainder = captainPayout - toChest;
      if (shipWinner) {
        shipPayout += remainder;
      }
      captainPayout = 0;
      console.log(`[Vacant Captain] ${toChest} to chest, ${remainder} to ship`);
    }

    if (!shipWinner) {
      const toChest = Math.floor(shipPayout * this.fullConfig.chest.unfilled_role_to_chest);
      this.gameState.cargoChest = (this.gameState.cargoChest || 0) + toChest;
      shipPayout = 0;
      console.log(`[Vacant Ship] ${toChest} to chest`);
    }

    // Award payouts
    if (shipWinner) shipWinner.payout += shipPayout;
    if (captainWinner) captainWinner.payout += captainPayout;
    if (crewWinner) crewWinner.payout += crewPayout;

    return results;
  }

  /**
   * Resolve chest trigger winner using tiebreak mode
   */
  private resolveChestTriggerWinner(
    candidates: Array<{ result: ShowdownResult; lowDiceAnalysis: { type: string; value: number; count: number } | null; timestamp: number }>,
    tiebreakMode: 'rank_then_time' | 'time_then_rank'
  ): { result: ShowdownResult; lowDiceAnalysis: { type: string; value: number; count: number } | null; timestamp: number } | null {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0] || null;

    // Rank values: yahtzee > quads > trips
    const rankValue = (type: string) => {
      if (type === 'yahtzee') return 3;
      if (type === 'quads') return 2;
      if (type === 'trips') return 1;
      return 0;
    };

    let best = candidates[0];
    if (!best) return null;

    if (tiebreakMode === 'rank_then_time') {
      // Best trigger type first, then earliest timestamp
      for (const curr of candidates.slice(1)) {
        const bestRank = best.lowDiceAnalysis ? rankValue(best.lowDiceAnalysis.type) : 0;
        const currRank = curr.lowDiceAnalysis ? rankValue(curr.lowDiceAnalysis.type) : 0;

        if (currRank > bestRank || (currRank === bestRank && curr.timestamp < best.timestamp)) {
          best = curr;
        }
      }
    } else {
      // Earliest timestamp first, then best trigger type
      for (const curr of candidates.slice(1)) {
        if (curr.timestamp < best.timestamp) {
          best = curr;
        } else if (curr.timestamp === best.timestamp) {
          const bestRank = best.lowDiceAnalysis ? rankValue(best.lowDiceAnalysis.type) : 0;
          const currRank = curr.lowDiceAnalysis ? rankValue(curr.lowDiceAnalysis.type) : 0;
          if (currRank > bestRank) {
            best = curr;
          }
        }
      }
    }

    return best;
  }

  /**
   * Analyze low dice (1s, 2s, 3s) for cargo chest triggers
   */
  private analyzeLowDice(dice: Die[]): { type: string; value: number; count: number } | null {
    const counts = [0, 0, 0, 0]; // indices 0-3 for values 0-3 (0 unused)
    for (const die of dice) {
      if (die.value >= 1 && die.value <= 3) {
        const idx = die.value;
        counts[idx] = (counts[idx] || 0) + 1;
      }
    }

    // Check for Yahtzee (5 of same low value)
    for (let val = 1; val <= 3; val++) {
      if (counts[val] === 5) {
        return { type: 'yahtzee', value: val, count: 5 };
      }
    }

    // Check for Quads (4 of same low value)
    for (let val = 1; val <= 3; val++) {
      if (counts[val] === 4) {
        return { type: 'quads', value: val, count: 4 };
      }
    }

    // Check for Trips (3 of same low value)
    for (let val = 1; val <= 3; val++) {
      if (counts[val] === 3) {
        return { type: 'trips', value: val, count: 3 };
      }
    }

    return null;
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
          this.gameState.phaseEndsAtMs = Date.now() + (this.fullConfig.timing.phase_timers.turn_timeout_seconds * 1000);
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
      defaultBuyIn: this.config.minBuyIn || (this.fullConfig.betting.ante.amount * 5)
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

    // Collect antes based on configuration
    // Ported from server.ts:6798-6872
    const anteConfig = this.fullConfig.betting.ante;

    if (anteConfig.mode !== 'none') {
      for (const seat of this.gameState.seats) {
        if (!seat) continue;

        let shouldPayAnte = false;

        switch (anteConfig.mode) {
          case 'per_player':
            shouldPayAnte = true;
            break;
          case 'button':
            // First player pays (button tracking not implemented)
            shouldPayAnte = seat === this.gameState.seats[0];
            break;
          case 'every_nth':
            // Pay ante every nth hand
            const handNumber = this.gameState.handCount || 0;
            shouldPayAnte = handNumber > 0 && handNumber % anteConfig.every_nth === 0;
            break;
        }

        if (shouldPayAnte) {
          const anteAmount = anteConfig.amount;
          const amt = Math.min(seat.tableStack, anteAmount);
          seat.tableStack -= amt;

          // Process drip to cargo chest for antes
          const { mainPot, chestDrip } = this.processDripFromWager(amt);
          this.gameState.pot += mainPot;
          seat.totalContribution = amt;

          const streetInfo = anteConfig.progressive ? ' (progressive)' : '';
          console.log(`[${seat.name}] Paid ante: ${amt} ${this.currency} (mode: ${anteConfig.mode}${streetInfo}, drip: ${chestDrip})`);

          if (seat.tableStack === 0) {
            seat.isAllIn = true;
          }
        } else {
          seat.totalContribution = 0;
          console.log(`[${seat.name}] No ante required (mode: ${anteConfig.mode})`);
        }
      }
    } else {
      // No ante mode - initialize totalContribution to 0
      for (const seat of this.gameState.seats) {
        if (seat) {
          seat.totalContribution = 0;
          console.log(`[${seat.name}] No ante required (mode: none)`);
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

    // Set phase timer for frontend progress bar (from config)
    this.gameState.phaseEndsAtMs = Date.now() + (this.fullConfig.timing.phase_timers.lock_phase_seconds * 1000);

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

    this.gameState.phaseEndsAtMs = Date.now() + (this.fullConfig.timing.phase_timers.betting_phase_seconds * 1000);

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

    // Use comprehensive showdown calculation with all config features
    this.gameState.showdownResults = this.calculateShowdownResults();
    this.broadcastGameState();

    // Move to payout after configured delay
    const delay = this.fullConfig.timing.delays.showdown_display_seconds * 1000;
    setTimeout(() => {
      if (!this.gameState) return;
      this.gameState.phase = 'Payout';
      this.onEnterPhase();
    }, delay);
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
      // Apply edge tier discount (weaker hands pay less)
      const discountedAmount = this.applyEdgeTierMultiplier(amountToCall, seat);
      const roundedAmount = this.applyBettingRounding(discountedAmount);
      const betAmount = Math.min(roundedAmount, seat.tableStack);

      // Log edge tier discount if applied
      if (discountedAmount !== amountToCall) {
        const tier = this.calculateEdgeTier(seat);
        console.log(`[${seat.name}] Edge tier ${tier}: ${amountToCall} → ${discountedAmount} → ${roundedAmount} (${Math.round((roundedAmount/amountToCall)*100)}%)`);
      }

      seat.tableStack -= betAmount;
      seat.currentBet += betAmount;

      // Apply chest drip to call
      const { mainPot, chestDrip } = this.processDripFromWager(betAmount);
      this.gameState.pot += mainPot;

      if (seat.tableStack === 0) seat.isAllIn = true;
      seat.hasActed = true;

      console.log(`[${seat.name}] Called ${betAmount} ${this.currency} (drip: ${chestDrip})`);
    } else if (action === 'raise' && raiseAmount) {
      // Apply street limits and rounding to raise amount
      const streetLimitedRaise = this.applyStreetLimits(raiseAmount, seat.name);
      const roundedRaise = this.applyBettingRounding(streetLimitedRaise);
      const totalBet = amountToCall + roundedRaise;
      const betAmount = Math.min(totalBet, seat.tableStack);

      seat.tableStack -= betAmount;
      seat.currentBet += betAmount;

      // Apply chest drip to raise
      const { mainPot, chestDrip } = this.processDripFromWager(betAmount);
      this.gameState.pot += mainPot;
      this.gameState.currentBet = seat.currentBet;

      if (seat.tableStack === 0) seat.isAllIn = true;
      seat.hasActed = true;

      // Reset hasActed for other players since bet increased
      for (const s of this.gameState.seats) {
        if (s && s.playerId !== playerId) s.hasActed = false;
      }

      console.log(`[${seat.name}] Raised to ${this.gameState.currentBet} ${this.currency} (drip: ${chestDrip})`);
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

    // Apply bust fee if configured
    this.applyBustFee(playerId);

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

    const minBuyIn = this.config.minBuyIn || (this.fullConfig.betting.ante.amount * 5);
    const { seatIndex, buyInAmount = minBuyIn } = payload;

    // Validate buy-in amount
    if (buyInAmount < minBuyIn) {
      socket.emit('error', `Minimum buy-in is ${minBuyIn} ${this.currency}`);
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
