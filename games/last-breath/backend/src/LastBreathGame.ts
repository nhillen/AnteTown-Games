/**
 * Last Breath - Core Game Logic
 *
 * A deterministic push-your-luck survival game where players descend through rooms,
 * managing oxygen, suit integrity, and corruption while maximizing data extraction.
 */

import { EventEmitter } from 'events';
import { mulberry32, generateSeed, randomInRange, randomBool } from './rng.js';
import type {
  LastBreathConfig,
  RunState,
  GameEvent,
  AdvanceResult,
  ExfiltrateResult
} from './types/index.js';

const DEFAULT_CONFIG: LastBreathConfig = {
  start: { O2: 100, Suit: 1.0, M0: 1.00 },
  costs: { O2Base: 5 },
  rewards: {
    muMin: 0.008,
    muMax: 0.018,
    pSurge: 0.12,
    surgeMin: 0.18,
    surgeMax: 0.30
  },
  hazard: {
    q0: 0.02,
    a: 0.010,
    beta: 0.020,
    lambda: 0.008
  },
  events: {
    leakP: 0.10,
    canisterP: 0.07,
    stabilizeP: 0.05
  },
  patch: {
    enabled: true,
    qReduction: 0.03,
    rewardPenalty: 0.5
  },
  ante: 100
};

/**
 * Server secret for seed generation
 * In production, this should be loaded from environment variables
 */
const SERVER_SECRET = process.env.LAST_BREATH_SECRET || 'last-breath-secret-key';

export class LastBreathGame extends EventEmitter {
  private config: LastBreathConfig;
  private activeRuns: Map<string, RunState>;
  private runCounter: number = 0;

  constructor(config?: Partial<LastBreathConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.activeRuns = new Map();
  }

  /**
   * Start a new run for a player
   */
  public startRun(playerId: string): RunState {
    const timestamp = Date.now();
    const nonce = this.runCounter++;
    const seed = generateSeed(SERVER_SECRET, playerId, timestamp, nonce);
    const runId = `${playerId}-${timestamp}-${nonce}`;

    const initialState: RunState = {
      runId,
      playerId,
      seed,
      rngCount: 0,
      depth: 0,
      O2: this.config.start.O2,
      Suit: this.config.start.Suit,
      Corruption: 0,
      DataMultiplier: this.config.start.M0,
      active: true,
      exfiltrated: false,
      currentEvents: [],
      eventHistory: [],
      actionHistory: []
    };

    this.activeRuns.set(runId, initialState);
    this.emit('run_started', { runId, playerId, seed });

    return initialState;
  }

  /**
   * Calculate hazard probability for current state
   */
  private calculateHazard(depth: number, corruption: number): number {
    const { q0, a, beta } = this.config.hazard;
    const q = q0 + a * depth + beta * corruption;
    return Math.max(0, Math.min(0.95, q)); // Clamp to [0, 0.95]
  }

  /**
   * Calculate reward gain for this step
   */
  private calculateRewardGain(
    rng: () => number,
    corruption: number,
    isSurge: boolean
  ): number {
    const { muMin, muMax, surgeMin, surgeMax } = this.config.rewards;
    const { lambda } = this.config.hazard;

    const baseGain = randomInRange(rng, muMin, muMax);
    const surgeGain = isSurge ? randomInRange(rng, surgeMin, surgeMax) : 0;
    const corruptionBoost = lambda * corruption;

    return baseGain + surgeGain + corruptionBoost;
  }

