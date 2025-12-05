/**
 * Shared Run Manager
 *
 * Manages shared runs where multiple players experience the same descent together.
 *
 * MECHANICS:
 * - Connected watchers drive the loop (not staked players)
 * - Loop runs continuously when watchers are connected
 * - Players set "pending stakes" that auto-join the next dive
 * - No waiting for stakes - loop keeps rolling
 * - Players can set stakes at any time (during dive, after exfil, etc.)
 */

import { EventEmitter } from 'events';
import { mulberry32, generateSeed, randomInRange, randomBool } from './rng.js';
import type { LastBreathConfig, GameEvent } from './types/index.js';
import type { SharedRunState, PlayerRunState, SharedAdvanceResult, PlayerDecision } from './types/SharedRun.js';

const SERVER_SECRET = process.env.LAST_BREATH_SECRET || 'last-breath-secret-key';
const AUTO_START_DELAY = 10000;  // 10 seconds lobby countdown
const AUTO_ADVANCE_INTERVAL = 3000;  // 3 seconds between rooms
const NEXT_RUN_DELAY = 5000;  // 5 seconds between runs for players to adjust stakes

interface PendingStake {
  playerName: string;
  bid: number;
}

export class SharedRunManager extends EventEmitter {
  private config: LastBreathConfig;
  private currentRun: SharedRunState | null = null;
  private runCounter: number = 0;
  private tableId: string;
  private autoStartTimer: NodeJS.Timeout | null = null;
  private autoAdvanceTimer: NodeJS.Timeout | null = null;
  private nextRunTimer: NodeJS.Timeout | null = null;
  private nextRunAt: number | null = null;

  // Track connected watchers (all sockets watching this table)
  private connectedWatchers: Set<string> = new Set();

  // Track pending stakes (players who want to join next dive)
  private pendingStakes: Map<string, PendingStake> = new Map();

  constructor(tableId: string, config: LastBreathConfig) {
    super();
    this.tableId = tableId;
    this.config = config;
  }

  /**
   * Get the timestamp when the next run will start (for new clients joining)
   */
  public getNextRunAt(): number | null {
    return this.nextRunAt;
  }

  /**
   * Get pending stakes (for state sync)
   */
  public getPendingStakes(): Map<string, PendingStake> {
    return new Map(this.pendingStakes);
  }

  /**
   * Get connected watcher count
   */
  public getWatcherCount(): number {
    return this.connectedWatchers.size;
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
    if (this.nextRunTimer) {
      clearTimeout(this.nextRunTimer);
      this.nextRunTimer = null;
    }
    this.nextRunAt = null;
    this.connectedWatchers.clear();
    this.pendingStakes.clear();
    this.removeAllListeners();
  }

  /**
   * Player connects to the table (becomes a watcher)
   * This starts the game loop if it's the first watcher
   */
  public playerConnect(playerId: string, playerName: string): void {
    const wasEmpty = this.connectedWatchers.size === 0;
    this.connectedWatchers.add(playerId);

    console.log(`[Last Breath] Player connected: ${playerId} (${playerName}), total watchers: ${this.connectedWatchers.size}`);

    // If first watcher and no run exists, start the loop
    if (wasEmpty) {
      this.ensureLoopRunning();
    }
  }

  /**
   * Player disconnects from the table
   */
  public playerDisconnect(playerId: string): void {
    this.connectedWatchers.delete(playerId);
    this.pendingStakes.delete(playerId);

    console.log(`[Last Breath] Player disconnected: ${playerId}, remaining watchers: ${this.connectedWatchers.size}`);

    // Optionally pause loop if no watchers? For now, keep it running
    // The run will complete naturally and just wait for new watchers
  }

  /**
   * Player sets their stake for the next dive
   * Can be called at any time - during dive, after exfil, etc.
   */
  public setStake(playerId: string, playerName: string, bid: number): void {
    this.pendingStakes.set(playerId, { playerName, bid });
    console.log(`[Last Breath] Stake set: ${playerId} (${playerName}) = ${bid} TC`);

    this.emit('stake_set', {
      playerId,
      playerName,
      bid,
      pendingCount: this.pendingStakes.size
    });

    // If we're in lobby phase, add them immediately
    if (this.currentRun && this.currentRun.phase === 'lobby') {
      this.addPendingPlayerToLobby(playerId);
    }
  }

  /**
   * Player clears their stake (opt out of next dive)
   */
  public clearStake(playerId: string): void {
    this.pendingStakes.delete(playerId);
    console.log(`[Last Breath] Stake cleared: ${playerId}`);

    this.emit('stake_cleared', {
      playerId,
      pendingCount: this.pendingStakes.size
    });
  }

  /**
   * Ensure the game loop is running
   */
  private ensureLoopRunning(): void {
    // If no run and no scheduled run, create a lobby
    if (!this.currentRun && !this.nextRunAt) {
      this.createLobbyAndStart();
    }
  }

