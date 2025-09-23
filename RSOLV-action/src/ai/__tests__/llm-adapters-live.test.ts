/**
 * Live API tests for all LLM adapters
 * These tests make real API calls to various LLM providers
 * 
 * Run with environment variables:
 * - LIVE_LLM_TESTS=true - Enable live tests
 * - TEST_ANTHROPIC=true - Test Anthropic API
 * - TEST_OPENAI=true - Test OpenAI API  
 * - TEST_OLLAMA=true - Test Ollama (requires local Ollama)
 * - ANTHROPIC_API_KEY=xxx - Your Anthropic API key
 * - OPENAI_API_KEY=xxx - Your OpenAI API key
 */
import { test, expect, describe, vi } from 'vitest';
import { getAiClient } from '../client.js';
import { AiProviderConfig } from '../../types/index.js';

const SKIP_LIVE = process.env.LIVE_LLM_TESTS !== 'true';

// Test prompt that all providers should handle well
const TEST_PROMPT = `Fix this SQL injection vulnerability:

\`\`\`javascript
function getUser(username) {
  const query = \`SELECT * FROM users WHERE username = '\${username}'\`;
  return db.query(query);
}
\`\`\`

Provide a secure solution using parameterized queries.`;

describe.skipIf(SKIP_LIVE)('Live LLM Adapter Tests', () => {
  
  describe.skipIf(!process.env.TEST_ANTHROPIC)('Anthropic Live Tests', () => {
    test('should make real API call to Anthropic', async () => {
      const config: AiProviderConfig = {
        provider: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: 'claude-3-5-sonnet-20241022',
        temperature: 0.2,
        maxTokens: 2000
      };

      const client = await getAiClient(config);
      
      console.log('Making real Anthropic API call...');
      const startTime = Date.now();
      
      const response = await client.complete(TEST_PROMPT, {
        temperature: 0.2,
        maxTokens: 1000
      });
      
      const duration = Date.now() - startTime;
      console.log(`Anthropic API responded in ${duration}ms`);
      console.log('Response preview:', response.substring(0, 200) + '...');
      
      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(50);
      expect(response.toLowerCase()).toContain('parameter');
      expect(response).toContain('?'); // Should have parameterized query placeholder
    }, 30000);

    test('should handle Anthropic with credential vending', async () => {
      if (!process.env.RSOLV_API_KEY) {
        console.log('Skipping credential vending test - no RSOLV_API_KEY');
        return;
      }

      const config: AiProviderConfig = {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        useVendedCredentials: true,
        temperature: 0.2,
        maxTokens: 1000
      };

      // This should use credential vending
      const client = await getAiClient(config);
      
      const response = await client.complete('What is 2+2? Reply with just the number.');
      
      console.log('Vended credential response:', response);
      expect(response).toContain('4');
    }, 20000);
  });

  describe.skipIf(!process.env.TEST_OPENAI)('OpenAI Live Tests', () => {
    test('should make real API call to OpenAI', async () => {
      const config: AiProviderConfig = {
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4-turbo-preview',
        temperature: 0.2,
        maxTokens: 2000
      };

      const client = await getAiClient(config);
      
      console.log('Making real OpenAI API call...');
      const startTime = Date.now();
      
      const response = await client.complete(TEST_PROMPT, {
        temperature: 0.2,
        maxTokens: 1000
      });
      
      const duration = Date.now() - startTime;
      console.log(`OpenAI API responded in ${duration}ms`);
      console.log('Response preview:', response.substring(0, 200) + '...');
      
      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(50);
      expect(response.toLowerCase()).toContain('sql');
    }, 30000);
  });

  describe.skipIf(!process.env.TEST_OLLAMA)('Ollama Live Tests', () => {
    test('should make real API call to local Ollama', async () => {
      const config: AiProviderConfig = {
        provider: 'ollama',
        model: 'deepseek-r1:14b', // Or whatever model you have locally
        baseUrl: 'http://localhost:11434',
        temperature: 0.2,
        maxTokens: 2000
      };

      try {
        const client = await getAiClient(config);
        
        console.log('Making real Ollama API call...');
        const startTime = Date.now();
        
        const response = await client.complete(TEST_PROMPT, {
          temperature: 0.2,
          maxTokens: 1000
        });
        
        const duration = Date.now() - startTime;
        console.log(`Ollama API responded in ${duration}ms`);
        console.log('Response preview:', response.substring(0, 200) + '...');
        
        expect(response).toBeDefined();
        expect(response.length).toBeGreaterThan(50);
      } catch (error) {
        console.log('Ollama test failed - is Ollama running locally?');
        console.log('Start with: ollama serve');
        console.log('Pull model with: ollama pull deepseek-r1:14b');
        throw error;
      }
    }, 60000); // Longer timeout for local models
  });

  // Comparison test across providers
  describe.skipIf(!process.env.TEST_ALL_PROVIDERS)('Provider Comparison', () => {
    test('should compare responses across all available providers', async () => {
      const providers = [];
      
      if (process.env.ANTHROPIC_API_KEY) {
        providers.push({
          name: 'Anthropic',
          config: {
            provider: 'anthropic',
            apiKey: process.env.ANTHROPIC_API_KEY,
            model: 'claude-3-5-sonnet-20241022',
            temperature: 0.2,
            maxTokens: 1000
          } as AiProviderConfig
        });
      }
      
      if (process.env.OPENAI_API_KEY) {
        providers.push({
          name: 'OpenAI',
          config: {
            provider: 'openai',
            apiKey: process.env.OPENAI_API_KEY,
            model: 'gpt-4-turbo-preview',
            temperature: 0.2,
            maxTokens: 1000
          } as AiProviderConfig
        });
      }
      
      if (process.env.TEST_OLLAMA) {
        providers.push({
          name: 'Ollama',
          config: {
            provider: 'ollama',
            model: 'deepseek-r1:14b',
            baseUrl: 'http://localhost:11434',
            temperature: 0.2,
            maxTokens: 1000
          } as AiProviderConfig
        });
      }

      const results = await Promise.all(
        providers.map(async ({ name, config }) => {
          try {
            const client = await getAiClient(config);
            const startTime = Date.now();
            const response = await client.complete(TEST_PROMPT);
            const duration = Date.now() - startTime;
            
            return {
              name,
              success: true,
              duration,
              responseLength: response.length,
              hasParameterizedQuery: response.includes('?'),
              response: response.substring(0, 500) + '...'
            };
          } catch (error) {
            return {
              name,
              success: false,
              error: error.message
            };
          }
        })
      );

      console.log('\n=== Provider Comparison Results ===\n');
      results.forEach(result => {
        console.log(`${result.name}:`);
        if (result.success) {
          console.log(`  ✓ Response time: ${result.duration}ms`);
          console.log(`  ✓ Response length: ${result.responseLength} chars`);
          console.log(`  ✓ Has parameterized query: ${result.hasParameterizedQuery}`);
          console.log(`  Preview: ${result.response.substring(0, 100)}...`);
        } else {
          console.log(`  ✗ Error: ${result.error}`);
        }
        console.log();
      });

      // At least one provider should succeed
      expect(results.some(r => r.success)).toBe(true);
    }, 120000); // 2 minute timeout for all providers
  });
});