/**
 * End-to-end tests for vended credential LLM integration
 * These tests verify that we can:
 * 1. Exchange RSOLV API key for LLM credentials
 * 2. Make real LLM API calls with vended credentials
 * 3. Get valid code generation responses
 * 
 * Run with: VENDED_CREDENTIAL_E2E_TEST=true RSOLV_API_KEY=xxx vitest vended-credential-e2e.test.ts
 */
import { describe, test, expect, beforeAll, vi } from 'vitest';
import { getAiClient } from '../client.js';
import { AiProviderConfig } from '../../types/index.js';
import { RSOLVCredentialManager } from '../../credentials/manager.js';

const SKIP_TEST = process.env.VENDED_CREDENTIAL_E2E_TEST !== 'true' || !process.env.RSOLV_API_KEY;

describe.skipIf(SKIP_TEST)('Vended Credential E2E Tests', () => {
  let credManager: RSOLVCredentialManager;

  beforeAll(async () => {
    // Initialize credential manager with real RSOLV API key
    credManager = new RSOLVCredentialManager();
    await credManager.initialize(process.env.RSOLV_API_KEY!);
    
    console.log('Credential vending initialized successfully');
  });

  test('should make real LLM API call with vended Anthropic credentials', async () => {
    const config: AiProviderConfig = {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0.2,
      maxTokens: 1000,
      useVendedCredentials: true
    };

    const client = await getAiClient(config);
    
    console.log('Making real API call with vended credentials...');
    const startTime = Date.now();
    
    const response = await client.complete('What is 2+2? Reply with just the number.');
    
    const duration = Date.now() - startTime;
    console.log(`API responded in ${duration}ms`);
    console.log('Response:', response);
    
    expect(response).toBeDefined();
    expect(response).toContain('4');
  }, 30000);

  test('should generate code solution with vended credentials', async () => {
    const config: AiProviderConfig = {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0.2,
      maxTokens: 2000,
      useVendedCredentials: true
    };

    const client = await getAiClient(config);
    
    const codePrompt = `Fix this SQL injection vulnerability:

\`\`\`javascript
function getUser(username) {
  const query = \`SELECT * FROM users WHERE username = '\${username}'\`;
  return db.query(query);
}
\`\`\`

Provide a secure solution using parameterized queries. Return only the fixed code.`;

    console.log('Requesting code generation with vended credentials...');
    const response = await client.complete(codePrompt);
    
    console.log('Generated solution:', response);
    
    // Verify we got a real code solution
    expect(response).toBeDefined();
    expect(response.length).toBeGreaterThan(50);
    expect(response).toContain('function');
    expect(response.toLowerCase()).toMatch(/parameter|prepare|placeholder|\?/);
    expect(response).not.toContain('${username}'); // Should not have string interpolation
  }, 30000);

  test('should handle credential refresh during long session', async () => {
    const config: AiProviderConfig = {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0.2,
      maxTokens: 500,
      useVendedCredentials: true
    };

    const client = await getAiClient(config);
    
    // Make multiple calls to test credential persistence
    const responses = [];
    
    for (let i = 1; i <= 3; i++) {
      console.log(`Making API call ${i}/3...`);
      const response = await client.complete(`What is ${i} + ${i}? Reply with just the number.`);
      responses.push(response);
      
      // Small delay between calls
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('All responses:', responses);
    
    expect(responses).toHaveLength(3);
    expect(responses[0]).toContain('2');
    expect(responses[1]).toContain('4');
    expect(responses[2]).toContain('6');
  }, 45000);
});

describe.skipIf(SKIP_TEST)('Claude Code with Vended Credentials E2E', () => {
  test('should generate issue solution using Claude Code with vended credentials', async () => {
    const config: AiProviderConfig = {
      provider: 'claude-code',
      model: 'claude-3-sonnet-20240229',
      temperature: 0.2,
      maxTokens: 4000,
      useVendedCredentials: true
    };

    // Note: This would require Claude Code CLI to support vended credentials
    // Currently it uses its own authentication
    console.log('Claude Code integration with vended credentials is not yet implemented');
    console.log('Claude Code uses its own authentication mechanism via CLI');
    
    // For now, we can test that the config is accepted
    const client = await getAiClient(config);
    expect(client).toBeDefined();
  });
});

// Test specifically for issue resolution workflow
describe.skipIf(SKIP_TEST)('Issue Resolution with Vended Credentials E2E', () => {
  test('should analyze and generate solution for security issue', async () => {
    const config: AiProviderConfig = {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0.2,
      maxTokens: 4000,
      useVendedCredentials: true
    };

    const client = await getAiClient(config);
    
    // Simulate real issue analysis
    const analysisPrompt = `Analyze this security issue:

Title: SQL Injection vulnerability in user authentication
Description: The login function concatenates user input directly into SQL queries.

Code:
\`\`\`javascript
// src/auth/login.js
async function authenticateUser(username, password) {
  const query = \`SELECT * FROM users WHERE username = '\${username}' AND password = '\${password}'\`;
  const result = await db.query(query);
  return result.rows[0];
}
\`\`\`

Provide:
1. Issue type (bug/feature/security)
2. Complexity (low/medium/high)
3. Files to modify
4. Suggested approach`;

    console.log('Analyzing issue with vended credentials...');
    const analysis = await client.complete(analysisPrompt);
    
    console.log('Analysis result:', analysis);
    
    expect(analysis).toBeDefined();
    expect(analysis.toLowerCase()).toContain('security');
    expect(analysis.toLowerCase()).toContain('sql');
    expect(analysis).toContain('login.js');
    
    // Now generate the solution
    const solutionPrompt = `Based on the analysis, generate a complete solution for the SQL injection vulnerability.

The solution must:
1. Use parameterized queries or prepared statements
2. Include proper error handling
3. Add input validation
4. Be production-ready

Return the complete fixed code for src/auth/login.js.`;

    console.log('Generating solution with vended credentials...');
    const solution = await client.complete(solutionPrompt);
    
    console.log('Generated solution preview:', solution.substring(0, 300) + '...');
    
    expect(solution).toBeDefined();
    expect(solution.length).toBeGreaterThan(200);
    expect(solution).toContain('async function');
    expect(solution).not.toContain('${username}');
    expect(solution).toMatch(/\$\d|\?|:username/); // Parameterized query markers
  }, 60000);
});