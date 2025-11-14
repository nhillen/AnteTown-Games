# CK Flipz 🪙

**A minimal reference implementation game for the AnteTown platform**

## What is CK Flipz?

CK Flipz is a collection of simple betting games:
- **Coin Flip**: Bet on heads or tails
- **Card Flip**: Bet on red or black

### Features
- ⚡ Lightning fast rounds (< 30 seconds)
- 🎯 Pure chance, no skill component
- 💰 Configurable antes and rake
- 🔄 Multi-table support
- 🎲 Minimal complexity

### Why CK Flipz Exists

CK Flipz serves as a **reference implementation** for the AnteTown game SDK:
1. **Minimal Complexity**: Intentionally simple to demonstrate core patterns
2. **Documentation by Example**: Shows how to structure a basic game package
3. **Testing Vehicle**: Used to validate platform integration features
4. **Quick Start Template**: Starting point for new game developers

---

## Package Structure

```
games/ck-flipz/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Exports: initializeCKFlipz(), GAME_METADATA
│   │   ├── CoinFlipGame.ts       # Coin flip game logic
│   │   ├── CardFlipGame.ts       # Card flip game logic
│   │   └── FlipzTableConfig.ts   # Multi-table configurations
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── index.ts              # Exports: CKFlipzClient, GAME_CLIENT_INFO
│   │   └── CoinFlipClient.tsx    # React component
│   ├── package.json
│   └── tsconfig.json
│
├── package.json                  # Root package (coordinates backend/frontend)
└── README.md                     # This file
```

**Key Files:**
- `backend/src/index.ts` - Exports game initialization function and metadata
- `frontend/src/index.ts` - Exports React component for platform integration
- `FlipzTableConfig.ts` - Demonstrates multi-table configuration

---

## Integration with AnteTown Platform

CK Flipz follows the standard AnteTown game package pattern. See the main [CLAUDE.md](/CLAUDE.md) for complete integration documentation.

**Quick Summary:**
- Backend exports `initializeCKFlipz()` function that the platform calls at startup
- Frontend exports `CKFlipzClient` React component that the platform renders
- Uses Socket.IO for real-time game state synchronization
- Supports multiple table instances with different configurations

---

## Development

### From Monorepo Root

```bash
# Build all games including CK Flipz
npm run build

# Build only CK Flipz
npm run build --workspace games/ck-flipz

# Type check
cd games/ck-flipz/backend && npx tsc --noEmit
cd games/ck-flipz/frontend && npx tsc --noEmit
```

### Testing with Platform

To test CK Flipz with the AnteTown platform:

```bash
# 1. Build CK Flipz
cd games/ck-flipz
npm run build

# 2. Link to platform and test
cd ../../../AnteTown  # Or wherever platform is located
npm install           # Links file: dependencies
npm run dev           # Start platform

# 3. Access at http://localhost:3001/#game/ck-flipz
```

---

## Using CK Flipz as a Template

CK Flipz is designed to be copied and modified for new games:

### Step-by-Step:

1. **Copy the structure** to a new game directory
   ```bash
   cp -r games/ck-flipz games/your-game
   cd games/your-game
   ```

2. **Rename** package and game identifiers
   - Update `package.json` name: `@antetown/game-your-game`
   - Update `GAME_METADATA.id`: `'your-game'`
   - Update `GAME_CLIENT_INFO.id`: `'your-game'`

3. **Implement your game logic**
   - Replace `CoinFlipGame.ts` with your game class
   - Extend `GameBase` from `@antetown/game-sdk`
   - Implement required methods: `handleJoin`, `handleAction`, etc.

4. **Create your frontend**
   - Replace `CoinFlipClient.tsx` with your React component
   - Connect to Socket.IO events
   - Render game state

5. **Configure tables** (optional)
   - Update `FlipzTableConfig.ts` if using multi-table architecture
   - Or simplify to single-table if that suits your game

6. **Test and deploy**
   - Build your game
   - Test with platform locally
   - Deploy platform with your game included

### Key Patterns to Copy:

- ✅ **Backend initialization**: `initializeYourGame(io, options)` function
- ✅ **Game metadata**: Export `GAME_METADATA` object
- ✅ **Frontend export**: Export `YourGameClient` React component
- ✅ **Client info**: Export `GAME_CLIENT_INFO` object
- ✅ **Socket events**: Standard events (`join`, `sit_down`, `game_action`, `game_state`)

---

## Why Two Variants?

CK Flipz includes both **Coin Flip** and **Card Flip** to demonstrate:
- How to structure multiple game variants in one package
- Sharing common patterns between similar games
- Multi-table configuration with different game types

This pattern is useful for games with minor rule variations (e.g., different deck sizes, betting structures).

---

## Minimal Complexity by Design

CK Flipz intentionally omits features present in other games:

- **No AI players**: Pure player-vs-player (simplifies bot implementation)
- **No complex rules**: Just flip and win (easy to understand)
- **No progressive mechanics**: Fixed antes and payouts (no jackpots)
- **Minimal state**: Phase, bets, result (easy to debug)

This makes it the **best starting point** for understanding AnteTown game integration.

---

## History

CK Flipz was originally developed as `@pirate/game-coin-flip` and later consolidated into the AnteTown-Games monorepo. The code was recovered from git commit `c4c0b44` and updated to the current SDK patterns.
