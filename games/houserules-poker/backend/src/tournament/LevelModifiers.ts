/**
 * Level Modifiers (Roguelike Mechanics)
 *
 * Manages rule modifications that activate at specific blind levels.
 * Each modifier can change game rules, add new mechanics, or modify payouts.
 */

import type { RuleModifiers } from '../rules/RulesEngine.js';
import type { LevelModifierConfig } from './TournamentConfig.js';

/**
 * Manages active level modifiers for a tournament
 */
export class LevelModifierManager {
  private readonly configuredModifiers: LevelModifierConfig[];
  private activeModifiers: LevelModifierConfig[] = [];

  constructor(modifiers: LevelModifierConfig[] = []) {
    this.configuredModifiers = modifiers;
  }

  /**
   * Check for and return any new modifiers at the given level
   */
  checkForNewModifiers(currentLevel: number): LevelModifierConfig[] {
    const newMods = this.configuredModifiers.filter(
      m => m.level === currentLevel &&
        !this.activeModifiers.some(am => am.level === m.level && am.name === m.name)
    );

    this.activeModifiers.push(...newMods);
    return newMods;
  }

  /**
   * Get all currently active modifiers
   */
  getActiveModifiers(): LevelModifierConfig[] {
    return [...this.activeModifiers];
  }

  /**
   * Merge all active modifiers into a single RuleModifiers object
   */
  getMergedRuleModifiers(): Partial<RuleModifiers> {
    return this.activeModifiers.reduce((acc, mod) => {
      return this.deepMergeModifiers(acc, mod.modifier);
    }, {} as Partial<RuleModifiers>);
  }

  /**
   * Deep merge two RuleModifiers objects
   */
  private deepMergeModifiers(
    base: Partial<RuleModifiers>,
    overlay: Partial<RuleModifiers>
  ): Partial<RuleModifiers> {
    const result = { ...base };

    for (const key of Object.keys(overlay) as Array<keyof RuleModifiers>) {
      const baseVal = base[key];
      const overlayVal = overlay[key];

      if (Array.isArray(overlayVal)) {
        // Merge arrays (e.g., wildCards)
        result[key] = [...(baseVal as any[] || []), ...overlayVal] as any;
      } else if (typeof overlayVal === 'object' && overlayVal !== null) {
        // Deep merge objects
        result[key] = { ...(baseVal as any || {}), ...overlayVal } as any;
      } else if (overlayVal !== undefined) {
        // Simple value override
        result[key] = overlayVal as any;
      }
    }

    return result;
  }

  /**
   * Reset all active modifiers (for new tournament)
   */
  reset(): void {
    this.activeModifiers = [];
  }
}

// ============================================================================
// Pre-defined Level Modifier Sets (Roguelike Themes)
// ============================================================================

/**
 * Standard roguelike modifiers for tournaments
 */
export const ROGUELIKE_MODIFIERS: LevelModifierConfig[] = [
  {
    level: 3,
    name: 'Wild Deuces',
    description: 'All 2s are now wild cards',
    announcement: '🃏 Wild Deuces activated! 2s can substitute for any card!',
    modifier: {
      wildCards: ['2'],
    },
  },
  {
    level: 5,
    name: 'Ante Up',
    description: 'Antes are now required each hand',
    announcement: '💰 Ante Up! Everyone pays an ante each hand!',
    modifier: {
      // Ante is handled by the tournament blind schedule, but this is a signal
    },
  },
  {
    level: 7,
    name: 'Double Flop',
    description: 'Two flops are dealt - best hand from either wins',
    announcement: '🎲 Double Flop! Two boards, double the action!',
    modifier: {
      communityCardOverride: {
        flop: 6,  // Deal 6 cards instead of 3
      },
    },
  },
];

/**
 * Chaos mode modifiers - more wild variations
 */
export const CHAOS_MODIFIERS: LevelModifierConfig[] = [
  {
    level: 2,
    name: 'Three-Card Monte',
    description: 'Players receive 3 hole cards, must use exactly 2',
    announcement: '🎴 Three-Card Monte! You get 3 hole cards but must use 2!',
    modifier: {
      holeCardCount: 3,
      mustUseExactly: 2,
    },
  },
  {
    level: 4,
    name: 'Wild Jacks',
    description: 'Jacks are wild',
    announcement: '🃏 Wild Jacks! J can be any card!',
    modifier: {
      wildCards: ['J'],
    },
  },
  {
    level: 6,
    name: 'Short Deck',
    description: 'All 2s, 3s, 4s, and 5s are removed from the deck',
    announcement: '📦 Short Deck! Low cards removed - big hands only!',
    modifier: {
      deckModifications: [
        { type: 'remove', cards: ['2', '3', '4', '5'] },
      ],
    },
  },
  {
    level: 8,
    name: 'Pot Limit',
    description: 'Betting is now pot-limit instead of no-limit',
    announcement: '🎯 Pot Limit activated! Max bet is the pot size!',
    modifier: {
      potLimit: true,
      noLimit: false,
    },
  },
];

/**
 * High-stakes modifiers - emphasis on variance
 */
export const HIGHSTAKES_MODIFIERS: LevelModifierConfig[] = [
  {
    level: 3,
    name: 'Bomb Pot',
    description: 'Everyone antes 5 BB, no pre-flop betting',
    announcement: '💣 Bomb Pot incoming! Massive action!',
    modifier: {
      skipStandardPhases: ['PreFlop'],
    },
  },
  {
    level: 5,
    name: 'Insurance Available',
    description: 'Players can buy all-in insurance',
    announcement: '🛡️ Insurance now available for all-in situations!',
    modifier: {
      // Custom handling needed
    },
  },
  {
    level: 7,
    name: 'Double or Nothing',
    description: 'Winner takes double, loser loses all',
    announcement: '⚡ Double or Nothing! Stakes just doubled!',
    modifier: {
      // Custom handling needed
    },
  },
];

/**
 * Get a modifier set by name
 */
export function getModifierSet(name: 'roguelike' | 'chaos' | 'highstakes'): LevelModifierConfig[] {
  switch (name) {
    case 'roguelike':
      return ROGUELIKE_MODIFIERS;
    case 'chaos':
      return CHAOS_MODIFIERS;
    case 'highstakes':
      return HIGHSTAKES_MODIFIERS;
    default:
      return [];
  }
}

/**
 * Create a custom modifier set by combining predefined modifiers
 */
export function combineModifierSets(...sets: LevelModifierConfig[][]): LevelModifierConfig[] {
  // Combine all modifiers, adjusting levels to be sequential
  const combined: LevelModifierConfig[] = [];
  let levelOffset = 0;

  for (const set of sets) {
    for (const mod of set) {
      combined.push({
        ...mod,
        level: mod.level + levelOffset,
      });
    }
    // Next set starts after this one's highest level
    const maxLevel = Math.max(...set.map(m => m.level), 0);
    levelOffset += maxLevel;
  }

  return combined;
}
