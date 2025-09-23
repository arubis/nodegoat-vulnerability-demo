/**
 * Simple verification script to test staging confidence threshold fix
 * Bypasses test framework and MSW to make direct API calls
 */

import * as crypto from 'crypto';

const API_KEY = 'staging-master-key-123';
const API_URL = 'https://api.rsolv-staging.com';

const testCode = `
def vulnerable_function(user_input):
    query = "SELECT * FROM users WHERE name = '" + user_input + "'"
    db.execute(query)
`;

// Generate encryption key
const encryptionKey = crypto.randomBytes(32);

// Encrypt the content
const iv = crypto.randomBytes(16);
const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);

let encrypted = cipher.update(testCode, 'utf8');
encrypted = Buffer.concat([encrypted, cipher.final()]);
const authTag = cipher.getAuthTag();

const contentHash = crypto.createHash('sha256').update(testCode).digest('hex');

// Build request
const request = {
  requestId: `verify-fix-${Date.now()}`,
  files: [{
    path: 'app.py',
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

console.log('🔍 Testing staging confidence threshold fix...');
console.log(`API URL: ${API_URL}`);
console.log(`API Key: ${API_KEY.substring(0, 15)}...`);

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

  if (!response.ok) {
    console.error(`❌ API call failed: ${response.status} ${response.statusText}`);
    const errorText = await response.text();
    console.error('Error response:', errorText);
    process.exit(1);
  }

  const data = await response.json();
  console.log('✅ API call successful!');
  
  if (data.results && data.results.length > 0) {
    const fileResult = data.results[0];
    
    if (fileResult.findings && fileResult.findings.length > 0) {
      console.log(`🎉 SUCCESS: Found ${fileResult.findings.length} vulnerabilities!`);
      
      fileResult.findings.forEach((finding, i) => {
        console.log(`\n  ${i + 1}. ${finding.patternName}`);
        console.log(`     Type: ${finding.type}`);
        console.log(`     Severity: ${finding.severity}`);
        console.log(`     Confidence: ${(finding.confidence * 100).toFixed(1)}%`);
      });
      
      console.log('\n✅ Confidence threshold fix is working! Vulnerabilities are now detected.');
    } else {
      console.log('❌ No vulnerabilities found. Confidence threshold may still be too high.');
      console.log('Full result:', JSON.stringify(fileResult, null, 2));
    }
  } else {
    console.log('❌ No results returned from API');
    console.log('Full response:', JSON.stringify(data, null, 2));
  }

} catch (error) {
  console.error('❌ Error testing staging API:', error.message);
  process.exit(1);
}