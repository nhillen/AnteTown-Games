# WarFaire

**A strategic card game for the AnteTown gaming platform**

A strategic card game about showcasing produce and baked goods across a series of State Fairs.

---

## 🎮 Platform Integration

**WarFaire integrates with the [AnteTown platform](https://github.com/drybrushgames/PiratePlunder-new)** for production deployment.

- **Standalone mode**: Run locally with `npm run server` for development
- **Platform mode**: Deployed as `@pirate/game-warfaire` package on AnteTown
- **Production URL**: https://antetown.com/#game/warfaire (when integrated)

For integration instructions, see [INTEGRATION.md](./INTEGRATION.md)

---

## About

State Fair (working title) is a card game where players compete to win ribbons in multiple categories that belong to groups. Players must balance short-term wins with long-term strategy, as categories rise and fall in prestige between Fairs.

See [GDD.md](./GDD.md) for the complete Game Design Document.

## Quick Start

### Prerequisites

- Node.js (v14 or higher)

### Installation

```bash
npm install
```

### Running the Game

**Web Multiplayer Mode (Recommended):**

```bash
npm run server
```

Then open http://localhost:3000 in your browser. Share the game ID with other players to join the same game.

**Command Line Test Mode:**

Run a test game with 2 Fairs (default):

```bash
npm start
```

Run a game with a custom number of Fairs:

```bash
node index.js 3
```

**Run Tests:**

```bash
npm test
```

## Project Structure

### Core Game Logic
- `GDD.md` - Complete Game Design Document
- `index.js` - CLI game runner for testing
- `game.js` - Main game logic and Fair management
- `card.js` - Card, Category, and Group definitions
- `player.js` - Player class and state management
- `scorer.js` - Scoring and ribbon award logic
- `test.js` - Comprehensive test suite

### Web Application
- `server.js` - Express + Socket.IO multiplayer server
- `public/index.html` - Web game interface
- `public/style.css` - Game styling
- `public/game.js` - Client-side game logic and Socket.IO integration

### Configuration
- `package.json` - Node.js package configuration
- `CLAUDE.md` - Development guidance for Claude Code

## Game Components

- **12 Categories** across 3 Groups (Produce, Baking, Livestock)
- **13 Value Cards** per category (2,2,2,2,3,3,3,3,4,4,5,5,6)
- **Group Cards** - Wild cards that can be played in any category within their group
- **Ribbons** - Gold (2 VP), Silver (1 VP), Bronze (0 VP) - values increase with category prestige
- **Progressive Prestige** - Popular categories become more valuable over time

## Current Implementation Status

**Fully Implemented:**

- ✅ Card system with categories and groups
- ✅ Player management (4-10 players)
- ✅ Round structure (3 rounds per Fair)
- ✅ Face-down card system (forward planning)
- ✅ Scoring system with ribbons
- ✅ Progressive category prestige
- ✅ Category rotation (for < 10 players)
- ✅ Group scoring
- ✅ Interactive web UI with real-time updates
- ✅ Multiplayer networking via Socket.IO
- ✅ Interactive player decisions and card selection
- ✅ Comprehensive test suite (58 tests)

**Not Yet Implemented:**

- Advanced variants from GDD (static prestige, hand carryover, etc.)
- Save/load game state
- Game replays
- Player statistics and history
- Mobile-optimized UI

## How to Play

1. Start the server with `npm run server`
2. Open http://localhost:3000 in your browser
3. Enter your name and a game ID (or create a new one)
4. Share the game ID with 3-9 other players
5. Once at least 4 players have joined, any player can start the game
6. Each round:
   - Select one card to play face-up (scores this Fair)
   - Select one card to play face-down (auto-plays next Fair)
   - If you select a Group Card, choose which category to assign it to
   - Submit your cards and wait for other players
7. After 3 rounds, the Fair ends and scores are tallied
8. Top 3 most-played categories gain +1 prestige
9. Play continues for 3 Fairs total

## Development

The CLI prototype (`index.js`) uses random card selection for automated testing. The web version (`server.js` + `public/`) implements full interactive gameplay.

## License

MIT
