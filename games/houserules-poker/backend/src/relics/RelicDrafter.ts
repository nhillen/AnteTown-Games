/**
 * Relic Drafter
 *
 * Handles the relic drafting process during Rogue Breaks.
 * Manages draft state, timeouts, and player selections.
 */

import type {
  RelicDefinition,
  RoguelikeConfig,
  RelicRarity,
  RelicRarityWeights,
} from './types.js';
import relicsData from './relics.json' assert { type: 'json' };

/**
 * State of the current draft
 */
export interface DraftState {
  breakNumber: number;
  isActive: boolean;
  startedAt: number;
  deadline: number;
  playerOptions: Map<string, RelicDefinition[]>;
  playerSelections: Map<string, string | null>; // relicId or null if not yet selected
}

/**
 * Draft result for a player
 */
export interface DraftResult {
  playerId: string;
  selectedRelicId: string | null;
  wasAutoSelected: boolean;
}

/**
 * Events emitted by the drafter
 */
export type DraftEventType =
  | 'draft_started'
  | 'options_sent'
  | 'player_selected'
  | 'draft_complete'
  | 'draft_timeout';

export interface DraftEvent {
  type: DraftEventType;
  timestamp: number;
  breakNumber: number;
  data?: Record<string, unknown>;
}

/**
 * Manages relic drafting during Rogue Breaks
 */
export class RelicDrafter {
  private readonly config: RoguelikeConfig;
  private readonly allRelics: RelicDefinition[];
  private currentDraft: DraftState | null = null;
  private eventListeners: ((event: DraftEvent) => void)[] = [];
  private draftTimeout: NodeJS.Timeout | null = null;

  constructor(config: RoguelikeConfig) {
    this.config = config;
    this.allRelics = relicsData.relics as RelicDefinition[];
  }

  // ============================================================================
  // Draft Lifecycle
  // ============================================================================

  /**
   * Start a new draft for a Rogue Break
   */
  startDraft(breakNumber: number, playerIds: string[]): DraftState {
    if (this.currentDraft?.isActive) {
      console.warn('Attempted to start draft while one is already active');
      this.endDraft();
    }

    const now = Date.now();
    const deadline = now + (this.config.draftTimeSeconds * 1000);

    this.currentDraft = {
      breakNumber,
      isActive: true,
      startedAt: now,
      deadline,
      playerOptions: new Map(),
      playerSelections: new Map(),
    };

    // Generate options for each player
    for (const playerId of playerIds) {
      const options = this.generateDraftOptions(breakNumber);
      this.currentDraft.playerOptions.set(playerId, options);
      this.currentDraft.playerSelections.set(playerId, null);
    }

    // Set timeout for auto-selection
    this.draftTimeout = setTimeout(() => {
      this.handleDraftTimeout();
    }, this.config.draftTimeSeconds * 1000);

    this.emitEvent({
      type: 'draft_started',
      timestamp: now,
      breakNumber,
      data: {
        playerCount: playerIds.length,
        deadline,
        draftTimeSeconds: this.config.draftTimeSeconds,
      },
    });

    console.log(`🎴 Draft started for Rogue Break #${breakNumber} - ${playerIds.length} players`);

    return this.currentDraft;
  }

  /**
   * Get draft options for a specific player
   */
  getPlayerOptions(playerId: string): RelicDefinition[] {
    if (!this.currentDraft?.isActive) {
      return [];
    }
    return this.currentDraft.playerOptions.get(playerId) || [];
  }

  /**
   * Player makes a selection
   */
  selectRelic(playerId: string, relicId: string): { success: boolean; error?: string } {
    if (!this.currentDraft?.isActive) {
      return { success: false, error: 'No active draft' };
    }

    const options = this.currentDraft.playerOptions.get(playerId);
    if (!options) {
      return { success: false, error: 'Player not in draft' };
    }

    // Check if already selected
    if (this.currentDraft.playerSelections.get(playerId) !== null) {
      return { success: false, error: 'Already selected' };
    }

    // Verify relic is in options
    if (!options.some(r => r.id === relicId)) {
      return { success: false, error: 'Invalid relic selection' };
    }

    this.currentDraft.playerSelections.set(playerId, relicId);

    const selectedRelic = options.find(r => r.id === relicId);
    this.emitEvent({
      type: 'player_selected',
      timestamp: Date.now(),
      breakNumber: this.currentDraft.breakNumber,
      data: {
        playerId,
        relicId,
        relicName: selectedRelic?.name,
      },
    });

    console.log(`🎴 ${playerId} selected: ${selectedRelic?.name}`);

    // Check if all players have selected
    this.checkDraftCompletion();

    return { success: true };
  }

  /**
   * Check if draft is complete (all players selected)
   */
  private checkDraftCompletion(): void {
    if (!this.currentDraft?.isActive) return;

    const allSelected = Array.from(this.currentDraft.playerSelections.values())
      .every(selection => selection !== null);

    if (allSelected) {
      this.completeDraft(false);
    }
  }

