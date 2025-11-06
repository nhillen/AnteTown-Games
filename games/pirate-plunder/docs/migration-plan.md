# Pirate Platform Migration Plan

Goal: transition this repository into a standalone PiratePlunder game package while extracting shared platform code, SDKs, and deployment tooling into their own artifacts. The migration happens in four controlled phases so you never lose the ability to ship.

---

## Phase 0 – Prep & Inventory (Current State)
- Freeze new feature work briefly and catalog what lives where (frontend, backend, deployment scripts, AI assets, infra helpers).
- Document critical entry points (backend `main.ts`, frontend bootstrap, shared utils).
- Capture current environment variables, secrets, and CI jobs so they can be re-used.
- Stand up Verdaccio + artifact hosting on OVH (see `docs/ovh-artifact-hosting.md`) so the new packages have a home when you start publishing them.

### Exit Criteria
- Inventory complete and shared with team.
- Verdaccio reachable at `registry.tail751d97.ts.net` and artifacts host at `artifacts.tail751d97.ts.net`.

---

## Phase 1 – In-Repo Separation (Monorepo Layout)
Restructure **within this repo** to mimic the final separation while you still have a single Git history.

```
.
├── games/
│   └── pirate-plunder/        # copy of current frontend + backend
├── packages/
│   ├── core-engine/           # shared runtime code extracted from backend
│   ├── game-sdk/              # SDK surfaces consumed by games
│   └── platform-manifest/     # manifest schema + helpers
├── platform/                  # front and backend shell that hosts games
├── docs/
└── package.json               # configured as npm workspace root
```

- Move existing code into the new directories (`git mv`).
- Convert the repo to npm/pnpm workspaces (`package.json` at root references `packages/*` and `games/*`).
- Update import paths so PiratePlunder consumes `@pirate/core-engine` via workspaces instead of relative imports.
- Keep deployment scripts temporarily under `platform/` but wired to the old paths so production remains unchanged.

### Exit Criteria
- `npm install && npm run test` succeeds across the workspace.
- PiratePlunder still builds and deploys using the legacy scripts.
- Core APIs start living under `packages/` with unit tests.

---

## Phase 2 – Package Hardening & Registry Publish
- Finish extracting reusable logic into `packages/` and remove duplicate code from `games/pirate-plunder`.
- Add `npm run package` scripts to publish `@pirate/core-engine`, `@pirate/game-sdk`, and `@pirate/games-pirate-plunder` to Verdaccio.
- Create CI workflow that runs on tags and pushes packages + uploads manifests/client bundles to `/opt/pirate-artifacts` via Tailscale SSH.
- Platform runtime inside this repo switches to consuming the published packages (even though they are hosted on the same machine) to prove the pipeline works.

### Exit Criteria
- Tagged release publishes all packages to Verdaccio and artifacts to the OVH host.
- Platform can be rebuilt from scratch using only published artifacts plus the repo source.

---

## Phase 3 – Spin Out Platform Repository
Once packages are stable and the platform only depends on published artifacts:

1. Create a new repo (`pirate-platform`). Use the contents of the `platform/` directory as the seed.
2. Migrate deployment scripts, systemd unit, and CI workflows to the new repo.
3. Set the platform repo to depend on the Verdaccio packages and artifact URLs.
4. Update production deployment so the OVH unit pulls from `/opt/pirate-platform` instead of this repo.

During this phase you will temporarily update both repos when fixing core issues. Prioritize finishing Phase 3 quickly.

### Exit Criteria
- Production server deploys from `pirate-platform` main branch.
- This repo’s `platform/` directory is deleted; the root now only contains `games/pirate-plunder` plus required workspace metadata.

---

## Phase 4 – Finalize Game Repo
- Rename this repository if desired (e.g., `pirate-game-pirate-plunder`).
- Remove legacy deploy scripts and CI jobs that target production servers.
- Keep only game-specific build/test/publish workflows.
- Document the release checklist for this game (points to Verdaccio + artifacts path).

### Exit Criteria
- Repo contains only PiratePlunder game code and its tests.
- CI publishes game artifacts on tagged releases.
- README/DEPLOY docs reference platform repo for promotion/deployment.

---

## When to Create the New GitHub Repo
- **After Phase 2** (packages publish cleanly and the platform runtime can consume them). At this point cloning `platform/` into a new repo is low risk.
- If you create the new repo earlier, you will duplicate unfinished code and increase maintenance overhead.
- Use `git filter-repo` (or `git subtree split`) to preserve history for the `platform/` directory when seeding `pirate-platform`.

---

## Checklist Summary
- [ ] Inventory current code + stand up Verdaccio/artifacts (Phase 0).
- [ ] Restructure into workspace layout inside this repo (Phase 1).
- [ ] Publish packages/bundles to OVH-hosted registry + artifacts (Phase 2).
- [ ] Clone `platform/` into new GitHub repo and point production to it (Phase 3).
- [ ] Clean game repo to contain only PiratePlunder assets and workflows (Phase 4).

Following these phases keeps production deployable while you peel core functionality into a reusable platform and eventually run each game from its own repository.
