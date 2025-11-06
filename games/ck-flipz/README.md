# CK Flipz 🪙

**A reference implementation game package for the AnteTown platform**

## Why This Lives In-Repo

**⚠️ ARCHITECTURAL EXCEPTION:** CK Flipz intentionally breaks the pattern of separate game repositories.

Unlike other games (PiratePlunder, WarFaire, HouseRules) which live in their own repositories, CK Flipz is kept inside the AnteTown platform repository because:

1. **Reference Implementation**: Serves as an example for developers creating new games
2. **Minimal Complexity**: Intentionally kept simple to demonstrate core patterns
3. **Testing Vehicle**: Used to test platform integration features
4. **Documentation by Example**: Shows how to structure a minimal game package

**Other games should follow the separate repository pattern.** CK Flipz is the exception, not the rule.

---

## What is CK Flipz?

CK Flipz is a collection of simple betting games:
- **Coin Flip**: Bet on heads or tails
- **Card Flip**: Bet on red or black

### Features
- ⚡ Lightning fast rounds (< 30 seconds)
- 🎯 Pure chance, no skill component
- 💰 Configurable antes and rake
- 🔄 Multi-table support
- 🎲 Minimal UI complexity

---

## Package Structure

```
examples/ck-flipz/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Exports: initializeCKFlipz(), GAME_METADATA
│   │   ├── CoinFlipGame.ts       # Coin flip game logic
│   │   ├── CardFlipGame.ts       # Card flip game logic
│   │   └── FlipzTableConfig.ts   # Multi-table configurations
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── index.ts              # Exports: CKFlipzClient
│   │   └── CoinFlipClient.tsx    # React component
│   └── package.json
│
└── README.md (this file)
```

---

## Integration with AnteTown Platform

CK Flipz integrates with the platform just like external game packages:

### Backend Integration

```typescript
// platform/backend/src/server.ts
import { initializeCKFlipz, GAME_METADATA } from '../../examples/ck-flipz/backend/src/index.js';

// Initialize games
const ckFlipzResult = initializeCKFlipz(io, {
  namespace: '/',
  tables: FLIPZ_TABLES  // Multi-table configuration
});
```

### Frontend Integration

```typescript
// platform/frontend/src/App.tsx
import { CKFlipzClient } from '../../examples/ck-flipz/frontend/src/index';

if (currentGame === 'ck-flipz') {
  return <CKFlipzClient />;
}
```

---

## Key Differences from Other Games

### Multi-Table Architecture

Unlike PiratePlunder which has one game instance with multiple seats, CK Flipz creates **multiple game instances** (one per table):

```typescript
// CK Flipz: Multiple game instances
const tables = FLIPZ_TABLES.map(config =>
  new CoinFlipGame(config)  // Each table is separate
);

// PiratePlunder: One game, multiple seats
const game = initializePiratePlunder(io);  // Single instance
```

### Minimal Complexity

- **No AI players**: Pure player-vs-player
- **No complex rules**: Just flip and win
- **No progressive mechanics**: Fixed antes and payouts
- **Minimal state**: Phase, bets, result

This makes it an excellent starting point for understanding game integration.

---

## Development

CK Flipz is built and deployed as part of the AnteTown platform:

```bash
# From platform root
npm run dev          # Starts platform with CK Flipz included

# Build
make build          # Builds platform including CK Flipz
```

**No separate deployment** - CK Flipz is always deployed with the platform.

---

## Using CK Flipz as a Template

To create a new game based on CK Flipz:

1. **Copy this structure** to a new repository
2. **Rename** all references from "ck-flipz" to your game name
3. **Implement your game logic** in place of CoinFlipGame/CardFlipGame
4. **Create your frontend** component
5. **Publish as package** (don't keep it in-repo like CK Flipz!)

See [PiratePlunder](https://github.com/nhillen/PiratePlunder) for an example of a proper external game package.

---

## Why Two Variants?

CK Flipz includes both **Coin Flip** and **Card Flip** to demonstrate:
- How to structure multiple game variants in one package
- Sharing common patterns between similar games
- Multi-table configuration with different variants

---

## History

CK Flipz was originally developed as `@pirate/game-coin-flip` in a separate package structure, but was moved into the platform repository to serve as a reference implementation. The code was recovered from git commit `c4c0b44`.

---

**Remember**: CK Flipz breaks the pattern intentionally. Most games should be separate repositories!
