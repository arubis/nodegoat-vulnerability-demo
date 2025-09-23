#!/usr/bin/env bun
/**
 * End-to-End test for RSOLV credential vending system
 * 
 * This test verifies that:
 * 1. RSOLV API can exchange API keys for temporary LLM credentials
 * 2. The vended credentials work with the actual LLM APIs
 * 3. The system can perform real AI-powered code analysis and fixes
 * 
 * Run with:
 *   export RSOLV_API_KEY=your_key
 *   bun run e2e-real-vended.ts
 */

// Use global fetch to bypass any mocks
const nodeFetch = globalThis.fetch;

// Force production mode
process.env.NODE_ENV = 'production';
process.env.FORCE_REAL_AI = 'true';
process.env.RSOLV_API_URL = 'https://api.rsolv.dev';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

const RSOLV_API_KEY = process.env.RSOLV_INTERNAL_API_KEY || process.env.RSOLV_API_KEY;
if (!RSOLV_API_KEY) {
  console.error(`${RED}❌ Error: RSOLV_API_KEY must be set${RESET}`);
  process.exit(1);
}

interface VendedCredentials {
  anthropic?: { api_key: string; expires_at: string };
  openai?: { api_key: string; expires_at: string };
  openrouter?: { api_key: string; expires_at: string };
}

async function exchangeCredentials(): Promise<VendedCredentials> {
  console.log(`${YELLOW}Exchanging credentials...${RESET}`);
  
  const response = await fetch('https://api.rsolv.dev/api/v1/credentials/exchange', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: RSOLV_API_KEY,
      providers: ['anthropic', 'openai', 'openrouter'],
      ttl_minutes: 60
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Credential exchange failed (${response.status}): ${JSON.stringify(error)}`);
  }
  
  const data = await response.json();
  console.log(`${GREEN}✓ Got credentials for:${RESET} ${Object.keys(data.credentials).join(', ')}`);
  
  return data.credentials;
}

async function callAnthropicAPI(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      messages: [{
        role: 'user',
        content: prompt
      }],
      max_tokens: 500,
      temperature: 0
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Anthropic API error (${response.status}): ${JSON.stringify(error)}`);
  }
  
  const data = await response.json();
  return data.content[0].text;
}

async function runTest(name: string, fn: () => Promise<void>) {
  console.log(`\n${YELLOW}Test: ${name}${RESET}`);
  try {
    const start = Date.now();
    await fn();
    const duration = Date.now() - start;
    console.log(`${GREEN}✅ PASSED${RESET} (${duration}ms)`);
    return true;
  } catch (error: any) {
    console.error(`${RED}❌ FAILED: ${error.message}${RESET}`);
    return false;
  }
}

async function main() {
  console.log('🧪 Vended Credentials E2E Test');
  console.log('==============================');
  console.log(`API: ${process.env.RSOLV_API_URL}`);
  console.log(`Key: ${RSOLV_API_KEY?.substring(0, 20)}...`);
  
  let credentials: VendedCredentials | null = null;
  const results: boolean[] = [];
  
  // Test 1: Exchange credentials
  results.push(await runTest('Exchange RSOLV API key for LLM credentials', async () => {
    credentials = await exchangeCredentials();
    
    if (!credentials.anthropic?.api_key.startsWith('sk-ant-')) {
      throw new Error('Invalid Anthropic credential format');
    }
    
    console.log(`  Anthropic key: ${credentials.anthropic.api_key.substring(0, 25)}...`);
    console.log(`  Expires: ${credentials.anthropic.expires_at}`);
  }));
  
  if (!credentials) {
    console.error('Cannot continue without credentials');
    process.exit(1);
  }
  
  // Test 2: Simple API call
  results.push(await runTest('Simple math question', async () => {
    const response = await callAnthropicAPI(
      credentials!.anthropic!.api_key,
      'What is 2+2? Reply with just the number.'
    );
    
    console.log(`  Response: "${response.trim()}"`);
    
    if (!response.includes('4')) {
      throw new Error(`Expected "4", got: ${response}`);
    }
  }));
  
  // Test 3: Code generation
  results.push(await runTest('Generate JavaScript code', async () => {
    const response = await callAnthropicAPI(
      credentials!.anthropic!.api_key,
      'Write a JavaScript function to escape HTML. Return only the code, no explanation.'
    );
    
    console.log(`  Generated ${response.length} chars`);
    console.log(`  Preview: ${response.substring(0, 60).replace(/\n/g, ' ')}...`);
    
    if (!response.match(/function|const|=>/)) {
      throw new Error('No valid JS code generated');
    }
  }));
  
  // Test 4: Security analysis
  results.push(await runTest('Identify SQL injection', async () => {
    const code = `
app.get('/user/:id', (req, res) => {
  db.query('SELECT * FROM users WHERE id = ' + req.params.id, (err, result) => {
    res.json(result);
  });
});`;
    
    const response = await callAnthropicAPI(
      credentials!.anthropic!.api_key,
      `What security vulnerability exists in this code? Reply with just the vulnerability name.\n\`\`\`javascript\n${code}\n\`\`\``
    );
    
    console.log(`  Identified: ${response.trim()}`);
    
    const normalized = response.toLowerCase();
    if (!normalized.includes('sql') || !normalized.includes('injection')) {
      throw new Error('Failed to identify SQL injection');
    }
  }));
  
  // Test 5: Generate security fix
  results.push(await runTest('Generate secure fix', async () => {
    const response = await callAnthropicAPI(
      credentials!.anthropic!.api_key,
      `Fix this SQL injection vulnerability. Return only the fixed code.
\`\`\`javascript
db.query('SELECT * FROM users WHERE id = ' + req.params.id, callback);
\`\`\``
    );
    
    console.log(`  Fixed code length: ${response.length} chars`);
    
    // Check for parameterized query indicators
    if (!response.match(/\?|\$\d|:\w+/)) {
      throw new Error('Fix does not use parameterized queries');
    }
    
    if (response.includes('+ req.params.id')) {
      throw new Error('Fix still contains concatenation');
    }
    
    console.log('  ✓ Uses parameterized queries');
    console.log('  ✓ No string concatenation');
  }));
  
  // Summary
  console.log('\n==============================');
  console.log('📊 Results Summary');
  console.log('==============================');
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`Total: ${total} tests`);
  console.log(`${GREEN}Passed: ${passed}${RESET}`);
  console.log(`${RED}Failed: ${total - passed}${RESET}`);
  
  if (passed === total) {
    console.log(`\n${GREEN}🎉 SUCCESS! All tests passed.${RESET}`);
    console.log('\nProven capabilities:');
    console.log('✅ RSOLV API exchanges keys for LLM credentials');
    console.log('✅ Vended Anthropic credentials work with Claude API');
    console.log('✅ Can generate code and analyze security issues');
    console.log('✅ End-to-end flow works without direct API keys');
    process.exit(0);
  } else {
    console.log(`\n${RED}⚠️  Some tests failed${RESET}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error(`${RED}Fatal error:${RESET}`, error);
  process.exit(1);
});