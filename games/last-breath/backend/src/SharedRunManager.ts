/**
 * Shared Run Manager
 *
 * Manages shared runs where multiple players experience the same descent together.
 * Creates FOMO: players who exit early watch others potentially go further!
 */

import { EventEmitter } from 'events';
import { mulberry32, generateSeed, randomInRange, randomBool } from './rng.js';
import type { LastBreathConfig, GameEvent } from './types/index.js';
import type { SharedRunState, PlayerRunState, SharedAdvanceResult, PlayerDecision } from './types/SharedRun.js';

const SERVER_SECRET = process.env.LAST_BREATH_SECRET || 'last-breath-secret-key';

export class SharedRunManager extends EventEmitter {
  private config: LastBreathConfig;
  private currentRun: SharedRunState | null = null;
  private runCounter: number = 0;
  private tableId: string;

  constructor(tableId: string, config: LastBreathConfig) {
    super();
    this.tableId = tableId;
    this.config = config;
  }

  /**
   * Start a new shared run (or join existing one in lobby)
   */
  public joinOrCreateRun(playerId: string, playerName: string): SharedRunState {
    // If there's an active run in lobby phase, join it
    if (this.currentRun && this.currentRun.phase === 'lobby') {
      return this.joinRun(playerId, playerName);
    }

    // Otherwise, create a new run
    return this.createRun(playerId, playerName);
  }

  /**
   * Create a new shared run
   */
  private createRun(playerId: string, playerName: string): SharedRunState {
    const timestamp = Date.now();
    const nonce = this.runCounter++;
    const seed = generateSeed(SERVER_SECRET, this.tableId, timestamp, nonce);
    const runId = `${this.tableId}-${timestamp}`;

    const playerState: PlayerRunState = {
      playerId,
      playerName,
      active: true,
      exfiltrated: false,
      joinedAtDepth: 0
    };

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
      awaitingDecisions: new Set(),
      createdAt: timestamp
    };

    this.emit('run_created', { runId, seed });
    return this.currentRun;
  }

  /**
   * Join an existing run in lobby
   */
  private joinRun(playerId: string, playerName: string): SharedRunState {
    if (!this.currentRun) {
      throw new Error('No active run to join');
    }

    const playerState: PlayerRunState = {
      playerId,
      playerName,
      active: true,
      exfiltrated: false,
      joinedAtDepth: this.currentRun.depth
    };

    this.currentRun.players.set(playerId, playerState);
    this.emit('player_joined', { runId: this.currentRun.runId, playerId });

    return this.currentRun;
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

    this.currentRun.phase = 'descending';
    this.currentRun.startedAt = Date.now();

    // All active players need to make first decision
    for (const [playerId, player] of this.currentRun.players) {
      if (player.active) {
        this.currentRun.awaitingDecisions.add(playerId);
      }
    }

    this.emit('descent_started', { runId: this.currentRun.runId });
  }

  /**
   * Player makes a decision (advance or exfiltrate)
   */
  public playerDecision(playerId: string, decision: PlayerDecision): void {
    if (!this.currentRun) {
      throw new Error('No active run');
    }

    const player = this.currentRun.players.get(playerId);
    if (!player || !player.active) {
      throw new Error('Player not in active run');
    }

    this.currentRun.awaitingDecisions.delete(playerId);

    if (decision === 'exfiltrate') {
      // Player cashes out - they watch the rest with FOMO!
      player.active = false;
      player.exfiltrated = true;
      player.exfiltrateDepth = this.currentRun.depth;
      player.payout = Math.floor(this.config.ante * this.currentRun.DataMultiplier);

      this.emit('player_exfiltrated', {
        runId: this.currentRun.runId,
        playerId,
        depth: this.currentRun.depth,
        payout: player.payout
      });
    }

    // If all active players have decided, advance the run
    if (this.currentRun.awaitingDecisions.size === 0) {
      this.advanceRun();
    }
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
      } else {
        // Player survived, they need to make next decision
        run.awaitingDecisions.add(playerId);
      }

      playerResults.set(playerId, { survived, failureReason });
    }

    // Check if run should end (all players out)
    const hasActivePlayers = Array.from(run.players.values()).some(p => p.active);
    if (!hasActivePlayers || hazardOccurred) {
      run.active = false;
      run.phase = 'completed';
      run.completedAt = Date.now();
      this.emit('run_completed', { runId: run.runId, depth: run.depth });
    }

    const result: SharedAdvanceResult = {
      success: hasActivePlayers && !hazardOccurred,
      newState: run,
      events: run.currentEvents,
      hazardOccurred,
      playerResults
    };

    this.emit('run_advanced', result);
    return result;
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
