# Currency API for Game Developers

## Overview

**CRITICAL: Games must be currency-agnostic!**

Games receive a `currencyCode` from their table configuration and use it for all operations. **Never hardcode 'TC', 'VT', or any specific currency in game logic.**

## The Golden Rule

```typescript
// ✅ CORRECT - Currency-agnostic
await currencyManager.adjustBalance(
  userId,
  this.config.currencyCode,  // ← From config!
  amount,
  options
);

// ❌ WRONG - Hardcoded currency
await currencyManager.adjustBalance(
  userId,
  'TC',  // ← NEVER DO THIS!
  amount,
  options
);
```

## Getting Currency from Config

Every game table receives `currencyCode` in its configuration:

```typescript
import type { BaseGameConfig } from '@antetown/game-sdk';

interface MyGameConfig extends BaseGameConfig {
  currencyCode: string;  // ← Platform provides this
  anteAmount: number;    // ← In the currency specified by currencyCode
  // ... other game-specific config
}

export function initializeMyGame(io, options) {
  const { tables } = options;

  tables.forEach(tableConfig => {
    // Each table can use a different currency!
    console.log(`Table ${tableConfig.tableId} uses ${tableConfig.currencyCode}`);

    // Store this for all currency operations
    const game = new MyGame(io, tableConfig);
  });
}
```

## Currency Manager Interface

Games interact with currencies through `ICurrencyManager`:

```typescript
import type { ICurrencyManager } from '@antetown/game-sdk';

// Platform provides this
import { currencyManager } from '@antetown/platform-backend/services/CurrencyManager';
```

### Get Balance

```typescript
const balance = await currencyManager.getBalance(
  userId,
  this.config.currencyCode
);
```

### Check Affordability

```typescript
const canAfford = await currencyManager.canAfford(
  userId,
  this.config.currencyCode,
  buyInAmount
);

if (!canAfford) {
  socket.emit('error', {
    code: 'INSUFFICIENT_BALANCE',
    message: `Insufficient ${this.config.currencyCode}`
  });
  return;
}
```

### Deduct Currency (Buy-In)

```typescript
try {
  const result = await currencyManager.adjustBalance(
    userId,
    this.config.currencyCode,
    -buyInAmount,  // Negative = deduct
    {
      transactionType: 'game_buy_in',
      referenceType: 'game_table',
      referenceId: this.tableId,
      reason: `Buy-in to ${this.config.displayName}`,
      metadata: {
        gameType: this.config.gameType,
        tableId: this.tableId
      }
    }
  );

  console.log(`Deducted ${buyInAmount} ${this.config.currencyCode}, new balance: ${result.newBalance}`);
} catch (error) {
  // Handle insufficient balance
  if (error.message.includes('Insufficient')) {
    socket.emit('error', { code: 'INSUFFICIENT_BALANCE' });
  }
  throw error;
}
```

### Award Currency (Winnings)

```typescript
const result = await currencyManager.adjustBalance(
  winnerId,
  this.config.currencyCode,
  winAmount,  // Positive = credit
  {
    transactionType: 'game_win',
    referenceType: 'game_session',
    referenceId: sessionId,
    reason: `Won ${this.config.displayName}`,
    metadata: {
      gameType: this.config.gameType,
      opponentIds: losers.map(p => p.userId),
      potSize: totalPot
    }
  }
);
```

### Return Currency (Player Leaves)

```typescript
// Player stands up, return their chips
const result = await currencyManager.adjustBalance(
  userId,
  this.config.currencyCode,
  player.chipCount,  // Return their stack
  {
    transactionType: 'game_stand_up',
    referenceType: 'game_table',
    referenceId: this.tableId,
    reason: `Left ${this.config.displayName}`
  }
);
```

## Complete Buy-In Example

```typescript
class MyGame {
  private config: MyGameConfig;
  private currencyManager: ICurrencyManager;

  constructor(io, config, currencyManager) {
    this.config = config;
    this.currencyManager = currencyManager;
  }

  async handleSitDown(socket, data: { buyInAmount: number }) {
    const userId = socket.userId;
    const { buyInAmount } = data;

    // 1. Validate buy-in amount
    if (this.config.minBuyIn && buyInAmount < this.config.minBuyIn) {
      return socket.emit('error', { code: 'BUY_IN_TOO_LOW' });
    }
    if (this.config.maxBuyIn && buyInAmount > this.config.maxBuyIn) {
      return socket.emit('error', { code: 'BUY_IN_TOO_HIGH' });
    }

    // 2. Check if user can afford (in their currency)
    const canAfford = await this.currencyManager.canAfford(
      userId,
      this.config.currencyCode,  // ← Currency-agnostic!
      buyInAmount
    );

    if (!canAfford) {
      return socket.emit('error', {
        code: 'INSUFFICIENT_BALANCE',
        currency: this.config.currencyCode
      });
    }

    // 3. Deduct the buy-in
    try {
      await this.currencyManager.adjustBalance(
        userId,
        this.config.currencyCode,
        -buyInAmount,
        {
          transactionType: 'game_buy_in',
          referenceType: 'game_table',
          referenceId: this.tableId,
          reason: `Buy-in to ${this.config.displayName}`,
          metadata: { gameType: this.config.gameType }
        }
      );
    } catch (error) {
      return socket.emit('error', {
        code: 'BUY_IN_FAILED',
        message: error.message
      });
    }

    // 4. Add player to game
    this.addPlayer(userId, buyInAmount);

    socket.emit('sit_down_success', {
      chipCount: buyInAmount,
      currency: this.config.currencyCode
    });
  }
}
```

