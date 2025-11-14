# Currency Integration Patterns

This document defines how games integrate with the platform's currency system. Games NEVER directly access the database or modify user balances - all currency operations go through platform-provided callbacks.

## Core Principle

**Games work with in-memory state. The platform persists currency changes to the database.**

Games manipulate:
- `player.bankroll` (in-memory balance)
- `seat.tableStack` (chips on the table)

The platform is responsible for:
- Loading initial balances from database
- Persisting currency changes via CurrencyManager
- Maintaining audit trail of all transactions

## Two Currency Flow Patterns

### Pattern 1: Sit/Stand (Cash Game Model)

**Used for:** Cash games, most table-based games where players can sit and stand at will.

**Flow:**
1. **Player sits down** - Converts database balance to table chips
   - Platform: Deduct buy-in from database (via CurrencyManager)
   - Game: Deduct from `player.bankroll`, create `seat.tableStack`

2. **Gameplay** - All in-memory
   - Game: Manipulate `seat.tableStack` for bets, wins, losses
   - NO database operations during gameplay

3. **Player stands up** - Converts table chips back to database balance
   - Game: Add `seat.tableStack` to `player.bankroll`, remove seat
   - Platform: Credit final stack to database (via CurrencyManager)

**Transaction Types:**
- `game_buyin` - Debit on sit down
- `game_buyin_refund` - Credit if sit fails after deduction
- `game_cashout` - Credit on stand up

**Platform Hooks:**
```typescript
// Called by platform when player requests to sit
socket.on('sit_down', async (data: { seatIndex: number, buyInAmount: number }) => {
  // 1. Platform deducts from database FIRST
  await currencyManager.adjustBalance(userId, 'TC', -buyInAmount, {
    transactionType: 'game_buyin',
    referenceType: 'game_table',
    referenceId: tableId
  });

  // 2. Then game sits player (in-memory)
  const result = game.sitPlayer(player, seatIndex, buyInAmount);

  // 3. If sit fails, refund
  if (!result.success) {
    await currencyManager.adjustBalance(userId, 'TC', buyInAmount, {
      transactionType: 'game_buyin_refund'
    });
  }
});

// Called by platform when player requests to stand
socket.on('stand_up', async (data?: { immediate?: boolean }) => {
  const immediate = data?.immediate || false;

  // 1. Get final stack BEFORE standing
  const seat = game.findSeat(playerId);
  const finalStack = seat?.tableStack || 0;

  // 2. Stand player (in-memory)
  //    - immediate=true: Fold and stand now (loses current hand)
  //    - immediate=false: Queue stand, finish hand first
  game.standPlayer(playerId, immediate);

  // 3. Credit final stack to database
  //    - If immediate: Credit now
  //    - If queued: Credit when hand actually ends (see HandEnd handling below)
  if (immediate && finalStack > 0) {
    await currencyManager.adjustBalance(userId, 'TC', finalStack, {
      transactionType: 'game_cashout',
      referenceType: 'game_table',
      referenceId: tableId
    });
  } else if (!immediate) {
    // Player is queued to stand - they'll finish current hand
    // Platform must listen for actual stand completion
    // (See "Queued Stand Completion" section below)
  }
});
```

**Games Using This Pattern:**
- CK Flipz (Coin Flip / Card Flip)
- War Faire
- HouseRules Poker (cash game mode)

#### Best Practice: Two Stand-Up Modes

Players should have TWO ways to stand up:

