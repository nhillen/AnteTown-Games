import { PokerRulesEngine, GameVariant, PotWinResult } from './RulesEngine.js';
import { HOLDEM_RULES } from './holdem.js';

/**
 * Squidz Game Configuration
 */
export interface SquidzConfig {
  baseSquidValueType: 'flat' | 'bigBlind';  // Either flat amount or BB multiplier
  baseSquidValue: number;                    // If flat: pennies, if bigBlind: multiplier
  squidzFormula?: string;                    // Formula for squidz count (default: 'players + 3')
  squidzCount?: number;                      // Alternative: fixed number of squidz
}

export const DEFAULT_SQUIDZ_CONFIG: SquidzConfig = {
  baseSquidValueType: 'bigBlind',   // Use big blind as base
  baseSquidValue: 1,                // 1x BB per squid (1-2 squidz)
  squidzFormula: 'players + 3',     // Default formula
};

/**
 * Squidz Game Rules
 *
 * Special mechanics:
 * - Fixed number of players (no joining mid-round)
 * - Squidz pool = players + 3
 * - Pot winner gets 1 squid
 * - Round ends when all squidz distributed OR only 1 player has squidz
 * - Bounty system: Players with no squidz pay everyone who has squidz
 * - Hand reveal: Hole cards revealed on 1st, 3rd, and 5th squid
 * - Squid values scale (each):
 *   - 1-2 squidz: $5 each (e.g., 2 squidz = $10 total)
 *   - 3-4 squidz: $10 each (e.g., 3 squidz = $30 total)
 *   - 5+ squidz: $15 each (e.g., 5 squidz = $75 total)
 */
