# CK Flipz: Lessons Learned - PvE Game Start & Ante Collection Issues

**Date**: 2025-11-17
**Issue**: Game wouldn't start in PvE mode, pot showed 0 TC
**Time to Fix**: ~2 hours (could have been 15 minutes with better approach)

## What Broke

### Issue 1: Game Wouldn't Start
- **Symptom**: Clicking "Start Hand" did nothing - game stayed in Lobby phase
- **Root Cause**: AI opponent wasn't auto-marking itself ready
- **Code Location**: `CoinFlipGame.ts:95-124` and `CardFlipGame.ts:111-140`
- **Why It Happened**: `handleMarkReady()` required 2 ready players, but only human marked ready

### Issue 2: Pot Showed 0 TC
- **Symptom**: Pot displayed 0 TC throughout entire hand (Ante, CallSide, Flip, Payout phases)
- **Root Cause**: `handleAntePhase()` had "side bet" logic - didn't collect antes upfront
- **Code Location**: `CoinFlipGame.ts:213-260` and `CardFlipGame.ts:225-267`
- **Why It Happened**: Original design was to settle after flip, not collect antes at start

## The Fix

### Fix 1: AI Auto-Ready
```typescript
// In sitPlayer() override - after AI is added
if (aiResult.success) {
  console.log(`🤖 [CoinFlip] AI opponent ${aiPlayer.name} added`);
  // Auto-mark AI as ready
  if (!this.gameState.readyPlayers) {
    this.gameState.readyPlayers = [];
  }
  if (!this.gameState.readyPlayers.includes(aiPlayer.id)) {
    this.gameState.readyPlayers.push(aiPlayer.id);
    console.log(`🤖 [CoinFlip] AI opponent auto-marked ready`);
  }
}
```

### Fix 2: Collect Antes in Ante Phase
```typescript
// In handleAntePhase() - replace "side bet" comment with actual collection
// Collect antes from each player and add to pot
let totalAntes = 0;
for (const seat of this.gameState.seats) {
  if (seat && !seat.hasFolded) {
    seat.tableStack -= anteAmount;
    seat.currentBet = anteAmount;
    seat.totalContribution = anteAmount;
    totalAntes += anteAmount;
    console.log(`🪙 [Flipz] Collected ${anteAmount} ante from ${seat.name} (stack now: ${seat.tableStack})`);
  }
}
this.gameState.pot = totalAntes;
```

## Why It Took So Long to Fix

### Diagnostic Missteps (60 minutes)
1. **Started with currency system**: Investigated TC vs VT, penny conversions, `getAnteAmount()` - all red herrings
2. **Focused on state initialization**: Checked how `gameState.pot` was initialized - wasn't the issue
3. **Didn't trace game flow**: Should have immediately followed phase transitions to find where antes should be collected

### Deployment Issues (20 minutes)
1. **Used wrong deployment script**: Used `deploy-platform-only.sh` which rebuilds platform but NOT external game packages
2. **Multiple test cycles**: Had to redeploy after realizing game changes weren't included

### What Should Have Been Done (15 minute path)
1. **Trace the game flow** (5 min):
   - Player clicks "Start Hand" → `handlePlayerAction('start_hand')` → `handleMarkReady()`
   - Check: What does `handleMarkReady()` require? → 2 ready players
   - Check: Does AI mark ready? → No → **FOUND ISSUE 1**

2. **Trace phase transitions** (5 min):
   - `startHand()` → `transitionToPhase('Ante')` → `handleAntePhase()`
   - Read `handleAntePhase()` code → See "side bet" comment → **FOUND ISSUE 2**

3. **Fix and deploy** (5 min):
   - Add AI auto-ready logic
   - Replace "side bet" with actual ante collection
   - Deploy with `deploy-external-game.sh ck-flipz`

## Best Practices Going Forward

### Debugging Multi-Player Games
1. **Always start with game flow tracing**:
   - What phase is the game in?
   - What event triggered the action?
   - What handler is called?
   - What conditions does it check?

2. **Check player count logic first**:
   - Are there enough players?
   - Are they all ready?
   - Are any checks using `humanCount` when they should use `totalCount` (or vice versa)?

3. **Use server logs effectively**:
   - Backend logs show phase transitions: `🪙 [Flipz] Transitioning to phase: Ante`
   - Backend logs show player actions: `🪙 [CoinFlip] DaOgre marked ready (1/2)`
   - Follow the logs chronologically to see where flow stops

### PvE Mode Checklist
When implementing PvE mode, ensure:
- [ ] AI opponents auto-spawn when human sits
- [ ] AI opponents auto-mark ready (don't wait for human to ready them)
- [ ] AI opponents take actions automatically (don't block game flow)
- [ ] Game start conditions account for AI players (`targetTotalPlayers` check)
- [ ] Ante/bet collection works with AI players

### Deployment
- **Platform changes only**: `./scripts/deploy-platform-only.sh`
- **External game changes**: `./scripts/deploy-external-game.sh <game-name>`
- **Both changed**: Run both scripts in order (game first, then platform)

## Testing Checklist for Future Changes

### Manual Test Flow
1. **PvE Game Start**:
   - [ ] Join PvE table → AI spawns
   - [ ] Click "Start Hand" → Game starts immediately (no waiting)
   - [ ] Verify phase: Lobby → Ante → CallSide

2. **Ante Collection**:
   - [ ] Check pot in Ante phase → Should show total antes (e.g., 200 TC for 100 TC ante)
   - [ ] Check player stacks → Should be reduced by ante amount
   - [ ] Check pot in Payout phase → Should still show total antes

3. **PvP Game Start**:
   - [ ] First player joins → Sees "Waiting for opponent"
   - [ ] Second player joins → Both see "Ready to start"
   - [ ] Both click ready → Game starts

### Automated Tests (Future)
```typescript
describe('PvE Mode', () => {
  it('should auto-spawn AI opponent when human sits', async () => {
    const game = createGame({ mode: 'pve' });
    game.sitPlayer(humanPlayer, 0, 1000);
    expect(game.gameState.seats.filter(s => s).length).toBe(2);
    expect(game.gameState.seats[1]?.isAI).toBe(true);
  });

  it('should auto-ready AI opponent', async () => {
    const game = createGame({ mode: 'pve' });
    game.sitPlayer(humanPlayer, 0, 1000);
    expect(game.gameState.readyPlayers?.length).toBe(1); // AI auto-ready
  });

  it('should collect antes in Ante phase', async () => {
    const game = createGame({ ante: 100 });
    game.sitPlayer(humanPlayer, 0, 1000);
    game.sitPlayer(aiPlayer, 1, 1000);
    game.startHand();
    expect(game.gameState.pot).toBe(200); // 2 players × 100 TC
    expect(game.gameState.seats[0]?.tableStack).toBe(900); // 1000 - 100
  });
});
```

## Related Files
- `CoinFlipGame.ts:95-124` - AI auto-spawn in `sitPlayer()`
- `CoinFlipGame.ts:213-260` - Ante collection in `handleAntePhase()`
- `CardFlipGame.ts:111-140` - AI auto-spawn (card variant)
- `CardFlipGame.ts:225-267` - Ante collection (card variant)
- `../packages/game-sdk/src/GameBase.ts:486-496` - `canStartHand()` validation

## Commit
- Commit: `05fa410` - "fix(ck-flipz): Fix game start and ante collection"
- PR: N/A (direct to main)
- Deployed: 2025-11-17 20:06 UTC
