/**
 * Relic Manager
 *
 * Manages relic state, effects, and lifecycle for a roguelike session.
 * Handles relic acquisition, activation, cooldowns, and visibility.
 */

import type {
  RelicDefinition,
  PlayerRelic,
  RelicRarity,
  RelicTriggerPhase,
  RelicEffectResult,
  RelicEvent,
  RoguelikeConfig,
  RelicRarityWeights,
} from './types.js';
import relicsData from './relics.json' assert { type: 'json' };

/**
 * Context for relic effect evaluation
 */
export interface RelicContext {
  playerId: string;
  playerStack: number;
  potSize: number;
  currentOrbit: number;
  currentHand: number;
  phase: string;
  isAllIn: boolean;
  wonLastHand: boolean;
  lostLastHand: boolean;
  winStreak: number;
  loseStreak: number;
  handRank?: string;
  opponentRelicRevealed?: string;
}

/**
 * Manages all relics for a roguelike session
 */
export class RelicManager {
  private readonly config: RoguelikeConfig;
  private readonly allRelics: Map<string, RelicDefinition> = new Map();
  private playerRelics: Map<string, PlayerRelic[]> = new Map();
  private eventListeners: ((event: RelicEvent) => void)[] = [];

  // Tracking for conditional relics
  private playerWinStreaks: Map<string, number> = new Map();
  private playerLoseStreaks: Map<string, number> = new Map();
  private usedThisOrbit: Map<string, Set<string>> = new Map(); // playerId -> Set<relicId>

  constructor(config: RoguelikeConfig) {
    this.config = config;
    this.loadRelicDefinitions();
  }

  /**
   * Load relic definitions from JSON
   */
  private loadRelicDefinitions(): void {
    for (const relic of relicsData.relics) {
      this.allRelics.set(relic.id, relic as RelicDefinition);
    }
    console.log(`🎴 Loaded ${this.allRelics.size} relic definitions`);
  }

  /**
   * Initialize a player's relic state
   */
  initializePlayer(playerId: string): void {
    this.playerRelics.set(playerId, []);
    this.playerWinStreaks.set(playerId, 0);
    this.playerLoseStreaks.set(playerId, 0);
    this.usedThisOrbit.set(playerId, new Set());
  }

  /**
   * Give a player their starting relic(s)
   */
  grantStartingRelics(playerId: string, orbit: number): PlayerRelic[] {
    const granted: PlayerRelic[] = [];

    for (let i = 0; i < this.config.startingRelics; i++) {
      const relic = this.drawRandomRelic(this.config.startingRelicRarity);
      if (relic) {
        const playerRelic = this.grantRelic(playerId, relic, orbit);
        if (playerRelic) {
          granted.push(playerRelic);
        }
      }
    }

    return granted;
  }

  /**
   * Grant a specific relic to a player
   */
  grantRelic(playerId: string, definition: RelicDefinition, orbit: number): PlayerRelic | null {
    const playerRelicList = this.playerRelics.get(playerId);
    if (!playerRelicList) {
      console.error(`Player ${playerId} not initialized`);
      return null;
    }

    const playerRelic: PlayerRelic = {
      definition,
      isRevealed: this.config.relicVisibility === 'visible',
      usesRemaining: definition.usesPerMatch,
      cooldownRemaining: 0,
      acquiredAtOrbit: orbit,
    };

    playerRelicList.push(playerRelic);

    this.emitEvent({
      type: 'relic_drafted',
      timestamp: Date.now(),
      playerId,
      relicId: definition.id,
      data: { rarity: definition.rarity, name: definition.name },
    });

    console.log(`🎴 ${playerId} acquired relic: ${definition.name} (${definition.rarity})`);
    return playerRelic;
  }

  /**
   * Get all relics for a player
   */
  getPlayerRelics(playerId: string): PlayerRelic[] {
    return this.playerRelics.get(playerId) || [];
  }

