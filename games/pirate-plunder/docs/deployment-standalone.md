# PiratePlunder Game Deployment

**⚠️ IMPORTANT: This game is NOT deployed standalone.**

PiratePlunder is a game package designed for the **AnteTown gaming platform**. Deployment is handled at the platform level, not from this repository.

---

## How Deployment Works

1. **Make changes** to this game repository and commit/push to GitHub
2. **AnteTown platform** pulls changes (via `file:` dependency or package registry)
3. **Platform deployment** builds and deploys all integrated games together
4. **Game goes live** at https://antetown.com/#game/pirate-plunder

---

## Deploying Changes to Production

### Quick Process

```bash
# 1. In this repo: Commit and push your changes
git add .
git commit -m "Your changes"
git push

# 2. Switch to AnteTown platform repository
cd ../PiratePlunder-new

# 3. If using file: dependency, pull latest
npm install  # Re-links file: dependencies

# 4. Deploy platform (which includes your game changes)
tailscale ssh deploy@vps-0b87e710.tail751d97.ts.net \
  "cd /opt/AnteTown && git pull origin main && make build && sudo systemctl restart AnteTown"

# 5. Verify deployment
curl -s https://antetown.com/api/deploy-info | jq '{commitHash, buildVersion, timestamp}'
```

### Detailed Instructions

See the **complete deployment guide** in the platform repository:

**📖 [AnteTown Platform DEPLOY.md](https://github.com/drybrushgames/PiratePlunder-new/blob/main/DEPLOY.md)**

That document contains:
- Full step-by-step deployment process
- Troubleshooting guides
- Post-deployment verification steps
- Production environment configuration
- OAuth and database setup

---

## Development Workflow

### Local Development

Test your changes locally using the standalone dev server:

```bash
# In this repo
npm install

# Start backend
(cd backend && npm run dev)

# Start frontend (in new terminal)
(cd frontend && npm run dev)

# Open http://localhost:5173
```

### Integration Testing with Platform

Test with the full AnteTown platform locally:

```bash
# 1. Build your changes
(cd backend && npm run build)
(cd frontend && npm run build)

# 2. Switch to platform repo and start platform
cd ../PiratePlunder-new
npm install
npm run dev

# 3. Open http://localhost:3001/#game/pirate-plunder
```

---

## Production URLs

- **Primary**: https://antetown.com/#game/pirate-plunder
- **Internal (Tailscale)**: http://vps-0b87e710.tail751d97.ts.net:3001/#game/pirate-plunder

---

## Package Publishing (Optional)

If using a private npm registry like Verdaccio:

```bash
# Bump version
npm version patch  # or minor, or major

# Publish to registry
npm publish

# Update platform to use new version
cd ../PiratePlunder-new
npm install @pirate/game-pirate-plunder@latest
```

**Note**: Currently using `file:` dependency for local development, which automatically picks up changes.

---

## Why Can't I Deploy This Repo Directly?

This repository is a **game package**, not a complete application. It requires:

- **Authentication** from AnteTown platform (Google OAuth)
- **Database** from AnteTown platform (PostgreSQL + Prisma)
- **User Management** from AnteTown platform (bankrolls, profiles, sessions)
- **Socket.IO Server** from AnteTown platform (hosts game connections)

The AnteTown platform provides all these services and calls `initializePiratePlunder(io)` to start the game.

For more details, see the [Platform Integration section in README.md](./README.md#-what-is-this).

---

## Questions?

- **Platform deployment**: See [AnteTown DEPLOY.md](https://github.com/drybrushgames/PiratePlunder-new/blob/main/DEPLOY.md)
- **Game development**: See [CLAUDE.md](./CLAUDE.md)
- **Architecture**: See [README.md](./README.md)
