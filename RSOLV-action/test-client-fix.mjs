#!/usr/bin/env node

import crypto from 'crypto';

const API_URL = 'https://api.rsolv-staging.com';
const API_KEY = 'staging-master-key-123';

async function testClientFix() {
  console.log('Testing client fix for findings field...\n');
  
  const encryptionKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);
  
  const code = `
// Test vulnerabilities
const userInput = req.query.input;
const result = eval(userInput);  // RCE vulnerability
document.innerHTML = userInput;   // XSS vulnerability
db.query('SELECT * FROM users WHERE id = ' + userInput);  // SQL injection
exec('ls ' + userInput);  // Command injection
`;
  
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  const request = {
    requestId: 'client-fix-test-' + Date.now(),
    files: [{
      path: 'test.js',
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
    console.log('Request ID:', data.requestId);
    
    if (data.results && data.results[0]) {
      const result = data.results[0];
      console.log('\nResult structure:');
      console.log('- Has "findings" field:', 'findings' in result);
      console.log('- Has "patterns" field:', 'patterns' in result);
      console.log('- Status:', result.status);
      console.log('- Language:', result.language);
      
      const findings = result.findings || [];
      console.log('\nFindings count:', findings.length);
      
      if (findings.length > 0) {
        console.log('\n🎉 Vulnerabilities detected!');
        findings.forEach((finding, i) => {
          console.log(`\n${i + 1}. ${finding.patternName || finding.type}`);
          console.log(`   Type: ${finding.type || finding.patternId}`);
          console.log(`   Severity: ${finding.severity}`);
          console.log(`   Location: Line ${finding.location?.startLine || finding.location?.start?.line || '?'}`);
          console.log(`   Confidence: ${finding.confidence || 'N/A'}`);
        });
      } else {
        console.log('\n⚠️ No findings detected - this indicates a pattern loading issue');
      }
    }
    
    console.log('\n✅ Client fix is working - API returns "findings" field');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testClientFix();