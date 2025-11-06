# Architecture: Multi-Table Lobby & Rules Engine

## Overview

This document outlines the architecture for supporting:
1. **Multi-table lobby system** - Players can browse and join different tables with different game variants
2. **Pluggable rules engine** - Support for multiple poker variants (Hold'em, 2s wild, etc.) with extensible rule modifications

## A. Multi-Table Lobby System

### Architecture Pattern (Based on CK Flipz)

```
HouseRulesLobby
  ├── TableRegistry (manages all active tables)
  ├── TableCards[] (UI: browsable table list)
  └── TableSelector (routing to specific table)

Server Side:
  - Multiple HouseRules game instances
  - Each instance = one table with specific rules
  - Players route to specific table via tableId
```

### Table Registry Schema

```typescript
interface PokerTableConfig {
  tableId: string;           // unique identifier
  displayName: string;       // "High Stakes Hold'em"
  variant: GameVariant;      // 'holdem' | 'twos-wild' | 'omaha' | etc
  rules: RuleModifiers;      // variant-specific modifications

  // Table parameters
  minBuyIn: number;
  maxBuyIn: number;
  smallBlind: number;
  bigBlind: number;
  maxSeats: number;

  // Metadata
  emoji: string;             // "♠️", "🃏", "🎲"
  description: string;       // "Classic Texas Hold'em"
  difficulty?: string;       // "Beginner", "Advanced"

  // State
  currentPlayers: number;
  isActive: boolean;
}

// Example tables
const POKER_TABLES: PokerTableConfig[] = [
  {
    tableId: 'classic-holdem-1',
    displayName: 'Classic Hold\'em',
    variant: 'holdem',
    rules: {},
    minBuyIn: 2000,
    maxBuyIn: 10000,
    smallBlind: 50,
    bigBlind: 100,
    maxSeats: 9,
    emoji: '♠️',
    description: 'Standard Texas Hold\'em poker',
    currentPlayers: 0,
    isActive: true
  },
  {
    tableId: 'twos-wild-1',
    displayName: '2s Wild',
    variant: 'twos-wild',
    rules: {
      wildCards: ['2'],
      handRankingOverride: 'five-of-a-kind-enabled'
    },
    minBuyIn: 2000,
    maxBuyIn: 10000,
    smallBlind: 50,
    bigBlind: 100,
    maxSeats: 9,
    emoji: '🃏',
    description: 'All 2s are wild cards',
    currentPlayers: 0,
    isActive: true
  }
];
```

### Lobby UI Flow

```
1. Player opens House Rules
2. Shows TableCards grid (like CK Flipz)
   - Display: emoji, name, players, blinds, variant
   - Click to select table
3. Table detail modal
   - Buy-in slider
   - Seat selection
   - "Join Table" button
4. Route to specific table game instance
```

### Server-Side Table Management

```typescript
// In server.ts or table-manager.ts

class PokerTableManager {
  private tables: Map<string, HouseRules> = new Map();
  private tableConfigs: PokerTableConfig[];

  initializeTables() {
    // Create game instances for each table config
    this.tableConfigs.forEach(config => {
      const game = new HouseRules({
        tableId: config.tableId,
        variant: config.variant,
        rules: config.rules,
        maxSeats: config.maxSeats,
        // ... other params
      });
      this.tables.set(config.tableId, game);
    });
  }

  getTable(tableId: string): HouseRules | undefined {
    return this.tables.get(tableId);
  }

  getActiveTables(): PokerTableInfo[] {
    return Array.from(this.tables.values()).map(table => ({
      tableId: table.tableId,
      variant: table.variant,
      currentPlayers: table.getSeatedPlayerCount(),
      // ... other public info
    }));
  }

  routePlayerToTable(playerId: string, tableId: string) {
    const table = this.tables.get(tableId);
    // ... routing logic
  }
}
```

## B. Rules Engine Architecture

### Core Concept

The rules engine provides **hook points** throughout the poker game flow where variant-specific logic can intercept and modify behavior.

### Rule Hook Points

```typescript
interface PokerRulesEngine {
  variant: GameVariant;
  modifiers: RuleModifiers;

  // Hook points in game flow
  hooks: {
    // Card evaluation
    evaluateHand?: (cards: Card[]) => HandEvaluation;
    isWildCard?: (card: Card) => boolean;
    substituteWildCard?: (wildCard: Card, context: HandContext) => Card;

    // Dealing modifications
    modifyDealCount?: (phase: PokerPhase) => number;  // e.g., Omaha = 4 hole cards
    modifyCommunityCards?: (phase: PokerPhase) => number;

    // Betting modifications
    modifyBettingRules?: () => BettingRules;

    // Action modifications
    allowedActions?: (seat: PokerSeat, phase: PokerPhase) => PokerAction[];

    // Phase transitions
    skipPhase?: (phase: PokerPhase) => boolean;
    addPhase?: (currentPhase: PokerPhase) => PokerPhase[];

    // Showdown modifications
    compareHands?: (hand1: HandEvaluation, hand2: HandEvaluation) => number;
  };
}
```

### Example: Hold'em Rules (Baseline)

```typescript
const HOLDEM_RULES: PokerRulesEngine = {
  variant: 'holdem',
  modifiers: {},
  hooks: {
    // Standard evaluation, no overrides
    evaluateHand: evaluateStandardHand,
    isWildCard: () => false,
  }
};
```

### Example: 2s Wild Rules

```typescript
const TWOS_WILD_RULES: PokerRulesEngine = {
  variant: 'twos-wild',
  modifiers: {
    wildCards: ['2'],
    handRankingOverride: 'five-of-a-kind-enabled'
  },
  hooks: {
    isWildCard: (card: Card) => card.rank === '2',

    evaluateHand: (cards: Card[]) => {
      // Separate wild cards from regular cards
      const wilds = cards.filter(c => c.rank === '2');
      const regular = cards.filter(c => c.rank !== '2');

      // Try all possible substitutions and take best hand
      return evaluateWithWilds(regular, wilds);
    },

    compareHands: (hand1, hand2) => {
      // Five of a kind beats everything
      if (hand1.rank === 'five-of-a-kind') return 1;
      if (hand2.rank === 'five-of-a-kind') return -1;
      return standardCompare(hand1, hand2);
    }
  }
};
```

### Rules Engine Integration in HouseRules Class

```typescript
export class HouseRules extends GameBase {
  private rulesEngine: PokerRulesEngine;
  private variant: GameVariant;

  constructor(config: HouseRulesConfig) {
    super(config);
    this.variant = config.variant || 'holdem';
    this.rulesEngine = this.loadRulesEngine(this.variant);
  }

  private loadRulesEngine(variant: GameVariant): PokerRulesEngine {
    const engines: Record<GameVariant, PokerRulesEngine> = {
      'holdem': HOLDEM_RULES,
      'twos-wild': TWOS_WILD_RULES,
      'omaha': OMAHA_RULES,
      // ... more variants
    };
    return engines[variant] || HOLDEM_RULES;
  }

  // Use hooks throughout game logic
  private evaluatePlayerHand(seat: PokerSeat): HandEvaluation {
    const evaluator = this.rulesEngine.hooks.evaluateHand || evaluateStandardHand;
    return evaluator(seat.holeCards.concat(this.gameState.communityCards));
  }

  private dealHoleCards(): void {
    const cardCount = this.rulesEngine.hooks.modifyDealCount?.('PreFlop') || 2;
    // Deal cardCount cards to each player
  }
}
```

### Rule Modifiers Schema

```typescript
interface RuleModifiers {
  // Card modifications
  wildCards?: string[];                    // ['2'] or ['J', 'joker']
  deckModifications?: DeckMod[];           // add jokers, remove cards

  // Hand ranking modifications
  handRankingOverride?: string;            // 'five-of-a-kind-enabled'
  customHandRanks?: HandRank[];

  // Dealing modifications
  holeCardCount?: number;                  // 2 for Hold'em, 4 for Omaha
  communityCardOverride?: {
    flop?: number;
    turn?: number;
    river?: number;
  };

  // Betting modifications
  potLimit?: boolean;                      // PLO
  noLimit?: boolean;                       // NLHE
  fixedLimit?: number;

  // Special rules
  mustUseExactly?: number;                 // Omaha: must use exactly 2 hole cards
  highLowSplit?: boolean;                  // High-low games

  // Roguelike additions (for future)
  relicsEnabled?: boolean;
  rogueBreaks?: boolean;
}
```

### File Structure

```
HouseRules/
├── src/
│   ├── HouseRules.ts              # Main game class
│   ├── types.ts                   # Core types
│   ├── rules/                     # Rules engine
│   │   ├── RulesEngine.ts         # Base interface
│   │   ├── holdem.ts              # Hold'em rules
│   │   ├── twos-wild.ts           # 2s wild rules
│   │   ├── omaha.ts               # Omaha rules
│   │   └── index.ts               # Export all variants
│   ├── evaluators/                # Hand evaluation
│   │   ├── standard.ts            # Standard hand eval
│   │   ├── wild-cards.ts          # Wild card hand eval
│   │   └── five-of-a-kind.ts      # Extended rankings
│   ├── lobby/                     # Multi-table system
│   │   ├── TableRegistry.ts       # Manages tables
│   │   ├── TableManager.ts        # Server-side logic
│   │   └── table-configs.ts       # Table definitions
│   ├── PokerLobby.tsx             # Lobby UI component
│   └── PokerClient.tsx            # Game table UI
├── docs/
│   ├── architecture-multi-table-rules-engine.md  # This file
│   └── roguelike-design.md        # Roguelike mode (deferred)
```

## Implementation Priority

### Phase 1: Multi-Table Foundation
1. Create `TableRegistry` and `TableManager` classes
2. Define `PokerTableConfig` schema
3. Create `PokerLobby.tsx` component (table browser)
4. Add table routing in server
5. Test with 2-3 identical Hold'em tables

### Phase 2: Rules Engine Foundation
1. Define `PokerRulesEngine` interface
2. Refactor `HouseRules.ts` to use rules engine hooks
3. Implement baseline `HOLDEM_RULES`
4. Add hook points throughout game flow
5. Test that Hold'em still works identically

### Phase 3: First Variant (2s Wild)
1. Implement `TWOS_WILD_RULES`
2. Create wild card evaluation logic
3. Add "Five of a Kind" hand rank
4. Create table config for 2s Wild table
5. Test 2s Wild gameplay

### Phase 4: Additional Variants
- Omaha (4 hole cards, must use exactly 2)
- Seven Card Stud (different dealing pattern)
- Pineapple (discard one hole card post-flop)
- etc.

### Phase 5: Roguelike Mode (Future)
- Implement Relic system using rules engine hooks
- Add roguelike table variant with relic drafting
- See `docs/roguelike-design.md`

## Testing Strategy

### Unit Tests
```typescript
describe('Rules Engine', () => {
  it('should evaluate standard Hold\'em hands', () => {
    const engine = loadRulesEngine('holdem');
    const hand = engine.hooks.evaluateHand(testCards);
    expect(hand.rank).toBe('flush');
  });

  it('should treat 2s as wild cards in 2s Wild', () => {
    const engine = loadRulesEngine('twos-wild');
    expect(engine.hooks.isWildCard({ rank: '2', suit: 'hearts' })).toBe(true);
  });

  it('should recognize Five of a Kind in 2s Wild', () => {
    const engine = loadRulesEngine('twos-wild');
    const hand = engine.hooks.evaluateHand([
      { rank: 'K', suit: 'hearts' },
      { rank: 'K', suit: 'diamonds' },
      { rank: 'K', suit: 'clubs' },
      { rank: 'K', suit: 'spades' },
      { rank: '2', suit: 'hearts' }  // wild, becomes 5th King
    ]);
    expect(hand.rank).toBe('five-of-a-kind');
  });
});
```

### Integration Tests
- Multi-table lobby loads correctly
- Players can join different tables
- Each table maintains independent state
- 2s Wild rules work end-to-end
- Hand rankings are correct per variant

## Migration Path

Current `HouseRules.ts` needs minimal changes:

1. Add `variant` and `rulesEngine` properties
2. Wrap existing evaluation logic in `HOLDEM_RULES`
3. Replace direct calls with hook calls
4. Keep all existing functionality working

**Backward Compatibility**: All existing code continues to work by defaulting to `variant: 'holdem'`.

## Benefits

1. **Extensibility**: Easy to add new poker variants
2. **Separation of Concerns**: Rules logic separated from game engine
3. **Testing**: Each variant can be tested independently
4. **Future-Proof**: Roguelike relics can use same hook system
5. **Configuration**: Tables can be defined in JSON/config files

---

**Status**: Architecture design phase. Ready for implementation.
