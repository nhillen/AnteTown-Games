// Table Configuration Types for Pirate Plunder

export interface TableConfigMetadata {
  version: string;
  description: string;
  lastModified: string;
}

export interface TableSettings {
  minHumanPlayers: number;
  targetTotalPlayers: number;
  maxSeats: number;
  cargoChestLearningMode: boolean;
  tableMinimumMultiplier: number; // Multiplier of minimum table stack required to sit down
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
  amount: number; // Amount in pennies (e.g., 100 = $1.00)
  every_nth: number;
  progressive: boolean; // Enable progressive antes that grow per street
  street_multiplier: number; // Amount to add per street in pennies (e.g., 100 = $1.00 increase per street)
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
  role_requirements?: RoleRequirements;
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
  disconnect_action_timeout_seconds: number;  // Time to wait before taking default action (30s)
  disconnect_fold_timeout_seconds: number;    // Time to wait before folding player (30s + action time)
  disconnect_kick_timeout_minutes: number;    // Time to wait before kicking from seat (3min)
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

export interface AIHandStrengthWeights {
  ship_multiplier: number;  // Weight for 6s (Ship role)
  captain_multiplier: number;  // Weight for 5s (Captain role)
  crew_multiplier: number;  // Weight for 4s (Crew role)
  cargo_multiplier: number;  // Bonus for low dice (cargo chest triggers)
  bet1_phase_modifier: number;  // Multiplier for Bet1 phase (conservative)
  bet3_phase_modifier: number;  // Multiplier for Bet3 phase (aggressive)
}

export interface AIBettingThresholds {
  bluff_modifier: number;  // Strength bonus when bluffing
  mistake_penalty: number;  // Strength penalty for mistakes
  fold_threshold_offset: number;  // Added to profile.foldThreshold for strong hands
  strong_hand_offset: number;  // Added to profile.foldThreshold for raises
  max_raises_per_round: number;  // Maximum raises allowed per betting round
}

export interface AIStackDecisions {
  fold_stack_threshold: number;  // Fold if call > this fraction of stack (e.g., 0.2 = 20%)
  allin_stack_threshold: number;  // Consider all-in if call > this fraction (e.g., 0.3 = 30%)
  risk_adjustment: number;  // Multiplier for profile.riskTolerance when raising (e.g., 0.7)
}

export interface AIBetSizing {
  bet_pot_multiplier: number;  // Multiplier for pot when betting (e.g., 0.1 = 10% pot)
  raise_pot_multiplier: number;  // Multiplier for pot when raising (e.g., 0.15 = 15% pot)
}

export interface AIBehaviorConfig {
  hand_strength: AIHandStrengthWeights;
  betting_thresholds: AIBettingThresholds;
  stack_decisions: AIStackDecisions;
  bet_sizing: AIBetSizing;
}

export interface RulesSectionConfig {
  enabled: boolean;
  weight: number;
  type: 'static' | 'dynamic';
  span: 1 | 2 | 3; // Grid column span: 1=small, 2=medium, 3=full width
}

export interface RulesDisplayConfig {
  sections: Record<string, RulesSectionConfig>;
}

export interface PresetConfig {
  name: string;
  description: string;
  config: Partial<TableConfigData>;
}

export interface TableConfigData {
  table: TableSettings;
  betting: BettingConfig;
  payouts: PayoutsConfig;
  house: HouseConfig;
  chest: ChestConfig;
  bust_fee: BustFeeConfig;
  advanced: AdvancedConfig;
  timing: TimingConfig;
  display: DisplayConfig;
  ai_behavior: AIBehaviorConfig;
  rules_display: RulesDisplayConfig;
}

export interface TableConfig {
  _metadata: TableConfigMetadata;
  table: TableSettings;
  betting: BettingConfig;
  payouts: PayoutsConfig;
  house: HouseConfig;
  chest: ChestConfig;
  bust_fee: BustFeeConfig;
  advanced: AdvancedConfig;
  timing: TimingConfig;
  display: DisplayConfig;
  ai_behavior: AIBehaviorConfig;
  rules_display: RulesDisplayConfig;
  presets: Record<string, PresetConfig>;
}

// Validation functions
export function validateTableConfig(config: any): config is TableConfig {
  try {
    // Basic structure validation
    if (!config._metadata || !config.table || !config.betting) {
      return false;
    }

    // Validate table settings
    const table = config.table;
    if (typeof table.minHumanPlayers !== 'number' || table.minHumanPlayers < 1) {
      return false;
    }
    if (typeof table.targetTotalPlayers !== 'number' || table.targetTotalPlayers < table.minHumanPlayers) {
      return false;
    }
    if (typeof table.maxSeats !== 'number' || table.maxSeats < table.targetTotalPlayers) {
      return false;
    }
    if (typeof table.tableMinimumMultiplier !== 'number' || table.tableMinimumMultiplier < 1.0) {
      return false;
    }

    // Validate betting streets
    const streets = config.betting.streets;
    if (!streets || typeof streets.S1 !== 'number' || typeof streets.S2 !== 'number' || typeof streets.S3 !== 'number') {
      return false;
    }
    if (!['1x', '2x', '3x'].includes(streets.s3_multiplier)) {
      return false;
    }

    // Validate ante mode
    const ante = config.betting.ante;
    if (!ante || !['none', 'per_player', 'button', 'every_nth'].includes(ante.mode)) {
      return false;
    }

    // Validate edge tiers
    const edges = config.betting.edge_tiers;
    if (!edges || typeof edges.behind !== 'number' || typeof edges.co !== 'number' || 
        typeof edges.leader !== 'number' || typeof edges.dominant !== 'number') {
      return false;
    }

    // Validate role payouts sum to reasonable total (should be <= 1.0)
    const payouts = config.payouts?.role_payouts;
    if (payouts) {
      const total = payouts.ship + payouts.captain + payouts.crew;
      if (total > 1.0) {
        return false;
      }
    }

    return true;
  } catch (error) {
    return false;
  }
}

// Default configuration factory
export function createDefaultConfig(): TableConfig {
  return {
    _metadata: {
      version: "1.0.0",
      description: "Default table configuration for Pirate Plunder game",
      lastModified: new Date().toISOString()
    },
    table: {
      minHumanPlayers: 2,
      targetTotalPlayers: 4,
      maxSeats: 8,
      cargoChestLearningMode: false,
      tableMinimumMultiplier: 2.0  // Require 2x minimum table stack to sit down
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
        mode: 'none',
        amount: 0,
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
    ai_behavior: {
      hand_strength: {
        ship_multiplier: 2.0,
        captain_multiplier: 1.5,
        crew_multiplier: 1.2,
        cargo_multiplier: 0.5,
        bet1_phase_modifier: 0.8,
        bet3_phase_modifier: 1.2
      },
      betting_thresholds: {
        bluff_modifier: 2.0,
        mistake_penalty: 1.0,
        fold_threshold_offset: 2.0,
        strong_hand_offset: 3.0,
        max_raises_per_round: 4
      },
      stack_decisions: {
        fold_stack_threshold: 0.2,
        allin_stack_threshold: 0.3,
        risk_adjustment: 0.7
      },
      bet_sizing: {
        bet_pot_multiplier: 0.1,
        raise_pot_multiplier: 0.15
      }
    },
    rules_display: {
      sections: {
        role_hierarchy: {
          enabled: true,
          weight: 10,
          type: 'static',
          span: 2
        },
        cargo_chest: {
          enabled: true,
          weight: 20,
          type: 'dynamic',
          span: 2
        },
        locking_rules: {
          enabled: true,
          weight: 30,
          type: 'static',
          span: 1
        },
        betting: {
          enabled: true,
          weight: 40,
          type: 'static',
          span: 1
        },
        bust_fee: {
          enabled: true,
          weight: 50,
          type: 'dynamic',
          span: 1
        },
        edge_tiers: {
          enabled: true,
          weight: 60,
          type: 'dynamic',
          span: 3
        }
      }
    },
    presets: {}
  };
}