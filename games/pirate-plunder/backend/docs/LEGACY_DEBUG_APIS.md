# Legacy Debug APIs (From Standalone Server)

**Note**: These APIs were part of the standalone dev server (`server.ts`) which has been removed. The underlying functionality still exists in `PiratePlunderTable.ts` and `@pirate/core-engine`. This document preserves the API design for potential future implementation in the platform.

---

## Hand History APIs

### GET `/api/hand-history`
Returns recent hands (last 20 by default).

**Response**:
```json
[
  {
    "handId": "hand_1234567890_abc123",
    "timestamp": "2025-01-15T12:34:56.789Z",
    "players": [...],
    "results": {...},
    "cargoChest": {...}
  }
]
```

### GET `/api/hand-history/:handId`
Returns detailed history for a specific hand.

**Parameters**:
- `handId` - Hand identifier

**Response**: Full hand history object with all phases, actions, and results.

**Note**: Hand history was stored in:
- In-memory array (`handHistory` in server.ts)
- Filesystem backups in `hand_history/{handId}.json`

---

## Money Flow APIs

These APIs used `moneyFlowService` from `@pirate/core-engine` to track and validate money movement.

### GET `/api/money-flow/transactions`
Get filtered transaction list.

**Query Parameters**:
- `handId` - Filter by hand
- `playerId` - Filter by player
- `type` - Comma-separated transaction types
- `limit` - Max results
- `since` - ISO timestamp

**Response**:
```json
{
  "transactions": [
    {
      "handId": "...",
      "playerId": "...",
      "type": "ante|bet|payout|rake|drip",
      "from": "player|system",
      "to": "pot|chest|house|system",
      "amount": 100,
      "timestamp": "..."
    }
  ]
}
```

### GET `/api/money-flow/hand-summary/:handId`
Get money flow summary for a specific hand.

**Response**:
```json
{
  "handId": "...",
  "totalIn": 1000,
  "totalOut": 950,
  "playerBalanceChanges": {
    "player1": -100,
    "player2": 150,
    "system": -50
  },
  "transactions": [...]
}
```

### GET `/api/money-flow/audit`
Get comprehensive money audit across all hands.

**Response**:
```json
{
  "recentHands": ["hand1", "hand2", ...],
  "systemBalance": 0,
  "discrepancies": [],
  "summary": {
    "totalProcessed": 10000,
    "transactionCount": 1234
  }
}
```

### POST `/api/money-flow/export`
Export all transactions as downloadable JSON.

**Response**: File download with all transaction data.

### GET `/api/money-flow/recent-hands`
Get recent hands with money flow summaries.

**Response**:
```json
[
  {
    "handId": "...",
    "totalIn": 1000,
    "totalOut": 950,
    "playerCount": 4,
    "timestamp": "..."
  }
]
```

---

## Cross-Reference Validation

The `cross-reference-service.ts` provides validation between hand history and money flow:

```typescript
import { crossReferenceService } from './services/cross-reference-service';

// Validate a completed hand
const result = crossReferenceService.crossReference(handHistory, handId);
if (!result.valid) {
  console.error('Money flow discrepancy:', result.discrepancies);
}
```

**Discrepancy Types**:
- `pot_mismatch` - Pot calculations don't match
- `payout_mismatch` - Payout amounts don't match
- `missing_transaction` - Expected transaction not found
- `unexpected_transaction` - Extra transaction found
- `amount_mismatch` - Transaction amounts don't match

---

## Future Platform Implementation

When implementing these in the platform:

1. **Hand History**: Store in database (PostgreSQL) with indexed queries
2. **Money Flow**: Use `moneyFlowService` from core-engine
3. **Cross-Reference**: Run validation after each hand completes
4. **APIs**: Implement as platform-level endpoints (not game-specific)
5. **UI**: Create admin dashboard for debugging money flow

**Example Platform Route**:
```typescript
// platform/backend/src/routes/game-debug.ts
router.get('/api/debug/:gameId/hand-history', async (req, res) => {
  const hands = await prisma.handHistory.findMany({
    where: { gameId: req.params.gameId },
    orderBy: { timestamp: 'desc' },
    take: 20
  });
  res.json(hands);
});
```
