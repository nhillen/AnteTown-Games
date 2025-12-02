/**
 * Relic Frontend Types
 *
 * Types for the relic UI components.
 */

/**
 * Relic rarity tier
 */
export type RelicRarity = 'common' | 'rare' | 'epic';

/**
 * How the relic activates
 */
export type RelicActivationType = 'passive' | 'triggered' | 'conditional';

/**
 * Relic effect summary for display
 */
export interface RelicEffect {
  type: string;
  description: string;
}

/**
 * Relic definition for display
 */
export interface RelicDefinition {
  id: string;
  name: string;
  rarity: RelicRarity;
  activationType: RelicActivationType;
  description: string;
  flavorText?: string;
  effect: RelicEffect;
}

/**
 * Player's relic instance
 */
export interface PlayerRelic {
  definition: RelicDefinition;
  isRevealed: boolean;
  usesRemaining?: number;
  cooldownRemaining?: number;
  acquiredAtOrbit: number;
  lastUsedHand?: number;
}

/**
 * Draft options sent to player
 */
export interface DraftOptions {
  breakNumber: number;
  options: RelicDefinition[];
  deadline: number;
  timeRemaining: number;
}

/**
 * Relic activation result
 */
export interface RelicActivationResult {
  success: boolean;
  message: string;
  effectDescription?: string;
}

/**
 * Roguelike state from tournament
 */
export interface RoguelikeState {
  currentOrbit: number;
  handsInCurrentOrbit: number;
  rogueBreaksCompleted: number;
  isInRogueBreak: boolean;
  playerRelics: Record<string, PlayerRelic[]>;
}

/**
 * Get rarity color classes
 */
export function getRarityColors(rarity: RelicRarity): {
  border: string;
  bg: string;
  text: string;
  glow: string;
} {
  switch (rarity) {
    case 'common':
      return {
        border: 'border-gray-500',
        bg: 'bg-gray-800',
        text: 'text-gray-300',
        glow: 'shadow-gray-500/30',
      };
    case 'rare':
      return {
        border: 'border-blue-500',
        bg: 'bg-blue-900/50',
        text: 'text-blue-300',
        glow: 'shadow-blue-500/50',
      };
    case 'epic':
      return {
        border: 'border-purple-500',
        bg: 'bg-purple-900/50',
        text: 'text-purple-300',
        glow: 'shadow-purple-500/50',
      };
  }
}

/**
 * Get activation type icon
 */
export function getActivationIcon(type: RelicActivationType): string {
  switch (type) {
    case 'passive':
      return '⚡'; // Always on
    case 'triggered':
      return '🎯'; // Manual trigger
    case 'conditional':
      return '🔄'; // Auto when condition met
  }
}

/**
 * Get rarity label
 */
export function getRarityLabel(rarity: RelicRarity): string {
  return rarity.charAt(0).toUpperCase() + rarity.slice(1);
}
