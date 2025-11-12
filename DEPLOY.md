# AnteTown-Games Deployment Guide

This guide covers deploying game packages from the AnteTown-Games monorepo to production.

## Overview

**Important**: AnteTown-Games is NOT deployed as a standalone service. Games are integrated into the AnteTown Platform via `file:` symlinks.

The AnteTown-Games repository contains:
- Individual game packages (`games/*/`)
- Shared game SDK (`packages/game-sdk/`)

**Production Setup:**
- Games repo: `/opt/AnteTown-Games/` (git clone of this repo)
- Platform repo: `/opt/AnteTown/`
- Platform references games via symlinks in `node_modules/@pirate/`

## Deployment Process

### When to Deploy

Deploy AnteTown-Games changes when you:
- Add new games or game features
- Update game logic or rules
- Modify game configuration schemas
- Update the shared game-sdk

**After deploying AnteTown-Games, you MUST rebuild games AND the AnteTown Platform** to pick up the changes.

### Deployment Steps (Current Method)

#### 1. Commit and Push Changes Locally

```bash
cd /Users/nathan/Documents/GitHub/AnteTown-Games
git add .
git commit -m "your commit message"
git push origin main
```

#### 2. Pull Changes on Production

```bash
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/AnteTown-Games && git pull origin main"
```

#### 3. Rebuild Changed Game Packages

**Build order matters!** Always build in this order:

```bash
# 1. Build game-sdk (if changed)
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/AnteTown-Games/packages/game-sdk && npm run build"

# 2. Build game backends (if changed)
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/AnteTown-Games/games/GAME_NAME/backend && npm install && npm run build"

# 3. Build game frontends (if changed)
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/AnteTown-Games/games/GAME_NAME/frontend && npm install && npm run build"

# Example for CK Flipz:
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/AnteTown-Games/games/ck-flipz/backend && npm install && npm run build"
```

**Note**: Some games (like Pirate Plunder) need `ai-profiles.json` copied to dist after building:
```bash
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cp /opt/AnteTown-Games/games/pirate-plunder/backend/src/ai-profiles.json /opt/AnteTown-Games/games/pirate-plunder/backend/dist/"
```

#### 4. Rebuild Platform Frontend (if needed)

If you changed platform frontend code in `/opt/AnteTown`:

```bash
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/AnteTown && git pull origin main"
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/AnteTown/platform/frontend && npx vite build && cp -r dist/* ../backend/dist/public/"
```

#### 5. Restart AnteTown Service

```bash
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "sudo systemctl restart AnteTown"
```

#### 6. Verify Deployment

```bash
# Check service status
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "systemctl status AnteTown --no-pager"

# View recent logs
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "tail -50 /opt/AnteTown/logs/output.log"

# Check for errors
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "tail -50 /opt/AnteTown/logs/error.log"
```

## Complete Example: Deploying Poker Config Changes

```bash
# 1. Commit and push locally
cd /Users/nathan/Documents/GitHub/AnteTown-Games
git add games/houserules-poker/backend/src/config/
git commit -m "fix: Update poker config validation"
git push origin main

# 2. Pull changes on production
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/AnteTown-Games && git pull origin main"

# 3. Rebuild poker backend
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/AnteTown-Games/games/houserules-poker/backend && npm run build"

# 4. Rebuild platform (if needed)
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/AnteTown && make build"

# 5. Restart service
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "sudo systemctl restart AnteTown"

# 6. Verify deployment
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "systemctl status AnteTown --no-pager"
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "tail -50 /opt/AnteTown/logs/output.log"
```

## Dependency Build Order

When updating multiple packages, build in this order:

1. **game-sdk** (if changed) - shared package used by all games
2. **Game packages** (poker, ck-flipz, etc.) - depend on game-sdk
3. **AnteTown Platform backend** - depends on all game packages

Example for SDK + poker update:
```bash
# 1. Rebuild SDK
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/AnteTown-Games/packages/game-sdk && npm run build"

# 2. Rebuild poker (which uses SDK)
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/AnteTown-Games/games/houserules-poker/backend && npm run build"

# 3. Rebuild platform (which uses poker)
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/AnteTown && make build"

# 4. Restart
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "sudo systemctl restart AnteTown"
```

## Troubleshooting

### Game Tables Not Loading

**Symptom**: "Table X not found" errors in logs or client

**Common Causes**:
1. Game package built but platform not rebuilt
2. Validation errors in game configs
3. Missing dependencies

**Fix**:
```bash
# Check if game package builds successfully
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/AnteTown-Games/games/GAME_NAME/backend && npm run build"

# Rebuild platform to pick up changes
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/AnteTown && make build"

# Check logs for specific errors
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "sudo journalctl -u AnteTown -f"
```

### TypeScript Build Errors

**Symptom**: Build fails with type errors

**Common Causes**:
1. Outdated game-sdk
2. Mismatched type definitions
3. Missing npm dependencies

**Fix**:
```bash
# Install dependencies
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/AnteTown-Games && npm install"

# Rebuild SDK first
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/AnteTown-Games/packages/game-sdk && npm run build"

# Then rebuild game package
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/AnteTown-Games/games/GAME_NAME/backend && npm run build"
```

### Platform Service Won't Start

**Symptom**: `systemctl status AnteTown` shows failed state

**Debug Steps**:
```bash
# Stop service
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "sudo systemctl stop AnteTown"

# Run manually to see error
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/AnteTown/platform/backend && NODE_ENV=production node dist/server.js"

# Common issues:
# - Port 3001 already in use: Kill process first
# - Module not found: Rebuild platform
# - Validation errors: Check game configs in database
```

## Production Environment

- **Server**: vps-0b87e710.tail751d97.ts.net (Tailscale SSH)
- **Platform Location**: `/opt/AnteTown/`
- **Games Location**: `/opt/AnteTown-Games/`
- **Service Name**: `AnteTown` (systemd)
- **Port**: 3001
- **Database**: PostgreSQL (PiratePlunder database, legacy name)

## Adding a New Game

When adding a new game to the platform:

1. **Develop game package** in `games/NEW_GAME/`
2. **Add to platform dependencies** in `AnteTown-Platform/platform/backend/package.json`
3. **Initialize in server** in `AnteTown-Platform/platform/backend/src/server.ts`
4. **Deploy game package** following steps above
5. **Pull latest platform code** with new game integration
6. **Rebuild and restart** platform

See `AnteTown-Platform/CLAUDE.md` for detailed game integration instructions.

## Notes

- Production `/opt/AnteTown-Games/` IS a git repository (cloned from this repo)
- Changes are deployed via `git pull origin main` on production server
- Platform references games via `file:` symlinks in `node_modules/@pirate/`
- Always rebuild affected game packages after pulling changes
- Always rebuild platform after updating game packages (platform depends on built game files)
- Always verify deployment with health check and logs
- Coordinate with platform deployments when adding/updating games
