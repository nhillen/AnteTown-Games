# AnteTown-Games Deployment Guide

This guide covers deploying game packages from the AnteTown-Games monorepo to production.

## Overview

**Important**: AnteTown-Games is NOT deployed as a standalone service. Game packages are integrated into the AnteTown Platform backend as npm dependencies.

The AnteTown-Games repository contains:
- Individual game packages (`games/*/`)
- Shared game SDK (`packages/game-sdk/`)

Production server location: `/opt/AnteTown-Games/`

## Deployment Process

### When to Deploy

Deploy AnteTown-Games changes when you:
- Add new games or game features
- Update game logic or rules
- Modify game configuration schemas
- Update the shared game-sdk

**After deploying AnteTown-Games, you MUST rebuild the AnteTown Platform backend** to pick up the changes.

### Manual Deployment (Current Method)

#### 1. Commit and Push Changes Locally

```bash
cd /home/nathan/GitHub/AnteTown-Games
git add .
git commit -m "your commit message"
git push
```

#### 2. Create Deployment Tarball

For full game package updates:
```bash
cd /home/nathan/GitHub/AnteTown-Games
tar czf /tmp/game-update.tar.gz games/GAME_NAME/
```

For SDK updates:
```bash
tar czf /tmp/sdk-update.tar.gz packages/game-sdk/
```

For config-only updates (e.g., poker config files):
```bash
tar czf /tmp/config-update.tar.gz games/houserules-poker/backend/src/config/
```

#### 3. Deploy to Production

```bash
# Transfer and extract files
cat /tmp/game-update.tar.gz | tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cat > /tmp/game-update.tar.gz && cd /opt/AnteTown-Games && tar xzf /tmp/game-update.tar.gz"
```

#### 4. Rebuild Game Package(s) on Production

For SDK changes (MUST rebuild SDK first, then dependent games):
```bash
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/AnteTown-Games/packages/game-sdk && npm run build"
```

For game package changes:
```bash
# Example: Rebuild poker backend
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/AnteTown-Games/games/houserules-poker/backend && npm run build"
```

#### 5. Rebuild AnteTown Platform

**CRITICAL**: After updating any game package, you MUST rebuild the platform backend:

```bash
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/AnteTown && make build"
```

This recompiles the platform backend and pulls in the updated game packages.

#### 6. Restart AnteTown Service

```bash
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "sudo systemctl restart AnteTown"
```

#### 7. Verify Deployment

```bash
# Check service status
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "sudo systemctl status AnteTown"

# Check health endpoint
curl -s http://vps-0b87e710.tail751d97.ts.net:3001/api/health | jq

# View recent logs
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "sudo journalctl -u AnteTown --since '1 minute ago' --no-pager"
```

## Complete Example: Deploying Poker Config Changes

```bash
# 1. Commit locally
cd /home/nathan/GitHub/AnteTown-Games
git add games/houserules-poker/backend/src/config/
git commit -m "fix: Update poker config validation"
git push

# 2. Create tarball
tar czf /tmp/poker-config.tar.gz games/houserules-poker/backend/src/config/

# 3. Deploy to production
cat /tmp/poker-config.tar.gz | tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cat > /tmp/poker-config.tar.gz && cd /opt/AnteTown-Games && tar xzf /tmp/poker-config.tar.gz"

# 4. Rebuild poker backend
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/AnteTown-Games/games/houserules-poker/backend && npm run build"

# 5. Rebuild platform
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "cd /opt/AnteTown && make build"

# 6. Restart service
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net "sudo systemctl restart AnteTown"

# 7. Verify
curl -s http://vps-0b87e710.tail751d97.ts.net:3001/api/health | jq
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

- Production `/opt/AnteTown-Games/` is NOT a git repository
- Changes must be manually synced via tarball deployment
- Always rebuild platform after updating game packages
- Always verify deployment with health check and logs
- Coordinate with platform deployments when adding/updating games