## Currency Display

Get currency details for UI display:

```typescript
const currency = await currencyManager.getCurrency(this.config.currencyCode);

// Send to frontend
socket.emit('game_state', {
  // ... game state
  currency: {
    code: currency.code,
    displayName: currency.displayName,
    symbol: currency.symbol,
    iconUrl: currency.iconUrl
  }
});
```

Frontend can then display:
```tsx
// If icon available, use it
{currency.iconUrl ? (
  <img src={currency.iconUrl} alt={currency.displayName} />
) : currency.symbol ? (
  <span>{currency.symbol}</span>
) : (
  <span>{currency.displayName}</span>
)}
<span>{amount}</span>
```

## Transaction Types

Use these standard transaction types for consistency:

| Type | When to Use | Amount |
|------|-------------|--------|
| `game_buy_in` | Player sits down at table | Negative |
| `game_win` | Player wins pot/game | Positive |
| `game_loss` | Player loses (if tracked separately) | Negative |
| `game_stand_up` | Player leaves table | Positive |
| `game_rebuy` | Player rebuys chips | Negative |
| `game_refund` | Game cancelled, return buy-ins | Positive |

## Best Practices

### ✅ DO

1. **Always use `this.config.currencyCode`**
   - Never hardcode currency codes in game logic

2. **Provide clear transaction reasons**
   ```typescript
   reason: `Won ${this.config.displayName} against ${opponentName}`
   ```

3. **Include metadata for debugging**
   ```typescript
   metadata: {
     gameType: this.config.gameType,
     tableId: this.tableId,
     sessionId,
     opponentIds: [...]
   }
   ```

4. **Handle errors gracefully**
   ```typescript
   try {
     await currencyManager.adjustBalance(...);
   } catch (error) {
     socket.emit('error', { code: 'CURRENCY_ERROR', message: error.message });
   }
   ```

5. **Return chips when players leave**
   - Don't let chips disappear!

### ❌ DON'T

1. **Never hardcode currency codes**
   ```typescript
   // WRONG!
   await currencyManager.adjustBalance(userId, 'TC', amount, options);
   ```

2. **Never assume currency exists**
   ```typescript
   // Check canAfford() first
   const canAfford = await currencyManager.canAfford(...);
   ```

3. **Never modify balances directly**
   ```typescript
   // WRONG!
   await prisma.user.update({ data: { bankroll: { increment: amount } } });

   // CORRECT!
   await currencyManager.adjustBalance(...);
   ```

4. **Don't forget to return chips on errors**
   ```typescript
   // If game crashes after buy-in, refund the players
   if (gameError) {
     for (const player of players) {
       await currencyManager.adjustBalance(
         player.userId,
         this.config.currencyCode,
         player.chipCount,
         { transactionType: 'game_refund', reason: 'Game error' }
       );
     }
   }
   ```

## Multi-Currency Support

Your game can support multiple currencies simultaneously:

```typescript
// Platform can create multiple tables with different currencies:
// - Table A: currencyCode = 'TC'
// - Table B: currencyCode = 'VT'
// - Table C: currencyCode = 'GEMS'

// Your game code stays the same! Just use this.config.currencyCode
```

**Example config:**
```typescript
const tables = [
  {
    tableId: 'poker-tc-beginner',
    currencyCode: 'TC',
    anteAmount: 100,
    minBuyIn: 1000,
    maxBuyIn: 10000
  },
  {
    tableId: 'poker-vt-premium',
    currencyCode: 'VT',
    anteAmount: 10,
    minBuyIn: 100,
    maxBuyIn: 1000
  }
];
```

## Testing

When testing your game:

1. **Test with different currencies**
   - Create TC table, verify buy-ins work
   - Create VT table, verify buy-ins work
   - Create test currency table

2. **Test insufficient balance**
   - Verify error handling when user can't afford buy-in

3. **Test refunds**
   - Verify chips are returned when player leaves
   - Verify refunds on game errors

## See Also

- [Platform Currency System](../../../../AnteTown-Platform/docs/platform/CURRENCY_SYSTEM.md) - Full internal architecture
- [Buy-In Guide](../guides/buy-ins.md) - Step-by-step implementation guide
- SDK Types: `ICurrencyManager`, `BaseGameConfig`, `CurrencyOperationOptions`
