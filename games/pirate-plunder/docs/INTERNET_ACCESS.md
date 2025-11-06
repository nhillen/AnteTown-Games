# Internet Access Setup for PiratePlunder

## Current Setup
The game is running on the OVH server at port 3001, accessible via:
- **Tailscale VPN**: `http://vps-0b87e710.tail751d97.ts.net:3001`

## Options for Public Internet Access

### Option 1: Direct Port Access (Simplest)
If your OVH server has a public IP and port 3001 is open:
```bash
# Find your public IP
curl ifconfig.me

# Access the game at
http://YOUR_PUBLIC_IP:3001
```

**Security Note**: Ensure firewall rules allow port 3001:
```bash
# On the OVH server
sudo ufw allow 3001/tcp
```

### Option 2: Nginx Reverse Proxy (Recommended)
Set up Nginx on the OVH server to proxy requests:

1. **Install Nginx**:
```bash
sudo apt update
sudo apt install nginx
```

2. **Create Nginx config** at `/etc/nginx/sites-available/pirateplunder`:
```nginx
server {
    listen 80;
    server_name your-domain.com;  # Or use your public IP

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

3. **Enable the site**:
```bash
sudo ln -s /etc/nginx/sites-available/pirateplunder /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

4. **Access**: `http://your-domain.com` or `http://YOUR_PUBLIC_IP`

### Option 3: Cloudflare Tunnel (No Public IP Needed)
If you want to expose the service without opening ports:

1. **Install Cloudflare Tunnel**:
```bash
# On OVH server
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/
```

2. **Authenticate**:
```bash
cloudflared tunnel login
```

3. **Create tunnel**:
```bash
cloudflared tunnel create pirateplunder
```

4. **Configure** (`~/.cloudflared/config.yml`):
```yaml
url: http://localhost:3001
tunnel: YOUR_TUNNEL_ID
credentials-file: /home/deploy/.cloudflared/YOUR_TUNNEL_ID.json
```

5. **Route to your domain**:
```bash
cloudflared tunnel route dns pirateplunder your-subdomain.your-domain.com
```

6. **Run tunnel**:
```bash
cloudflared tunnel run pirateplunder
```

### Option 4: Use OVH's Load Balancer
If you have OVH's load balancer service, you can configure it to route traffic to your VPS on port 3001.

## Environment Configuration

Once you have a public domain/IP, update your frontend configuration:

1. **For development** (`games/pirate-plunder/frontend/.env.local`):
```
VITE_BACKEND_URL=http://your-domain.com
```

2. **For production** (`games/pirate-plunder/frontend/.env.production`):
```
VITE_BACKEND_URL=https://your-domain.com
```

## SSL/HTTPS Setup (Recommended)

For HTTPS with Let's Encrypt:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Testing Access

Once configured, test from outside the network:
```bash
# Test health endpoint
curl http://your-domain.com/health

# Or with IP
curl http://YOUR_PUBLIC_IP:3001/health
```

## Troubleshooting

1. **Check if service is running**:
```bash
sudo systemctl status PiratePlunder
```

2. **Check if port is listening**:
```bash
sudo netstat -tlnp | grep 3001
```

3. **Test locally first**:
```bash
curl http://localhost:3001/health
```

4. **Check firewall**:
```bash
sudo ufw status
```

5. **Check OVH firewall** in OVH control panel - ensure port 3001 or 80/443 are open.
