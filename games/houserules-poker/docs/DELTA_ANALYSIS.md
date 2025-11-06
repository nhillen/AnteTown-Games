# Implementation Delta Analysis: House Rules

**Date:** 2025-11-04
**Current Version:** 0.2.0
**Status:** Core Poker ✅ | Roguelike Features ❌

This document tracks the gap between our current implementation and the full GDD specification.

---

## Executive Summary

### ✅ What We Have (Core Poker Engine)
- Full Texas Hold'em game logic
- Player seating with buy-in system
- Betting rounds (PreFlop, Flop, Turn, River, Showdown)
- Hand evaluation and winner determination
- React frontend component (PokerClient)
- Game state management via @pirate/game-sdk
- Blind system (small/big blinds)
- All-in and side pot handling
- Multi-player support (up to 9 players)

### ❌ What We're Missing (Roguelike Features)

**Critical Systems:**
1. **Relic System** - The entire rule-bending power system
2. **Rogue Break System** - Periodic drafting phases
3. **Round & Orbit Tracking** - Match structure with 3 rounds
4. **Escalating Blinds** - +25% every orbit
5. **Session Management** - 25-30 minute timed sessions
6. **Telemetry & Analytics** - Match results and stats

**Secondary Systems:**
7. Ghost Player system (disconnect handling)
8. Escape Buyout (early leave with 60% cashout)
9. AI opponents with relic awareness
10. VFX/SFX for relic activations
11. Draft UI and reveal animations

---

## Detailed Gap Analysis

### 1. Relic System ❌ **CRITICAL - NOT IMPLEMENTED**

**Current State:** No relic system exists.

**Required:**
- Data structure for relic definitions
- Relic manager class
- Three activation types: Passive, Triggered, Conditional
- Rarity tiers: Common (60%), Rare (30%), Epic (10%)
- Hidden/revealed state tracking
- Cooldown system for triggered relics
- Integration hooks into poker phases

**Implementation Tasks:**
```typescript
// Need to add to types.ts
export type RelicRarity = 'common' | 'rare' | 'epic';
export type RelicActivationType = 'passive' | 'triggered' | 'conditional';

export interface Relic {
  id: string;
  name: string;
  rarity: RelicRarity;
  activationType: RelicActivationType;
  description: string;
  isRevealed: boolean;
  isActive: boolean;
  cooldown?: number;
  currentCooldown?: number;
  triggerCondition?: string;
  effect: RelicEffect;
}

export interface RelicEffect {
  type: 'modify_pot' | 'modify_cards' | 'peek_info' | 'modify_stack' | 'custom';
  params: any;
}

export interface PokerSeat {
  // ... existing fields
  relics: Relic[];
}
```

**Files to Create:**
- `src/relics/RelicManager.ts` - Core relic logic
- `src/relics/relics.json` - Relic definitions
- `src/relics/effects.ts` - Effect implementations
- `src/components/RelicDisplay.tsx` - UI component

**Complexity:** HIGH (10-15 hours)

---

### 2. Rogue Break System ❌ **CRITICAL - NOT IMPLEMENTED**

**Current State:** Games run continuously without breaks for drafting.

**Required:**
- Break triggers after N hands (10-15 hands per round)
- Draft UI showing 2 relic choices
- Weighted random selection based on rarity
- Break phase in game state
- Resume poker after draft completes

**Implementation Tasks:**
```typescript
// Add to types.ts
export type PokerPhase =
  | 'Lobby'
  | 'PreHand'
  | 'PreFlop'
  | 'Flop'
  | 'Turn'
  | 'River'
  | 'Showdown'
  | 'RogueBreak'    // NEW
  | 'FinalReveal';  // NEW

// Add to HouseRulesGameState
interface HouseRulesGameState extends GameState {
  // ... existing fields
  currentRound: number;           // 1, 2, or 3
  handsInCurrentRound: number;
  rogueBreakOptions: Map<string, Relic[]>; // playerId -> [relic1, relic2]
}
```

**Files to Modify:**
- `src/HouseRules.ts` - Add break logic
- `src/types.ts` - Add new phases

**Files to Create:**
- `src/components/RogueBreakUI.tsx` - Draft selection UI
- `src/relics/RelicDrafter.ts` - Draft logic

**Complexity:** MEDIUM (6-8 hours)

---

### 3. Round & Orbit Tracking ❌ **NOT IMPLEMENTED**

**Current State:** Hand counter exists, but no orbit or round tracking.

**GDD Requirement:**
- Track dealer button rotations (orbits)
- Match has 3 rounds separated by Rogue Breaks
- 10-15 hands per round
- 4 orbit limit for timed victory

