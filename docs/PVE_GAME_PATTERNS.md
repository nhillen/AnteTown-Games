# PvE Game Implementation Patterns

**Best practices for implementing Player vs Environment (PvE) game modes**

## Core PvE Requirements

All PvE games MUST implement these patterns to ensure smooth gameplay:

### 1. Auto-Spawn AI Opponents

**When**: As soon as a human player sits down
**Where**: Override `sitPlayer()` method in your game class

```typescript
public sitPlayer(player: Player, seatIndex?: number, buyInAmount?: number) {
  const result = super.sitPlayer(player, seatIndex, buyInAmount);

  if (result.success && !player.isAI && this.gameState) {
    const seatedCount = this.gameState.seats.filter(s => s !== null).length;
    const humanCount = this.gameState.seats.filter(s => s && !s.isAI).length;

    // If this is PvE mode and only 1 player seated, add AI opponent(s)
    if (humanCount === 1 && seatedCount === 1) {
      console.log('🤖 [Game] PvE mode detected - adding AI opponent');
      const aiPlayer = this.createAIPlayer();
      const aiResult = super.sitPlayer(aiPlayer, undefined, buyInAmount);

      if (aiResult.success) {
        console.log(`🤖 [Game] AI opponent ${aiPlayer.name} added`);
        // CRITICAL: Auto-mark AI as ready (see next section)
      }
    }
  }

  return result;
}
```

**Multi-AI Games** (e.g., poker with 4 AI opponents):
```typescript
// Calculate how many AI opponents are needed
const targetAI = this.tableConfig.targetTotalPlayers - humanCount;
const currentAI = seatedCount - humanCount;
const neededAI = targetAI - currentAI;

for (let i = 0; i < neededAI; i++) {
  const aiPlayer = this.createAIPlayer();
  super.sitPlayer(aiPlayer, undefined, buyInAmount);
}
```

### 2. Auto-Ready AI Players

**Critical**: AI players MUST mark themselves ready immediately, or the game will never start.

**When**: Immediately after AI sits down
**Where**: In `sitPlayer()` override, right after AI is seated

```typescript
if (aiResult.success) {
  console.log(`🤖 [Game] AI opponent ${aiPlayer.name} added`);

  // Auto-mark AI as ready
  if (!this.gameState.readyPlayers) {
    this.gameState.readyPlayers = [];
  }
  if (!this.gameState.readyPlayers.includes(aiPlayer.id)) {
    this.gameState.readyPlayers.push(aiPlayer.id);
    console.log(`🤖 [Game] AI opponent auto-marked ready`);
  }
}
```

**Why This Matters**: If AI doesn't auto-ready, the `handleMarkReady()` check will fail:
```typescript
// In handleMarkReady()
if (this.gameState.readyPlayers.length >= 2 && activePlayers.length >= 2) {
  this.startHand(); // Only starts if BOTH players are ready
}
```

### 3. Collect Antes/Bets at Start

**Critical**: Money must be deducted from player stacks and added to pot BEFORE gameplay begins.

**When**: In the ante/betting phase (not at payout!)
**Where**: `handleAntePhase()` or equivalent betting phase handler

```typescript
private handleAntePhase(): void {
  if (!this.gameState) return;

  const anteAmount = this.getAnteAmount();

  // Auto-stand players who can't cover ante
  for (let i = 0; i < this.gameState.seats.length; i++) {
    const seat = this.gameState.seats[i];
    if (seat && seat.tableStack < anteAmount) {
      // Remove player who can't afford ante
      this.gameState.seats[i] = null as any;
    }
  }

  // Check we still have enough players
  const remainingPlayers = this.getActivePlayers();
  if (remainingPlayers.length < 2) {
    this.transitionToPhase('HandEnd');
    return;
  }

  // CRITICAL: Collect antes from each player
  let totalAntes = 0;
  for (const seat of this.gameState.seats) {
    if (seat && !seat.hasFolded) {
      seat.tableStack -= anteAmount;        // Deduct from stack
      seat.currentBet = anteAmount;         // Track current bet
      seat.totalContribution = anteAmount;  // Track total contribution
      totalAntes += anteAmount;             // Sum for pot
    }
  }
  this.gameState.pot = totalAntes;  // Update pot

  // Move to next phase
  this.transitionToPhase('NextPhase');
}
```

