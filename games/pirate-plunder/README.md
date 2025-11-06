# Pirate Plunder 🎲⚓

**A game package for the AnteTown gaming platform**

A real-time multiplayer dice poker game featuring sophisticated AI opponents and strategic role-based gameplay.

---

## 🎮 What is This?

**PiratePlunder** is a game package designed to be integrated with the [AnteTown platform](https://github.com/drybrushgames/PiratePlunder-new). It exports both backend game logic and frontend React components that the platform uses to host the game.

### Platform Integration

- **Frontend**: Exports `PiratePlunderClient` React component
- **Backend**: Exports `initializePiratePlunder(io)` function to initialize game on platform's Socket.IO server
- **Production**: Deployed as part of AnteTown platform at https://antetown.com/#game/pirate-plunder
- **Dependencies**: Requires AnteTown platform backend for auth, database, and Socket.IO hosting

**For deployment and production information**, see the [AnteTown platform repository](https://github.com/drybrushgames/PiratePlunder-new).

---

## 🚀 Quick Start

### Requirements
- Node.js 18+
- npm

### Standalone Development Server

**For testing game logic changes without the full platform:**

```bash
# Install dependencies
npm install

# Start backend (port 3001)
(cd backend && npm run dev)

# Start frontend in new terminal (port 5173)
(cd frontend && npm run dev)
```

Open http://localhost:5173 to play the game locally.

**Note**: The standalone dev server is for testing only. Production deployment uses the AnteTown platform.

### Testing with AnteTown Platform

**To test this game integrated with the full platform:**

```bash
# 1. Make changes in this repo and build
(cd backend && npm run build)
(cd frontend && npm run build)

# 2. Switch to AnteTown platform repo
cd ../PiratePlunder-new

# 3. Install (links this package via file: dependency)
npm install

# 4. Start platform
npm run dev

# 5. Open http://localhost:3001/#game/pirate-plunder
```

---

## 📦 Package Exports

This package exports the following for consumption by the AnteTown platform:

### Backend (`@pirate/game-pirate-plunder`)
```typescript
import { initializePiratePlunder, GAME_METADATA } from '@pirate/game-pirate-plunder';

// Initialize game on Socket.IO server
const gameInstance = initializePiratePlunder(io, {
  namespace: '/',
  enableDebugRoutes: false
});
```

### Frontend (`@pirate/game-pirate-plunder/client`)
```typescript
import { PiratePlunderClient } from '@pirate/game-pirate-plunder/client';

// Render game component
<PiratePlunderClient />
```

---

## 🎯 Game Overview

**Pirate Plunder** is a dice-based card game where players compete for ship roles (Ship, Captain, Crew) using five dice across three rounds. The twist: roles are awarded to whoever has the **most** of each die value (6s for Ship, 5s for Captain, 4s for Crew), with unique role vacancy rules and a cargo system that can dramatically alter payouts.

### Key Features
- 🎯 **Role-Based Strategy**: Win by having the most 6s (Ship), 5s (Captain), or 4s (Crew)
- 💰 **Dynamic Payouts**: Ship gets 50%, Captain 30%, Crew 20% with vacancy redistribution rules
- 📦 **Cargo Twist**: Non-role players use 1s/2s/3s to trigger special payout effects
- 🎭 **Public/Private Dice**: Lock more dice than shown to opponents for strategic advantage
- 🤖 **4 AI Personalities**: From aggressive Reckless Roger to conservative Careful Kate
- ⚡ **Real-time Multiplayer**: Socket.io-powered game state synchronization
- 🎨 **Enhanced UX**: Animated showdown ceremony, visual dice indicators, responsive design

### Game Flow

1. **Lobby Phase**: 2-8 players, auto-fill with AI to 4 minimum
2. **3 Rounds of Play**: Roll → Lock → Bet (with final Roll4 after Lock3)
3. **Role Assignment**: Most dice wins each role (ties = vacant roles)
4. **Cargo Effects**: Non-role players use 1s/2s/3s for special effects
5. **Payout**: Distribute pot based on roles and cargo modifications
6. **Showdown Ceremony**: Animated results with sequential role reveals

---

## 🤖 AI System

The game features four distinct AI personalities with sophisticated decision-making:

### AI Profiles (`backend/src/ai-profiles.json`)
- **🔥 Reckless Roger**: Aggressive risk-taker (85% risk tolerance, 25% bluff rate)
- **🧠 Calculating Clara**: Tight-aggressive strategist (65% risk, 10% bluff)
- **🍀 Lucky Luke**: Loose-passive player (90% risk, 5% bluff, 15% mistakes)
- **🛡️ Careful Kate**: Conservative player (40% risk, 2% bluff)

### AI Intelligence Features
- **Hand Strength Evaluation**: 0-6 scale considering role potential and game phase
- **Role Priority Systems**: Each AI targets different role combinations
- **Behavioral Variance**: ±10% randomization prevents robotic play patterns
- **Strategic Bluffing**: Profile-based bluff frequencies with mistake simulation
- **Advanced Dice Locking**: Targets highest-priority achievable roles

---

## 🧪 Testing & Development

### Testing Commands
```bash
# TypeScript compilation (run before committing)
(cd backend && npx tsc --noEmit)
(cd frontend && npx tsc --noEmit)

# Unit tests
(cd backend && npm run test)        # Backend unit tests (Jest)
(cd frontend && npm run test)       # Frontend component tests (Vitest)

# Integration tests
(cd backend && npm run test:integration)  # Automated game flow testing
```

### Debug Tools
- **Debug Dashboard**: Open `debug-client.html` for real-time game state monitoring
- **Integration Testing**: `backend/scripts/test-game-flow.js` simulates full games

### Build Commands
```bash
# Build backend
(cd backend && npm run build)   # Compiles TypeScript to dist/

# Build frontend
(cd frontend && npm run build)  # Builds library with type declarations
```

---

## 🛠️ Technical Stack

- **Backend**: Express.js + Socket.io + TypeScript
- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **Real-time**: Socket.io for game state synchronization
- **Testing**: Jest (backend) + Vitest (frontend)
- **Build**: Vite library mode with TypeScript declarations

### Platform Dependencies

This game requires the AnteTown platform backend for:
- **Authentication**: Google OAuth and session management
- **User Management**: User accounts and bankrolls
- **Database**: PostgreSQL with Prisma ORM
- **Socket.IO Hosting**: Platform creates server and calls `initializePiratePlunder(io)`

---

## 📚 Documentation

- **📋 [CLAUDE.md](./CLAUDE.md)**: Development guidance and testing workflows
- **🏗️ [Architecture](./docs/architecture.md)**: Technical system overview
- **🎮 [Game Design](./docs/gdd.md)**: Complete game rules and mechanics
- **🔄 [State Machine](./docs/state_machine_diagram.md)**: Game phase flow diagrams
- **🚀 [Platform Deployment](https://github.com/drybrushgames/PiratePlunder-new/blob/main/DEPLOY.md)**: How to deploy via AnteTown platform

---

## 🏗️ Repository Structure

```
@pirate/game-pirate-plunder/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Package exports (initializePiratePlunder, GAME_METADATA)
│   │   ├── server.ts             # Standalone dev server (dev only)
│   │   ├── game-logic/           # Core game implementation
│   │   └── ai-profiles.json      # AI personality configurations
│   ├── tests/                    # Unit tests
│   ├── scripts/                  # Integration test scripts
│   └── dist/                     # Compiled output
│
├── frontend/
│   ├── src/
│   │   ├── index.ts              # Package exports (PiratePlunderClient, BackOffice)
│   │   ├── components/           # React components
│   │   └── utils/                # Dice rendering, game rules
│   └── dist/                     # Library build output
│
├── docs/                         # Game design and architecture docs
├── debug-client.html             # Real-time debugging dashboard
└── package.json                  # Package metadata
```

---

## 🎪 Recent Improvements

### v2.0 Features
- ✅ **Enhanced AI System**: 4 distinct personality profiles with strategic decision making
- ✅ **Roll4 Phase**: Proper Lock → Roll → Bet flow for final round
- ✅ **Public/Private Dice**: Strategic dice visibility system with visual indicators
- ✅ **Showdown Ceremony**: Extended animated results with sequential role reveals
- ✅ **UI Improvements**: Better positioning, visual feedback, and responsive design
- ✅ **Game Logic Fixes**: Correct "most dice wins" role assignment with vacancy rules

### Architecture Highlights
- 🔄 **Real-time State Sync**: Instant game state updates across all clients
- 🎭 **Personality-Driven AI**: Each AI has unique risk tolerance, bluff patterns, and role priorities
- 🎯 **Strategic Depth**: Public/private dice mechanics add bluffing and information warfare
- 🎨 **Polished UX**: Smooth animations, clear visual feedback, and intuitive controls
- 📦 **Package Architecture**: Clean separation of backend/frontend, exportable as library

---

## 🚀 Deployment

**This game is deployed as part of the AnteTown platform**, not standalone.

**Production URL**: https://antetown.com/#game/pirate-plunder

For deployment instructions, see: [AnteTown Platform DEPLOY.md](https://github.com/drybrushgames/PiratePlunder-new/blob/main/DEPLOY.md)

---

**Ready to sail the high seas and plunder some treasure? Start your engines with `npm run dev`! ⚓🎲**

## 📄 License

Proprietary - All Rights Reserved
