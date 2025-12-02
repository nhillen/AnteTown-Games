/**
 * Roguelike Session Manager
 *
 * Orchestrates the full Roguelike "House Rules" mode.
 * Manages Rogue Breaks, relic drafting, and integrates with tournament system.
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import { RelicManager, type RelicContext } from './RelicManager.js';
import { RelicDrafter, type DraftResult } from './RelicDrafter.js';
import type {
  RoguelikeConfig,
  RoguelikeState,
  PlayerRelic,
  RelicEvent,
  RelicTriggerPhase,
  RelicEffectResult,
} from './types.js';
import { DEFAULT_ROGUELIKE_CONFIG } from './types.js';

/**
 * Session event types
 */
export type SessionEventType =
  | 'session_started'
  | 'session_ended'
  | 'rogue_break_triggered'
  | 'rogue_break_started'
  | 'rogue_break_ended'
  | 'orbit_started'
  | 'orbit_ended'
  | 'relic_effect_triggered';

export interface SessionEvent {
  type: SessionEventType;
  timestamp: number;
  data?: Record<string, unknown>;
}

/**
 * Manages a complete roguelike session
 */
export class RoguelikeSession {
  private readonly config: RoguelikeConfig;
  private readonly relicManager: RelicManager;
  private readonly drafter: RelicDrafter;
  private state: RoguelikeState;
  private io: SocketIOServer | null = null;
  private eventListeners: ((event: SessionEvent) => void)[] = [];

