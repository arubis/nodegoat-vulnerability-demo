#!/usr/bin/env node

import crypto from 'crypto';

const API_URL = 'https://api.rsolv-staging.com';
const API_KEY = 'staging-master-key-123';

async function testObviousVulnerabilities() {
  console.log('Testing with obvious vulnerabilities...\n');
  
  const encryptionKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);
  
  // Very obvious vulnerabilities with direct user input
  const code = `
function vulnerableHandler(req, res) {
  // Direct eval of user input - should be high confidence
  const userCode = req.query.code;
  const result = eval(userCode);  // CRITICAL: Direct RCE
  
  // SQL injection with direct concatenation
  const userId = req.params.id;
  const query = "SELECT * FROM users WHERE id = " + userId;  // HIGH: SQL injection
  db.query(query);
  
  // Direct innerHTML assignment
  const userHtml = req.body.html;
  document.getElementById('output').innerHTML = userHtml;  // HIGH: XSS
  
  // Command injection
  const fileName = req.query.file;
  exec('cat ' + fileName);  // CRITICAL: Command injection
  
  // Hardcoded credentials
  const password = "admin123";  // HIGH: Hardcoded password
  const apiKey = "sk-1234567890abcdef";  // HIGH: Hardcoded API key
  
  return result;
}
`;
  
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  const request = {
    requestId: 'obvious-vulns-test-' + Date.now(),
    files: [{
      path: 'vulnerable.js',
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
      const findings = result.findings || [];
      
      console.log('\nFindings count:', findings.length);
      
      if (findings.length > 0) {
        console.log('\n🎉 Vulnerabilities detected!');
        findings.forEach((finding, i) => {
          console.log(`\n${i + 1}. ${finding.patternName || finding.type}`);
          console.log(`   Type: ${finding.type || finding.patternId}`);
          console.log(`   Severity: ${finding.severity}`);
          console.log(`   Line: ${finding.location?.startLine || '?'}`);
          console.log(`   Confidence: ${finding.confidence || 'N/A'}`);
          console.log(`   Message: ${finding.recommendation || ''}`);
        });
      } else {
        console.log('\n⚠️ No findings - confidence thresholds may be too high');
        console.log('Expected to find:');
        console.log('- eval() with user input (line 4)');
        console.log('- SQL injection (line 8)');
        console.log('- XSS via innerHTML (line 12)');
        console.log('- Command injection (line 16)');
        console.log('- Hardcoded credentials (lines 19-20)');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testObviousVulnerabilities();