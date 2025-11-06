## Game Plugin Architecture

### Multi-Repo Layout
- **Platform repository (`pirate-platform`, working name)**: Hosts the shared runtime, authentication, matchmaking, deployment tooling, and the plugin loader that knows how to boot any published game manifest.
- **Game repositories (this repo `PiratePlunder`, `WarFaire`, etc.)**: Own the rules, user experience, and bespoke assets for a single title. Every game emits a standardized manifest plus build artifacts the platform can ingest.
- **Shared packages (`@pirate/core-engine`, `@pirate/game-sdk`, `@pirate/game-manifest`)**: Versioned npm packages published from the platform repo. Game repos depend on these to integrate without copying core code.

### Game Repository Responsibilities
- Implement the game server hooks against `@pirate/game-sdk` (`registerGame`, lifecycle handlers, turn resolution, persistence callbacks where needed).
- Build the web client bundle that targets the platform shell (authentication, lobby UI, transport) via the provided SDK.
- Produce a `game-manifest.json` that advertises compatibility (`engineVersion`, `minPlayers`, `maxPlayers`, exposed features) and points at the published artifacts.
- Ship CI that validates the manifest, runs unit/integration tests, and publishes versioned artifacts when tags are pushed.

### Reference Layout
```
PiratePlunder/
  package.json
  src/
    client/           # React/Vite or static client using the platform UI kit
    server/           # Game logic, socket handlers, persistence adapters
    manifest.ts       # Generates the manifest JSON during build
  manifests/
    game-manifest.json
  scripts/
    build.ts
    publish.ts
  dist/
    client/           # Deployed to CDN/S3 bucket
    server/           # Compiled server bundle or container context
    game-manifest.json
```

### Build & Publish Flow
1. `npm run test` – exercises rules, AI, and contract tests against the SDK shim.
2. `npm run build` –
   - Compiles server into `dist/server/index.js` (ESM) plus type declarations.
   - Bundles client into `dist/client/` (Vite/webpack) with asset hashes.
   - Emits `dist/game-manifest.json` using the manifest generator.
3. `npm run package` –
   - Publishes the server bundle as `@pirate/games-pirate-plunder` (or `@pirate/games-warfaire`) to the package registry.
   - Uploads `dist/client` as `pirate-plunder/<version>/client.zip` to the artifact bucket.
   - Writes the manifest to `manifests/pirate-plunder/<version>.json`.
4. CI signs the manifest, creates a Git tag, and attaches artifacts for auditability.

### Runtime Contract (SDK Highlights)
```ts
export interface GameManifest {
  gameId: string;
  displayName: string;
  version: string;
  engineVersion: string;
  minPlayers: number;
  maxPlayers: number;
  client: {
    cdnPath: string;      // Resolved by platform CDN (or local static host)
    entryFile: string;    // e.g., index.html
  };
  server: {
    packageName: string;  // @pirate/games-pirate-plunder
    entryExport: string;  // export that conforms to GamePlugin
  };
  features: Record<string, boolean | string>;
}

export interface GamePlugin {
  registerGame(ctx: GameRuntimeContext): Promise<void> | void;
}
```

The platform repo resolves the manifest, installs the npm package for the server plugin, serves the client bundle through its CDN edge, and boots the game by calling `registerGame` with a runtime context that exposes matchmaking hooks, persistence, analytics, and messaging channels.

### WarFaire Integration Example
WarFaire already exposes an Express + Socket.IO runtime (`server.js`) and static client assets (`public/`). To publish it via the plugin model:

1. **Adopt the SDK**: Install `@pirate/core-engine` and `@pirate/game-sdk` and refactor `server.js` into `src/server/plugin.js` that exports `registerGame(ctx)` instead of starting its own Express server. Translate room management to `ctx.createMatch` and use the shared transport utilities rather than raw socket IDs.
2. **Client build**: Replace the ad-hoc static serving with a bundler (`Vite` or `esbuild`) that outputs into `dist/client`. The existing `/public` assets become the source for that bundle.
3. **Manifest**: Add `src/manifest.ts` that reads package metadata (`name`, `version`) and publishes a manifest similar to:
   ```json
   {
     "gameId": "warfaire",
     "displayName": "WarFaire",
     "version": "0.2.0",
     "engineVersion": ">=1.0.0 <2.0.0",
     "minPlayers": 4,
     "maxPlayers": 10,
     "client": {
       "cdnPath": "warfaire/0.2.0/client.zip",
       "entryFile": "index.html"
     },
     "server": {
       "packageName": "@pirate/games-warfaire",
       "entryExport": "registerGame"
     }
   }
   ```
