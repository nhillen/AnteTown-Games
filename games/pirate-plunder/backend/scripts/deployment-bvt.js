#!/usr/bin/env node

/**
 * Build Verification Test (BVT) for Pirate Plunder Deployment
 * 
 * This script validates that a deployed instance of Pirate Plunder is working correctly.
 * It's designed to be run after deployment to verify all critical system components.
 * 
 * Usage:
 *   node deployment-bvt.js [BASE_URL]
 *   
 * Examples:
 *   node deployment-bvt.js                                    # Test localhost:3001
 *   node deployment-bvt.js http://localhost:3001              # Test specific local URL  
 *   node deployment-bvt.js https://pirateplunder.yourdomain.com  # Test production
 */

const https = require('https');
const http = require('http');

const DEFAULT_BASE_URL = 'http://localhost:3001';
const BASE_URL = process.argv[2] || DEFAULT_BASE_URL;

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const { method = 'GET', headers = {}, body, timeout = 10000 } = options;
    const isHttps = url.startsWith('https');
    const client = isHttps ? https : http;
    
    const req = client.request(url, { method, headers, timeout }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsedData = data ? JSON.parse(data) : null;
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsedData
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    
    req.end();
  });
}

async function runBVT() {
  console.log('🚀 Pirate Plunder Deployment BVT');
  console.log(`🎯 Target: ${BASE_URL}`);
  console.log(`⏰ Started: ${new Date().toISOString()}\\n`);
  
  let exitCode = 0;
  
  try {
    // Test 1: Basic Connectivity & Ping
    console.log('📡 Testing basic connectivity...');
    const pingResponse = await makeRequest(`${BASE_URL}/health/ping`);
    
    if (pingResponse.statusCode === 200) {
      console.log('✅ Server is responding');
      console.log(`   Uptime: ${pingResponse.body?.uptime} seconds`);
    } else {
      console.log(`❌ Server not responding (HTTP ${pingResponse.statusCode})`);
      exitCode = 1;
    }
    
    // Test 2: Comprehensive Health Check
    console.log('\\n🏥 Running comprehensive health check...');
    const healthResponse = await makeRequest(`${BASE_URL}/health`);
    
    if (healthResponse.statusCode === 200 || healthResponse.statusCode === 503) {
      const health = healthResponse.body;
      
      console.log(`📊 Overall Status: ${health.status.toUpperCase()}`);
      console.log(`🏷️  Version: ${health.version}`);
      console.log(`🌍 Environment: ${health.environment}`);
      console.log(`⏱️  System Uptime: ${health.uptime} seconds`);
      
      console.log('\\n📋 Component Status:');
      health.checks.forEach(check => {
        const icon = check.status === 'healthy' ? '✅' : 
                    check.status === 'degraded' ? '⚠️' : '❌';
        console.log(`   ${icon} ${check.component}: ${check.status}`);
        console.log(`      ${check.message}`);
        if (check.responseTime !== undefined) {
          console.log(`      Response time: ${check.responseTime}ms`);
        }
        if (check.details) {
          console.log(`      Details: ${JSON.stringify(check.details)}`);
        }
      });
      
      // Set exit code based on health status
      if (health.status === 'unhealthy') {
        exitCode = 1;
        console.log('\\n❌ System is unhealthy - deployment verification FAILED');
      } else if (health.status === 'degraded') {
        exitCode = 2;
        console.log('\\n⚠️  System is degraded - deployment has issues but is functional');
      } else {
        console.log('\\n✅ System is healthy - deployment verification PASSED');
      }
    } else {
      console.log(`❌ Health check endpoint failed (HTTP ${healthResponse.statusCode})`);
      exitCode = 1;
    }
    
    // Test 3: Authentication System
    console.log('\\n🔐 Testing authentication system...');
    try {
      const authResponse = await makeRequest(`${BASE_URL}/auth/user`);
      if (authResponse.statusCode === 401) {
        console.log('✅ Auth endpoint properly rejecting unauthenticated requests');
      } else {
        console.log(`⚠️  Auth endpoint unexpected response: HTTP ${authResponse.statusCode}`);
      }
      
      // Test Google OAuth redirect
      const oauthResponse = await makeRequest(`${BASE_URL}/auth/google`);
      if (oauthResponse.statusCode === 302 && 
          oauthResponse.headers.location && 
          oauthResponse.headers.location.includes('google.com')) {
        console.log('✅ Google OAuth redirect working');
      } else {
        console.log(`⚠️  Google OAuth redirect issue: HTTP ${oauthResponse.statusCode}`);
      }
    } catch (error) {
      console.log(`❌ Authentication test failed: ${error.message}`);
    }
    
    // Test 4: Game API
    console.log('\\n🎮 Testing game API...');
    try {
      const apiResponse = await makeRequest(`${BASE_URL}/api/status`);
      if (apiResponse.statusCode === 200) {
        console.log('✅ Game API responding');
        console.log(`   Active players: ${apiResponse.body?.players || 0}`);
        console.log(`   Game phase: ${apiResponse.body?.phase || 'N/A'}`);
      } else {
        console.log(`⚠️  Game API issue: HTTP ${apiResponse.statusCode}`);
      }
    } catch (error) {
      console.log(`❌ Game API test failed: ${error.message}`);
    }
    
  } catch (error) {
    console.log(`💥 BVT failed with error: ${error.message}`);
    exitCode = 1;
  }
  
  // Summary
  console.log(`\\n📋 BVT Summary:`);
  console.log(`⏰ Completed: ${new Date().toISOString()}`);
  console.log(`🎯 Target: ${BASE_URL}`);
  
  if (exitCode === 0) {
    console.log(`✅ Result: PASS - Deployment is healthy and ready`);
  } else if (exitCode === 1) {
    console.log(`❌ Result: FAIL - Deployment has critical issues`);
  } else if (exitCode === 2) {
    console.log(`⚠️  Result: DEGRADED - Deployment is functional but has issues`);
  }
  
  console.log(`📊 Exit Code: ${exitCode}`);
  
  process.exit(exitCode);
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the BVT
runBVT();