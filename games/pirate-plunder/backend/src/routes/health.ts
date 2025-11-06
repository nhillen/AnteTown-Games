import express, { Request, Response } from 'express';
import prisma from '../config/database';
import { promises as fs } from 'fs';
import path from 'path';

const router = express.Router();

interface HealthCheckResult {
  component: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  message: string;
  responseTime?: number;
  details?: any;
}

interface SystemStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  commitHash: string;
  buildDate?: string;
  buildVersion?: string;
  environment: string;
  uptime: number;
  checks: HealthCheckResult[];
}

async function checkDatabase(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    // Test basic connectivity
    await prisma.$connect();
    
    // Test read operation
    const userCount = await prisma.user.count();
    
    // Test write operation (create and delete a health check record)
    const testUser = await prisma.user.create({
      data: {
        googleId: `healthcheck_${Date.now()}`,
        email: `healthcheck_${Date.now()}@system.test`,
        name: 'Health Check Test User'
      }
    });
    
    await prisma.user.delete({
      where: { id: testUser.id }
    });
    
    const responseTime = Date.now() - start;
    
    return {
      component: 'database',
      status: 'healthy',
      message: 'Database read/write operations successful',
      responseTime,
      details: { userCount, provider: 'postgresql' }
    };
  } catch (error) {
    const responseTime = Date.now() - start;
    return {
      component: 'database',
      status: 'unhealthy',
      message: `Database check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      responseTime
    };
  }
}

async function checkFileSystem(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    // Check if critical files exist
    const criticalFiles = [
      'src/server.ts',
      'src/config/database.ts',
      'src/config/passport.ts',
      'src/ai-profiles.json'
    ];
    
    const fileChecks = await Promise.all(
      criticalFiles.map(async (file) => {
        try {
          await fs.access(path.join(__dirname, '..', '..', file));
          return { file, exists: true };
        } catch {
          return { file, exists: false };
        }
      })
    );
    
    const missingFiles = fileChecks.filter(check => !check.exists);
    const responseTime = Date.now() - start;
    
    if (missingFiles.length > 0) {
      return {
        component: 'filesystem',
        status: 'unhealthy',
        message: `Critical files missing: ${missingFiles.map(f => f.file).join(', ')}`,
        responseTime,
        details: { missingFiles: missingFiles.length, totalFiles: criticalFiles.length }
      };
    }
    
    return {
      component: 'filesystem',
      status: 'healthy',
      message: 'All critical files present',
      responseTime,
      details: { filesChecked: criticalFiles.length }
    };
  } catch (error) {
    const responseTime = Date.now() - start;
    return {
      component: 'filesystem',
      status: 'unhealthy',
      message: `Filesystem check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      responseTime
    };
  }
}

async function checkAuthentication(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    // Check if environment variables are set
    const requiredEnvVars = ['SESSION_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    const responseTime = Date.now() - start;
    
    if (missingVars.length > 0) {
      return {
        component: 'authentication',
        status: 'degraded',
        message: `Missing environment variables: ${missingVars.join(', ')}`,
        responseTime,
        details: { 
          missingVariables: missingVars.length,
          totalRequired: requiredEnvVars.length,
          googleOAuthConfigured: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET
        }
      };
    }
    
    return {
      component: 'authentication',
      status: 'healthy',
      message: 'Authentication configuration complete',
      responseTime,
      details: {
        googleOAuthConfigured: true,
        sessionSecretConfigured: true
      }
    };
  } catch (error) {
    const responseTime = Date.now() - start;
    return {
      component: 'authentication',
      status: 'unhealthy',
      message: `Authentication check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      responseTime
    };
  }
}

async function checkAIProfiles(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    const aiProfilesPath = path.join(__dirname, '..', 'ai-profiles.json');
    const aiProfiles = JSON.parse(await fs.readFile(aiProfilesPath, 'utf-8'));
    
    const expectedProfiles = 4; // Should have 4 AI profiles
    const actualProfiles = Array.isArray(aiProfiles) ? aiProfiles.length : 0;
    
    const responseTime = Date.now() - start;
    
    if (actualProfiles !== expectedProfiles) {
      return {
        component: 'ai_profiles',
        status: 'degraded',
        message: `Expected ${expectedProfiles} AI profiles, found ${actualProfiles}`,
        responseTime,
        details: { expected: expectedProfiles, actual: actualProfiles }
      };
    }
    
    return {
      component: 'ai_profiles',
      status: 'healthy',
      message: 'AI profiles loaded successfully',
      responseTime,
      details: { profileCount: actualProfiles }
    };
  } catch (error) {
    const responseTime = Date.now() - start;
    return {
      component: 'ai_profiles',
      status: 'unhealthy',
      message: `AI profiles check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      responseTime
    };
  }
}

