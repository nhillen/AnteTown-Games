/**
 * Shared Run Manager
 *
 * Manages shared runs where multiple players experience the same descent together.
 *
 * NEW MECHANICS:
 * - Auto-start: Timer begins when first player joins (10 seconds)
 * - Auto-advance: Run progresses automatically every 3 seconds
 * - Exfiltrate only: Players choose WHEN to cash out (no advance button)
 * - Variable bets: Each player sets their own bid amount
 * - Payout: Bid × DataMultiplier
 */

import { EventEmitter } from 'events';
import { mulberry32, generateSeed, randomInRange, randomBool } from './rng.js';
import type { LastBreathConfig, GameEvent } from './types/index.js';
import type { SharedRunState, PlayerRunState, SharedAdvanceResult, PlayerDecision } from './types/SharedRun.js';

const SERVER_SECRET = process.env.LAST_BREATH_SECRET || 'last-breath-secret-key';
const AUTO_START_DELAY = 10000;  // 10 seconds after first player joins
const AUTO_ADVANCE_INTERVAL = 3000;  // 3 seconds between rooms

export class SharedRunManager extends EventEmitter {
  private config: LastBreathConfig;
  private currentRun: SharedRunState | null = null;
  private runCounter: number = 0;
  private tableId: string;
  private autoStartTimer: NodeJS.Timeout | null = null;
  private autoAdvanceTimer: NodeJS.Timeout | null = null;

  constructor(tableId: string, config: LastBreathConfig) {
    super();
    this.tableId = tableId;
    this.config = config;
  }

