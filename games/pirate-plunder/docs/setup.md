# Development Environment Setup

This guide walks you through setting up the Pirate Plunder development environment from scratch.

## Prerequisites

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher
- **Git**: For cloning the repository
- **Operating System**: macOS, Linux, or Windows

### Verify Prerequisites
```bash
node --version  # Should show v18.0.0 or higher
npm --version   # Should show 8.0.0 or higher
```

## Installation Steps

### 1. Clone the Repository
```bash
git clone <repository-url>
cd PiratePlunder
```

### 2. Install Dependencies

Run the following commands in order from the project root:

```bash
# Install all workspace dependencies
npm install
```

### 2a. Configure npm for the Private Registry (once per machine)

The shared packages live on the OVH Verdaccio registry. Copy `.npmrc.example` to your home directory and log in:

```bash
cp .npmrc.example ~/.npmrc   # or append to an existing ~/.npmrc
npm login --scope=@pirate --registry http://registry.tail751d97.ts.net:4873/
```

This ensures `npm install` can resolve `@pirate/*` packages once they are published in Phase 2.

**Alternative: One-liner installation**
```bash
npm install && npm install --prefix backend && npm install --prefix frontend
```

### 3. Environment Configuration (Optional)

The default configuration works out of the box. If you need to customize:

#### Frontend Environment Variables
Create `games/pirate-plunder/frontend/.env.local`:
```env
VITE_BACKEND_URL=http://localhost:3001
```

## Starting the Development Environment

### Option 1: Start Both Servers (Recommended)
```bash
# From project root
npm run dev        # macOS/Linux
npm run dev:win    # Windows
```

This starts:
- Backend server on http://localhost:3001
- Frontend dev server on http://localhost:5173

### Option 2: Start Servers Individually
```bash
# Terminal 1 - Backend
npm run dev --workspace @pirate/game-pirate-plunder-backend

# Terminal 2 - Frontend  
npm run dev --workspace @pirate/game-pirate-plunder-frontend
```

## Verifying Your Setup

1. **Backend Health Check**: Navigate to http://localhost:3001/health
   - Should return: `{"status":"ok"}`

2. **Frontend**: Navigate to http://localhost:5173
   - Should show the Pirate Plunder game interface

3. **Debug Dashboard**: Open `debug-client.html` in your browser
   - Shows real-time game state monitoring

## Common Issues & Solutions

### Port Already in Use
If you see "Error: listen EADDRINUSE :::3001" or similar:

```bash
# Kill processes on default ports
npm run kill-ports

# Or manually kill specific ports
npx kill-port 3001 5173
```

### Node Version Issues
If you encounter module compatibility errors:
1. Ensure Node.js is version 18+
2. Clear node_modules and reinstall:
```bash
rm -rf node_modules games/pirate-plunder/backend/node_modules games/pirate-plunder/frontend/node_modules
npm install
```

### TypeScript Compilation Errors
Always verify TypeScript compilation before running:
```bash
# Check backend
npm exec --workspace @pirate/game-pirate-plunder-backend tsc -- --noEmit

# Check frontend
npm exec --workspace @pirate/game-pirate-plunder-frontend tsc -- --noEmit
```

### Windows-Specific Issues
- Use `npm run dev:win` instead of `npm run dev`
- Run terminals as Administrator if permission errors occur
- Use PowerShell or Git Bash instead of Command Prompt

## Next Steps

Once your environment is running:

1. **Run Tests**: Verify everything works
   ```bash
   npm run test:all
   ```

2. **Read Documentation**:
   - [Game Design Document](./gdd.md) - Game rules and mechanics
   - [Architecture Overview](./architecture.md) - Technical structure
   - [CLAUDE.md](../CLAUDE.md) - Development guidelines

3. **Start Development**:
   - Frontend code: `games/pirate-plunder/frontend/src/`
   - Backend code: `games/pirate-plunder/backend/src/`
   - Run tests frequently: `npm run test:backend` or `npm run test:frontend`

## Development Commands Reference

```bash
# Development
npm run dev              # Start both servers (Mac/Linux)
npm run dev:win          # Start both servers (Windows)
npm run kill-ports       # Kill processes on ports 3001 and 5173

# Testing
npm run test:all         # Run complete test suite
npm run test:backend     # Backend unit tests only
npm run test:frontend    # Frontend unit tests only
npm run test:integration # Integration tests

# Building
npm run build:frontend        # Production frontend build
npm run build:backend         # Compile TypeScript to JavaScript

# Linting & Validation
npm run lint --workspace @pirate/game-pirate-plunder-frontend
npm exec --workspace @pirate/game-pirate-plunder-backend tsc -- --noEmit
npm exec --workspace @pirate/game-pirate-plunder-frontend tsc -- --noEmit
```

## Support

- Check existing issues in the repository
- Review debug output in `debug-client.html`
- Ensure all dependencies are properly installed
- Verify Node.js and npm versions meet requirements
