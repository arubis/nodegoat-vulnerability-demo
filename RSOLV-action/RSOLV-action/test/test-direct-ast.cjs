const crypto = require('crypto');

// Generate encryption key
const encryptionKey = crypto.randomBytes(32);

// Python code to test
const pythonCode = `import os
def run(user_input):
    os.system("echo " + user_input)
`;

// Encrypt the content
function encrypt(text, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(text, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64')
  };
}

const encrypted = encrypt(pythonCode, encryptionKey);

const request = {
  requestId: 'test-' + Date.now(),
  files: [{
    path: 'test.py',
    encryptedContent: encrypted.encrypted,
    encryption: {
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      algorithm: 'aes-256-gcm'
    },
    metadata: {
      language: 'python',
      size: Buffer.byteLength(pythonCode),
      contentHash: crypto.createHash('sha256').update(pythonCode).digest('hex')
    }
  }],
  options: {
    patternFormat: 'enhanced',
    includeSecurityPatterns: true
  }
};

console.log('Request:', JSON.stringify(request, null, 2));
console.log('\nEncryption Key (base64):', encryptionKey.toString('base64'));

// Make the request
fetch('http://localhost:4002/api/v1/ast/analyze', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'rsolv_test_suite_key',
    'X-Encryption-Key': encryptionKey.toString('base64')
  },
  body: JSON.stringify(request)
})
.then(res => res.json())
.then(data => {
  console.log('\nResponse:', JSON.stringify(data, null, 2));
})
.catch(err => {
  console.error('Error:', err);
});