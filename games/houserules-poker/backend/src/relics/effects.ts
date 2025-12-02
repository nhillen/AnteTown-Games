/**
 * Relic Effect Implementations
 *
 * Contains the actual effect handlers for complex relic effects.
 * Simple effects (percentage bonuses, etc.) are handled inline in RelicManager.
 * This file handles custom handlers and effects that modify game state.
 */

import type { Card } from '../types.js';
import type { RelicEffectParams, RelicEffectResult } from './types.js';

/**
 * Context passed to effect handlers
 */
export interface EffectHandlerContext {
  playerId: string;
  playerStack: number;
  potSize: number;
  holeCards?: Card[];
  communityCards?: Card[];
  deck?: Card[];
  allPlayersStacks?: Map<string, number>;
  eliminatedPlayerId?: string; // For bounty hunter
  lossAmount?: number; // For insurance policy
  isAllIn?: boolean;
}

/**
 * Result of an effect handler
 */
export interface EffectHandlerResult {
  success: boolean;
  stackDeltas?: Map<string, number>;
  potDelta?: number;
  newHoleCards?: Card[];
  newCommunityCards?: Card[];
  revealedInfo?: any;
  message: string;
}

/**
 * Registry of custom effect handlers
 */
export type EffectHandler = (
  params: RelicEffectParams,
  context: EffectHandlerContext
) => EffectHandlerResult;

const effectHandlers: Map<string, EffectHandler> = new Map();

// ============================================================================
// Custom Effect Handlers
// ============================================================================

/**
 * Debt Marker Effect
 * +10% stack immediately, -15% next orbit
 * This needs special handling because it creates a delayed effect
 */
effectHandlers.set('debtMarkerEffect', (params, context) => {
  const bonus = Math.floor(context.playerStack * 0.10);

  return {
    success: true,
    stackDeltas: new Map([[context.playerId, bonus]]),
    message: `Debt Marker: Gained ${bonus} chips now. Will lose 15% next orbit.`,
  };
});

/**
 * Chaos Burn Effect
 * Replace turn & river with 3 random community cards, double the pot
 */
effectHandlers.set('chaosBurnEffect', (params, context) => {
  if (!context.deck || !context.communityCards) {
    return { success: false, message: 'Cannot activate Chaos Burn - no deck available' };
  }

  // Draw 3 new cards (we'd need the deck shuffled)
  // In practice, the game logic will handle the actual card drawing
  const potDoubled = context.potSize; // Add this much to the pot

  return {
    success: true,
    potDelta: potDoubled,
    newCommunityCards: [], // Placeholder - game logic fills this
    message: `Chaos Burn: Pot doubled to ${context.potSize + potDoubled}! Three new community cards dealt.`,
  };
});

/**
 * Bounty Hunter Effect
 * +20% of eliminated player's final stack
 */
effectHandlers.set('bountyHunterEffect', (params, context) => {
  if (!context.eliminatedPlayerId || !context.allPlayersStacks) {
    return { success: false, message: 'No player eliminated' };
  }

  const eliminatedStack = context.allPlayersStacks.get(context.eliminatedPlayerId) || 0;
  const bonus = Math.floor(eliminatedStack * 0.20);

  return {
    success: true,
    stackDeltas: new Map([[context.playerId, bonus]]),
    message: `Bounty Hunter: Collected ${bonus} chip bounty from eliminated player!`,
  };
});

// ============================================================================
// Card Manipulation Effects
// ============================================================================

/**
 * Mulligan Effect - Redraw both hole cards
 * Returns placeholder - actual card drawing handled by game
 */
export function handleMulliganEffect(
  currentCards: Card[],
  deck: Card[]
): { newCards: Card[]; updatedDeck: Card[] } | null {
  if (deck.length < 2) {
    return null;
  }

  // Return current cards to deck (conceptually - shuffling happens elsewhere)
  const updatedDeck = [...deck];

  // Draw 2 new cards from deck
  const newCards: Card[] = [];
  for (let i = 0; i < 2 && updatedDeck.length > 0; i++) {
    const card = updatedDeck.shift();
    if (card) newCards.push(card);
  }

  return { newCards, updatedDeck };
}

/**
 * Weighted Flop Effect - Re-roll one flop card
 */
