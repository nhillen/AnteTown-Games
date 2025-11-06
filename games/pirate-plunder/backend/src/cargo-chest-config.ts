// Progressive Cargo Chest Configuration
export interface CargoChestConfig {
  pots: {
    rake_percent_main: number;           // house rake on main pot
    drip_percent_to_chest: number;       // % of each wager diverted to Cargo Chest
  };
  roles: {
    base_split: { 
      ship: number; 
      captain: number; 
      crew: number; 
    };
    vacancy_to_chest_enabled: boolean;
    vacancy_to_chest_fraction: number;   // send 1/2 of any unfilled share to Chest
  };
  stamps: {
    required: number;                    // stamps needed to be Chest-eligible
    window_hands: number;                // last N hands at THIS table
    award_rule: string;                  // "any_contribution" - one stamp per hand with any bet/call/raise
    fresh_table_fallback: boolean;       // allow payout if everyone under threshold
    fresh_threshold: number;             // if max stamps at table <= 1, allow payout
  };
  chest_awards: {
    trips_percent: number;               // 30% of chest for trips
    quads_percent: number;               // 60% of chest for quads
    yahtzee_percent: number;             // 100% of chest for yahtzee
  };
}

export const defaultCargoChestConfig: CargoChestConfig = {
  pots: {
    rake_percent_main: 0.05,
    drip_percent_to_chest: 0.10
  },
  roles: {
    base_split: { 
      ship: 0.50, 
      captain: 0.30, 
      crew: 0.20 
    },
    vacancy_to_chest_enabled: true,
    vacancy_to_chest_fraction: 0.5
  },
  stamps: {
    required: 2,
    window_hands: 5,
    award_rule: "any_contribution",
    fresh_table_fallback: true,
    fresh_threshold: 1
  },
  chest_awards: {
    trips_percent: 0.30,
    quads_percent: 0.60,
    yahtzee_percent: 1.00
  }
};

// Stamp tracking for players
export interface PlayerStamps {
  playerId: string;
  tableId: string;
  stamps: boolean[];  // rolling window of last N hands
  currentCount: number;
}

// Low dice analysis for chest awards
export interface LowDiceResult {
  type: 'yahtzee' | 'quads' | 'trips' | 'none';
  value: number;  // the dice value (1, 2, or 3)
  count: number;  // how many of that value
  totalLowDice: number;  // total 1s, 2s, 3s for tiebreaking
}

export function analyzeLowDice(dice: { value: number }[]): LowDiceResult {
  const lowDice = dice.filter(d => d.value >= 1 && d.value <= 3);
  const counts = { 1: 0, 2: 0, 3: 0 };
  
  lowDice.forEach(die => {
    counts[die.value as 1 | 2 | 3]++;
  });
  
  // Check for combinations (highest first)
  for (const value of [3, 2, 1]) {
    const count = counts[value as 1 | 2 | 3];
    if (count >= 5) return { type: 'yahtzee', value, count, totalLowDice: lowDice.length };
    if (count >= 4) return { type: 'quads', value, count, totalLowDice: lowDice.length };
    if (count >= 3) return { type: 'trips', value, count, totalLowDice: lowDice.length };
  }
  
  return { type: 'none', value: 0, count: 0, totalLowDice: lowDice.length };
}

export function calculateChestAward(
  chestAmount: number, 
  result: LowDiceResult, 
  config: CargoChestConfig
): { award: number; carry: number } {
  let percentage = 0;
  
  switch (result.type) {
    case 'yahtzee':
      percentage = config.chest_awards.yahtzee_percent;
      break;
    case 'quads':
      percentage = config.chest_awards.quads_percent;
      break;
    case 'trips':
      percentage = config.chest_awards.trips_percent;
      break;
    default:
      percentage = 0;
  }
  
  const award = Math.floor(chestAmount * percentage);
  const carry = chestAmount - award;
  
  return { award, carry };
}

export interface ChestTriggerCandidate {
  playerId: string;
  name: string;
  lowDiceAnalysis: LowDiceResult;
  handTimestamp?: number; // For time-based tiebreaking
}

export function resolveChestTriggerTiebreaker(
  candidates: ChestTriggerCandidate[],
  tiebreakMode: 'rank_then_time' | 'time_then_rank'
): ChestTriggerCandidate | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0] || null;
  
  // Filter to only candidates with actual triggers
  const validCandidates = candidates.filter(c => c.lowDiceAnalysis.type !== 'none');
  if (validCandidates.length === 0) return null;
  if (validCandidates.length === 1) return validCandidates[0] || null;
  
  // Find the best trigger type
  const triggerRanks = { 'yahtzee': 3, 'quads': 2, 'trips': 1, 'none': 0 };
  const bestTriggerRank = Math.max(...validCandidates.map(c => triggerRanks[c.lowDiceAnalysis.type]));
  const bestTriggerCandidates = validCandidates.filter(c => triggerRanks[c.lowDiceAnalysis.type] === bestTriggerRank);
  
  if (bestTriggerCandidates.length === 1) return bestTriggerCandidates[0] || null;
  
  // Handle ties between same trigger types
  if (tiebreakMode === 'rank_then_time') {
    // First tiebreaker: Higher dice value (3s > 2s > 1s)
    const maxValue = Math.max(...bestTriggerCandidates.map(c => c.lowDiceAnalysis.value));
    const valueWinners = bestTriggerCandidates.filter(c => c.lowDiceAnalysis.value === maxValue);
    
    if (valueWinners.length === 1) return valueWinners[0] || null;
    
    // Second tiebreaker: More dice of that value
    const maxCount = Math.max(...valueWinners.map(c => c.lowDiceAnalysis.count));
    const countWinners = valueWinners.filter(c => c.lowDiceAnalysis.count === maxCount);
    
    if (countWinners.length === 1) return countWinners[0] || null;
    
    // Final tiebreaker: Earliest timestamp
    const timestampWinners = countWinners.filter(c => c.handTimestamp !== undefined);
    if (timestampWinners.length > 0) {
      return timestampWinners.reduce((earliest, current) => 
        (current.handTimestamp! < earliest.handTimestamp!) ? current : earliest
      );
    }
    
    return countWinners[0] || null; // Fallback to first if no timestamps
  } else {
    // time_then_rank: Earliest timestamp first
    const timestampWinners = bestTriggerCandidates.filter(c => c.handTimestamp !== undefined);
    if (timestampWinners.length > 0) {
      const earliest = timestampWinners.reduce((earliest, current) => 
        (current.handTimestamp! < earliest.handTimestamp!) ? current : earliest
      );
      
      // If multiple have same timestamp, fall back to rank-based tiebreaking
      const sameTimeWinners = timestampWinners.filter(c => c.handTimestamp === earliest.handTimestamp);
      if (sameTimeWinners.length === 1) return earliest;
      
      // Apply rank-based tiebreaking for same timestamp
      const maxValue = Math.max(...sameTimeWinners.map(c => c.lowDiceAnalysis.value));
      const valueWinners = sameTimeWinners.filter(c => c.lowDiceAnalysis.value === maxValue);
      
      if (valueWinners.length === 1) return valueWinners[0] || null;
      
      const maxCount = Math.max(...valueWinners.map(c => c.lowDiceAnalysis.count));
      const countWinners = valueWinners.filter(c => c.lowDiceAnalysis.count === maxCount);
      
      return countWinners[0] || null;
    }
    
    return bestTriggerCandidates[0] || null; // Fallback if no timestamps
  }
}