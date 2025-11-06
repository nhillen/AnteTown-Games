import { PokerRulesEngine, GameVariant, PotWinResult } from './RulesEngine.js';
import { HOLDEM_RULES } from './holdem.js';

/**
 * Squidz Game Configuration
 */
export interface SquidzConfig {
  baseSquidValue: number;      // Base value per squid (e.g., $5 = 500 pennies)
  minPlayers: number;          // Minimum players to start
  maxPlayers: number;          // Maximum players
  largeBuyIn: number;          // Required buy-in (larger than normal)
  squidBonusAt3: number;       // Bonus per squid at 3+ squidz
  squidBonusAt5: number;       // Bonus per squid at 5+ squidz
}

export const DEFAULT_SQUIDZ_CONFIG: SquidzConfig = {
  baseSquidValue: 500,         // $5.00 per squid (1-2 squidz)
  minPlayers: 4,
  maxPlayers: 8,
  largeBuyIn: 10000,           // $100
  squidBonusAt3: 500,          // +$5 bonus (= $10 each at 3-4 squidz)
  squidBonusAt5: 1000,         // +$10 bonus (= $15 each at 5+ squidz)
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
      const { playerCount, gameState } = context;

      // Check if we need to start a new round
      if (!gameState.isSquidzRound) {
        const totalSquidz = getTotalSquidzCount(playerCount);

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
      const { gameState, seatedPlayers } = context;

      if (!gameState.isSquidzRound) return {};

      console.log(`🦑 Processing Squidz Game bounty payouts...`);

      // Separate winners and losers
      const playersWithSquidz = seatedPlayers.filter(s => (s.squidCount || 0) > 0);
      const playersWithoutSquidz = seatedPlayers.filter(s => (s.squidCount || 0) === 0);

      if (playersWithSquidz.length === 0 || playersWithoutSquidz.length === 0) {
        console.log(`🦑 No bounty payouts needed (${playersWithSquidz.length} winners, ${playersWithoutSquidz.length} losers)`);
      } else {
        console.log(`🦑 Bounty payout: ${playersWithoutSquidz.length} losers will pay ${playersWithSquidz.length} winners`);

        // Calculate and distribute bounties
        playersWithSquidz.forEach(winner => {
          const squidCount = winner.squidCount || 0;
          const bountyPerLoser = calculateBountyPerPlayer(squidCount, DEFAULT_SQUIDZ_CONFIG);

          console.log(`🦑 ${winner.name} has ${squidCount} squidz (value: $${bountyPerLoser / 100} per loser)`);

          let totalBountyReceived = 0;

          playersWithoutSquidz.forEach(loser => {
            const actualBounty = Math.min(bountyPerLoser, loser.tableStack);
            loser.tableStack -= actualBounty;
            totalBountyReceived += actualBounty;

            console.log(`🦑   ${loser.name} pays $${actualBounty / 100} to ${winner.name}`);
          });

          winner.tableStack += totalBountyReceived;
          console.log(`🦑 ${winner.name} receives total bounty: $${totalBountyReceived / 100}`);
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
        customMessage: 'Squidz round complete - starting new round'
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
 */
export function calculateSquidValue(squidCount: number, config: SquidzConfig = DEFAULT_SQUIDZ_CONFIG): number {
  if (squidCount === 0) return 0;

  if (squidCount >= 5) {
    // 5+ squidz: base + $10 per squid
    return squidCount * (config.baseSquidValue + config.squidBonusAt5);
  } else if (squidCount >= 3) {
    // 3-4 squidz: base + $5 per squid
    return squidCount * (config.baseSquidValue + config.squidBonusAt3);
  } else {
    // 1-2 squidz: base value per squid
    return squidCount * config.baseSquidValue;
  }
}

/**
 * Calculate total bounty a player should receive
 * Returns amount per losing player
 */
export function calculateBountyPerPlayer(squidCount: number, config: SquidzConfig = DEFAULT_SQUIDZ_CONFIG): number {
  return calculateSquidValue(squidCount, config);
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
export function getTotalSquidzCount(playerCount: number): number {
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

  // Only 1 player has squidz (everyone else has 0)
  const playersWithSquidz = squidCounts.filter(count => count > 0).length;
  if (playersWithSquidz === 1) {
    return { shouldEnd: true, reason: 'Only one player has squidz remaining' };
  }

  return { shouldEnd: false };
}