  /**
   * Clean up timers
   */
  public destroy(): void {
    if (this.autoStartTimer) {
      clearTimeout(this.autoStartTimer);
      this.autoStartTimer = null;
    }
    if (this.autoAdvanceTimer) {
      clearInterval(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
    this.removeAllListeners();
  }

  /**
   * Start a new shared run (or join existing one in lobby)
   */
  public joinOrCreateRun(playerId: string, playerName: string, bid: number): SharedRunState {
    // If there's an active run in lobby phase, join it
    if (this.currentRun && this.currentRun.phase === 'lobby') {
      return this.joinRun(playerId, playerName, bid);
    }

    // Otherwise, create a new run
    return this.createRun(playerId, playerName, bid);
  }

  /**
   * Create a new shared run
   */
  private createRun(playerId: string, playerName: string, bid: number): SharedRunState {
    const timestamp = Date.now();
    const nonce = this.runCounter++;
    const seed = generateSeed(SERVER_SECRET, this.tableId, timestamp, nonce);
    const runId = `${this.tableId}-${timestamp}`;

    const playerState: PlayerRunState = {
      playerId,
      playerName,
      bid,
      active: true,
      exfiltrated: false,
      joinedAtDepth: 0
    };

    const autoStartAt = timestamp + AUTO_START_DELAY;

    this.currentRun = {
      runId,
      tableId: this.tableId,
      seed,
      depth: 0,
      O2: this.config.start.O2,
      Suit: this.config.start.Suit,
      Corruption: 0,
      DataMultiplier: this.config.start.M0,
      rngCount: 0,
      active: true,
      phase: 'lobby',
      currentEvents: [],
      eventHistory: [],
      players: new Map([[playerId, playerState]]),
      createdAt: timestamp,
      autoStartAt
    };

    // Start auto-start timer
    this.scheduleAutoStart();

    this.emit('run_created', { runId, seed, autoStartAt });
    return this.currentRun;
  }

  /**
   * Join an existing run in lobby
   */
  private joinRun(playerId: string, playerName: string, bid: number): SharedRunState {
    if (!this.currentRun) {
      throw new Error('No active run to join');
    }

    const playerState: PlayerRunState = {
      playerId,
      playerName,
      bid,
      active: true,
      exfiltrated: false,
      joinedAtDepth: this.currentRun.depth
    };

    this.currentRun.players.set(playerId, playerState);
    this.emit('player_joined', { runId: this.currentRun.runId, playerId });

    return this.currentRun;
  }

  /**
   * Schedule auto-start timer
   */
  private scheduleAutoStart(): void {
    if (!this.currentRun || this.currentRun.phase !== 'lobby') return;

    const delay = (this.currentRun.autoStartAt || 0) - Date.now();
    if (delay <= 0) {
      this.startDescent();
      return;
    }

    this.autoStartTimer = setTimeout(() => {
      this.startDescent();
    }, delay);
  }

  /**
   * Schedule auto-advance interval
   */
  private scheduleAutoAdvance(): void {
    if (this.autoAdvanceTimer) return; // Already running

    this.autoAdvanceTimer = setInterval(() => {
      if (this.currentRun && this.currentRun.phase === 'descending' && this.currentRun.active) {
        this.advanceRun();
      }
    }, AUTO_ADVANCE_INTERVAL);
  }

  /**
   * Start the descent (move from lobby to descending)
   */
  public startDescent(): void {
    if (!this.currentRun) {
      throw new Error('No run to start');
    }

    if (this.currentRun.phase !== 'lobby') {
      throw new Error('Run already started');
    }

    // Clear auto-start timer
    if (this.autoStartTimer) {
      clearTimeout(this.autoStartTimer);
      this.autoStartTimer = null;
    }

    this.currentRun.phase = 'descending';
    this.currentRun.startedAt = Date.now();
    this.currentRun.nextAdvanceAt = Date.now() + AUTO_ADVANCE_INTERVAL;

    // Start auto-advance timer
    this.scheduleAutoAdvance();

    this.emit('descent_started', { runId: this.currentRun.runId });
  }

  /**
   * Player exfiltrates (cashes out)
   */
  public playerDecision(playerId: string, decision: PlayerDecision): void {
    if (!this.currentRun) {
      throw new Error('No active run');
    }

    if (decision !== 'exfiltrate') {
      throw new Error('Invalid decision: only exfiltrate is allowed');
    }

    const player = this.currentRun.players.get(playerId);
    if (!player || !player.active) {
      throw new Error('Player not in active run');
    }

    // Player cashes out - they watch the rest with FOMO!
    player.active = false;
    player.exfiltrated = true;
    player.exfiltrateDepth = this.currentRun.depth;
    player.payout = Math.floor(player.bid * this.currentRun.DataMultiplier);

    this.emit('player_exfiltrated', {
      runId: this.currentRun.runId,
      playerId,
      depth: this.currentRun.depth,
      payout: player.payout
    });

    // Run continues even if all players exfiltrated - they can spectate for FOMO!
    // The run will end naturally when O2/Suit runs out or hazard occurs
  }

  /**
   * Advance the shared run (all active players move to next room)
   */
  private advanceRun(): SharedAdvanceResult {
    if (!this.currentRun) {
      throw new Error('No active run');
    }

    const run = this.currentRun;
    const rng = mulberry32(run.seed);

    // Fast-forward RNG to current position
    for (let i = 0; i < run.rngCount; i++) {
      rng();
    }

    // Increment depth
    run.depth++;
    run.currentEvents = [];

    // Check for surge event
    const isSurge = randomBool(rng, this.config.rewards.pSurge);
    run.rngCount++;

    if (isSurge) {
      const surgeGain = randomInRange(rng, this.config.rewards.surgeMin, this.config.rewards.surgeMax);
      run.rngCount++;
      const event: GameEvent = {
        type: 'surge',
        description: 'Data surge detected!',
        effects: { DataMultiplier: surgeGain, Corruption: 1 }
      };
      run.currentEvents.push(event);
      run.eventHistory.push(event);
      run.DataMultiplier += surgeGain;
      run.Corruption += 1;
    }

    // Generate room events (same for all players)
    const roomEvents = this.generateEvents(rng, run);
    run.rngCount += roomEvents.length * 2;
    run.currentEvents.push(...roomEvents);
    run.eventHistory.push(...roomEvents);
    this.applyEvents(run, roomEvents);

    // Calculate reward gain
    const baseGain = randomInRange(rng, this.config.rewards.muMin, this.config.rewards.muMax);
    const corruptionBoost = this.config.hazard.lambda * run.Corruption;
    run.rngCount++;
    run.DataMultiplier += baseGain + corruptionBoost;

    // Apply O2 cost and suit decay
    const o2Cost = this.config.costs.O2Base + run.Corruption;
    run.O2 -= o2Cost;

    const suitDecay = randomInRange(rng, 0.01, 0.03);
    run.rngCount++;
    run.Suit = Math.max(0, run.Suit - suitDecay);

    // Check hazard (affects all active players the same)
    const hazardChance = this.calculateHazard(run.depth, run.Corruption);
    const hazardOccurred = randomBool(rng, hazardChance);
    run.rngCount++;

    // Process each active player
    const playerResults = new Map<string, { survived: boolean; failureReason: 'oxygen' | 'suit' | 'hazard' | null }>();

    for (const [playerId, player] of run.players) {
      if (!player.active) {
        continue; // Skip players who already exfiltrated/busted
      }

      let survived = true;
      let failureReason: 'oxygen' | 'suit' | 'hazard' | null = null;

      if (hazardOccurred) {
        survived = false;
        failureReason = 'hazard';
      } else if (run.O2 <= 0) {
        survived = false;
        failureReason = 'oxygen';
      } else if (run.Suit <= 0) {
        survived = false;
        failureReason = 'suit';
      }

      if (!survived && failureReason) {
        player.active = false;
        player.bustReason = failureReason;
        player.bustDepth = run.depth;
        player.payout = 0;

        this.emit('player_busted', {
          runId: run.runId,
          playerId,
          reason: failureReason,
          depth: run.depth
        });
      }

      playerResults.set(playerId, { survived, failureReason });
    }

    // Check if run should end naturally (hazard, O2, or suit failure)
    // Run continues even if all players exfiltrated - they spectate for FOMO!
    const hasActivePlayers = Array.from(run.players.values()).some(p => p.active);
    const naturalEnding = hazardOccurred || run.O2 <= 0 || run.Suit <= 0;

    if (naturalEnding) {
      this.endRun();
    } else {
      // Update next advance time - run continues for spectators
      run.nextAdvanceAt = Date.now() + AUTO_ADVANCE_INTERVAL;
    }

    const result: SharedAdvanceResult = {
      success: !naturalEnding,
      newState: run,
      events: run.currentEvents,
      hazardOccurred,
      playerResults
    };

    this.emit('run_advanced', result);
    return result;
  }

  /**
   * End the current run
   */
  private endRun(): void {
    if (!this.currentRun) return;

    this.currentRun.active = false;
    this.currentRun.phase = 'completed';
    this.currentRun.completedAt = Date.now();

    // Clear auto-advance timer
    if (this.autoAdvanceTimer) {
      clearInterval(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }

    this.emit('run_completed', {
      runId: this.currentRun.runId,
      depth: this.currentRun.depth
    });

    // Clear current run after a delay to allow clients to see final state
    setTimeout(() => {
      this.currentRun = null;
    }, 5000);
  }

  /**
   * Generate random events for this room
   */
  private generateEvents(rng: () => number, state: SharedRunState): GameEvent[] {
    const events: GameEvent[] = [];
    const { leakP, canisterP, stabilizeP } = this.config.events;

    if (randomBool(rng, leakP)) {
      events.push({
        type: 'micro-leak',
        description: 'Micro-leak detected in suit',
        effects: { Corruption: 1 }
      });
    }

    if (randomBool(rng, canisterP)) {
      events.push({
        type: 'air-canister',
        description: 'Found emergency air canister',
        effects: { O2: 20, DataMultiplier: 0.10, Corruption: 1 }
      });
    }

    if (randomBool(rng, stabilizeP)) {
      events.push({
        type: 'structural-brace',
        description: 'Structural brace reinforces suit',
        effects: { Suit: 0.05 }
      });
    }

    return events;
  }

  /**
   * Apply events to shared state
   */
  private applyEvents(state: SharedRunState, events: GameEvent[]): void {
    for (const event of events) {
      if (event.effects.O2) state.O2 += event.effects.O2;
      if (event.effects.Suit) state.Suit = Math.min(1.0, state.Suit + event.effects.Suit);
      if (event.effects.Corruption) state.Corruption += event.effects.Corruption;
      if (event.effects.DataMultiplier) state.DataMultiplier += event.effects.DataMultiplier;
    }
  }

  /**
   * Calculate hazard probability
   */
  private calculateHazard(depth: number, corruption: number): number {
    const { q0, a, beta } = this.config.hazard;
    const q = q0 + a * depth + beta * corruption;
    return Math.max(0, Math.min(0.95, q));
  }

  /**
   * Get current run state
   */
  public getCurrentRun(): SharedRunState | null {
    return this.currentRun;
  }

  /**
   * Get config
   */
  public getConfig(): LastBreathConfig {
    return { ...this.config };
  }
}
