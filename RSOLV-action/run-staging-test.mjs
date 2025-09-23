#!/usr/bin/env node

/**
 * Direct staging API test - bypasses all test framework mocking
 * Run with: node run-staging-test.mjs
 */

import crypto from 'crypto';

// Staging credentials
const API_KEY = 'staging-master-key-123';
const API_URL = 'https://api.rsolv-staging.com';

async function testDirectAST() {
  console.log('Testing direct AST endpoint...');
  console.log(`API URL: ${API_URL}`);
  console.log(`API Key: ${API_KEY.substring(0, 15)}...`);
  
  // Generate encryption key
  const encryptionKey = crypto.randomBytes(32);
  
  // Test code with obvious SQL injection
  const testCode = `
def get_user(user_id):
    query = "SELECT * FROM users WHERE id = " + user_id
    cursor.execute(query)
    return cursor.fetchone()
`;
  
  // Encrypt the content
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  
  let encrypted = cipher.update(testCode, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  const contentHash = crypto.createHash('sha256').update(testCode).digest('hex');
  
  // Build request
  const request = {
    requestId: `ast-direct-${Date.now()}`,
    files: [{
      path: 'test.py',
      encryptedContent: encrypted.toString('base64'),
      encryption: {
        iv: iv.toString('base64'),
        algorithm: 'aes-256-gcm',
        authTag: authTag.toString('base64')
      },
      metadata: {
        language: 'python',
        size: Buffer.byteLength(testCode, 'utf8'),
        contentHash
      }
    }],
    options: {
      patternFormat: 'enhanced',
      includeSecurityPatterns: true
    }
  };
  
  try {
    console.log('\nCalling AST endpoint:', `${API_URL}/api/v1/ast/analyze`);
    
    const response = await fetch(`${API_URL}/api/v1/ast/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'X-Encryption-Key': encryptionKey.toString('base64')
      },
      body: JSON.stringify(request)
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    const data = await response.json();
    
    if (response.ok) {
      console.log('\n✅ AST Analysis succeeded!');
      console.log('Request ID:', data.requestId);
      console.log('Session ID:', data.session?.sessionId);
      console.log('Results:', JSON.stringify(data.results, null, 2));
      
      if (data.results?.[0]?.patterns?.length > 0) {
        console.log('\n🎉 Vulnerabilities detected!');
        console.log('Count:', data.results[0].patterns.length);
        console.log('First pattern:', JSON.stringify(data.results[0].patterns[0], null, 2));
      } else {
        console.log('\n⚠️ No vulnerabilities detected');
        console.log('This might indicate pattern loading issues with the API key');
      }
      
      console.log('\nTiming:', data.timing);
      console.log('Summary:', data.summary);
    } else {
      console.log('\n❌ Request failed:', data);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

async function testPatternLoading() {
  console.log('\n\nTesting pattern loading...');
  
  try {
    const response = await fetch(`${API_URL}/api/v1/patterns?language=python&format=enhanced`, {
      headers: {
        'x-api-key': API_KEY
      }
    });
    
    console.log('Pattern endpoint status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('Patterns loaded:', data.patterns?.length || 0);
      
      if (data.patterns?.length > 0) {
        console.log('First pattern ID:', data.patterns[0].id);
        console.log('Pattern has AST rules:', !!data.patterns[0].astRules);
      }
    } else {
      const error = await response.text();
      console.log('Pattern loading failed:', error);
    }
  } catch (error) {
    console.error('Pattern loading error:', error);
  }
}

// Run tests
console.log('='.repeat(60));
console.log('RSOLV Staging API Direct Test');
console.log('='.repeat(60));

await testDirectAST();
await testPatternLoading();

console.log('\n' + '='.repeat(60));
console.log('Test complete');