  /**
   * Get relics visible to a specific viewer
   */
  getVisibleRelics(playerId: string, viewerId: string): PlayerRelic[] {
    const relics = this.playerRelics.get(playerId) || [];

    if (playerId === viewerId) {
      // Owner always sees their own relics
      return relics;
    }

    switch (this.config.relicVisibility) {
      case 'visible':
        return relics;
      case 'hidden':
        return relics.filter(r => r.isRevealed);
      case 'rarity_hint':
        // Return relics with definition stripped (just rarity visible)
        return relics.map(r => ({
          ...r,
          definition: r.isRevealed ? r.definition : {
            ...r.definition,
            name: '???',
            description: 'Hidden relic',
            effect: { type: 'custom', params: {}, description: '???' },
          } as RelicDefinition,
        }));
      case 'owner_only':
        return [];
      default:
        return relics.filter(r => r.isRevealed);
    }
  }

  /**
   * Draw a random relic of specified rarity
   */
  drawRandomRelic(rarity: RelicRarity): RelicDefinition | null {
    const candidates = Array.from(this.allRelics.values())
      .filter(r => r.rarity === rarity);

    if (candidates.length === 0) {
      console.warn(`No relics found for rarity: ${rarity}`);
      return null;
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /**
   * Draw relics for draft based on break number and weights
   */
  drawDraftOptions(breakNumber: number, count: number): RelicDefinition[] {
    const weights = this.getWeightsForBreak(breakNumber);
    const options: RelicDefinition[] = [];

    for (let i = 0; i < count; i++) {
      const rarity = this.rollRarity(weights);
      const relic = this.drawRandomRelic(rarity);
      if (relic && !options.some(o => o.id === relic.id)) {
        options.push(relic);
      }
    }

    // If we couldn't get enough unique relics, fill with commons
    while (options.length < count) {
      const relic = this.drawRandomRelic('common');
      if (relic && !options.some(o => o.id === relic.id)) {
        options.push(relic);
      } else {
        break; // Avoid infinite loop
      }
    }

    return options;
  }

  /**
   * Get rarity weights for a specific break number
   */
  private getWeightsForBreak(breakNumber: number): RelicRarityWeights {
    switch (breakNumber) {
      case 1: return this.config.rarityPoolsByBreak.break1;
      case 2: return this.config.rarityPoolsByBreak.break2;
      case 3:
      default: return this.config.rarityPoolsByBreak.break3;
    }
  }

  /**
   * Roll a rarity based on weights
   */
  private rollRarity(weights: RelicRarityWeights): RelicRarity {
    const total = weights.common + weights.rare + weights.epic;
    const roll = Math.random() * total;

    if (roll < weights.common) return 'common';
    if (roll < weights.common + weights.rare) return 'rare';
    return 'epic';
  }

  // ============================================================================
  // Relic Activation
  // ============================================================================

  /**
   * Check and execute triggered relics for a phase
   */
  checkTriggeredRelics(phase: RelicTriggerPhase, context: RelicContext): RelicEffectResult[] {
    const results: RelicEffectResult[] = [];
    const playerRelicList = this.playerRelics.get(context.playerId) || [];

    for (const playerRelic of playerRelicList) {
      const def = playerRelic.definition;

      // Skip if not the right phase
      if (def.triggerPhase !== phase) continue;

      // Skip if passive (handled separately) or manual
      if (def.activationType === 'passive') continue;
      if (def.activationType === 'triggered' && def.triggerPhase !== 'manual') continue;

      // Check conditional activation
      if (def.activationType === 'conditional') {
        if (!this.checkCondition(playerRelic, context)) continue;
      }

      // Check uses remaining
      if (!this.canUseRelic(context.playerId, playerRelic, context.currentOrbit)) continue;

      // Apply effect
      const result = this.applyRelicEffect(context.playerId, playerRelic, context);
      results.push(result);
    }

    return results;
  }

  /**
   * Manually activate a triggered relic
   */
  activateRelic(playerId: string, relicId: string, context: RelicContext): RelicEffectResult {
    const playerRelicList = this.playerRelics.get(playerId) || [];
    const playerRelic = playerRelicList.find(r => r.definition.id === relicId);

    if (!playerRelic) {
      return { success: false, message: 'Relic not found' };
    }

    if (playerRelic.definition.activationType !== 'triggered') {
      return { success: false, message: 'This relic cannot be manually activated' };
    }

    if (!this.canUseRelic(playerId, playerRelic, context.currentOrbit)) {
      return { success: false, message: 'Relic is on cooldown or out of uses' };
    }

    // Check if correct phase
    if (playerRelic.definition.triggerPhase !== 'manual' &&
        playerRelic.definition.triggerPhase !== context.phase) {
      return { success: false, message: `Can only activate during ${playerRelic.definition.triggerPhase}` };
    }

    return this.applyRelicEffect(playerId, playerRelic, context);
  }

  /**
   * Check if a relic can be used
   */
  canUseRelic(playerId: string, playerRelic: PlayerRelic, currentOrbit: number): boolean {
    const def = playerRelic.definition;

    // Check cooldown
    if (playerRelic.cooldownRemaining && playerRelic.cooldownRemaining > 0) {
      return false;
    }

    // Check uses remaining (per match)
    if (playerRelic.usesRemaining !== undefined && playerRelic.usesRemaining <= 0) {
      return false;
    }

    // Check uses per orbit
    if (def.usesPerOrbit !== undefined) {
      const usedThisOrbit = this.usedThisOrbit.get(playerId);
      if (usedThisOrbit?.has(def.id)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if a conditional relic's condition is met
   */
  private checkCondition(playerRelic: PlayerRelic, context: RelicContext): boolean {
    const condition = playerRelic.definition.condition;
    if (!condition) return true;

    switch (condition.type) {
      case 'streak':
        const streakReq = condition.value as { type: 'win' | 'loss'; count: number };
        if (streakReq.type === 'win') {
          return context.winStreak >= streakReq.count;
        } else {
          return context.loseStreak >= streakReq.count;
        }

      case 'stack_threshold':
        return context.playerStack >= condition.value;

      case 'hand_rank':
        return context.handRank === condition.value;

      case 'pot_size':
        return context.potSize >= condition.value;

      case 'custom':
        // Handle special conditions
        if (condition.value === 'won_all_in') {
          return context.isAllIn && context.wonLastHand;
        }
        if (condition.value === 'lost_all_in') {
          return context.isAllIn && context.lostLastHand;
        }
        return false;

      default:
        return false;
    }
  }

  /**
   * Apply a relic's effect
   */
  private applyRelicEffect(playerId: string, playerRelic: PlayerRelic, context: RelicContext): RelicEffectResult {
    const def = playerRelic.definition;
    const effect = def.effect;

    // Reveal if configured
    if (this.config.revealOnUse && !playerRelic.isRevealed) {
      playerRelic.isRevealed = true;
      this.emitEvent({
        type: 'relic_revealed',
        timestamp: Date.now(),
        playerId,
        relicId: def.id,
        data: { name: def.name, rarity: def.rarity },
      });
    }

    // Track usage
    if (def.usesPerOrbit !== undefined) {
      const usedSet = this.usedThisOrbit.get(playerId) || new Set();
      usedSet.add(def.id);
      this.usedThisOrbit.set(playerId, usedSet);
    }

    if (playerRelic.usesRemaining !== undefined) {
      playerRelic.usesRemaining--;
    }

    if (def.cooldownHands) {
      playerRelic.cooldownRemaining = def.cooldownHands;
    }

    playerRelic.lastUsedHand = context.currentHand;

    // Emit activation event
    this.emitEvent({
      type: 'relic_activated',
      timestamp: Date.now(),
      playerId,
      relicId: def.id,
      data: { effectType: effect.type },
    });

    console.log(`🎴 ${playerId} activated relic: ${def.name}`);

    // Build result based on effect type
    const result: RelicEffectResult = {
      success: true,
      message: `${def.name} activated: ${effect.description}`,
      changes: {},
    };

    // Calculate effect values
    switch (effect.type) {
      case 'bonus_payout':
      case 'modify_pot':
        if (effect.params.percentage) {
          result.changes!.potDelta = Math.floor(context.potSize * (effect.params.percentage / 100));
        } else if (effect.params.amount) {
          result.changes!.potDelta = effect.params.amount;
        }
        break;

      case 'modify_stack':
        if (effect.params.percentage) {
          const delta = Math.floor(context.playerStack * (effect.params.percentage / 100));
          result.changes!.stackDeltas = new Map([[playerId, delta]]);
        }
        break;

      case 'protection':
        // Protection effects are calculated differently - they reduce losses
        // The actual implementation would need the loss amount
        break;

      case 'peek_info':
      case 'reveal_opponent':
        result.changes!.infoRevealed = {
          type: effect.params.infoType,
          forPlayer: playerId,
        };
        break;

      case 'redraw_cards':
      case 'reroll_community':
        result.changes!.cardsChanged = true;
        break;

      case 'custom':
        // Custom effects need special handling
        result.message = `${def.name}: ${effect.description}`;
        break;
    }

    this.emitEvent({
      type: 'relic_effect_applied',
      timestamp: Date.now(),
      playerId,
      relicId: def.id,
      data: { result },
    });

    return result;
  }

  // ============================================================================
  // Orbit & Streak Management
  // ============================================================================

  /**
   * Called when a new orbit starts
   */
  onOrbitStart(): void {
    // Reset per-orbit usage tracking
    this.usedThisOrbit.clear();

    // Decrement cooldowns
    for (const [playerId, relics] of this.playerRelics) {
      for (const relic of relics) {
        if (relic.cooldownRemaining && relic.cooldownRemaining > 0) {
          relic.cooldownRemaining--;
        }
      }
    }
  }

  /**
   * Update streak tracking after a hand
   */
  updateStreaks(playerId: string, won: boolean): void {
    if (won) {
      const current = this.playerWinStreaks.get(playerId) || 0;
      this.playerWinStreaks.set(playerId, current + 1);
      this.playerLoseStreaks.set(playerId, 0);
    } else {
      const current = this.playerLoseStreaks.get(playerId) || 0;
      this.playerLoseStreaks.set(playerId, current + 1);
      this.playerWinStreaks.set(playerId, 0);
    }
  }

  /**
   * Get current win streak for player
   */
  getWinStreak(playerId: string): number {
    return this.playerWinStreaks.get(playerId) || 0;
  }

  /**
   * Get current lose streak for player
   */
  getLoseStreak(playerId: string): number {
    return this.playerLoseStreaks.get(playerId) || 0;
  }

  // ============================================================================
  // Final Orbit Reveal
  // ============================================================================

  /**
   * Reveal all relics (for final orbit)
   */
  revealAllRelics(): void {
    for (const [playerId, relics] of this.playerRelics) {
      for (const relic of relics) {
        if (!relic.isRevealed) {
          relic.isRevealed = true;
          this.emitEvent({
            type: 'relic_revealed',
            timestamp: Date.now(),
            playerId,
            relicId: relic.definition.id,
            data: { name: relic.definition.name, rarity: relic.definition.rarity, reason: 'final_orbit' },
          });
        }
      }
    }
    console.log('🎴 All relics revealed for final orbit');
  }

  // ============================================================================
  // Event System
  // ============================================================================

  /**
   * Add event listener
   */
  addEventListener(callback: (event: RelicEvent) => void): void {
    this.eventListeners.push(callback);
  }

  /**
   * Remove event listener
   */
  removeEventListener(callback: (event: RelicEvent) => void): void {
    const index = this.eventListeners.indexOf(callback);
    if (index !== -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  /**
   * Emit event to all listeners
   */
  private emitEvent(event: RelicEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in relic event listener:', err);
      }
    }
  }

  // ============================================================================
  // State Management
  // ============================================================================

  /**
   * Get full state for serialization
   */
  getState(): {
    playerRelics: Record<string, PlayerRelic[]>;
    winStreaks: Record<string, number>;
    loseStreaks: Record<string, number>;
  } {
    return {
      playerRelics: Object.fromEntries(this.playerRelics),
      winStreaks: Object.fromEntries(this.playerWinStreaks),
      loseStreaks: Object.fromEntries(this.playerLoseStreaks),
    };
  }

  /**
   * Reset manager for new session
   */
  reset(): void {
    this.playerRelics.clear();
    this.playerWinStreaks.clear();
    this.playerLoseStreaks.clear();
    this.usedThisOrbit.clear();
  }
}