**1. Stand Up After Hand (Default)**
- Player clicks "Stand Up" during active hand
- Game marks `seat.standingUp = true` and `seat.hasFolded = true`
- Player finishes current hand (doesn't have to act, auto-folds)
- At hand end, game removes seat and returns chips to bankroll
- Platform persists at that moment

**2. Stand Up Immediately**
- Player clicks "Stand Up Now" or similar urgent option
- Game folds player immediately (loses current hand)
- Game removes seat and returns chips to bankroll immediately
- Platform persists immediately

**SDK Implementation (GameBase):**
```typescript
// GameBase.standPlayer() already supports this:
public standPlayer(playerId: string, immediate: boolean = false): { success: boolean; error?: string } {
  const seat = this.findSeat(playerId);
  if (!seat) return { success: false, error: 'Not seated' };

  if (immediate || this.gameState.phase === 'Lobby') {
    // IMMEDIATE: Stand right now
    const player = this.getPlayer(playerId);
    if (player) {
      player.bankroll += seat.tableStack;
    }
    this.gameState.seats[seatIndex] = null;
    return { success: true };
  } else {
    // QUEUED: Finish current hand first
    seat.standingUp = true;
    seat.hasFolded = true;
    return { success: true };
  }
}
```

**Queued Stand Completion:**

When hand ends, game processes queued stands:
```typescript
// In game's endHand() method:
protected endHand(): void {
  // Process queued stand-ups
  for (const seat of this.gameState.seats) {
    if (seat?.standingUp) {
      const player = this.getPlayer(seat.playerId);
      if (player) {
        player.bankroll += seat.tableStack;
      }
      // Mark seat as empty
      this.gameState.seats[seatIndex] = null;

      // Emit event so platform can persist
      this.emit('player_stood', {
        playerId: seat.playerId,
        finalStack: seat.tableStack
      });
    }
  }
}
```

**Platform Handling of Queued Stands:**
```typescript
// Listen for stand completion event
game.on('player_stood', async (data: { playerId: string, finalStack: number }) => {
  if (data.finalStack > 0) {
    await currencyManager.adjustBalance(data.playerId, 'TC', data.finalStack, {
      transactionType: 'game_cashout',
      referenceType: 'game_table',
      referenceId: tableId,
      reason: 'Queued stand completed after hand'
    });
  }
});
```

**Why Two Modes?**
- **After Hand:** Polite, doesn't disrupt game, player gets to finish hand
- **Immediate:** Emergency exit, disconnecting, need to leave NOW
- **UX:** Default button = "Stand After Hand", secondary = "Leave Now"

---

### Pattern 2: Entry/Payout (Tournament Model)

**Used for:** Tournaments, prop bets, side games, one-time entry events where players don't sit/stand.

**Flow:**
1. **Player enters** - One-time fee deduction
   - Platform: Deduct entry fee from database
   - Game: Track player participation (no seat.tableStack)

2. **Gameplay** - Event-driven
   - Game: Track scores, results internally
   - NO currency manipulation during play

3. **Payout event** - Triggered by game outcome
   - Game: Emit payout event with winners and amounts
   - Platform: Credit winners via database

**Transaction Types:**
- `tournament_entry` - Debit on entry
- `tournament_payout` - Credit on win
- `prop_bet_entry` - Debit when placing bet
- `prop_bet_payout` - Credit on bet win
- `side_game_entry` - Debit for side game
- `side_game_payout` - Credit on side game win

**Platform Hooks:**
```typescript
// Entry - player pays to participate
socket.on('enter_tournament', async (data: { tournamentId: string, entryFee: number }) => {
  // Deduct entry fee from database
  await currencyManager.adjustBalance(userId, 'TC', -entryFee, {
    transactionType: 'tournament_entry',
    referenceType: 'tournament',
    referenceId: tournamentId
  });

  // Register player in tournament (no buy-in to game state)
  tournament.addPlayer(player);
});

// Payout - game emits event when tournament completes
game.on('tournament_complete', async (results: { playerId: string, payout: number }[]) => {
  // Credit each winner
  for (const result of results) {
    if (result.payout > 0) {
      await currencyManager.adjustBalance(result.playerId, 'TC', result.payout, {
        transactionType: 'tournament_payout',
        referenceType: 'tournament',
        referenceId: tournamentId,
        metadata: { placement: result.placement }
      });
    }
  }
});

// Prop bet example
socket.on('place_prop_bet', async (data: { betId: string, amount: number }) => {
  await currencyManager.adjustBalance(userId, 'TC', -amount, {
    transactionType: 'prop_bet_entry',
    referenceType: 'prop_bet',
    referenceId: betId
  });

  game.recordPropBet(playerId, betId, amount);
});

game.on('prop_bet_resolved', async (bet: { playerId: string, betId: string, payout: number }) => {
  if (bet.payout > 0) {
    await currencyManager.adjustBalance(bet.playerId, 'TC', bet.payout, {
      transactionType: 'prop_bet_payout',
      referenceType: 'prop_bet',
      referenceId: bet.betId
    });
  }
});
```

**Games Using This Pattern:**
- HouseRules Poker (side pots, prop bets)
- Future tournament modes
- Future prop bet system

---

## SDK Interface Design

### GameBase Callbacks (to be implemented)

Games should NOT implement currency persistence. Instead, the platform provides callbacks:

```typescript
export interface CurrencyCallbacks {
  /**
   * Called when a player needs to pay (sit down, enter tournament, place bet)
   * Platform deducts from database and returns success/failure
   */
  deductCurrency(
    playerId: string,
    amount: number,
    transactionType: string,
    metadata?: any
  ): Promise<{ success: boolean; error?: string }>;

  /**
   * Called when a player receives payment (stand up, win tournament, win bet)
   * Platform credits to database
   */
  creditCurrency(
    playerId: string,
    amount: number,
    transactionType: string,
    metadata?: any
  ): Promise<{ success: boolean; error?: string }>;
}

export class GameBase {
  protected currencyCallbacks?: CurrencyCallbacks;

  /**
   * Platform calls this to provide currency integration
   */
  public setCurrencyCallbacks(callbacks: CurrencyCallbacks): void {
    this.currencyCallbacks = callbacks;
  }

  // Games can optionally use callbacks for advanced scenarios
  // But for sit/stand pattern, platform handles it externally
}
```

### Event-Based Currency (for Entry/Payout pattern)

For games that need to trigger payouts from within game logic:

```typescript
export interface GameEvents {
  // ... existing events ...

  /**
   * Emitted when game needs to credit a player
   * Platform listens and persists via CurrencyManager
   */
  'currency_credit': {
    playerId: string;
    amount: number;
    reason: string;
    transactionType: string;
    metadata?: any;
  };

  /**
   * Emitted when tournament/event completes with payouts
   */
  'payout_complete': {
    payouts: Array<{
      playerId: string;
      amount: number;
      placement?: number;
    }>;
  };
}
```

---

## Platform Implementation Checklist

### For Sit/Stand Pattern:
- [ ] `sit_down` handler deducts buy-in via CurrencyManager
- [ ] `sit_down` calls `game.sitPlayer()` only after successful deduction
- [ ] `sit_down` refunds on failure
- [ ] `stand_up` handler gets `seat.tableStack` BEFORE standing
- [ ] `stand_up` calls `game.standPlayer()`
- [ ] `stand_up` credits final stack via CurrencyManager
- [ ] `disconnect` handler auto-stands seated players to persist chips

### For Entry/Payout Pattern:
- [ ] Entry handler deducts fee via CurrencyManager
- [ ] Entry calls game registration (no sitPlayer)
- [ ] Platform listens for game payout events
- [ ] Payout handler credits winners via CurrencyManager

---

## Transaction Type Reference

### Sit/Stand Pattern
- `game_buyin` - Player sits at table with buy-in
- `game_buyin_refund` - Refund if sit fails
- `game_cashout` - Player stands from table

### Entry/Payout Pattern
- `tournament_entry` - Entry fee for tournament
- `tournament_payout` - Tournament winnings
- `prop_bet_entry` - Prop bet wager
- `prop_bet_payout` - Prop bet winnings
- `side_game_entry` - Side game buy-in
- `side_game_payout` - Side game winnings

### Other
- `game_rebuy` - Player rebuys while seated (if supported)
- `game_addon` - Player adds chips while seated (if supported)

---

## Error Handling

### Critical: Failed Persistence

If currency deduction succeeds but game operation fails:
```typescript
// ALWAYS refund
await currencyManager.adjustBalance(userId, 'TC', amount, {
  transactionType: 'game_buyin_refund'
});
```

If game operation succeeds but credit fails:
```typescript
// Log critical error - player has lost chips!
console.error('CRITICAL: Failed to credit player chips');
// TODO: Implement recovery mechanism (retry queue, admin tool)
```

### Disconnect Handling

When player disconnects mid-game:
```typescript
socket.on('disconnect', async () => {
  // If player is seated, auto-stand to persist chips
  const seat = game.findSeat(playerId);
  if (seat) {
    const finalStack = seat.tableStack;
    game.standPlayer(playerId, true); // immediate stand

    if (finalStack > 0) {
      await currencyManager.adjustBalance(playerId, 'TC', finalStack, {
        transactionType: 'game_cashout',
        reason: 'Auto-cashout on disconnect'
      });
    }
  }
});
```

---

## Migration Notes

### Old Broken Pattern (DO NOT USE)
```typescript
// ❌ WRONG: Game manipulates database directly
await prisma.user.update({
  where: { googleId },
  data: { bankroll: { increment: winAmount } }
});
```

```typescript
// ❌ WRONG: Only in-memory, never persisted
player.bankroll += winAmount; // Lost on disconnect!
```

### New Correct Pattern
```typescript
// ✅ CORRECT: Platform persists via CurrencyManager
await currencyManager.adjustBalance(userId, 'TC', winAmount, {
  transactionType: 'game_cashout',
  reason: 'Cash out from table',
  referenceType: 'game_table',
  referenceId: tableId
});
```

---

## Audit Checklist

For each game, verify:

1. **No direct database access**
   - ❌ No `prisma.user.update()` in game code
   - ❌ No direct modification of `User.bankroll` in database

2. **In-memory only during gameplay**
   - ✅ Games only touch `player.bankroll` and `seat.tableStack`
   - ✅ All bets/wins/losses happen in-memory

3. **Platform handles persistence**
   - ✅ `sit_down` handler deducts via CurrencyManager
   - ✅ `stand_up` handler credits via CurrencyManager
   - ✅ OR game emits events that platform handles

4. **Proper transaction types**
   - ✅ Using standard transaction type names
   - ✅ Including proper metadata (tableId, reason, etc.)

---

## Future Enhancements

- [ ] Retry queue for failed credit operations
- [ ] Admin tool to resolve stuck currency
- [ ] Currency hold/lock system for in-progress games
- [ ] Multi-currency support (TC vs VT)
- [ ] Rake/fee automatic deduction
- [ ] Transaction batching for high-volume games
