# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WarFaire (working title: "State Fair") is a strategic card game built in Node.js for the AnteTown gaming platform. Players compete to win ribbons across multiple categories (Carrots, Pies, Pumpkins, etc.) that belong to groups (Produce, Baking, Livestock). The game features a unique progressive prestige system where popular categories become more valuable over time, and players must balance short-term wins with long-term strategy by playing cards face-down for future rounds.

**Status**: ✅ Fully functional with multiplayer support via Socket.IO and interactive web UI. Can run standalone for development or integrate with AnteTown platform for production.

## Development Commands

```bash
# Run a test game with 2 Fairs (default)
npm start

# Run a game with custom number of Fairs
node index.js 3

# No build, lint, or test commands configured yet
```

## Core Architecture

### Game Flow
The game operates in a hierarchical structure: **Game → Fairs → Rounds → Player Actions**

1. **Game** (`game.js`): Orchestrates the entire multi-Fair game
   - Manages active/inactive categories (rotates categories when < 10 players)
   - Handles deck creation and shuffling
   - Tracks category prestige progression across Fairs
   - Coordinates Fair and Round execution

2. **Fair**: A complete competition season consisting of 3 rounds
   - Categories gain prestige based on popularity
   - At Fair end, lowest-ranked category may be retired and replaced
   - Players accumulate ribbons and Victory Points

3. **Round** (`game.js:playRound`): One turn of gameplay
   - Players flip their face-down cards from the previous round
   - Draw 3 new cards
   - Play 1 card face-up (scores this Fair)
   - Play 1 card face-down (auto-plays at start of next Fair's corresponding round)

### Key Components

**Card System** (`card.js`):
- **Category Cards**: 13 cards per category with values [2,2,2,2,3,3,3,3,4,4,5,5,6]
- **Group Cards**: 8 wild cards per group [2,2,3,3,4,4,5,5] that can be played in any category within their group
- **Card.getEffectiveCategory()**: Returns the selected category for group cards, or the card's category otherwise
- 12 total categories across 3 groups (Produce, Baking, Livestock)

**Player State** (`player.js`):
- `hand`: Cards currently held (drawn but not played)
- `faceDownCards`: Cards queued to auto-play in future rounds
- `playedCards`: Cards played face-up this Fair (used for scoring)
- `ribbons`: Historical record of all ribbons earned with VP values
- `totalVP`: Cumulative Victory Points across all Fairs

**Scoring System** (`scorer.js`):
- **Category Scoring**: Top 3 players in each category earn ribbons (Gold/Silver/Bronze)
- **Ribbon Values**: Base values are Gold=2VP, Silver=1VP, Bronze=0VP, PLUS category prestige
- **Ties**: Multiple players can receive the same ribbon; skip lower ribbons accordingly
- **Group Winners**: Player with most VP from categories in a group wins that group
- **Prestige Progression**: Top 3 most-played categories gain +1 prestige after each Fair

### Game State Management

**Between Fairs** (`game.js:prepareNextFair`):
- Players keep: face-down cards (carry forward), ribbons (permanent), totalVP (cumulative)
- Players discard: hand, played cards
- Category rotation: If < 10 players, retire lowest-ranked category and introduce a new one
- Deck recreation: Build new deck from active categories (face-down cards not included in deck)
- Prestige persistence: Category prestige values carry forward and accumulate

### Current Implementation Status

**Fully implemented**:
- ✅ Interactive player decisions via web UI
- ✅ Multiplayer networking via Socket.IO
- ✅ Real-time game state updates
- ✅ Player card selection and submission
- ✅ Group card category assignment
- ✅ Comprehensive test suite (58 tests)

**Development modes**:
- **CLI mode** (`npm start`): Uses random AI for automated testing
- **Web mode** (`npm run server`): Full interactive multiplayer gameplay

**Not yet implemented**:
- Advanced variants from GDD.md (static prestige, hand carryover, etc.)
- Proper validation for invalid face-down cards when categories are retired
- Save/load game state
- Mobile-optimized UI

## Important Game Rules

1. **Face-down card timing**: Cards played face-down in Round N of Fair X auto-play at the start of Round N of Fair X+1
2. **Active categories**: Number of active categories = number of players + 1
3. **Group cards**: Must be assigned to a specific category within their group when played
4. **Category retirement**: Only happens when < 10 players AND inactive categories remain
5. **Deck composition**: Includes all active category cards PLUS all 3 groups' wild cards (24 group cards total)

## Code Conventions

- ES6 modules (`type: "module"` in package.json)
- Classes use PascalCase (Game, Player, Card)
- Methods use camelCase
- Constants use SCREAMING_SNAKE_CASE (CATEGORIES, GROUPS, RIBBON_TYPES)
- Game logging uses `game.log()` which both stores and displays messages
