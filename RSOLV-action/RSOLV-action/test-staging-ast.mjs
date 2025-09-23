#!/usr/bin/env node

import crypto from 'crypto';

async function testASTEndpoint() {
  const apiKey = 'staging-internal-key-456';
  const apiUrl = 'https://api.rsolv-staging.com';
  
  // Generate encryption key
  const encryptionKey = crypto.randomBytes(32);
  
  // Create test file content
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
    requestId: `ast-${Date.now()}-test`,
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
  
  console.log('Testing AST endpoint at:', `${apiUrl}/api/v1/ast/analyze`);
  console.log('Using API key:', apiKey.substring(0, 10) + '...');
  
  try {
    const response = await fetch(`${apiUrl}/api/v1/ast/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'X-Encryption-Key': encryptionKey.toString('base64')
      },
      body: JSON.stringify(request)
    });
    
    console.log('Response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('AST Analysis succeeded!');
      console.log('Results:', JSON.stringify(data, null, 2));
    } else {
      const error = await response.text();
      console.log('Response error:', error);
    }
  } catch (error) {
    console.error('Request failed:', error);
  }
}

testASTEndpoint();