export function handleWeightedFlopEffect(
  communityCards: Card[],
  deck: Card[],
  cardIndex: number
): { newCommunity: Card[]; updatedDeck: Card[] } | null {
  if (cardIndex < 0 || cardIndex >= communityCards.length) {
    return null;
  }

  if (deck.length < 1) {
    return null;
  }

  const updatedDeck = [...deck];
  const newCard = updatedDeck.shift();
  if (!newCard) return null;

  const newCommunity = [...communityCards];
  newCommunity[cardIndex] = newCard;

  return { newCommunity, updatedDeck };
}

/**
 * The Dealer Effect - Re-deal entire flop
 */
export function handleDealerEffect(
  deck: Card[]
): { newFlop: Card[]; updatedDeck: Card[] } | null {
  if (deck.length < 3) {
    return null;
  }

  const updatedDeck = [...deck];
  const newFlop: Card[] = [];

  for (let i = 0; i < 3 && updatedDeck.length > 0; i++) {
    const card = updatedDeck.shift();
    if (card) newFlop.push(card);
  }

  return { newFlop, updatedDeck };
}

// ============================================================================
// Information Reveal Effects
// ============================================================================

/**
 * Peekaboo Effect - Reveal random mucked card
 */
export function handlePeekabooEffect(
  muckedCards: Card[]
): Card | null {
  if (muckedCards.length === 0) return null;
  return muckedCards[Math.floor(Math.random() * muckedCards.length)];
}

/**
 * Second Sight Effect - Peek at top of deck
 */
export function handleSecondSightEffect(
  deck: Card[],
  cardCount: number = 1
): Card[] {
  return deck.slice(0, cardCount);
}

/**
 * Echo Tell Effect - View opponent's hole cards when they reveal a relic
 */
export function handleEchoTellEffect(
  opponentId: string,
  allHoleCards: Map<string, Card[]>
): Card[] | null {
  return allHoleCards.get(opponentId) || null;
}

// ============================================================================
// Protection Effects
// ============================================================================

/**
 * Insurance Policy Effect - Recover 25% of lost chips on all-in loss
 */
export function calculateInsuranceRecovery(
  lossAmount: number,
  percentage: number = 25
): number {
  return Math.floor(lossAmount * (percentage / 100));
}

// ============================================================================
// Bonus Calculation Effects
// ============================================================================

/**
 * Calculate pot bonus based on effect params
 */
export function calculatePotBonus(
  potSize: number,
  params: RelicEffectParams,
  context: { handRank?: string }
): number {
  // Check minimum pot requirement
  if (params.minPotSize && potSize < params.minPotSize) {
    return 0;
  }

  // Check hand rank requirement
  if (params.requiresHandRank && context.handRank !== params.requiresHandRank) {
    return 0;
  }

  // Calculate bonus
  if (params.percentage) {
    return Math.floor(potSize * (params.percentage / 100));
  }

  if (params.amount) {
    return params.amount;
  }

  return 0;
}

/**
 * Calculate stack modification
 */
export function calculateStackModification(
  currentStack: number,
  params: RelicEffectParams
): number {
  if (params.percentage) {
    return Math.floor(currentStack * (params.percentage / 100));
  }

  if (params.amount) {
    return params.amount;
  }

  return 0;
}

// ============================================================================
// Effect Handler Registry
// ============================================================================

/**
 * Execute a custom effect handler
 */
export function executeCustomEffect(
  handlerName: string,
  params: RelicEffectParams,
  context: EffectHandlerContext
): EffectHandlerResult {
  const handler = effectHandlers.get(handlerName);

  if (!handler) {
    console.warn(`Unknown custom effect handler: ${handlerName}`);
    return {
      success: false,
      message: `Unknown effect handler: ${handlerName}`,
    };
  }

  try {
    return handler(params, context);
  } catch (err) {
    console.error(`Error executing effect ${handlerName}:`, err);
    return {
      success: false,
      message: `Effect failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Register a custom effect handler
 */
export function registerEffectHandler(name: string, handler: EffectHandler): void {
  effectHandlers.set(name, handler);
}

/**
 * Check if a custom handler exists
 */
export function hasEffectHandler(name: string): boolean {
  return effectHandlers.has(name);
}