4. **CI pipeline**: Add GitHub Actions / `test-publish.yml` that runs tests (`node test.js`), builds, and on tag `v*` publishes the npm package plus uploads `dist/client` and `dist/game-manifest.json` to the artifact bucket.
5. **Platform deployment**: Submit a PR to the platform repo that bumps `games/warfaire.version` (or equivalent IaC value) to the new manifest version. Platform CI fetches the manifest, installs `@pirate/games-warfaire@0.2.0`, runs contract tests, and deploys.

### Local Development Workflow
- Run the platform dev server (`npm run dev` in the platform repo) – it watches the `games/` directory for manifests.
- In this repo, run `npm run watch` to rebuild the client and server plugin on change; the platform loader uses `npm link` / workspace symlink to hot-reload the plugin.
- Use the SDK-provided CLI (`npx pirate-games serve pirate-plunder`) to spin up an isolated match without the entire platform when iterating on rules.

### Versioning & Release Coordination
- Game repos follow semver; breaking SDK changes require a major bump in `@pirate/game-sdk` and coordinated releases.
- Dependabot/Renovate keeps game repos current with the SDK. Each upgrade includes contract tests run against the platform’s mocked runtime.
- The platform repo maintains contract tests per game that execute via the published plugin to guard against manifest/API drift before promoting a new version.

### Self-Hosted Artifact Storage (Single OVH Host)
To keep the hobby stack lightweight, host both the package registry and static bundles on the existing OVH machine and expose them over Tailscale:

- **Registry (`registry.tail751d97.ts.net:4873`)**
  - Install Verdaccio under `/opt/pirate-registry` (`npm install -g verdaccio` or container).
  - Configure `config.yaml` to allow the `@pirate/*` scope and require auth (store HTPasswd at `/opt/pirate-registry/htpasswd`).
  - Create a systemd unit (`pirate-registry.service`) that runs `verdaccio --config /opt/pirate-registry/config.yaml`.
  - On each dev machine, add `//registry.tail751d97.ts.net:4873/:_authToken=` to `~/.npmrc` (token lives in Verdaccio) and set `@pirate:registry=http://registry.tail751d97.ts.net:4873/`.

- **Static bundle host (`artifacts.tail751d97.ts.net`)**
  - Serve `/opt/pirate-artifacts` via Nginx (or Caddy). Each game release uploads `client.zip` and `game-manifest.json` under `/opt/pirate-artifacts/<game>/<version>/`.
  - Nginx snippet:
    ```nginx
    server {
      listen 443 ssl;
      server_name artifacts.tail751d97.ts.net;
      root /opt/pirate-artifacts;
      autoindex off;
      location / { try_files $uri =404; }
    }
    ```
  - The manifest `cdnPath` becomes `https://artifacts.tail751d97.ts.net/<game>/<version>/client.zip`.

- **Tailscale configuration**
  - Enable MagicDNS so `registry.tail751d97.ts.net` and `artifacts.tail751d97.ts.net` resolve inside the tailnet.
  - Tag the OVH node (e.g., `tag:infra`) and allow access via ACLs to developer devices.
  - Optional: use `tailscale serve --https=4873 127.0.0.1:4873` if you want Verdaccio proxied without touching Nginx.

Detailed setup steps live in `docs/ovh-artifact-hosting.md`.

When you outgrow the single server, the same manifest layout works with GitHub Packages + a hosted CDN—only the URLs in `game-manifest.json` change.

### Migration Notes for This Repository
- Migrate existing server logic under `games/pirate-plunder/backend/` to the new `src/server` plugin format, removing direct Express bootstrapping.
- Move the current React frontend (under `games/pirate-plunder/frontend/`) into `src/client`, sharing the design system exported by `@pirate/ui-kit` from the platform repo.
- Update `package.json` scripts to the build/publish flow above and remove platform-specific infrastructure files that will live in the platform repo (Terraform, deploy scripts, etc.).