  /**
   * Handle draft timeout - auto-select for players who haven't chosen
   */
  private handleDraftTimeout(): void {
    if (!this.currentDraft?.isActive) return;

    this.emitEvent({
      type: 'draft_timeout',
      timestamp: Date.now(),
      breakNumber: this.currentDraft.breakNumber,
    });

    // Auto-select first option for players who haven't chosen
    for (const [playerId, selection] of this.currentDraft.playerSelections) {
      if (selection === null) {
        const options = this.currentDraft.playerOptions.get(playerId);
        if (options && options.length > 0) {
          this.currentDraft.playerSelections.set(playerId, options[0].id);
          console.log(`🎴 Auto-selected ${options[0].name} for ${playerId}`);
        }
      }
    }

    this.completeDraft(true);
  }

  /**
   * Complete the draft
   */
  private completeDraft(wasTimeout: boolean): void {
    if (!this.currentDraft) return;

    if (this.draftTimeout) {
      clearTimeout(this.draftTimeout);
      this.draftTimeout = null;
    }

    this.currentDraft.isActive = false;

    this.emitEvent({
      type: 'draft_complete',
      timestamp: Date.now(),
      breakNumber: this.currentDraft.breakNumber,
      data: {
        wasTimeout,
        selections: Object.fromEntries(this.currentDraft.playerSelections),
      },
    });

    console.log(`🎴 Draft complete for Rogue Break #${this.currentDraft.breakNumber}`);
  }

  /**
   * Force end the draft (e.g., if game ends)
   */
  endDraft(): void {
    if (this.draftTimeout) {
      clearTimeout(this.draftTimeout);
      this.draftTimeout = null;
    }
    this.currentDraft = null;
  }

  /**
   * Get final draft results
   */
  getDraftResults(): DraftResult[] {
    if (!this.currentDraft) return [];

    const results: DraftResult[] = [];
    for (const [playerId, selection] of this.currentDraft.playerSelections) {
      results.push({
        playerId,
        selectedRelicId: selection,
        wasAutoSelected: false, // Could track this more precisely
      });
    }

    return results;
  }

  // ============================================================================
  // Draft Option Generation
  // ============================================================================

  /**
   * Generate draft options for a player
   */
  private generateDraftOptions(breakNumber: number): RelicDefinition[] {
    const weights = this.getWeightsForBreak(breakNumber);
    const count = this.config.draftChoices;
    const options: RelicDefinition[] = [];
    const usedIds = new Set<string>();

    // Try to generate unique options
    let attempts = 0;
    const maxAttempts = count * 10;

    while (options.length < count && attempts < maxAttempts) {
      attempts++;

      const rarity = this.rollRarity(weights);
      const candidates = this.allRelics.filter(
        r => r.rarity === rarity && !usedIds.has(r.id)
      );

      if (candidates.length > 0) {
        const selected = candidates[Math.floor(Math.random() * candidates.length)];
        options.push(selected);
        usedIds.add(selected.id);
      }
    }

    // Fill remaining slots with any available relics
    if (options.length < count) {
      const remaining = this.allRelics.filter(r => !usedIds.has(r.id));
      while (options.length < count && remaining.length > 0) {
        const idx = Math.floor(Math.random() * remaining.length);
        options.push(remaining[idx]);
        remaining.splice(idx, 1);
      }
    }

    return options;
  }

  /**
   * Get rarity weights for a specific break
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
  // State Queries
  // ============================================================================

  /**
   * Check if a draft is currently active
   */
  isDraftActive(): boolean {
    return this.currentDraft?.isActive ?? false;
  }

  /**
   * Get current draft state (for UI)
   */
  getCurrentDraftState(): DraftState | null {
    return this.currentDraft;
  }

  /**
   * Get time remaining in draft (ms)
   */
  getTimeRemaining(): number {
    if (!this.currentDraft?.isActive) return 0;
    return Math.max(0, this.currentDraft.deadline - Date.now());
  }

  /**
   * Check if a player has made their selection
   */
  hasPlayerSelected(playerId: string): boolean {
    return this.currentDraft?.playerSelections.get(playerId) !== null;
  }

  /**
   * Get count of players who have selected
   */
  getSelectionCount(): { selected: number; total: number } {
    if (!this.currentDraft) return { selected: 0, total: 0 };

    let selected = 0;
    for (const selection of this.currentDraft.playerSelections.values()) {
      if (selection !== null) selected++;
    }

    return {
      selected,
      total: this.currentDraft.playerSelections.size,
    };
  }

  // ============================================================================
  // Event System
  // ============================================================================

  /**
   * Add event listener
   */
  addEventListener(callback: (event: DraftEvent) => void): void {
    this.eventListeners.push(callback);
  }

  /**
   * Remove event listener
   */
  removeEventListener(callback: (event: DraftEvent) => void): void {
    const index = this.eventListeners.indexOf(callback);
    if (index !== -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  /**
   * Emit event to listeners
   */
  private emitEvent(event: DraftEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in draft event listener:', err);
      }
    }
  }
}