export const SQUIDZ_GAME_RULES: PokerRulesEngine = {
  variant: 'squidz-game' as GameVariant,
  modifiers: {
    holeCardCount: 2,
    noLimit: true,
  },

  hooks: {
    // Inherit all standard Hold'em rules
    ...HOLDEM_RULES.hooks,

    /**
     * Initialize Squidz round when first hand starts
     */
    onRoundStart: (context) => {
      const { playerCount, gameState, tableConfig } = context;

      // Check if we need to start a new round
      if (!gameState.isSquidzRound) {
        // Get squidz config from table config or use defaults
        const squidzConfig = tableConfig.rules.squidzConfig
          ? { ...DEFAULT_SQUIDZ_CONFIG, ...tableConfig.rules.squidzConfig }
          : DEFAULT_SQUIDZ_CONFIG;

        const totalSquidz = getTotalSquidzCount(playerCount, squidzConfig);

        console.log(`🦑 Starting Squidz Game round with ${playerCount} players, ${totalSquidz} squidz in play`);

        // Initialize squid counts for all players
        context.seatedPlayers.forEach(seat => {
          seat.squidCount = 0;
          seat.handsRevealed = false;
        });

        return {
          lockTable: true,
          customData: {
            isSquidzRound: true,
            totalSquidz,
            squidzDistributed: 0,
          }
        };
      }

      return {};
    },

    /**
     * Award squid to pot winner and check for hand reveals
     */
    onPotWin: (context) => {
      const { winner, gameState } = context;

      if (!gameState.isSquidzRound) return {};

      // Award squid
      winner.squidCount = (winner.squidCount || 0) + 1;
      gameState.squidzDistributed = (gameState.squidzDistributed || 0) + 1;

      console.log(`🦑 ${winner.name} wins a squid! (${winner.squidCount} total, ${gameState.squidzDistributed}/${gameState.totalSquidz} distributed)`);

      // Check for hand reveal milestones
      const shouldReveal = shouldRevealHand(winner.squidCount);
      if (shouldReveal) {
        winner.handsRevealed = true;
        console.log(`🦑 ${winner.name}'s hands are now revealed to all players!`);
      }

      // Check if round should end
      const squidCounts = context.gameState.seats
        .filter((s: any) => s !== null && s.tableStack > 0)
        .map((s: any) => s.squidCount || 0);

      const roundEnd = shouldEndSquidzRound(
        squidCounts,
        gameState.squidzDistributed || 0,
        gameState.totalSquidz || 0
      );

      if (roundEnd.shouldEnd) {
        const result: PotWinResult = {
          shouldRevealHands: shouldReveal,
          shouldEndRound: true
        };
        if (roundEnd.reason) {
          result.customMessage = roundEnd.reason;
        }
        return result;
      }

      return {
        shouldRevealHands: shouldReveal
      };
    },

    /**
     * Handle bounty payouts at end of round
     */
    onRoundEnd: (context) => {
      const { gameState, seatedPlayers, tableConfig } = context;

      if (!gameState.isSquidzRound) return {};

      console.log(`🦑 Processing Squidz Game bounty payouts...`);

      // Get squidz config from table config or use defaults
      const squidzConfig = tableConfig.rules.squidzConfig
        ? { ...DEFAULT_SQUIDZ_CONFIG, ...tableConfig.rules.squidzConfig }
        : DEFAULT_SQUIDZ_CONFIG;

      // Separate winners and losers
      const playersWithSquidz = seatedPlayers.filter(s => (s.squidCount || 0) > 0);
      const playersWithoutSquidz = seatedPlayers.filter(s => (s.squidCount || 0) === 0);

      const sidePotPayments: any[] = [];

      if (playersWithSquidz.length === 0 || playersWithoutSquidz.length === 0) {
        console.log(`🦑 No bounty payouts needed (${playersWithSquidz.length} winners, ${playersWithoutSquidz.length} losers)`);
      } else {
        console.log(`🦑 Bounty payout: ${playersWithoutSquidz.length} losers will pay ${playersWithSquidz.length} winners`);

        // Calculate and generate payment requests (payments come from side pot)
        playersWithSquidz.forEach(winner => {
          const squidCount = winner.squidCount || 0;
          const bountyPerLoser = calculateBountyPerPlayer(squidCount, squidzConfig, tableConfig.bigBlind);

          console.log(`🦑 ${winner.name} has ${squidCount} squidz (value: $${bountyPerLoser / 100} per loser)`);

          playersWithoutSquidz.forEach(loser => {
            // Payment comes from side pot
            sidePotPayments.push({
              fromPlayerId: loser.playerId,
              toPlayerId: winner.playerId,
              amount: bountyPerLoser,
              reason: `Squidz bounty: ${squidCount} squids`
            });

            console.log(`🦑   ${loser.name} will pay $${bountyPerLoser / 100} from side pot to ${winner.name}`);
          });
        });
      }

      // Reset round state
      seatedPlayers.forEach(seat => {
        delete seat.squidCount;
        delete seat.handsRevealed;
      });

      console.log(`🦑 Squidz Game round complete!`);

      return {
        delayNextRound: 5000, // 5 second delay to show results
        shouldResetTable: true,
        customMessage: 'Squidz round complete - starting new round',
        sidePotPayments  // Return payments to be processed from side pots
      };
    },

    /**
     * Prevent players from joining during active round
     */
    canPlayerJoin: (gameState) => {
      if (gameState.roundLocked) {
        return {
          allowed: false,
          reason: 'Cannot join during an active Squidz Game round. Please wait for the round to finish.'
        };
      }
      return { allowed: true };
    },

    /**
     * Check if table should be locked
     */
    shouldLockTable: (gameState) => {
      return gameState.isSquidzRound || false;
    },
  },
};

/**
 * Calculate squid value based on count
 * Escalation: 1-2 squidz = 1x, 3-4 squidz = 2x, 5+ squidz = 3x
 */