**Anti-Pattern** (DON'T DO THIS):
```typescript
// ❌ WRONG - "Side bet" approach that doesn't collect antes upfront
private handleAntePhase(): void {
  // Side bet - no money collected at start, settled after flip
  console.log(`Side bet mode - ante is ${anteAmount}`);
  this.transitionToPhase('NextPhase');
}
```

### 4. AI Auto-Actions

**When**: When it's AI's turn to act
**Where**: Phase handlers that wait for player input

```typescript
private handleActionPhase(): void {
  const currentPlayer = this.getCurrentPlayer();

  if (currentPlayer.isAI) {
    // AI should act automatically after a short delay
    setTimeout(() => {
      this.handleAIAction(currentPlayer);
    }, 1000); // 1 second delay for realism
  } else {
    // Human player - wait for their action
    this.broadcastGameState();
  }
}

private handleAIAction(aiPlayer: Seat): void {
  // Implement AI decision logic
  const action = this.getAIDecision(aiPlayer);
  this.handlePlayerAction(aiPlayer.playerId, action);
}
```

## Game Start Flow Validation

### Required Checks in `canStartHand()`

Your game should inherit from `GameBase` which provides:
```typescript
protected canStartHand(): boolean {
  if (!this.gameState) return false;

  const seatedPlayers = this.gameState.seats.filter(s => s !== null);
  const humanPlayers = seatedPlayers.filter(s => !s.isAI);

  return (
    humanPlayers.length >= this.tableConfig.minHumanPlayers &&
    seatedPlayers.length >= this.tableConfig.targetTotalPlayers
  );
}
```

**PvE Configuration**:
```typescript
const gameConfig = {
  minHumanPlayers: 1,           // Only 1 human required
  targetTotalPlayers: 2,        // 1 human + 1 AI
  // ... other config
};
```

**PvP Configuration**:
```typescript
const gameConfig = {
  minHumanPlayers: 2,           // At least 2 humans required
  targetTotalPlayers: 2,        // 2 humans (or more)
  // ... other config
};
```

## Common Pitfalls

### ❌ Pitfall 1: Forgetting to Auto-Ready AI
**Symptom**: Game never starts in PvE mode
**Fix**: Add AI to `readyPlayers` array immediately after seating

### ❌ Pitfall 2: Not Collecting Antes Upfront
**Symptom**: Pot shows 0 TC during gameplay
**Fix**: Deduct from `seat.tableStack` and add to `gameState.pot` in ante phase

### ❌ Pitfall 3: Using Penny Conversions
**Symptom**: Ante is 100x too small (e.g., 1 TC instead of 100 TC)
**Fix**: TC/VT are stored as direct integers, NOT pennies - never divide by 100

### ❌ Pitfall 4: AI Blocking on Human Actions
**Symptom**: Game freezes waiting for AI to act
**Fix**: Implement automatic AI actions with short delays

### ❌ Pitfall 5: Wrong Deployment Script
**Symptom**: Changes deployed but don't appear in game
**Fix**: Use `./scripts/deploy-external-game.sh <game-name>` for game changes

## Testing Checklist

### Manual PvE Test
- [ ] Join PvE table → AI opponent spawns immediately
- [ ] AI opponent appears in seat list with `isAI: true`
- [ ] Click "Start Hand" → Game starts without waiting
- [ ] Ante phase → Pot shows correct total (e.g., 200 TC for 100 TC ante)
- [ ] Ante phase → Player stacks reduced by ante amount
- [ ] AI takes actions automatically (no freezing)
- [ ] Game completes full hand and returns to Lobby

### Manual PvP Test
- [ ] First player joins → "Waiting for opponent" message
- [ ] Second player joins → Both can ready up
- [ ] Both click ready → Game starts
- [ ] Ante phase works same as PvE

### Automated Test Suite
```typescript
describe('PvE Mode', () => {
  let game: YourGame;
  let humanPlayer: Player;

  beforeEach(() => {
    game = new YourGame(pveConfig);
    humanPlayer = createPlayer({ id: 'human1', isAI: false });
  });

  test('auto-spawns AI opponent', () => {
    game.sitPlayer(humanPlayer, 0, 1000);
    const seats = game.gameState.seats.filter(s => s);
    expect(seats.length).toBe(2);
    expect(seats[1]?.isAI).toBe(true);
  });

  test('AI auto-marks ready', () => {
    game.sitPlayer(humanPlayer, 0, 1000);
    expect(game.gameState.readyPlayers?.length).toBe(1);
    expect(game.gameState.readyPlayers).toContain(seats[1].playerId);
  });

  test('collects antes in ante phase', () => {
    game.sitPlayer(humanPlayer, 0, 1000);
    game.handlePlayerAction(humanPlayer.id, 'start_hand');

    // After ante phase
    expect(game.gameState.pot).toBe(200); // 2 × 100 TC
    expect(game.gameState.seats[0]?.tableStack).toBe(900); // 1000 - 100
    expect(game.gameState.seats[1]?.tableStack).toBe(900);
  });

  test('AI takes automatic actions', (done) => {
    game.sitPlayer(humanPlayer, 0, 1000);
    game.handlePlayerAction(humanPlayer.id, 'start_hand');

    // Verify AI acted within reasonable time
    setTimeout(() => {
      expect(game.gameState.phase).not.toBe('WaitingForAI');
      done();
    }, 2000);
  });
});
```

## Game-Specific Examples

### CK Flipz (2-player coin/card flip)
- Auto-spawns 1 AI opponent when human sits
- AI auto-readies immediately
- Collects antes in `handleAntePhase()`
- AI auto-calls side in `handleCallSidePhase()`

### War Faire (4-10 player card game)
- Auto-spawns 3 AI opponents (for 4-player game)
- AI auto-readies immediately
- Collects antes in ante phase
- AI makes betting decisions automatically

### HouseRules Poker (2-9 player Texas Hold'em)
- Auto-spawns 4 AI opponents (for 5-player game)
- AI auto-readies immediately
- Collects blinds in blind phase
- AI makes fold/call/raise decisions automatically

## Reference Implementation

See `games/ck-flipz/backend/src/CoinFlipGame.ts` for complete reference:
- Lines 95-124: AI auto-spawn and auto-ready
- Lines 213-279: Ante collection in `handleAntePhase()`
- Lines 291-330: AI auto-call in `handleCallSidePhase()`

## Related Documentation
- `LESSONS_LEARNED.md` - Detailed retrospective on CK Flipz fix
- `../packages/game-sdk/README.md` - GameBase class documentation
- `../../docs/GAME_INTEGRATION.md` - General game integration guide
