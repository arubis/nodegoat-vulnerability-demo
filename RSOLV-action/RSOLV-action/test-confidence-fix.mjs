import fetch from 'node-fetch';

const API_URL = 'https://staging.api.rsolv.dev';

// Simple eval vulnerability
const testCode = `
function dangerousEval(userInput) {
  eval(userInput);
}

// Also test hardcoded secret
const API_KEY = "sk-1234567890abcdef";
`;

async function testValidation() {
  console.log('Testing confidence scoring fix on staging...\n');
  
  const response = await fetch(`${API_URL}/api/v1/ast/validate`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      vulnerabilities: [
        {
          type: 'code_injection',
          pattern: 'eval()',
          file: 'test.js',
          line: 3,
          code: 'eval(userInput);',
          confidence: 0.9,
          context: {
            function_name: 'eval',
            pattern_type: 'code_injection'
          }
        },
        {
          type: 'hardcoded_secret',
          pattern: 'hardcoded credential',
          file: 'test.js', 
          line: 7,
          code: 'const API_KEY = "sk-1234567890abcdef";',
          confidence: 0.85,
          context: {
            pattern_type: 'hardcoded_secret'
          }
        }
      ],
      file_path: 'test.js',
      file_content: Buffer.from(testCode).toString('base64'),
      language: 'javascript'
    })
  });

  const result = await response.json();
  
  console.log('Response:', JSON.stringify(result, null, 2));
  
  // Check if vulnerabilities are now detected with proper confidence
  const validated = result.validated || [];
  const evalVuln = validated.find(v => v.type === 'code_injection');
  const secretVuln = validated.find(v => v.type === 'hardcoded_secret');
  
  console.log('\nResults:');
  console.log(`✓ Total vulnerabilities sent: 2`);
  console.log(`✓ Validated vulnerabilities: ${validated.length}`);
  
  if (evalVuln) {
    console.log(`✅ eval() detected with confidence: ${evalVuln.confidence || 'unknown'}`);
  } else {
    console.log(`❌ eval() not detected (should be detected with high confidence)`);
  }
  
  if (secretVuln) {
    console.log(`✅ Hardcoded secret detected with confidence: ${secretVuln.confidence || 'unknown'}`);
  } else {
    console.log(`❌ Hardcoded secret not detected (should be detected)`);
  }
  
  return validated.length === 2;
}

testValidation()
  .then(success => {
    if (success) {
      console.log('\n🎉 Confidence scoring fix successful! Both vulnerabilities detected.');
      process.exit(0);
    } else {
      console.log('\n⚠️ Some vulnerabilities still not detected. Check the confidence scores.');
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
