# Implementation Guide: Building House Rules Roguelike System

**Purpose:** Step-by-step guide to transform the current poker engine into a full roguelike poker game.
**Audience:** Developers implementing the GDD
**Estimated Total Time:** 60-80 hours

---

## Table of Contents

1. [Phase 1: Relic System Foundation](#phase-1-relic-system-foundation)
2. [Phase 2: Rogue Break & Draft System](#phase-2-rogue-break--draft-system)
3. [Phase 3: Orbit & Round Tracking](#phase-3-orbit--round-tracking)
4. [Phase 4: Session Management](#phase-4-session-management)
5. [Phase 5: UI & Polish](#phase-5-ui--polish)
6. [Phase 6: Telemetry](#phase-6-telemetry)
7. [Phase 7: AI & Testing](#phase-7-ai--testing)

---

## Phase 1: Relic System Foundation

**Goal:** Create the core data structures and logic for relics.
**Duration:** 10-15 hours

### Step 1.1: Create Relic Type Definitions

**File:** `src/relics/types.ts`

```typescript
export type RelicRarity = 'common' | 'rare' | 'epic';
export type RelicActivationType = 'passive' | 'triggered' | 'conditional';

export type RelicEffectType =
  | 'modify_pot'           // Change pot size
  | 'modify_stack'         // Change player stack
  | 'modify_cards'         // Redeal/change cards
  | 'peek_info'            // Reveal hidden info
  | 'modify_blinds'        // Change blind amounts
  | 'conditional_bonus';   // Triggered by specific conditions

export interface RelicEffectParams {
  // For modify_pot / modify_stack
  amount?: number;
  percentage?: number;

  // For modify_cards
  cardType?: 'hole' | 'flop' | 'turn' | 'river';
  cardCount?: number;

  // For peek_info
  infoType?: 'opponent_cards' | 'next_card' | 'mucked_cards';

  // For conditional_bonus
  condition?: 'win_with_pair' | 'lose_hand' | 'win_allin' | 'multi_hand_loss';
  bonusAmount?: number;
  bonusPercentage?: number;
}

export interface RelicEffect {
  type: RelicEffectType;
  params: RelicEffectParams;
  triggerPhase?: 'pre_deal' | 'post_deal' | 'pre_flop' | 'post_flop' | 'showdown';
}

export interface Relic {
  id: string;
  name: string;
  rarity: RelicRarity;
  activationType: RelicActivationType;
  description: string;
  flavorText?: string;  // Latin quote for UI

  // State tracking
  isRevealed: boolean;
  isActive: boolean;

  // For triggered relics
  maxUses?: number;
  currentUses: number;
  cooldownTurns?: number;
  currentCooldown: number;

  // For conditional relics
  triggerCondition?: string;
  conditionMet: boolean;

  // Effect definition
  effect: RelicEffect;
}

export interface RelicInstance extends Relic {
  ownerId: string;      // Player who owns this relic
  acquiredRound: number; // Which round was it acquired
  usageCount: number;    // How many times it's been used
  chipImpact: number;    // Net chip gain/loss from this relic
}
```

**Test:** Compile with `npm run build`

---

### Step 1.2: Create Relic Definitions JSON

**File:** `src/relics/relics.json`

```json
{
  "relics": [
    {
      "id": "lucky_pair",
      "name": "Lucky Pair",
      "rarity": "common",
      "activationType": "passive",
      "description": "First pocket pair each orbit yields +5% chip bonus on win.",
      "flavorText": "Fortuna favet fortibus",
      "maxUses": 1,
      "effect": {
        "type": "conditional_bonus",
        "triggerPhase": "showdown",
        "params": {
          "condition": "win_with_pair",
          "bonusPercentage": 5
        }
      }
    },
    {
      "id": "peekaboo",
      "name": "Peekaboo",
      "rarity": "common",
      "activationType": "triggered",
      "description": "Once per orbit, peek one random mucked card after showdown.",
      "flavorText": "Videre est credere",
      "maxUses": 1,
      "cooldownTurns": 0,
      "effect": {
        "type": "peek_info",
        "triggerPhase": "showdown",
        "params": {
          "infoType": "mucked_cards"
        }
      }
    },
    {
      "id": "chip_magnet",
      "name": "Chip Magnet",
      "rarity": "common",
      "activationType": "passive",
      "description": "Gain +2% chips on any pot over 500.",
      "flavorText": "Aurum crescit",
      "effect": {
        "type": "modify_pot",
        "triggerPhase": "showdown",
        "params": {
          "percentage": 2,
          "condition": "pot_over_threshold"
        }
      }
    },
    {
      "id": "mulligan",
      "name": "Mulligan",
      "rarity": "rare",
      "activationType": "triggered",
      "description": "Once per orbit, redraw both hole cards before flop.",
      "flavorText": "Iterum temptare",
      "maxUses": 1,
      "cooldownTurns": 0,
      "effect": {
        "type": "modify_cards",
        "triggerPhase": "pre_flop",
        "params": {
          "cardType": "hole",
          "cardCount": 2
        }
      }
    },
    {
      "id": "weighted_flop",
      "name": "Weighted Flop",
      "rarity": "rare",
      "activationType": "triggered",
      "description": "Once per round, re-roll one flop card.",
      "flavorText": "Fata viam invenient",
      "maxUses": 1,
      "effect": {
        "type": "modify_cards",
        "triggerPhase": "post_flop",
        "params": {
          "cardType": "flop",
          "cardCount": 1
        }
      }
    },
    {
      "id": "debt_marker",
      "name": "Debt Marker",
      "rarity": "rare",
      "activationType": "passive",
      "description": "Immediately gain +10% stack; lose 15% next orbit.",
      "flavorText": "Debitum crescit",
      "effect": {
        "type": "modify_stack",
        "triggerPhase": "immediate",
        "params": {
          "percentage": 10
        }
      }
    },
    {
      "id": "the_dealer",
      "name": "The Dealer",
      "rarity": "epic",
      "activationType": "triggered",
      "description": "Once per match, re-deal the entire flop.",
      "flavorText": "Omnia mutantur",
      "maxUses": 1,
      "effect": {
        "type": "modify_cards",
        "triggerPhase": "post_flop",
        "params": {
          "cardType": "flop",
          "cardCount": 3
        }
      }
    },
    {
      "id": "chaos_burn",
      "name": "Chaos Burn",
      "rarity": "epic",
      "activationType": "triggered",
      "description": "Replace turn & river with three random community cards; pot doubles automatically.",
      "flavorText": "Ignis mutationis",
      "maxUses": 1,
      "effect": {
        "type": "modify_cards",
        "triggerPhase": "post_turn",
        "params": {
          "cardType": "river",
          "cardCount": 3
        }
      }
    },
    {
      "id": "echo_tell",
      "name": "Echo Tell",
      "rarity": "rare",
      "activationType": "passive",
      "description": "When another player reveals a relic, view their hole cards that hand.",
      "flavorText": "Audere est facere",
      "effect": {
        "type": "peek_info",
        "triggerPhase": "immediate",
        "params": {
          "infoType": "opponent_cards"
        }
      }
    },
    {
      "id": "gamblers_soul",
      "name": "The Gambler's Soul",
      "rarity": "common",
      "activationType": "conditional",
      "description": "After losing a hand, your next win yields +10% pot bonus.",
      "flavorText": "Post tenebras lux",
      "effect": {
        "type": "conditional_bonus",
        "triggerPhase": "showdown",
        "params": {
          "condition": "lose_hand",
          "bonusPercentage": 10
        }
      }
    },
    {
      "id": "mirror_tell",
      "name": "Mirror Tell",
      "rarity": "common",
      "activationType": "passive",
      "description": "Reveals rarity color of any opponent relic upon trigger.",
      "flavorText": "Speculum veritatis",
      "effect": {
        "type": "peek_info",
        "params": {
          "infoType": "relic_rarity"
        }
      }
    },
    {
      "id": "allin_engine",
      "name": "All-In Engine",
      "rarity": "epic",
      "activationType": "conditional",
      "description": "When you win an all-in, permanently gain +10% stack. Single activation.",
      "flavorText": "Audaces fortuna iuvat",
      "maxUses": 1,
      "effect": {
        "type": "modify_stack",
        "triggerPhase": "showdown",
        "params": {
          "condition": "win_allin",
          "percentage": 10
        }
      }
    }
  ]
}
```

**Test:** Load JSON with Node.js: `node -e "console.log(require('./src/relics/relics.json'))"`

---

### Step 1.3: Implement Relic Manager

**File:** `src/relics/RelicManager.ts`

```typescript
import relicsData from './relics.json';
import { Relic, RelicInstance, RelicRarity, RelicEffectType } from './types';

export class RelicManager {
  private relicDefinitions: Map<string, Relic>;
  private playerRelics: Map<string, RelicInstance[]>; // playerId -> relics[]

  constructor() {
    this.relicDefinitions = new Map();
    this.playerRelics = new Map();
    this.loadRelics();
  }

  private loadRelics(): void {
    relicsData.relics.forEach((relic: any) => {
      this.relicDefinitions.set(relic.id, {
        ...relic,
        isRevealed: false,
        isActive: false,
        currentUses: 0,
        currentCooldown: 0,
        conditionMet: false
      });
    });

    console.log(`✨ Loaded ${this.relicDefinitions.size} relic definitions`);
  }

  /**
   * Draft N relics from the pool filtered by rarity
   */
  public draftRelics(count: number, rarities: RelicRarity[]): Relic[] {
    const pool = Array.from(this.relicDefinitions.values()).filter(r =>
      rarities.includes(r.rarity)
    );

    // Weighted random selection
    const drafted: Relic[] = [];
    for (let i = 0; i < count; i++) {
      if (pool.length === 0) break;

      const weights = pool.map(r => this.getRarityWeight(r.rarity));
      const selected = this.weightedRandom(pool, weights);
      drafted.push({ ...selected });

      // Remove from pool to avoid duplicates
      const idx = pool.findIndex(r => r.id === selected.id);
      pool.splice(idx, 1);
    }

    return drafted;
  }

  /**
   * Assign relic to player
   */
  public grantRelic(playerId: string, relic: Relic, round: number): RelicInstance {
    if (!this.playerRelics.has(playerId)) {
      this.playerRelics.set(playerId, []);
    }

    const instance: RelicInstance = {
      ...relic,
      ownerId: playerId,
      acquiredRound: round,
      usageCount: 0,
      chipImpact: 0,
      isActive: relic.activationType === 'passive' // Auto-activate passives
    };

    this.playerRelics.get(playerId)!.push(instance);
    console.log(`✨ ${playerId} acquired ${relic.name} (${relic.rarity})`);

    return instance;
  }

  /**
   * Get all relics for a player
   */
  public getPlayerRelics(playerId: string): RelicInstance[] {
    return this.playerRelics.get(playerId) || [];
  }

  /**
   * Activate a triggered relic
   */
  public activateRelic(playerId: string, relicId: string): boolean {
    const relics = this.getPlayerRelics(playerId);
    const relic = relics.find(r => r.id === relicId);

    if (!relic) {
      console.warn(`❌ Relic ${relicId} not found for player ${playerId}`);
      return false;
    }

    if (relic.activationType !== 'triggered') {
      console.warn(`❌ Relic ${relicId} is not triggered type`);
      return false;
    }

    if (relic.currentCooldown > 0) {
      console.warn(`❌ Relic ${relicId} is on cooldown (${relic.currentCooldown} turns)`);
      return false;
    }

    if (relic.maxUses && relic.currentUses >= relic.maxUses) {
      console.warn(`❌ Relic ${relicId} has no uses remaining`);
      return false;
    }

    // Activate
    relic.isRevealed = true;
    relic.isActive = true;
    relic.currentUses++;
    relic.usageCount++;

    if (relic.cooldownTurns) {
      relic.currentCooldown = relic.cooldownTurns;
    }

    console.log(`✨ ${playerId} activated ${relic.name}!`);
    return true;
  }

  /**
   * Check if conditional relic should trigger
   */
  public checkConditionalTrigger(
    playerId: string,
    condition: string,
    context: any
  ): RelicInstance[] {
    const relics = this.getPlayerRelics(playerId);
    const triggered: RelicInstance[] = [];

    relics.forEach(relic => {
      if (relic.activationType !== 'conditional') return;
      if (relic.effect.params.condition !== condition) return;
      if (relic.maxUses && relic.currentUses >= relic.maxUses) return;

      // Trigger the relic
      relic.isRevealed = true;
      relic.isActive = true;
      relic.currentUses++;
      relic.usageCount++;
      triggered.push(relic);

      console.log(`✨ ${playerId}'s ${relic.name} triggered by ${condition}`);
    });

    return triggered;
  }

  /**
   * Decrement cooldowns at end of orbit
   */
  public decrementCooldowns(playerId: string): void {
    const relics = this.getPlayerRelics(playerId);
    relics.forEach(relic => {
      if (relic.currentCooldown > 0) {
        relic.currentCooldown--;
      }
    });
  }

  /**
   * Reset orbit-specific relic uses
   */
  public resetOrbitRelics(playerId: string): void {
    const relics = this.getPlayerRelics(playerId);
    relics.forEach(relic => {
      if (relic.cooldownTurns === 0) {
        relic.currentUses = 0; // Reset uses for orbit-limited relics
      }
    });
  }

  private getRarityWeight(rarity: RelicRarity): number {
    switch (rarity) {
      case 'common': return 60;
      case 'rare': return 30;
      case 'epic': return 10;
    }
  }

  private weightedRandom<T>(items: T[], weights: number[]): T {
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < items.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return items[i];
      }
    }

    return items[items.length - 1];
  }
}
```

**Test:**
```typescript
// test/relicManager.test.ts
const manager = new RelicManager();
const relics = manager.draftRelics(2, ['common', 'rare']);
console.log('Drafted relics:', relics);
manager.grantRelic('player1', relics[0], 1);
console.log('Player relics:', manager.getPlayerRelics('player1'));
```

---

### Step 1.4: Modify Core Types

**File:** `src/types.ts` (append)

```typescript
import { RelicInstance } from './relics/types';

export interface PokerSeat {
  holeCards: Card[];
  lastAction?: PokerAction;
  relics: RelicInstance[];  // NEW
  relicEffectsActive: string[]; // IDs of currently active relic effects
}

export type PokerPhase =
  | 'Lobby'
  | 'PreHand'
  | 'PreFlop'
  | 'Flop'
  | 'Turn'
  | 'River'
  | 'Showdown'
  | 'RogueBreak'     // NEW
  | 'FinalReveal';   // NEW
```

---

### Step 1.5: Integrate Relic Manager into HouseRules

**File:** `src/HouseRules.ts` (add at top)

```typescript
import { RelicManager } from './relics/RelicManager.js';

export class HouseRules extends GameBase {
  // ... existing fields
  private relicManager: RelicManager;

  constructor(tableConfig: any) {
    super(tableConfig);
    this.relicManager = new RelicManager();
    // ... rest of constructor
  }

  protected initializeGameState(phase: PokerPhase): void {
    const seats: (Seat & PokerSeat)[] = Array(this.tableConfig.maxSeats)
      .fill(null)
      .map(() => ({
        // ... existing seat fields
        relics: [],
        relicEffectsActive: []
      }));

    // ... rest of initialization
  }

  public sitPlayer(player: Player, seatIndex?: number, buyInAmount?: number) {
    const result = super.sitPlayer(player, seatIndex, buyInAmount);

    if (result.success && result.seatIndex !== undefined) {
      // Grant starting Common relic
      const startingRelics = this.relicManager.draftRelics(1, ['common']);
      const seat = this.gameState!.seats[result.seatIndex] as Seat & PokerSeat;

      if (startingRelics.length > 0) {
        const relic = this.relicManager.grantRelic(
          player.id,
          startingRelics[0],
          0 // Round 0 = starting relic
        );
        seat.relics.push(relic);
      }
    }

    return result;
  }
}
```

**Test:** Build and run: `npm run build`

---

## Phase 2: Rogue Break & Draft System

**Goal:** Implement periodic breaks for relic drafting.
**Duration:** 6-8 hours

### Step 2.1: Add Round Tracking to Game State

**File:** `src/HouseRules.ts` (modify interface)

```typescript
interface HouseRulesGameState extends GameState {
  // ... existing fields
  currentRound: number;
  handsInCurrentRound: number;
  handsPerRound: number;
  orbitCount: number;
  rogueBreakOptions: Map<string, [Relic, Relic]>; // playerId -> [option1, option2]
}
```

**In constructor:**
```typescript
this.gameState = {
  // ... existing fields
  currentRound: 1,
  handsInCurrentRound: 0,
  handsPerRound: 12, // 10-15 hands
  orbitCount: 1,
  rogueBreakOptions: new Map()
};
```

---

### Step 2.2: Trigger Rogue Break After N Hands

**File:** `src/HouseRules.ts` (in `resolveShowdown`)

```typescript
private resolveShowdown(): void {
  // ... existing winner logic

  this.gameState.handsInCurrentRound++;

  // Check if we should trigger a Rogue Break
  if (this.shouldTriggerRogueBreak()) {
    this.startRogueBreak();
  } else {
    this.gameState.phase = 'PreHand';
  }

  this.broadcastGameState();
}

private shouldTriggerRogueBreak(): boolean {
  if (this.gameState.currentRound >= 3) return false; // No break after round 3

  return this.gameState.handsInCurrentRound >= this.gameState.handsPerRound;
}

private startRogueBreak(): void {
  this.gameState.phase = 'RogueBreak';
  console.log(`🎰 Rogue Break ${this.gameState.currentRound} starting...`);

  // Generate relic options for each player
  this.gameState.seats.forEach((seat, idx) => {
    if (!seat) return;

    const rarities = this.getRaritiesForRound(this.gameState.currentRound);
    const options = this.relicManager.draftRelics(2, rarities);

    if (options.length === 2) {
      this.gameState.rogueBreakOptions.set(seat.playerId, [options[0], options[1]]);
    }
  });

  this.broadcastGameState();
}

private getRaritiesForRound(round: number): RelicRarity[] {
  switch (round) {
    case 1: return ['common', 'rare'];
    case 2: return ['rare', 'epic'];
    case 3: return ['rare', 'epic'];
    default: return ['common'];
  }
}
```

---

### Step 2.3: Handle Player Relic Selection

**File:** `src/HouseRules.ts` (new method)

```typescript
public handleRelicSelection(playerId: string, relicId: string): void {
  if (this.gameState.phase !== 'RogueBreak') {
    console.warn('❌ Not in Rogue Break phase');
    return;
  }

  const options = this.gameState.rogueBreakOptions.get(playerId);
  if (!options) {
    console.warn(`❌ No relic options for player ${playerId}`);
    return;
  }

  const selectedRelic = options.find(r => r.id === relicId);
  if (!selectedRelic) {
    console.warn(`❌ Invalid relic selection: ${relicId}`);
    return;
  }

  // Grant relic to player
  const seat = this.gameState.seats.find(s => s?.playerId === playerId);
  if (seat) {
    const relicInstance = this.relicManager.grantRelic(
      playerId,
      selectedRelic,
      this.gameState.currentRound
    );
    (seat as Seat & PokerSeat).relics.push(relicInstance);
  }

  // Remove from pending selections
  this.gameState.rogueBreakOptions.delete(playerId);

  console.log(`✨ ${seat?.name} selected ${selectedRelic.name}`);

  // Check if all players have selected
  if (this.gameState.rogueBreakOptions.size === 0) {
    this.endRogueBreak();
  }
}

private endRogueBreak(): void {
  console.log('🎰 Rogue Break complete, resuming poker...');

  this.gameState.currentRound++;
  this.gameState.handsInCurrentRound = 0;
  this.gameState.phase = 'PreHand';

  this.broadcastGameState();
}
```

**Test:** Start game, play 12 hands, verify break triggers

---

## Phase 3: Orbit & Round Tracking

**Duration:** 2-3 hours

### Step 3.1: Track Dealer Button Orbits

**File:** `src/HouseRules.ts` (modify `startHand`)

```typescript
startHand(): void {
  // ... existing logic

  // Check if dealer button completed full orbit
  const previousDealer = this.gameState.dealerSeatIndex;
  this.gameState.dealerSeatIndex = this.getNextActiveSeat(this.gameState.dealerSeatIndex);

  // If we looped back, increment orbit
  if (this.gameState.dealerSeatIndex <= previousDealer) {
    this.gameState.orbitCount++;
    this.onOrbitComplete();
  }

  // ... rest of hand logic
}

private onOrbitComplete(): void {
  console.log(`🎰 Orbit ${this.gameState.orbitCount} complete`);

  // Escalate blinds by 25%
  this.gameState.smallBlind = Math.floor(this.gameState.smallBlind * 1.25);
  this.gameState.bigBlind = Math.floor(this.gameState.bigBlind * 1.25);

  console.log(`🎰 Blinds now: ${this.gameState.smallBlind}/${this.gameState.bigBlind}`);

  // Reset orbit-limited relics
  this.gameState.seats.forEach(seat => {
    if (seat) {
      this.relicManager.resetOrbitRelics(seat.playerId);
      this.relicManager.decrementCooldowns(seat.playerId);
    }
  });
}
```

**Test:** Play multiple hands, verify orbits increment and blinds increase

---

## Phase 4: Session Management

**Duration:** 3-4 hours

### Step 4.1: Add Session Timer

**File:** `src/HouseRules.ts` (game state)

```typescript
interface HouseRulesGameState extends GameState {
  // ... existing fields
  sessionStartTime: number;
  sessionDurationMs: number;
  maxOrbits: number;
  totalPotsWonByPlayer: Map<string, number>;
  largestPotByPlayer: Map<string, number>;
}

// In constructor
this.gameState = {
  // ... existing
  sessionStartTime: Date.now(),
  sessionDurationMs: 30 * 60 * 1000, // 30 minutes
  maxOrbits: 4,
  totalPotsWonByPlayer: new Map(),
  largestPotByPlayer: new Map()
};
```

---

### Step 4.2: Check Victory Conditions

**File:** `src/HouseRules.ts`

```typescript
private resolveShowdown(): void {
  // ... existing winner logic

  // Track pot stats
  const winnerSeat = /* ... winner from evaluation */;
  if (winnerSeat) {
    const playerId = winnerSeat.playerId;
    const currentTotal = this.gameState.totalPotsWonByPlayer.get(playerId) || 0;
    this.gameState.totalPotsWonByPlayer.set(playerId, currentTotal + 1);

    const currentLargest = this.gameState.largestPotByPlayer.get(playerId) || 0;
    if (this.gameState.pot > currentLargest) {
      this.gameState.largestPotByPlayer.set(playerId, this.gameState.pot);
    }
  }

  // Check for session end
  if (this.checkSessionEnd()) {
    this.endSession();
    return;
  }

  // ... rest of logic
}

private checkSessionEnd(): boolean {
  // Check elimination victory
  const activePlayers = this.gameState.seats.filter(s => s && s.tableStack > 0);
  if (activePlayers.length === 1) {
    return true;
  }

  // Check orbit limit
  if (this.gameState.orbitCount >= this.gameState.maxOrbits) {
    return true;
  }

  // Check time limit
  const elapsed = Date.now() - this.gameState.sessionStartTime;
  if (elapsed >= this.gameState.sessionDurationMs) {
    return true;
  }

  return false;
}

private endSession(): void {
  console.log('🎰 Session complete!');

  const winner = this.determineWinner();
  console.log(`🎰 Winner: ${winner.name} with ${winner.tableStack} chips`);

  this.gameState.phase = 'FinalReveal';
  this.broadcastGameState();

  // Generate telemetry report
  // ... (Phase 6)
}

private determineWinner(): Seat & PokerSeat {
  const activePlayers = this.gameState.seats.filter(s => s !== null);

  activePlayers.sort((a, b) => {
    // Primary: chip count
    if (b.tableStack !== a.tableStack) return b.tableStack - a.tableStack;

    // Tiebreak 1: total pots won
    const bPots = this.gameState.totalPotsWonByPlayer.get(b.playerId) || 0;
    const aPots = this.gameState.totalPotsWonByPlayer.get(a.playerId) || 0;
    if (bPots !== aPots) return bPots - aPots;

    // Tiebreak 2: largest single pot
    const bLargest = this.gameState.largestPotByPlayer.get(b.playerId) || 0;
    const aLargest = this.gameState.largestPotByPlayer.get(a.playerId) || 0;
    return bLargest - aLargest;
  });

  return activePlayers[0] as Seat & PokerSeat;
}
```

---

## Phase 5: UI & Polish

**Duration:** 10-12 hours

### Step 5.1: Relic HUD Component

**File:** `src/components/RelicHUD.tsx`

```tsx
import React from 'react';
import { RelicInstance } from '../relics/types';
import clsx from 'clsx';

interface RelicHUDProps {
  relics: RelicInstance[];
  onActivate?: (relicId: string) => void;
  isMyTurn: boolean;
}

export const RelicHUD: React.FC<RelicHUDProps> = ({ relics, onActivate, isMyTurn }) => {
  return (
    <div className="relic-hud">
      {relics.map(relic => (
        <div
          key={relic.id}
          className={clsx('relic-card', {
            'relic-revealed': relic.isRevealed,
            'relic-hidden': !relic.isRevealed,
            [`rarity-${relic.rarity}`]: true,
            'on-cooldown': relic.currentCooldown > 0,
            'used-up': relic.maxUses && relic.currentUses >= relic.maxUses
          })}
          onClick={() => {
            if (relic.activationType === 'triggered' && isMyTurn && onActivate) {
              onActivate(relic.id);
            }
          }}
        >
          {relic.isRevealed ? (
            <>
              <div className="relic-name">{relic.name}</div>
              <div className="relic-description">{relic.description}</div>
              {relic.currentCooldown > 0 && (
                <div className="cooldown-overlay">{relic.currentCooldown}</div>
              )}
            </>
          ) : (
            <div className="relic-back">
              <div className={`rarity-glow ${relic.rarity}`}></div>
              <div className="relic-placeholder">?</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
```

---

### Step 5.2: Draft Modal Component

**File:** `src/components/DraftModal.tsx`

```tsx
import React, { useState } from 'react';
import { Relic } from '../relics/types';
import clsx from 'clsx';

interface DraftModalProps {
  options: [Relic, Relic];
  onSelect: (relicId: string) => void;
  roundNumber: number;
}

export const DraftModal: React.FC<DraftModalProps> = ({ options, onSelect, roundNumber }) => {
  const [hoveredRelic, setHoveredRelic] = useState<string | null>(null);
  const [selectedRelic, setSelectedRelic] = useState<string | null>(null);

  const handleSelect = (relicId: string) => {
    setSelectedRelic(relicId);
  };

  const handleConfirm = () => {
    if (selectedRelic) {
      onSelect(selectedRelic);
    }
  };

  return (
    <div className="draft-modal-overlay">
      <div className="draft-modal">
        <h2>Rogue Break {roundNumber}</h2>
        <p className="draft-instructions">Choose a relic to add to your arsenal</p>

        <div className="draft-options">
          {options.map(relic => (
            <div
              key={relic.id}
              className={clsx('draft-card', {
                [`rarity-${relic.rarity}`]: true,
                'hovered': hoveredRelic === relic.id,
                'selected': selectedRelic === relic.id
              })}
              onMouseEnter={() => setHoveredRelic(relic.id)}
              onMouseLeave={() => setHoveredRelic(null)}
              onClick={() => handleSelect(relic.id)}
            >
              <div className="relic-header">
                <div className="relic-name">{relic.name}</div>
                <div className={`relic-rarity ${relic.rarity}`}>
                  {relic.rarity.toUpperCase()}
                </div>
              </div>

              <div className="relic-description">{relic.description}</div>

              {relic.flavorText && (
                <div className="relic-flavor">{relic.flavorText}</div>
              )}

              <div className="relic-stats">
                <div className="stat">Type: {relic.activationType}</div>
                {relic.maxUses && (
                  <div className="stat">Uses: {relic.maxUses}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          className="confirm-draft-button"
          disabled={!selectedRelic}
          onClick={handleConfirm}
        >
          Confirm Selection
        </button>
      </div>
    </div>
  );
};
```

---

### Step 5.3: Relic Activation Animation

**File:** `src/components/RelicActivation.tsx`

```tsx
import React, { useEffect } from 'react';
import { RelicInstance } from '../relics/types';
import clsx from 'clsx';

interface RelicActivationProps {
  relic: RelicInstance;
  playerName: string;
  onComplete: () => void;
}

export const RelicActivation: React.FC<RelicActivationProps> = ({
  relic,
  playerName,
  onComplete
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 3000); // 3 second animation

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className={clsx('relic-activation-overlay', relic.rarity)}>
      <div className="activation-card">
        <div className="player-name">{playerName} invoked</div>
        <div className={`relic-name ${relic.rarity}`}>{relic.name}!</div>
        <div className="relic-effect">{relic.description}</div>

        {/* Visual effects based on rarity */}
        {relic.rarity === 'common' && <div className="shimmer-effect"></div>}
        {relic.rarity === 'rare' && <div className="pulse-effect"></div>}
        {relic.rarity === 'epic' && <div className="environmental-effect"></div>}
      </div>
    </div>
  );
};
```

---

## Phase 6: Telemetry

**Duration:** 4-5 hours

**File:** `src/telemetry/TelemetryCollector.ts`

```typescript
export interface SessionTelemetry {
  sessionId: string;
  gameType: string;
  startTime: number;
  endTime: number;
  duration: number;

  players: PlayerTelemetry[];
  relicUsage: RelicUsageLog[];
  hands: HandTelemetry[];

  blindProgression: { orbit: number; small: number; big: number }[];
  rogueBreaks: number;
}

export interface PlayerTelemetry {
  playerId: string;
  name: string;
  startingStack: number;
  endingStack: number;
  chipDelta: number;
  placement: number;

  handsPlayed: number;
  handsWon: number;
  handsFolded: number;

  relicsAcquired: string[];
  relicsUsed: string[];

  totalBetsPlaced: number;
  totalRaisesPlaced: number;
  allInsCount: number;
}

export class TelemetryCollector {
  private sessionData: SessionTelemetry;

  constructor(sessionId: string) {
    this.sessionData = {
      sessionId,
      gameType: 'houserules-poker',
      startTime: Date.now(),
      endTime: 0,
      duration: 0,
      players: [],
      relicUsage: [],
      hands: [],
      blindProgression: [],
      rogueBreaks: 0
    };
  }

  public logRelicUsage(
    playerId: string,
    relicId: string,
    relicName: string,
    outcome: 'success' | 'failure',
    chipImpact: number
  ): void {
    this.sessionData.relicUsage.push({
      handNumber: this.sessionData.hands.length,
      timestamp: Date.now(),
      playerId,
      relicId,
      relicName,
      outcome,
      chipImpact
    });
  }

  public export(): SessionTelemetry {
    this.sessionData.endTime = Date.now();
    this.sessionData.duration = this.sessionData.endTime - this.sessionData.startTime;
    return this.sessionData;
  }

  public exportJSON(): string {
    return JSON.stringify(this.export(), null, 2);
  }
}
```

---

## Phase 7: AI & Testing

**Duration:** 20-25 hours

### Step 7.1: Basic AI Decision Tree

**File:** `src/ai/PokerAI.ts`

```typescript
import { HouseRulesGameState, PokerAction } from '../types';

export interface AIPersonality {
  name: string;
  foldThreshold: number;   // 0-1, higher = fold more
  raiseRate: number;       // 0-1, chance to raise vs call
  bluffRate: number;       // 0-1, chance to bluff
  relicUsageRate: number;  // 0-1, chance to use available relic
}

export const PERSONALITIES: Record<string, AIPersonality> = {
  passive: {
    name: 'Passive',
    foldThreshold: 0.6,
    raiseRate: 0.1,
    bluffRate: 0.05,
    relicUsageRate: 0.3
  },
  balanced: {
    name: 'Balanced',
    foldThreshold: 0.4,
    raiseRate: 0.3,
    bluffRate: 0.15,
    relicUsageRate: 0.5
  },
  aggressive: {
    name: 'Aggressive',
    foldThreshold: 0.2,
    raiseRate: 0.6,
    bluffRate: 0.3,
    relicUsageRate: 0.7
  }
};

export class PokerAI {
  constructor(
    public playerId: string,
    public personality: AIPersonality
  ) {}

  public decideAction(gameState: HouseRulesGameState): PokerAction {
    const seat = gameState.seats.find(s => s?.playerId === this.playerId);
    if (!seat) return 'fold';

    const handStrength = this.evaluateHandStrength(seat.holeCards, gameState.communityCards);
    const potOdds = this.calculatePotOdds(gameState, seat);

    // Decision tree
    if (handStrength < this.personality.foldThreshold) {
      return 'fold';
    }

    if (gameState.currentBet === seat.currentBet) {
      // No bet to call, can check
      if (Math.random() < this.personality.raiseRate) {
        return 'bet';
      }
      return 'check';
    }

    // There's a bet to call
    if (Math.random() < this.personality.raiseRate && handStrength > 0.7) {
      return 'raise';
    }

    return 'call';
  }

  private evaluateHandStrength(holeCards: Card[], communityCards: Card[]): number {
    // Simple hand strength evaluation
    // TODO: Implement proper equity calculation
    return Math.random(); // Placeholder
  }

  private calculatePotOdds(gameState: HouseRulesGameState, seat: PokerSeat): number {
    const toCall = gameState.currentBet - seat.currentBet;
    const potSize = gameState.pot;
    return toCall / (potSize + toCall);
  }
}
```

---

## Testing Checklist

- [ ] Relic system loads 12 relics from JSON
- [ ] Players receive 1 Common relic on join
- [ ] Rogue Break triggers after 12 hands
- [ ] Players can draft from 2 relic options
- [ ] Relics are face-down until activated
- [ ] Passive relics auto-activate
- [ ] Triggered relics activate on player input
- [ ] Conditional relics trigger on conditions
- [ ] Orbits increment correctly
- [ ] Blinds increase 25% per orbit
- [ ] Session ends after 4 orbits or elimination
- [ ] Winner determined by chip count + tiebreakers
- [ ] Telemetry exports complete session data
- [ ] AI can play full session with relics

---

## Next Steps After Implementation

1. **Balance Testing**
   - Play 100+ simulated games with AI
   - Adjust relic power levels
   - Tune blind progression
   - Adjust session duration

2. **Expand Relic Pool**
   - Add 20-30 more relics
   - Create relic families/synergies
   - Add legendary tier (2% rarity)

3. **Visual Polish**
   - Add VFX for each relic
   - Particle effects
   - Screen shake for Epic relics
   - Sound design

4. **Meta Progression**
   - Unlock system for relics
   - Relic codex / collection
   - Cosmetic rewards
   - Player stats dashboard

---

## Common Pitfalls & Solutions

| Problem | Solution |
|---------|----------|
| Relics not revealing after use | Ensure `isRevealed = true` in `activateRelic()` |
| Rogue Break not triggering | Check `handsInCurrentRound` increments in `resolveShowdown()` |
| Blinds not increasing | Verify orbit tracking logic in `startHand()` |
| Relic effects not applying | Add hooks in appropriate game phases |
| AI using wrong relics | Implement relic synergy evaluation |
| Memory leaks from relics | Clear `playerRelics` map on session end |

---

## Performance Considerations

- Limit relic effect calculations to relevant game phases
- Use event-driven architecture for relic triggers
- Cache hand strength evaluations for AI
- Batch relic activations in same phase
- Lazy-load relic definitions (don't load all at startup)

---

## Conclusion

This guide provides a structured path from core poker engine to full roguelike poker game. Follow phases sequentially, test after each phase, and iterate based on playtesting feedback.

**Estimated Time to MVP:** 40-50 hours for Phase 1-4
**Estimated Time to Polish:** +20-30 hours for Phase 5-7
**Total:** 60-80 hours

Good luck building House Rules! 🎰✨
