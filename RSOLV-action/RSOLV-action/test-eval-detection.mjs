#!/usr/bin/env node

import crypto from 'crypto';

const API_URL = 'https://api.rsolv-staging.com';
const API_KEY = 'staging-master-key-123';

async function testEvalDetection() {
  console.log('Testing eval detection specifically...\n');
  
  const encryptionKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);
  
  // Simple eval case
  const code = `
const userInput = req.query.input;
eval(userInput);
`;
  
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  const request = {
    requestId: 'eval-test-' + Date.now(),
    files: [{
      path: 'eval-test.js',
      encryptedContent: encrypted.toString('base64'),
      encryption: {
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        algorithm: 'aes-256-gcm'
      },
      metadata: {
        language: 'javascript',
        size: Buffer.byteLength(code)
      }
    }],
    options: {
      includeSecurityPatterns: true
    }
  };
  
  try {
    const response = await fetch(`${API_URL}/api/v1/ast/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'X-Encryption-Key': encryptionKey.toString('base64')
      },
      body: JSON.stringify(request)
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('❌ API Error:', data);
      return;
    }
    
    console.log('✅ API Response received');
    
    if (data.results && data.results[0]) {
      const result = data.results[0];
      const findings = result.findings || [];
      
      console.log('\nFindings for simple eval():');
      console.log('Count:', findings.length);
      
      if (findings.length === 0) {
        console.log('❌ eval() not detected - this is a critical miss!');
        console.log('\nExpected to find:');
        console.log('- eval(userInput) on line 2');
        console.log('\nThis suggests confidence scoring is too strict for RCE patterns');
      } else {
        findings.forEach(f => {
          console.log(`- ${f.patternName}: confidence ${f.confidence}`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testEvalDetection();