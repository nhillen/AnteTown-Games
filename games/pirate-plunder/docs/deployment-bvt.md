# Deployment Build Verification Test (BVT)

This document describes the Build Verification Test (BVT) system for validating Pirate Plunder deployments.

## Overview

The BVT system provides comprehensive health checks to verify that a deployed instance of Pirate Plunder is functioning correctly. It's designed to be run after deployment to catch issues before they affect users.

## Health Check Endpoints

### `/health` - Comprehensive System Health

Returns detailed status of all system components with appropriate HTTP status codes:

- **HTTP 200**: System healthy or degraded (still functional)
- **HTTP 503**: System unhealthy (critical failures)

```bash
curl https://yourdomain.com/health
```

**Response Format:**
```json
{
  "status": "healthy|degraded|unhealthy",
  "timestamp": "2025-08-22T17:59:24.929Z",
  "version": "1.0.0",
  "environment": "production",
  "uptime": 3600,
  "checks": [
    {
      "component": "database",
      "status": "healthy",
      "message": "Database read/write operations successful",
      "responseTime": 45,
      "details": { "userCount": 150, "provider": "postgresql" }
    }
    // ... other components
  ]
}
```

### `/health/ping` - Simple Uptime Check

Quick endpoint for basic uptime monitoring:

```bash
curl https://yourdomain.com/health/ping
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-08-22T17:59:24.929Z",
  "uptime": 3600
}
```

## System Components Checked

### 1. Database
- **Tests**: Connection, read operations, write operations (creates and deletes test record)
- **Healthy**: All database operations successful
- **Unhealthy**: Cannot connect or perform operations
- **Details**: User count, database provider

### 2. Filesystem
- **Tests**: Presence of critical application files
- **Healthy**: All required files present
- **Unhealthy**: Critical files missing
- **Details**: Number of files checked

### 3. Authentication
- **Tests**: Environment variables, OAuth configuration
- **Healthy**: All required environment variables set
- **Degraded**: Some optional configuration missing
- **Unhealthy**: Critical authentication components missing
- **Details**: OAuth configuration status

### 4. AI Profiles
- **Tests**: AI profile file loading and validation
- **Healthy**: Expected number of AI profiles loaded (4)
- **Degraded**: Wrong number of profiles
- **Unhealthy**: Cannot load AI profiles
- **Details**: Profile count

## BVT Script Usage

### Automated Deployment Verification

Use the BVT script for automated post-deployment verification:

```bash
# Test local development
node scripts/deployment-bvt.js

# Test specific URL
node scripts/deployment-bvt.js http://localhost:3001

# Test production deployment
node scripts/deployment-bvt.js https://pirateplunder.yourdomain.com
```

### Exit Codes

- **0**: All systems healthy - deployment verification PASSED
- **1**: Critical failures detected - deployment verification FAILED
- **2**: System degraded but functional - deployment has non-critical issues

### Example Output

```
🚀 Pirate Plunder Deployment BVT
🎯 Target: https://pirateplunder.yourdomain.com
⏰ Started: 2025-08-22T17:59:24.929Z

📡 Testing basic connectivity...
✅ Server is responding
   Uptime: 3600 seconds

🏥 Running comprehensive health check...
📊 Overall Status: HEALTHY
🏷️  Version: 1.2.0
🌍 Environment: production
⏱️  System Uptime: 3600 seconds

📋 Component Status:
   ✅ database: healthy
      Database read/write operations successful
      Response time: 45ms
      Details: {"userCount":150,"provider":"postgresql"}
   ✅ filesystem: healthy
      All critical files present
      Response time: 2ms
      Details: {"filesChecked":4}
   ✅ authentication: healthy
      Authentication configuration complete
      Response time: 1ms
      Details: {"googleOAuthConfigured":true,"sessionSecretConfigured":true}
   ✅ ai_profiles: healthy
      AI profiles loaded successfully
      Response time: 3ms
      Details: {"profileCount":4}

✅ System is healthy - deployment verification PASSED

🔐 Testing authentication system...
✅ Auth endpoint properly rejecting unauthenticated requests
✅ Google OAuth redirect working

🎮 Testing game API...
✅ Game API responding
   Active players: 5
   Game phase: Lobby

📋 BVT Summary:
⏰ Completed: 2025-08-22T17:59:25.259Z
🎯 Target: https://pirateplunder.yourdomain.com
✅ Result: PASS - Deployment is healthy and ready
📊 Exit Code: 0
```

## Integration with CI/CD

### GitHub Actions Integration

Add to your deployment workflow:

```yaml
- name: Run Deployment BVT
  run: |
    # Wait for deployment to be ready
    sleep 30
    
    # Run BVT against production URL
    node scripts/deployment-bvt.js https://pirateplunder.yourdomain.com
  working-directory: backend
```

### Monitoring Integration

For continuous monitoring, set up periodic health checks:

```bash
# Cron job example (every 5 minutes)
*/5 * * * * cd /path/to/pirateplunder/backend && node scripts/deployment-bvt.js https://pirateplunder.yourdomain.com >> /var/log/pirateplunder-health.log 2>&1
```

### Alerting

Set up alerts based on HTTP status codes:

```bash
# Example monitoring script
#!/bin/bash
HEALTH_URL="https://pirateplunder.yourdomain.com/health"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL")

if [ "$STATUS" -eq 503 ]; then
    # Send alert - system unhealthy
    echo "ALERT: Pirate Plunder system unhealthy"
    # Add your alerting logic here
elif [ "$STATUS" -ne 200 ]; then
    # Send warning - system degraded or other issue
    echo "WARNING: Pirate Plunder system status: $STATUS"
fi
```

## Common Issues and Troubleshooting

### Database Connection Issues
```json
{
  "component": "database",
  "status": "unhealthy",
  "message": "Database check failed: connect ECONNREFUSED"
}
```
**Solutions:**
- Check PostgreSQL service is running
- Verify DATABASE_URL environment variable
- Check network connectivity to database server

### Missing Environment Variables
```json
{
  "component": "authentication",
  "status": "degraded",
  "message": "Missing environment variables: GOOGLE_CLIENT_SECRET"
}
```
**Solutions:**
- Check all required environment variables are set
- Verify secrets are deployed correctly
- Check environment variable naming

### AI Profiles Loading Issues
```json
{
  "component": "ai_profiles",
  "status": "unhealthy",
  "message": "AI profiles check failed: ENOENT: no such file or directory"
}
```
**Solutions:**
- Ensure `src/ai-profiles.json` is deployed
- Check file permissions
- Verify build process includes AI profiles

## Manual Testing Commands

### Quick Health Check
```bash
curl -s https://yourdomain.com/health | jq '.status, .checks[].component, .checks[].status'
```

### Detailed Component Status
```bash
curl -s https://yourdomain.com/health | jq '.checks[] | "\(.component): \(.status) - \(.message)"'
```

### Check Response Times
```bash
curl -s https://yourdomain.com/health | jq '.checks[] | "\(.component): \(.responseTime)ms"'
```

### Monitor System Over Time
```bash
while true; do
  echo "$(date): $(curl -s https://yourdomain.com/health | jq -r '.status')"
  sleep 60
done
```

## Security Considerations

- Health endpoints don't expose sensitive information (passwords, keys, etc.)
- Only system status and performance metrics are returned
- Database checks use temporary test records that are immediately deleted
- Environment variable checks only report presence, not values
- All checks are read-only except for the minimal database write test

## Performance Impact

- Health checks are designed to be lightweight
- Database check creates/deletes one test record
- Typical response time: < 500ms
- Safe to run frequently for monitoring
- No impact on game performance or user experience