  /**
   * Create a lobby and start the countdown immediately
   */
  private createLobbyAndStart(): void {
    const timestamp = Date.now();
    const nonce = this.runCounter++;
    const seed = generateSeed(SERVER_SECRET, this.tableId, timestamp, nonce);
    const runId = `${this.tableId}-${timestamp}`;
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
      players: new Map(),
      createdAt: timestamp,
      autoStartAt
    };

    console.log(`[Last Breath] Created lobby with countdown: ${runId}, starts at ${autoStartAt}`);

    // Add all pending stakes to the lobby
    this.addAllPendingToLobby();

    // Start countdown timer
    this.scheduleAutoStart();

    this.emit('lobby_created', {
      runId,
      state: this.currentRun,
      autoStartAt
    });
  }

  /**
   * Add a single pending player to the current lobby
   * Players with bid=0 are sitting out and won't be added
   */
  private addPendingPlayerToLobby(playerId: string): void {
    if (!this.currentRun || this.currentRun.phase !== 'lobby') return;
    if (this.currentRun.players.has(playerId)) return; // Already in run

    const pending = this.pendingStakes.get(playerId);
    if (!pending) return;
    if (pending.bid <= 0) return; // Sitting out - don't add to lobby

    const playerState: PlayerRunState = {
      playerId,
      playerName: pending.playerName,
      bid: pending.bid,
      active: true,
      exfiltrated: false,
      joinedAtDepth: 0
    };

    this.currentRun.players.set(playerId, playerState);
    // Keep the pending stake - they'll auto-join future dives too

    console.log(`[Last Breath] Added pending player to lobby: ${playerId} (${pending.bid} TC)`);

    this.emit('player_joined', {
      runId: this.currentRun.runId,
      playerId,
      playerName: pending.playerName,
      playerCount: this.currentRun.players.size
    });
  }

  /**
   * Add all players with pending stakes to the current lobby
   * Players with bid=0 are sitting out and won't be added
   */
  private addAllPendingToLobby(): void {
    if (!this.currentRun || this.currentRun.phase !== 'lobby') return;

    let addedCount = 0;
    for (const [playerId, pending] of this.pendingStakes) {
      if (this.currentRun.players.has(playerId)) continue;
      if (pending.bid <= 0) continue; // Sitting out - skip

      const playerState: PlayerRunState = {
        playerId,
        playerName: pending.playerName,
        bid: pending.bid,
        active: true,
        exfiltrated: false,
        joinedAtDepth: 0
      };

      this.currentRun.players.set(playerId, playerState);
      addedCount++;
    }

    console.log(`[Last Breath] Added ${addedCount} players to lobby (${this.pendingStakes.size - addedCount} sitting out)`);
  }

  /**
   * Schedule auto-start timer
   */
  private scheduleAutoStart(): void {
    if (!this.currentRun || this.currentRun.phase !== 'lobby') return;

    // Clear existing timer
    if (this.autoStartTimer) {
      clearTimeout(this.autoStartTimer);
      this.autoStartTimer = null;
    }

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

    // Note: Their pending stake is still set, so they'll auto-join the next dive
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

    const completedRunId = this.currentRun.runId;
    const completedDepth = this.currentRun.depth;

    this.emit('run_completed', {
      runId: completedRunId,
      depth: completedDepth
    });

    // Clear current run
    this.currentRun = null;

    // Schedule next run after delay (gives players time to adjust stakes)
    if (this.connectedWatchers.size > 0 && NEXT_RUN_DELAY > 0) {
      this.nextRunAt = Date.now() + NEXT_RUN_DELAY;
      this.emit('next_run_scheduled', { nextRunAt: this.nextRunAt });

      this.nextRunTimer = setTimeout(() => {
        this.nextRunAt = null;
        this.nextRunTimer = null;
        this.createLobbyAndStart();
      }, NEXT_RUN_DELAY);
    } else if (this.connectedWatchers.size > 0) {
      // No delay - start immediately
      this.nextRunAt = null;
      setTimeout(() => {
        this.createLobbyAndStart();
      }, 100);
    }
  }

  /**
   * Create initial lobby when first player joins table (public method)
   * Called by server when no run exists
   */
  public createInitialLobby(): void {
    if (this.currentRun) return; // Don't overwrite existing run
    if (this.nextRunAt) return; // Don't interrupt next-run timer
    this.createLobbyAndStart();
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

  /**
   * Legacy method - now just sets stake and returns current run
   * @deprecated Use setStake instead
   */
  public joinOrCreateRun(playerId: string, playerName: string, bid: number): SharedRunState {
    this.setStake(playerId, playerName, bid);
    if (!this.currentRun) {
      this.createInitialLobby();
    }
    return this.currentRun!;
  }
}