  // Timing
  private rogueBreakCheckTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<RoguelikeConfig> = {}) {
    this.config = { ...DEFAULT_ROGUELIKE_CONFIG, ...config };
    this.relicManager = new RelicManager(this.config);
    this.drafter = new RelicDrafter(this.config);

    this.state = this.createInitialState();

    // Forward relic events
    this.relicManager.addEventListener((event) => this.handleRelicEvent(event));
  }

  /**
   * Create initial session state
   */
  private createInitialState(): RoguelikeState {
    return {
      sessionStartedAt: 0,
      currentOrbit: 0,
      handsInCurrentOrbit: 0,
      totalHandsPlayed: 0,
      rogueBreaksCompleted: 0,
      isInRogueBreak: false,
      playerRelics: new Map(),
      potsWonByPlayer: new Map(),
      largestPotByPlayer: new Map(),
    };
  }

  /**
   * Set Socket.IO server for real-time updates
   */
  setSocketServer(io: SocketIOServer): void {
    this.io = io;
  }

  // ============================================================================
  // Session Lifecycle
  // ============================================================================

  /**
   * Start the roguelike session
   */
  startSession(playerIds: string[]): void {
    this.state = this.createInitialState();
    this.state.sessionStartedAt = Date.now();
    this.state.currentOrbit = 1;

    // Initialize all players
    for (const playerId of playerIds) {
      this.relicManager.initializePlayer(playerId);
      this.state.potsWonByPlayer.set(playerId, 0);
      this.state.largestPotByPlayer.set(playerId, 0);
    }

    // Grant starting relics
    for (const playerId of playerIds) {
      const relics = this.relicManager.grantStartingRelics(playerId, 1);
      this.state.playerRelics.set(playerId, relics);
    }

    // Start time-based rogue break checker if needed
    if (this.config.rogueBreakTrigger === 'time') {
      this.startRogueBreakTimer();
    }

    this.emitEvent({
      type: 'session_started',
      timestamp: Date.now(),
      data: {
        playerCount: playerIds.length,
        config: {
          maxOrbits: this.config.maxOrbits,
          maxRogueBreaks: this.config.maxRogueBreaks,
          rogueBreakTrigger: this.config.rogueBreakTrigger,
        },
      },
    });

    console.log(`🎮 Roguelike session started with ${playerIds.length} players`);
  }

  /**
   * End the session
   */
  endSession(): void {
    if (this.rogueBreakCheckTimer) {
      clearInterval(this.rogueBreakCheckTimer);
      this.rogueBreakCheckTimer = null;
    }

    this.drafter.endDraft();

    this.emitEvent({
      type: 'session_ended',
      timestamp: Date.now(),
      data: {
        totalHands: this.state.totalHandsPlayed,
        orbitsCompleted: this.state.currentOrbit,
        rogueBreaksCompleted: this.state.rogueBreaksCompleted,
      },
    });

    console.log('🎮 Roguelike session ended');
  }

  // ============================================================================
  // Hand Progression
  // ============================================================================

  /**
   * Called when a hand completes
   */
  onHandComplete(handInfo: {
    winnerId?: string;
    potSize: number;
    wasAllIn?: boolean;
    eliminatedPlayerIds?: string[];
  }): void {
    this.state.totalHandsPlayed++;
    this.state.handsInCurrentOrbit++;

    // Track pot wins
    if (handInfo.winnerId) {
      const currentWins = this.state.potsWonByPlayer.get(handInfo.winnerId) || 0;
      this.state.potsWonByPlayer.set(handInfo.winnerId, currentWins + 1);

      const largestPot = this.state.largestPotByPlayer.get(handInfo.winnerId) || 0;
      if (handInfo.potSize > largestPot) {
        this.state.largestPotByPlayer.set(handInfo.winnerId, handInfo.potSize);
      }

      // Update streaks
      this.relicManager.updateStreaks(handInfo.winnerId, true);
    }

    // Check for rogue break trigger
    this.checkRogueBreakTrigger();
  }

  /**
   * Called when a new orbit starts (dealer rotation complete)
   */
  onOrbitStart(): void {
    this.state.currentOrbit++;
    this.state.handsInCurrentOrbit = 0;
    this.relicManager.onOrbitStart();

    // Check for final orbit reveal
    if (this.config.finalOrbitReveal && this.state.currentOrbit >= this.config.maxOrbits) {
      this.relicManager.revealAllRelics();
    }

    this.emitEvent({
      type: 'orbit_started',
      timestamp: Date.now(),
      data: { orbitNumber: this.state.currentOrbit },
    });

    // Check for rogue break on orbit trigger
    if (this.config.rogueBreakTrigger === 'orbits') {
      this.checkRogueBreakTrigger();
    }
  }

  // ============================================================================
  // Rogue Break Management
  // ============================================================================

  /**
   * Check if a rogue break should trigger
   */
  private checkRogueBreakTrigger(): void {
    if (this.state.isInRogueBreak) return;
    if (this.state.rogueBreaksCompleted >= (this.config.maxRogueBreaks || 3)) return;

    let shouldTrigger = false;

    switch (this.config.rogueBreakTrigger) {
      case 'hands':
        const handsPerBreak = this.config.rogueBreakInterval;
        shouldTrigger = this.state.totalHandsPlayed > 0 &&
          this.state.totalHandsPlayed % handsPerBreak === 0;
        break;

      case 'orbits':
        const orbitsPerBreak = this.config.rogueBreakInterval;
        shouldTrigger = this.state.currentOrbit > 0 &&
          this.state.currentOrbit % orbitsPerBreak === 0 &&
          this.state.handsInCurrentOrbit === 0; // Only at start of orbit
        break;

      case 'blind_level':
        // This would be called externally when blinds increase
        break;

      case 'time':
        // Handled by timer
        break;

      case 'manual':
        // Only triggered manually
        break;
    }

    if (shouldTrigger) {
      this.emitEvent({
        type: 'rogue_break_triggered',
        timestamp: Date.now(),
        data: {
          trigger: this.config.rogueBreakTrigger,
          breakNumber: this.state.rogueBreaksCompleted + 1,
        },
      });
    }
  }

  /**
   * Start time-based rogue break timer
   */
  private startRogueBreakTimer(): void {
    const intervalMs = this.config.rogueBreakInterval * 60 * 1000; // Convert minutes to ms
    this.rogueBreakCheckTimer = setInterval(() => {
      if (!this.state.isInRogueBreak &&
          this.state.rogueBreaksCompleted < (this.config.maxRogueBreaks || 3)) {
        this.emitEvent({
          type: 'rogue_break_triggered',
          timestamp: Date.now(),
          data: { trigger: 'time', breakNumber: this.state.rogueBreaksCompleted + 1 },
        });
      }
    }, intervalMs);
  }

  /**
   * Start a rogue break (called by game when ready)
   */
  startRogueBreak(playerIds: string[]): void {
    if (this.state.isInRogueBreak) {
      console.warn('Rogue break already in progress');
      return;
    }

    this.state.isInRogueBreak = true;
    this.state.rogueBreakStartedAt = Date.now();

    const breakNumber = this.state.rogueBreaksCompleted + 1;
    const draftState = this.drafter.startDraft(breakNumber, playerIds);

    // Send options to each player
    for (const playerId of playerIds) {
      const options = this.drafter.getPlayerOptions(playerId);
      this.emitToPlayer(playerId, 'rogue_break_draft', {
        breakNumber,
        options: options.map(r => ({
          id: r.id,
          name: r.name,
          rarity: r.rarity,
          description: r.description,
          flavorText: r.flavorText,
          activationType: r.activationType,
          effect: r.effect,
        })),
        deadline: draftState.deadline,
        timeRemaining: this.config.draftTimeSeconds,
      });
    }

    this.emitEvent({
      type: 'rogue_break_started',
      timestamp: Date.now(),
      data: {
        breakNumber,
        playerCount: playerIds.length,
        draftTimeSeconds: this.config.draftTimeSeconds,
      },
    });

    console.log(`🎴 Rogue Break #${breakNumber} started`);

    // Set up draft completion handler
    this.drafter.addEventListener((event) => {
      if (event.type === 'draft_complete') {
        this.completeDraft();
      }
    });
  }

  /**
   * Player selects a relic during draft
   */
  selectRelic(playerId: string, relicId: string): { success: boolean; error?: string } {
    if (!this.state.isInRogueBreak) {
      return { success: false, error: 'No rogue break active' };
    }

    return this.drafter.selectRelic(playerId, relicId);
  }

  /**
   * Complete the draft and grant relics
   */
  private completeDraft(): void {
    const results = this.drafter.getDraftResults();
    const breakNumber = this.state.rogueBreaksCompleted + 1;

    // Grant selected relics to players
    for (const result of results) {
      if (result.selectedRelicId) {
        const options = this.drafter.getPlayerOptions(result.playerId);
        const selected = options.find(r => r.id === result.selectedRelicId);
        if (selected) {
          const playerRelic = this.relicManager.grantRelic(
            result.playerId,
            selected,
            this.state.currentOrbit
          );
          if (playerRelic) {
            const relics = this.state.playerRelics.get(result.playerId) || [];
            relics.push(playerRelic);
            this.state.playerRelics.set(result.playerId, relics);
          }
        }
      }
    }

    this.state.isInRogueBreak = false;
    this.state.rogueBreaksCompleted++;
    this.state.rogueBreakStartedAt = undefined;

    this.emitEvent({
      type: 'rogue_break_ended',
      timestamp: Date.now(),
      data: {
        breakNumber,
        results: results.map(r => ({
          playerId: r.playerId,
          selectedRelicId: r.selectedRelicId,
        })),
      },
    });

    console.log(`🎴 Rogue Break #${breakNumber} completed`);
  }

  // ============================================================================
  // Relic Effect Hooks
  // ============================================================================

  /**
   * Check and apply relic effects for a phase
   */
  checkRelicEffects(phase: RelicTriggerPhase, context: Omit<RelicContext, 'winStreak' | 'loseStreak'>): RelicEffectResult[] {
    const fullContext: RelicContext = {
      ...context,
      winStreak: this.relicManager.getWinStreak(context.playerId),
      loseStreak: this.relicManager.getLoseStreak(context.playerId),
    };

    return this.relicManager.checkTriggeredRelics(phase, fullContext);
  }

  /**
   * Manually activate a player's relic
   */
  activateRelic(playerId: string, relicId: string, context: Omit<RelicContext, 'winStreak' | 'loseStreak'>): RelicEffectResult {
    const fullContext: RelicContext = {
      ...context,
      winStreak: this.relicManager.getWinStreak(playerId),
      loseStreak: this.relicManager.getLoseStreak(playerId),
    };

    return this.relicManager.activateRelic(playerId, relicId, fullContext);
  }

  // ============================================================================
  // State Queries
  // ============================================================================

  /**
   * Get current session state
   */
  getState(): RoguelikeState {
    return { ...this.state };
  }

  /**
   * Get player's relics (as seen by a viewer)
   */
  getPlayerRelics(playerId: string, viewerId: string): PlayerRelic[] {
    return this.relicManager.getVisibleRelics(playerId, viewerId);
  }

  /**
   * Get all relics for a player (owner view)
   */
  getOwnRelics(playerId: string): PlayerRelic[] {
    return this.relicManager.getPlayerRelics(playerId);
  }

  /**
   * Check if session is in a rogue break
   */
  isInRogueBreak(): boolean {
    return this.state.isInRogueBreak;
  }

  /**
   * Get config
   */
  getConfig(): RoguelikeConfig {
    return { ...this.config };
  }

  // ============================================================================
  // Event System
  // ============================================================================

  /**
   * Handle relic events and forward to session listeners
   */
  private handleRelicEvent(event: RelicEvent): void {
    // Broadcast relic events via Socket.IO
    if (this.io) {
      this.io.emit('relic_event', event);
    }

    if (event.type === 'relic_activated' || event.type === 'relic_effect_applied') {
      this.emitEvent({
        type: 'relic_effect_triggered',
        timestamp: event.timestamp,
        data: {
          playerId: event.playerId,
          relicId: event.relicId,
          eventType: event.type,
          eventData: event.data,
        },
      });
    }
  }

  /**
   * Emit event to player
   */
  private emitToPlayer(playerId: string, event: string, data: any): void {
    if (this.io) {
      // This assumes players are in rooms named by their playerId
      this.io.to(playerId).emit(event, data);
    }
  }

  /**
   * Add session event listener
   */
  addEventListener(callback: (event: SessionEvent) => void): void {
    this.eventListeners.push(callback);
  }

  /**
   * Remove session event listener
   */
  removeEventListener(callback: (event: SessionEvent) => void): void {
    const index = this.eventListeners.indexOf(callback);
    if (index !== -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  /**
   * Emit session event
   */
  private emitEvent(event: SessionEvent): void {
    // Broadcast via Socket.IO
    if (this.io) {
      this.io.emit('roguelike_event', event);
    }

    // Notify local listeners
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in session event listener:', err);
      }
    }
  }
}