**Implementation Tasks:**
```typescript
// Add to HouseRulesGameState
interface HouseRulesGameState extends GameState {
  // ... existing fields
  orbitCount: number;
  maxOrbits: number; // Default: 4
  currentRound: number; // 1, 2, or 3
  handsInCurrentRound: number;
  handsPerRound: number; // Default: 10-15
}
```

**Files to Modify:**
- `src/HouseRules.ts` - Track orbits, trigger breaks

**Complexity:** LOW (2-3 hours)

---

### 4. Escalating Blinds ❌ **NOT IMPLEMENTED**

**Current State:** Blinds are static (50/100).

**GDD Requirement:**
- Blinds increase by 25% every orbit
- Starting: 50/100
- Orbit 2: 63/125
- Orbit 3: 79/156
- Orbit 4: 99/198

**Implementation Tasks:**
```typescript
// In HouseRules.ts
private calculateBlinds(orbitCount: number): { small: number; big: number } {
  const multiplier = Math.pow(1.25, orbitCount - 1);
  return {
    small: Math.floor(50 * multiplier),
    big: Math.floor(100 * multiplier)
  };
}

private onOrbitComplete(): void {
  this.gameState.orbitCount++;
  const { small, big } = this.calculateBlinds(this.gameState.orbitCount);
  this.gameState.smallBlind = small;
  this.gameState.bigBlind = big;

  // Check for Rogue Break
  if (this.shouldTriggerRogueBreak()) {
    this.startRogueBreak();
  }
}
```

**Files to Modify:**
- `src/HouseRules.ts` - Add blind escalation logic

**Complexity:** LOW (1-2 hours)

---

### 5. Session Management & Victory Conditions ⚠️ **PARTIAL**

**Current State:** Basic winner determination exists, but no session timer or orbit-based victory.

**GDD Requirement:**
- 25-30 minute session timer
- Victory conditions:
  - Elimination: Last player standing
  - Timed: Highest stack after 4 orbits
  - Tie-breaking: Total pots won, then highest single pot

**Implementation Tasks:**
```typescript
interface HouseRulesGameState extends GameState {
  // ... existing fields
  sessionStartTime: number;
  sessionDurationMs: number; // 25-30 minutes
  totalPotsWonByPlayer: Map<string, number>;
  largestPotWonByPlayer: Map<string, number>;
}

// In HouseRules.ts
private checkSessionEnd(): boolean {
  const elapsed = Date.now() - this.gameState.sessionStartTime;
  const orbitsComplete = this.gameState.orbitCount >= this.gameState.maxOrbits;
  const timeExpired = elapsed >= this.gameState.sessionDurationMs;

  return orbitsComplete || timeExpired;
}

private determineWinnerByStack(): WinnerResult {
  const activePlayers = this.gameState.seats.filter(s => s !== null);
  activePlayers.sort((a, b) => {
    if (b.tableStack !== a.tableStack) return b.tableStack - a.tableStack;
    const bPots = this.gameState.totalPotsWonByPlayer.get(b.playerId) || 0;
    const aPots = this.gameState.totalPotsWonByPlayer.get(a.playerId) || 0;
    if (bPots !== aPots) return bPots - aPots;
    const bLargest = this.gameState.largestPotWonByPlayer.get(b.playerId) || 0;
    const aLargest = this.gameState.largestPotWonByPlayer.get(a.playerId) || 0;
    return bLargest - aLargest;
  });

  return {
    playerId: activePlayers[0].playerId,
    name: activePlayers[0].name,
    payout: activePlayers[0].tableStack,
    description: 'Victory by chip count'
  };
}
```

**Files to Modify:**
- `src/HouseRules.ts` - Add session timer and victory logic

**Complexity:** MEDIUM (3-4 hours)

---

### 6. Telemetry & Analytics ❌ **NOT IMPLEMENTED**

**GDD Requirement:**
- Log relic usage (which, when, outcome)
- Track win rates per player
- Session duration tracking
- Chip delta per player
- Player retention metrics
- Export to JSON/CSV for analysis

**Implementation Tasks:**
```typescript
interface SessionTelemetry {
  sessionId: string;
  startTime: number;
  endTime: number;
  duration: number;
  players: PlayerTelemetry[];
  relicUsage: RelicUsageLog[];
  hands: HandTelemetry[];
}

interface PlayerTelemetry {
  playerId: string;
  name: string;
  startingStack: number;
  endingStack: number;
  chipDelta: number;
  handsPlayed: number;
  handsWon: number;
  relicsAcquired: string[];
  relicsUsed: string[];
  placement: number;
}

interface RelicUsageLog {
  handNumber: number;
  playerId: string;
  relicId: string;
  relicName: string;
  outcome: 'success' | 'failure' | 'neutral';
  chipImpact: number;
}
```

