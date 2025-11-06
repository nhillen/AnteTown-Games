# OVH Artifact Hosting Setup

This guide covers running both the npm registry (Verdaccio) and the static artifact host on the existing OVH machine so game releases and platform deployments stay self-contained.

## 1. Verdaccio Private Registry

### Install
```bash
# On OVH host (via Tailscale)
sudo mkdir -p /opt/pirate-registry
cd /opt/pirate-registry
sudo npm install -g verdaccio
sudo chown -R deploy:deploy /opt/pirate-registry
```

### Configuration
Create `/opt/pirate-registry/config.yaml`:
```yaml
storage: /opt/pirate-registry/storage
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
packages:
  '@pirate/*':
    access: $authenticated
    publish: $authenticated
    proxy: npmjs
  '**':
    access: $all
    proxy: npmjs
auth:
  htpasswd:
    file: /opt/pirate-registry/htpasswd
listen: 0.0.0.0:4873
```

Create the password file and user:
```bash
npx htpasswd -cs /opt/pirate-registry/htpasswd pirate
```

### Systemd Unit
`/etc/systemd/system/pirate-registry.service`:
```ini
[Unit]
Description=Pirate Verdaccio Registry
After=network.target

[Service]
User=deploy
WorkingDirectory=/opt/pirate-registry
ExecStart=/usr/local/bin/verdaccio --config /opt/pirate-registry/config.yaml
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable pirate-registry
sudo systemctl start pirate-registry
```

### Tailscale Integration
- Ensure MagicDNS exposes `registry.tail751d97.ts.net`
- Optional: `tailscale serve --https=4873 localhost:4873` for automatic HTTPS

### Local npm Configuration
Create/edit `~/.npmrc` on dev machines:
```
@pirate:registry=http://registry.tail751d97.ts.net:4873/
//registry.tail751d97.ts.net:4873/:_authToken=<token from npm login>
```
Login:
```bash
npm login --registry http://registry.tail751d97.ts.net:4873/ --scope=@pirate
```

## 2. Static Artifact Host

### Directory Layout
```
/opt/pirate-artifacts/
└── pirate-plunder/
    └── 1.4.0/
        ├── client.zip
        └── game-manifest.json
```

### Nginx Site
Install Nginx (`sudo apt install nginx`). Create `/etc/nginx/sites-available/pirate-artifacts`:
```nginx
server {
    listen 443 ssl;
    server_name artifacts.tail751d97.ts.net;

    ssl_certificate /etc/letsencrypt/live/artifacts.tail751d97.ts.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/artifacts.tail751d97.ts.net/privkey.pem;

    root /opt/pirate-artifacts;
    autoindex off;

    location / {
        try_files $uri =404;
        add_header Access-Control-Allow-Origin '*';
    }
}
```

Enable and reload:
```bash
sudo ln -s /etc/nginx/sites-available/pirate-artifacts /etc/nginx/sites-enabled/pirate-artifacts
sudo nginx -t
sudo systemctl reload nginx
```

> Alternatively use `tailscale serve https /opt/pirate-artifacts` if you want to skip Nginx.

### Upload Permissions
```bash
sudo mkdir -p /opt/pirate-artifacts
sudo chown -R deploy:deploy /opt/pirate-artifacts
```

### Tailscale DNS
- Ensure MagicDNS entry `artifacts.tail751d97.ts.net` resolves inside the tailnet
- Update ACLs to allow developer devices to access TCP 443 (or `tailscale serve` port)

## 3. Publishing Workflow

1. Build game (`npm run build` inside game repo).
2. Publish server package:
   ```bash
   npm publish --registry http://registry.tail751d97.ts.net:4873/
   ```
3. Upload client bundle + manifest:
   ```bash
   # From repo root (ensure manifest exists)
   npm run publish:game -- 1.4.0
   ```
4. Manifest paths in `game-manifest.json` should point to `https://artifacts.tail751d97.ts.net/<game>/<version>/client.zip`.

## 4. Validation Commands

```bash
# Registry
curl http://registry.tail751d97.ts.net:4873/-/ping

# Artifact
curl -I https://artifacts.tail751d97.ts.net/pirate-plunder/1.4.0/client.zip
```

## 5. Troubleshooting

- Registry fails to start: check `/var/log/syslog` and `/opt/pirate-registry/storage` permissions.
- `npm publish` still hitting npmjs.org: verify `@pirate:registry` line in `~/.npmrc`.
- Artifact 404: confirm version folder exists and TLS certificate is valid.
- Tailscale access denied: update ACLs to allow `tag:infra` → developer devices.

With Verdaccio and the artifact host running on OVH you can publish game packages without adding third-party services, keeping the deployment flow self-contained until you’re ready to move to hosted infrastructure.