async function checkFrontendAssets(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    // Check if critical frontend files exist in public directory
    const publicDir = path.join(__dirname, '..', 'public');
    const assetsDir = path.join(publicDir, 'assets');
    
    // Check for index.html
    const indexExists = await fs.access(path.join(publicDir, 'index.html')).then(() => true).catch(() => false);
    
    // Check for assets directory
    const assetsDirExists = await fs.access(assetsDir).then(() => true).catch(() => false);
    
    let assetFiles: string[] = [];
    let jsFiles: string[] = [];
    let cssFiles: string[] = [];
    
    if (assetsDirExists) {
      assetFiles = await fs.readdir(assetsDir);
      jsFiles = assetFiles.filter(file => file.endsWith('.js'));
      cssFiles = assetFiles.filter(file => file.endsWith('.css'));
    }
    
    const responseTime = Date.now() - start;
    
    // Check for minimum required assets
    if (!indexExists) {
      return {
        component: 'frontend_assets',
        status: 'unhealthy',
        message: 'Critical frontend file missing: index.html',
        responseTime,
        details: { indexExists: false, assetFiles: assetFiles.length }
      };
    }
    
    if (jsFiles.length === 0) {
      return {
        component: 'frontend_assets',
        status: 'unhealthy',
        message: 'No JavaScript assets found - frontend may not be built',
        responseTime,
        details: { 
          indexExists, 
          jsFiles: jsFiles.length, 
          cssFiles: cssFiles.length,
          totalAssets: assetFiles.length 
        }
      };
    }
    
    // Check asset freshness (built in last 24 hours is good)
    const indexStat = await fs.stat(path.join(publicDir, 'index.html'));
    const hoursSinceModified = (Date.now() - indexStat.mtime.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceModified > 24) {
      return {
        component: 'frontend_assets',
        status: 'degraded',
        message: `Frontend assets may be stale (${Math.floor(hoursSinceModified)} hours old)`,
        responseTime,
        details: { 
          indexExists, 
          jsFiles: jsFiles.length, 
          cssFiles: cssFiles.length,
          totalAssets: assetFiles.length,
          hoursSinceModified: Math.floor(hoursSinceModified)
        }
      };
    }
    
    return {
      component: 'frontend_assets',
      status: 'healthy',
      message: 'Frontend assets present and fresh',
      responseTime,
      details: { 
        indexExists, 
        jsFiles: jsFiles.length, 
        cssFiles: cssFiles.length,
        totalAssets: assetFiles.length,
        hoursSinceModified: Math.floor(hoursSinceModified)
      }
    };
  } catch (error) {
    const responseTime = Date.now() - start;
    return {
      component: 'frontend_assets',
      status: 'unhealthy',
      message: `Frontend assets check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      responseTime
    };
  }
}

async function getSystemVersion(): Promise<string> {
  try {
    const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
    return packageJson.version || '1.0.0';
  } catch {
    return 'unknown';
  }
}

async function getBuildInfo(): Promise<{ commitHash: string, buildDate?: string, buildVersion?: string }> {
  try {
    const envBuildPath = path.join(__dirname, '..', '.env.build');
    const content = await fs.readFile(envBuildPath, 'utf8');
    const info: any = {};
    
    const commitMatch = content.match(/COMMIT_HASH=(.+)/);
    if (commitMatch && commitMatch[1]) info.commitHash = commitMatch[1].trim();
    
    const dateMatch = content.match(/BUILD_DATE=(.+)/);
    if (dateMatch && dateMatch[1]) info.buildDate = dateMatch[1].trim();
    
    const versionMatch = content.match(/BUILD_VERSION=(.+)/);
    if (versionMatch && versionMatch[1]) info.buildVersion = versionMatch[1].trim();
    
    return {
      commitHash: info.commitHash || process.env.GITHUB_SHA?.substring(0, 7) || 'unknown',
      ...(info.buildDate && { buildDate: info.buildDate }),
      ...(info.buildVersion && { buildVersion: info.buildVersion })
    };
  } catch (e) {
    return { 
      commitHash: process.env.GITHUB_SHA?.substring(0, 7) || 'unknown',
      ...(process.env.BUILD_DATE && { buildDate: process.env.BUILD_DATE }),
      ...(process.env.BUILD_VERSION && { buildVersion: process.env.BUILD_VERSION })
    };
  }
}

// Main health check endpoint
router.get('/', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    // Run all health checks in parallel
    const [
      databaseCheck,
      filesystemCheck,
      authCheck,
      aiProfilesCheck,
      frontendAssetsCheck,
      version,
      buildInfo
    ] = await Promise.all([
      checkDatabase(),
      checkFileSystem(),
      checkAuthentication(),
      checkAIProfiles(),
      checkFrontendAssets(),
      getSystemVersion(),
      getBuildInfo()
    ]);
    
    const checks = [databaseCheck, filesystemCheck, authCheck, aiProfilesCheck, frontendAssetsCheck];
    
    // Determine overall system status
    const hasUnhealthy = checks.some(check => check.status === 'unhealthy');
    const hasDegraded = checks.some(check => check.status === 'degraded');
    
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    if (hasUnhealthy) {
      overallStatus = 'unhealthy';
    } else if (hasDegraded) {
      overallStatus = 'degraded';
    }
    
    const systemStatus: SystemStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version,
      commitHash: buildInfo.commitHash,
      ...(buildInfo.buildDate && { buildDate: buildInfo.buildDate }),
      ...(buildInfo.buildVersion && { buildVersion: buildInfo.buildVersion }),
      environment: process.env.NODE_ENV || 'development',
      uptime: Math.floor(process.uptime()),
      checks
    };
    
    // Set appropriate HTTP status code
    const httpStatus = overallStatus === 'healthy' ? 200 : 
                      overallStatus === 'degraded' ? 200 : 503;
    
    res.status(httpStatus).json(systemStatus);
  } catch (error) {
    // Fallback error response
    const errorStatus: SystemStatus = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: 'unknown',
      commitHash: 'unknown',
      environment: process.env.NODE_ENV || 'development',
      uptime: Math.floor(process.uptime()),
      checks: [{
        component: 'system',
        status: 'unhealthy',
        message: `Health check system failure: ${error instanceof Error ? error.message : 'Unknown error'}`,
        responseTime: Date.now() - startTime
      }]
    };
    
    res.status(503).json(errorStatus);
  }
});

// Simple ping endpoint for basic uptime monitoring
router.get('/ping', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime())
  });
});

// Frontend-specific health check endpoint
router.get('/frontend', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const frontendCheck = await checkFrontendAssets();
    const buildInfo = await getBuildInfo();
    
    const response = {
      status: frontendCheck.status,
      timestamp: new Date().toISOString(),
      message: frontendCheck.message,
      responseTime: Date.now() - startTime,
      buildInfo,
      details: frontendCheck.details
    };
    
    const httpStatus = frontendCheck.status === 'healthy' ? 200 : 
                      frontendCheck.status === 'degraded' ? 200 : 503;
    
    res.status(httpStatus).json(response);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      message: `Frontend health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      responseTime: Date.now() - startTime
    });
  }
});

export default router;