  /**
   * Generate events for this room
   */
  private generateEvents(rng: () => number, state: RunState): GameEvent[] {
    const events: GameEvent[] = [];
    const { leakP, canisterP, stabilizeP } = this.config.events;

    // Micro-leak
    if (randomBool(rng, leakP)) {
      events.push({
        type: 'micro-leak',
        description: 'Micro-leak detected in suit',
        effects: { Corruption: 1 }
      });
    }

    // Air canister
    if (randomBool(rng, canisterP)) {
      events.push({
        type: 'air-canister',
        description: 'Found emergency air canister',
        effects: { O2: 20, DataMultiplier: 0.10, Corruption: 1 }
      });
    }

    // Structural brace
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
   * Apply events to state
   */
  private applyEvents(state: RunState, events: GameEvent[]): void {
    for (const event of events) {
      if (event.effects.O2) {
        state.O2 += event.effects.O2;
      }
      if (event.effects.Suit) {
        state.Suit = Math.min(1.0, state.Suit + event.effects.Suit);
      }
      if (event.effects.Corruption) {
        state.Corruption += event.effects.Corruption;
      }
      if (event.effects.DataMultiplier) {
        state.DataMultiplier += event.effects.DataMultiplier;
      }
    }
  }

  /**
   * Advance to next room
   */
  public advance(runId: string): AdvanceResult {
    const state = this.activeRuns.get(runId);
    if (!state) {
      throw new Error(`Run ${runId} not found`);
    }

    if (!state.active) {
      throw new Error(`Run ${runId} is not active`);
    }

    // Create RNG from current state
    const rng = mulberry32(state.seed);

    // Fast-forward RNG to current position
    for (let i = 0; i < state.rngCount; i++) {
      rng();
    }

    // Increment depth
    state.depth++;
    state.actionHistory.push('advance');

    // Check for surge event
    const isSurge = randomBool(rng, this.config.rewards.pSurge);
    state.rngCount++;

    if (isSurge) {
      const event: GameEvent = {
        type: 'surge',
        description: 'Data surge detected!',
        effects: {
          DataMultiplier: randomInRange(
            rng,
            this.config.rewards.surgeMin,
            this.config.rewards.surgeMax
          ),
          Corruption: 1
        }
      };
      state.rngCount++;
      state.currentEvents.push(event);
      this.applyEvents(state, [event]);
    }

    // Generate room events
    const roomEvents = this.generateEvents(rng, state);
    state.rngCount += roomEvents.length * 2; // Each event uses ~2 RNG calls
    state.currentEvents.push(...roomEvents);
    state.eventHistory.push(...roomEvents);
    this.applyEvents(state, roomEvents);

    // Calculate and apply reward gain
    const rewardGain = this.calculateRewardGain(rng, state.Corruption, isSurge);
    state.rngCount++;
    state.DataMultiplier += rewardGain;

    // Apply O2 cost
    const o2Cost = this.config.costs.O2Base + state.Corruption;
    state.O2 -= o2Cost;

    // Apply suit decay
    const suitDecay = randomInRange(rng, 0.01, 0.03);
    state.rngCount++;
    state.Suit = Math.max(0, state.Suit - suitDecay);

    // Check for catastrophic failure (hazard)
    const hazardChance = this.calculateHazard(state.depth, state.Corruption);
    const hazardOccurred = randomBool(rng, hazardChance);
    state.rngCount++;

    // Check failure conditions
    if (hazardOccurred) {
      state.active = false;
      state.payout = 0;
      state.failureReason = 'hazard';
      this.activeRuns.delete(runId);
      this.emit('run_ended', { runId, success: false, reason: 'hazard' });

      return {
        success: false,
        newState: state,
        events: state.currentEvents,
        hazardOccurred: true,
        failureReason: 'hazard'
      };
    }

    if (state.O2 <= 0) {
      state.active = false;
      state.payout = 0;
      state.failureReason = 'oxygen';
      this.activeRuns.delete(runId);
      this.emit('run_ended', { runId, success: false, reason: 'oxygen' });

      return {
        success: false,
        newState: state,
        events: state.currentEvents,
        hazardOccurred: false,
        failureReason: 'oxygen'
      };
    }

    if (state.Suit <= 0) {
      state.active = false;
      state.payout = 0;
      state.failureReason = 'suit';
      this.activeRuns.delete(runId);
      this.emit('run_ended', { runId, success: false, reason: 'suit' });

      return {
        success: false,
        newState: state,
        events: state.currentEvents,
        hazardOccurred: false,
        failureReason: 'suit'
      };
    }

    // Success - room cleared
    return {
      success: true,
      newState: state,
      events: state.currentEvents,
      hazardOccurred: false
    };
  }

  /**
   * Exfiltrate and end run successfully
   */
  public exfiltrate(runId: string): ExfiltrateResult {
    const state = this.activeRuns.get(runId);
    if (!state) {
      throw new Error(`Run ${runId} not found`);
    }

    if (!state.active) {
      throw new Error(`Run ${runId} is not active`);
    }

    state.actionHistory.push('exfiltrate');
    state.active = false;
    state.exfiltrated = true;

    // Calculate payout: ante * multiplier
    const payout = Math.floor(this.config.ante * state.DataMultiplier);
    state.payout = payout;

    this.activeRuns.delete(runId);
    this.emit('run_ended', { runId, success: true, payout, multiplier: state.DataMultiplier });

    return {
      success: true,
      payout,
      finalMultiplier: state.DataMultiplier,
      finalState: state
    };
  }

  /**
   * Get current run state
   */
  public getRunState(runId: string): RunState | undefined {
    return this.activeRuns.get(runId);
  }

  /**
   * Get current configuration
   */
  public getConfig(): LastBreathConfig {
    return { ...this.config };
  }

  /**
   * Calculate next hazard probability (for UI display)
   */
  public getNextHazard(runId: string): number {
    const state = this.activeRuns.get(runId);
    if (!state) {
      throw new Error(`Run ${runId} not found`);
    }

    return this.calculateHazard(state.depth + 1, state.Corruption);
  }
}