**Files to Create:**
- `src/telemetry/TelemetryCollector.ts`
- `src/telemetry/types.ts`

**Complexity:** MEDIUM (4-5 hours)

---

### 7. Ghost Player System ❌ **NOT IMPLEMENTED**

**GDD Requirement:**
- On disconnect, convert player to AI
- AI is fold-biased (folds most hands)
- Preserves chip stack
- Can reconnect and resume control

**Implementation Tasks:**
```typescript
interface PokerSeat {
  // ... existing fields
  isGhost?: boolean;
  disconnectedAt?: number;
  reconnectToken?: string;
}

// In HouseRules.ts
public handlePlayerDisconnect(playerId: string): void {
  const seat = this.findSeatByPlayerId(playerId);
  if (seat) {
    seat.isGhost = true;
    seat.disconnectedAt = Date.now();
    seat.reconnectToken = generateToken();

    // Start ghost AI behavior
    this.ghostPlayers.add(playerId);
  }
}

private handleGhostAction(playerId: string): void {
  // 80% fold, 15% check/call, 5% raise
  const action = this.getGhostAction();
  this.handlePlayerAction(playerId, action);
}
```

**Files to Modify:**
- `src/HouseRules.ts` - Add disconnect handling

**Files to Create:**
- `src/ai/GhostPlayer.ts`

**Complexity:** MEDIUM (4-5 hours)

---

### 8. Escape Buyout ❌ **NOT IMPLEMENTED**

**GDD Requirement:**
- Player can leave early
- Cashes out 60% of current stack
- Forfeit remaining 40%
- Immediate seat becomes available

**Implementation Tasks:**
```typescript
public escapeTable(playerId: string): { success: boolean; payout: number } {
  const seat = this.findSeatByPlayerId(playerId);
  if (!seat) return { success: false, payout: 0 };

  const payout = Math.floor(seat.tableStack * 0.6);

  // Return chips to player bankroll
  const player = this.players.get(playerId);
  if (player) {
    player.bankroll += payout;
  }

  // Remove from table
  this.removeSeat(playerId);

  this.broadcast({
    type: 'player_escaped',
    playerId,
    name: seat.name,
    payout
  });

  return { success: true, payout };
}
```

**Files to Modify:**
- `src/HouseRules.ts` - Add escape method

**Complexity:** LOW (1-2 hours)

---

### 9. AI Opponents with Relic Awareness ❌ **NOT IMPLEMENTED**

**GDD Requirement:**
- AI personalities: Passive, Balanced, Aggressive
- AI can use relics (random or scripted)
- AI adapts to revealed relics
- Batch testing support (2-8 AI players)

**Implementation Tasks:**
```typescript
interface AIPersonality {
  name: string;
  foldRate: number;
  raiseRate: number;
  bluffRate: number;
  relicUsageRate: number;
}

class PokerAI {
  constructor(
    public personality: AIPersonality,
    public playerId: string
  ) {}

  decideAction(gameState: HouseRulesGameState, seat: PokerSeat): PokerAction {
    // Hand strength evaluation
    // Position awareness
    // Stack-to-pot ratio
    // Opponent modeling
  }

  decideRelicDraft(options: Relic[]): Relic {
    // Synergy with existing relics
    // Current chip position
    // Table dynamics
  }

  shouldUseRelic(relic: Relic, gameState: HouseRulesGameState): boolean {
    // Evaluate if relic trigger is beneficial
  }
}
```

**Files to Create:**
- `src/ai/PokerAI.ts`
- `src/ai/personalities.ts`
- `src/ai/HandStrengthEvaluator.ts`

**Complexity:** HIGH (15-20 hours)

---

### 10. VFX/SFX System ❌ **NOT IMPLEMENTED**

**GDD Requirement:**
- Relic activation animations
- Rarity-based visual effects:
  - Common: Subtle shimmer
  - Rare: Radial pulse glow
  - Epic: Environmental reactions (card flash, chip levitate)
- Sound effects:
  - Relic triggers (shuffle, electric hum, metallic echo)
  - Dealer sounds
- UI animations for draft and reveal

