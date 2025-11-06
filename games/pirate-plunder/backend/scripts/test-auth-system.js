#!/usr/bin/env node

const https = require('https');
const http = require('http');

const BASE_URL = 'http://localhost:3001';

// Helper function to make HTTP requests
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const { method = 'GET', headers = {}, body } = options;
    
    const req = http.request(url, { method, headers }, (res) => {
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
    
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Testing Pirate Plunder Authentication System\\n');
  
  let passed = 0;
  let failed = 0;
  
  function logTest(name, success, details = '') {
    const status = success ? '✅' : '❌';
    console.log(`${status} ${name}`);
    if (details) console.log(`   ${details}`);
    success ? passed++ : failed++;
  }
  
  // Test 1: Health Check
  try {
    const response = await makeRequest(`${BASE_URL}/health`);
    logTest(
      'Health Check', 
      response.statusCode === 200 && response.body.status === 'ok',
      `Status: ${response.statusCode}, Environment: ${response.body?.env}`
    );
  } catch (error) {
    logTest('Health Check', false, `Error: ${error.message}`);
  }
  
  // Test 2: Database Connection
  try {
    const response = await makeRequest(`${BASE_URL}/test/db-connection`);
    logTest(
      'Database Connection',
      response.statusCode === 200 && response.body.status === 'success',
      `User count: ${response.body?.userCount}`
    );
  } catch (error) {
    logTest('Database Connection', false, `Error: ${error.message}`);
  }
  
  // Test 3: Create Test User
  try {
    const response = await makeRequest(`${BASE_URL}/test/create-test-user`, { method: 'POST' });
    logTest(
      'User Creation',
      response.statusCode === 200 && response.body.status === 'success',
      `User ID: ${response.body?.user?.id}, Name: ${response.body?.user?.name}`
    );
  } catch (error) {
    logTest('User Creation', false, `Error: ${error.message}`);
  }
  
  // Test 4: List Users
  try {
    const response = await makeRequest(`${BASE_URL}/test/users`);
    logTest(
      'List Users',
      response.statusCode === 200 && response.body.count > 0,
      `Found ${response.body?.count} users`
    );
  } catch (error) {
    logTest('List Users', false, `Error: ${error.message}`);
  }
  
  // Test 5: Session Info (Unauthenticated)
  try {
    const response = await makeRequest(`${BASE_URL}/test/session-info`);
    logTest(
      'Session Info (Unauthenticated)',
      response.statusCode === 200 && response.body.isAuthenticated === false,
      `Session ID: ${response.body?.sessionId}, Authenticated: ${response.body?.isAuthenticated}`
    );
  } catch (error) {
    logTest('Session Info (Unauthenticated)', false, `Error: ${error.message}`);
  }
  
  // Test 6: Auth User Endpoint (Should Fail)
  try {
    const response = await makeRequest(`${BASE_URL}/auth/user`);
    logTest(
      'Auth User Endpoint (Unauthenticated)',
      response.statusCode === 401 && response.body.error === 'Not authenticated',
      `Status: ${response.statusCode}, Message: ${response.body?.error}`
    );
  } catch (error) {
    logTest('Auth User Endpoint (Unauthenticated)', false, `Error: ${error.message}`);
  }
  
  // Test 7: Google OAuth Redirect
  try {
    const response = await makeRequest(`${BASE_URL}/auth/google`);
    const isGoogleRedirect = response.statusCode === 302 && 
                            response.headers.location && 
                            response.headers.location.includes('accounts.google.com');
    logTest(
      'Google OAuth Redirect',
      isGoogleRedirect,
      `Status: ${response.statusCode}, Location: ${response.headers.location?.substring(0, 50)}...`
    );
  } catch (error) {
    logTest('Google OAuth Redirect', false, `Error: ${error.message}`);
  }
  
  // Test 8: Prisma Client Working
  try {
    const response = await makeRequest(`${BASE_URL}/test/db-connection`);
    logTest(
      'Prisma ORM Integration',
      response.statusCode === 200 && response.body.message.includes('Database connection successful'),
      'Prisma client successfully connected to PostgreSQL database'
    );
  } catch (error) {
    logTest('Prisma ORM Integration', false, `Error: ${error.message}`);
  }
  
  // Clean up test data
  try {
    await makeRequest(`${BASE_URL}/test/cleanup`, { method: 'DELETE' });
    console.log('\\n🧹 Cleaned up test data');
  } catch (error) {
    console.log('\\n⚠️  Failed to clean up test data:', error.message);
  }
  
  // Summary
  console.log('\\n📊 Test Results:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
  
  if (failed === 0) {
    console.log('\\n🎉 All tests passed! Authentication system is working correctly.');
  } else {
    console.log('\\n⚠️  Some tests failed. Check the details above.');
  }
  
  process.exit(failed === 0 ? 0 : 1);
}

// Run tests
runTests().catch(console.error);