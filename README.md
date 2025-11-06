# AnteTown Games

**Monorepo for all AnteTown casino games**

This repository contains all games that integrate with the [AnteTown platform](https://github.com/nhillen/AnteTown).

## Games

- **🎲 Pirate Plunder** - Roll to be Captain or Crew
- **🪙 CK Flipz** - Lightning fast coin and card flips
- **⚔️ War Faire** - Strategic card game across three fairs
- **♠️ HouseRules Poker** - Texas Hold'em with smart tables

## Structure

```
AnteTown-Games/
├── games/
│   ├── pirate-plunder/      # Flagship dice game
│   ├── ck-flipz/            # Simple flip betting
│   ├── war-faire/           # Strategic card game
│   └── houserules-poker/    # Texas Hold'em
├── packages/
│   ├── game-sdk/            # Shared game framework
│   ├── ui-components/       # Shared React components
│   └── core-engine/         # Core game logic utilities
└── tools/                   # Build and dev tools
```

## Development

```bash
# Install all dependencies
npm install

# Build all games
npm run build

# Build specific game
npm run build --workspace games/pirate-plunder

# Clean all builds
npm run clean
```

## Adding a New Game

1. Create directory in `games/your-game/`
2. Add backend and frontend packages
3. Follow the patterns in existing games
4. Update platform to import your game

## Integration with AnteTown Platform

Games are imported by the platform as npm packages:

```typescript
import { initializeGame } from '@antetown/game-pirate-plunder';
import { GameClient } from '@antetown/game-pirate-plunder/client';
```

See individual game READMEs for integration details.

## License

MIT