**Implementation Tasks:**
```typescript
// Frontend component structure
interface RelicVFXProps {
  relic: Relic;
  isActivating: boolean;
  onComplete: () => void;
}

// Animation keyframes
const rarityAnimations = {
  common: 'shimmer 1s ease-in-out',
  rare: 'radial-pulse 1.5s ease-out',
  epic: 'environmental-reaction 2s cubic-bezier(0.68, -0.55, 0.265, 1.55)'
};
```

**Files to Create:**
- `src/components/RelicActivation.tsx`
- `public/sfx/` - Sound effect files
- `public/animations/` - Animation assets

**Complexity:** HIGH (10-12 hours for full polish)

---

### 11. Draft UI & Reveal Animations ❌ **NOT IMPLEMENTED**

**GDD Requirement:**
- Modal showing 2 relic choices during Rogue Break
- Hover to preview relic details
- Selection confirmation
- Relic appears in player HUD face-down
- Activation triggers flip animation
- Table-wide broadcast: "Nathan invoked The Dealer!"

**Implementation Tasks:**
```typescript
// Draft modal component
interface DraftModalProps {
  options: [Relic, Relic];
  onSelect: (relic: Relic) => void;
  timeRemaining: number;
}

// Reveal animation
interface RelicRevealProps {
  relic: Relic;
  playerName: string;
  onAnimationComplete: () => void;
}
```

**Files to Create:**
- `src/components/DraftModal.tsx`
- `src/components/RelicReveal.tsx`
- `src/components/RelicHUD.tsx`

**Complexity:** MEDIUM (6-8 hours)

---

## Implementation Priority Roadmap

### Phase 1: Core Roguelike Mechanics (Essential)
**Goal:** Transform poker game into roguelike poker
**Duration:** ~25-35 hours

1. **Relic System Foundation** (HIGH priority)
   - [ ] Create relic data structures
   - [ ] Implement RelicManager
   - [ ] Add relics.json with 12 example relics
   - [ ] Integrate relic hooks into game phases

2. **Round & Orbit Tracking** (HIGH priority)
   - [ ] Add orbit counter
   - [ ] Implement round system (3 rounds)
   - [ ] Add hand counter per round

3. **Rogue Break System** (HIGH priority)
   - [ ] Trigger breaks after 10-15 hands
   - [ ] Implement draft logic
   - [ ] Basic draft UI

4. **Escalating Blinds** (MEDIUM priority)
   - [ ] +25% blind increase per orbit

5. **Session Management** (MEDIUM priority)
   - [ ] 25-30 minute timer
   - [ ] Victory by elimination
   - [ ] Victory by chip count + tie-breaking

### Phase 2: Quality of Life & Polish (Important)
**Duration:** ~15-20 hours

6. **Draft & Reveal UI** (MEDIUM priority)
   - [ ] Polish draft modal
   - [ ] Relic HUD display
   - [ ] Activation animations
   - [ ] Table-wide reveal broadcasts

7. **Telemetry System** (MEDIUM priority)
   - [ ] Session logging
   - [ ] Relic usage tracking
   - [ ] Export to JSON

8. **Ghost Player System** (LOW priority)
   - [ ] Disconnect handling
   - [ ] Fold-biased AI
   - [ ] Reconnect logic

9. **Escape Buyout** (LOW priority)
   - [ ] 60% cashout option

### Phase 3: AI & Testing (Optional for MVP)
**Duration:** ~20-25 hours

10. **AI Opponents** (LOW priority)
    - [ ] Basic AI decision tree
    - [ ] AI relic usage
    - [ ] Personality types

11. **VFX/SFX Polish** (POLISH)
    - [ ] Rarity-based animations
    - [ ] Sound effects
    - [ ] Environmental reactions

---

## Current Poker Engine: What's Working ✅

### Core Texas Hold'em Logic
- ✅ Deck creation and shuffling (`deck.ts:1`)
- ✅ Card dealing for hole cards and community cards
- ✅ Betting rounds: PreFlop, Flop, Turn, River
- ✅ Player actions: fold, check, call, bet, raise, all-in
- ✅ Pot management
- ✅ Current bet tracking

### Hand Evaluation
- ✅ Full hand ranking (`hand-evaluator.ts:1`)
- ✅ Winner determination
- ✅ Tie handling
- ✅ Hand rank to string conversion

### Game State Management
- ✅ Extends GameBase from @pirate/game-sdk
- ✅ Seat management (up to 9 players)
- ✅ Player buy-in validation ($20-$100 range)
- ✅ Bankroll deduction
- ✅ Table stack tracking

### Betting System
- ✅ Small blind / big blind posting
- ✅ Betting round completion detection
- ✅ Next player turn calculation
- ✅ All-in detection
- ✅ Valid action calculation

