# HouseRules (Texas Hold'em Poker) ♠️

**A full-featured Texas Hold'em poker game for the AnteTown platform**

## What is HouseRules?

HouseRules is a Texas Hold'em poker implementation with:
- ✅ Full Texas Hold'em rules and betting rounds
- ♠️ Complete hand evaluation and winner determination
- 💰 Buy-in system and chip management
- 🎲 Multi-table support with configurable stakes
- 🎯 Up to 9 players per table
- 🔄 Blind rotation and all-in/side pot handling

### Game Variants

- **Standard Texas Hold'em** - Classic poker gameplay (current implementation)
- **Roguelike Mode** - Poker with power-ups and draft phases (in development - see `docs/variants/`)

---

## Package Structure

```
games/houserules-poker/
├── backend/
│   ├── src/
│   │   ├── HouseRules.ts         # Main game logic (extends GameBase)
│   │   ├── hand-evaluator.ts     # Poker hand evaluation
│   │   ├── deck.ts                # Card and deck utilities
│   │   ├── types.ts               # TypeScript interfaces
│   │   └── index.ts               # Package exports
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── PokerClient.tsx       # Main React component
│   │   ├── components/           # UI components (table, cards, actions)
│   │   └── index.ts              # Package exports
│   ├── package.json
│   └── tsconfig.json
│
├── docs/
│   ├── variants/                 # Variant-specific documentation
│   ├── TODO.md                   # Feature roadmap
│   └── *.md                      # Architecture and integration docs
│
├── package.json                  # Root package (coordinates backend/frontend)
└── README.md                     # This file
```

**Key Exports:**
- Backend: `HouseRules` class, `GAME_METADATA`
- Frontend: `PokerClient` component, `GAME_CLIENT_INFO`

---

## Integration with AnteTown Platform

HouseRules follows the standard AnteTown game package pattern. See the main [CLAUDE.md](/CLAUDE.md) for complete integration documentation.

**Package Name:** `@antetown/game-houserules`

---

## Development

### From Monorepo Root

```bash
# Build all games including HouseRules
npm run build

# Build only HouseRules
npm run build --workspace games/houserules-poker

# Type check
cd games/houserules-poker/backend && npx tsc --noEmit
cd games/houserules-poker/frontend && npx tsc --noEmit
```

### From Game Directory

```bash
cd games/houserules-poker

# Build backend and frontend
npm run build

# Build individually
npm run build:backend
npm run build:frontend

# Watch mode for development
cd backend && npm run watch
cd frontend && npm run watch
```

### Testing with Platform

To test HouseRules with the AnteTown platform:

```bash
# 1. Build HouseRules
cd games/houserules-poker
npm run build

# 2. Link to platform and test
cd ../../../AnteTown  # Or wherever platform is located
npm install           # Links file: dependencies
npm run dev           # Start platform

# 3. Access at http://localhost:3001/#game/houserules
```

---

## Game Rules

### Texas Hold'em Basics

1. **Blinds**: Small blind and big blind posted
2. **Pre-flop**: 2 hole cards dealt to each player
3. **Flop**: 3 community cards dealt → betting round
4. **Turn**: 4th community card dealt → betting round
5. **River**: 5th community card dealt → betting round
6. **Showdown**: Best 5-card hand wins

### Hand Rankings (High to Low)

1. Royal Flush
2. Straight Flush
3. Four of a Kind
4. Full House
5. Flush
6. Straight
7. Three of a Kind
8. Two Pair
9. Pair
10. High Card

### Actions

- **Fold** - Give up your hand
- **Check** - Pass action (no bet required)
- **Call** - Match current bet
- **Bet/Raise** - Increase the bet
- **All-in** - Bet all remaining chips

---

## Tech Stack

- **TypeScript** - Type-safe game logic and components
- **React 19** - Frontend UI (peer dependency)
- **@antetown/game-sdk** - Base game framework (GameBase, types)
- **clsx** - Conditional className utility

---

## Documentation

### Architecture
- `docs/architecture-multi-table-rules-engine.md` - Multi-table and rules engine design
- `docs/multi-table-integration.md` - Platform integration patterns

### Variants
- `docs/variants/roguelike-gdd.md` - Roguelike mode game design
- `docs/variants/roguelike-implementation.md` - Roguelike technical implementation
- `docs/variants/implementation-status.md` - Current implementation status

### Roadmap
- `docs/TODO.md` - Planned features and improvements

---

## Contributing

Part of the AnteTown Games monorepo. See [CLAUDE.md](../../CLAUDE.md) for contribution guidelines.

## License

MIT