export function calculateSquidValue(
  squidCount: number,
  config: SquidzConfig = DEFAULT_SQUIDZ_CONFIG,
  bigBlind: number = 100
): number {
  if (squidCount === 0) return 0;

  let baseValue: number;
  if (config.baseSquidValueType === 'bigBlind') {
    baseValue = config.baseSquidValue * bigBlind;
  } else {
    baseValue = config.baseSquidValue;
  }

  // Escalation multiplier
  let multiplier: number;
  if (squidCount >= 5) {
    multiplier = 3; // 3x base value for 5+ squidz
  } else if (squidCount >= 3) {
    multiplier = 2; // 2x base value for 3-4 squidz
  } else {
    multiplier = 1; // 1x base value for 1-2 squidz
  }

  return squidCount * baseValue * multiplier;
}

/**
 * Calculate total bounty a player should receive
 * Returns amount per losing player
 */
export function calculateBountyPerPlayer(
  squidCount: number,
  config: SquidzConfig = DEFAULT_SQUIDZ_CONFIG,
  bigBlind: number = 100
): number {
  return calculateSquidValue(squidCount, config, bigBlind);
}

/**
 * Check if hand should be revealed at this squid milestone
 */
export function shouldRevealHand(squidCount: number): boolean {
  return squidCount === 1 || squidCount === 3 || squidCount === 5;
}

/**
 * Calculate total squidz in play for a game
 */
export function getTotalSquidzCount(playerCount: number, config?: SquidzConfig): number {
  if (!config) {
    return playerCount + 3;
  }

  // If fixed count specified, use that
  if (config.squidzCount !== undefined) {
    return config.squidzCount;
  }

  // Otherwise use formula (default: 'players + 3')
  const formula = config.squidzFormula || 'players + 3';

  // Simple formula parser for 'players + N' or 'players * N'
  if (formula.includes('+')) {
    const parts = formula.split('+').map(s => s.trim());
    const modifier = parseInt(parts[1], 10);
    return playerCount + (isNaN(modifier) ? 3 : modifier);
  } else if (formula.includes('*')) {
    const parts = formula.split('*').map(s => s.trim());
    const multiplier = parseFloat(parts[1]);
    return Math.floor(playerCount * (isNaN(multiplier) ? 1.5 : multiplier));
  }

  // Fallback
  return playerCount + 3;
}

/**
 * Check if Squidz round should end
 */
export function shouldEndSquidzRound(
  squidCounts: number[],
  totalSquidzDistributed: number,
  totalSquidz: number
): { shouldEnd: boolean; reason?: string } {
  // All squidz distributed
  if (totalSquidzDistributed >= totalSquidz) {
    return { shouldEnd: true, reason: 'All squidz have been distributed' };
  }

  // Only 1 player WITHOUT squidz (everyone else has at least 1)
  const playersWithoutSquidz = squidCounts.filter(count => count === 0).length;
  if (playersWithoutSquidz === 1) {
    return { shouldEnd: true, reason: 'Only one player without squidz remaining' };
  }

  return { shouldEnd: false };
}

/**
 * Calculate maximum liability for a player in Squidz Game
 *
 * Worst case: One other player gets ALL the squids and this player has NONE
 * Liability = 0 if player has any squids (they GET PAID, not pay)
 *
 * @param playerId - Player to calculate liability for
 * @param playerCount - Total number of players
 * @param currentSquidCount - Current squid count for this player
 * @param config - Squidz configuration
 * @param bigBlind - Big blind amount
 * @returns Maximum amount this player might need to pay
 */
export function calculateMaxSquidzLiability(
  playerId: string,
  playerCount: number,
  currentSquidCount: number,
  config: SquidzConfig,
  bigBlind: number
): number {
  // If this player has any squids, they have ZERO liability (they get paid, not pay)
  if (currentSquidCount > 0) {
    return 0;
  }

  // Calculate total squids in play
  const totalSquids = getTotalSquidzCount(playerCount, config);

  // Worst case: One opponent has ALL the squids, I have none
  // I need to pay them the value of all squids
  const maxValue = calculateSquidValue(totalSquids, config, bigBlind);

  return maxValue;
}