### Frontend
- ✅ PokerClient React component
- ✅ Displays game state
- ✅ Player action buttons
- ✅ Table visualization

---

## Files to Create (New)

```
HouseRules/
├── src/
│   ├── relics/
│   │   ├── RelicManager.ts          ❌ NEW
│   │   ├── relics.json               ❌ NEW
│   │   ├── effects.ts                ❌ NEW
│   │   ├── RelicDrafter.ts           ❌ NEW
│   │   └── types.ts                  ❌ NEW
│   ├── ai/
│   │   ├── PokerAI.ts                ❌ NEW
│   │   ├── GhostPlayer.ts            ❌ NEW
│   │   ├── personalities.ts          ❌ NEW
│   │   └── HandStrengthEvaluator.ts  ❌ NEW
│   ├── telemetry/
│   │   ├── TelemetryCollector.ts     ❌ NEW
│   │   └── types.ts                  ❌ NEW
│   └── components/
│       ├── DraftModal.tsx            ❌ NEW
│       ├── RelicDisplay.tsx          ❌ NEW
│       ├── RelicHUD.tsx              ❌ NEW
│       ├── RelicReveal.tsx           ❌ NEW
│       ├── RelicActivation.tsx       ❌ NEW
│       └── RogueBreakUI.tsx          ❌ NEW
└── docs/
    ├── GDD.md                         ✅ DONE
    ├── DELTA_ANALYSIS.md              ✅ DONE
    └── IMPLEMENTATION_GUIDE.md        ❌ TODO
```

---

## Files to Modify (Existing)

```
├── src/
│   ├── types.ts                      ⚠️ MODIFY (add relic types, new phases)
│   ├── HouseRules.ts                 ⚠️ MODIFY (add relic hooks, breaks, orbits)
│   ├── PokerClient.tsx               ⚠️ MODIFY (add relic UI integration)
│   └── index.ts                      ⚠️ MODIFY (export new components)
├── package.json                      ⚠️ MODIFY (bump to 0.3.0)
└── README.md                         ⚠️ MODIFY (update with roguelike features)
```

---

## Estimated Total Development Time

| Phase | Hours | Status |
|-------|-------|--------|
| Phase 1: Core Roguelike | 25-35 | ❌ Not Started |
| Phase 2: QoL & Polish | 15-20 | ❌ Not Started |
| Phase 3: AI & Testing | 20-25 | ❌ Not Started |
| **Total** | **60-80 hours** | **~10% Complete** |

**Current Progress:** Core poker engine complete (~10% of full vision)

---

## Next Immediate Steps

1. Create `src/relics/types.ts` with relic interfaces
2. Create `src/relics/relics.json` with 12 example relics from GDD
3. Implement `RelicManager.ts` with basic passive relic support
4. Modify `types.ts` to add relic fields to PokerSeat
5. Modify `HouseRules.ts` to add orbit tracking
6. Test relic system with one passive relic (e.g., "Chip Magnet")

---

## Questions for Design Clarification

1. **Starting Relics:** Does each player get 1 Common relic at the start, or do they start with 0 relics and draft at the first break?
   - GDD says: "Each gets one Common relic" at 00:00
   - **Decision:** Give 1 random Common relic at table join

2. **Blind Structure:** Should blinds increase per orbit or per round?
   - GDD says: "every orbit"
   - **Decision:** Increase every orbit

3. **Draft Timing:** Does the break happen after exactly N hands, or after the Nth hand completes?
   - **Decision:** After Nth hand showdown completes

4. **Relic Reveal:** Are relics revealed to all players when used, or just the user?
   - GDD says: "Once revealed, they remain visible and trackable"
   - **Decision:** Revealed to all players

5. **Side Pots:** GDD doesn't mention side pots explicitly. Do we implement them?
   - **Decision:** Yes, implement side pots for proper all-in handling

---

## Success Metrics (For Testing Phase)

- [ ] 8 players can complete a full 30-minute session
- [ ] All 3 Rogue Breaks trigger correctly
- [ ] Each player drafts 3-4 relics per session
- [ ] Blinds escalate correctly (50/100 → 99/198 over 4 orbits)
- [ ] At least 3 different relic types are used per game
- [ ] Telemetry logs capture all key events
- [ ] AI can play a full session with relic usage
- [ ] No crashes or desyncs during 10 consecutive test sessions

---

## References

- **GDD:** `docs/GDD.md`
- **Current Poker Engine:** `src/HouseRules.ts`
- **Type Definitions:** `src/types.ts`
- **PiratePlunder SDK Reference:** `../PiratePlunder/packages/game-sdk/`
