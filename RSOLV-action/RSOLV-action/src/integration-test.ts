#!/usr/bin/env bun
/**
 * Integration test for Credential Vending Service
 * Demonstrates the full flow from API key to AI call
 */

import { getAiClient } from './ai/client.js';
import { RSOLVCredentialManager } from './credentials/manager.js';
import { AiProviderConfig } from './types/index.js';

// Mock server to simulate RSOLV API
// @ts-ignore - Bun types
import { serve } from 'bun';

const mockApiServer = serve({
  port: 4001,
  fetch(req: any) {
    const url = new URL(req.url);
    
    if (url.pathname === '/v1/credentials/exchange' && req.method === 'POST') {
      return new Response(JSON.stringify({
        credentials: {
          anthropic: {
            api_key: 'temp_ant_mock123',
            expires_at: new Date(Date.now() + 3600000).toISOString()
          },
          openai: {
            api_key: 'temp_oai_mock456',
            expires_at: new Date(Date.now() + 3600000).toISOString()
          }
        },
        usage: {
          remaining_fixes: 85,
          reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (url.pathname === '/v1/usage/report' && req.method === 'POST') {
      return new Response(JSON.stringify({ status: 'recorded' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Not Found', { status: 404 });
  }
});

async function runIntegrationTest() {
  console.log('=== RSOLV Credential Vending Integration Test ===\n');
  
  try {
    // Set up environment
    process.env.RSOLV_API_KEY = 'rsolv_test_abc123';
    process.env.RSOLV_API_URL = 'http://localhost:4001';
    process.env.NODE_ENV = 'development'; // Allow mock AI responses
    
    console.log('1. Testing credential exchange...');
    
    // Create and initialize credential manager
    const credentialManager = new RSOLVCredentialManager();
    await credentialManager.initialize(process.env.RSOLV_API_KEY);
    
    console.log('✅ Credentials exchanged successfully\n');
    
    console.log('2. Testing AI client with vended credentials...');
    
    // Configure AI client to use vended credentials
    const config: AiProviderConfig = {
      provider: 'anthropic',
      model: 'claude-3-sonnet-20240229',
      temperature: 0.2,
      maxTokens: 2000,
      useVendedCredentials: true
    };
    
    // Get AI client (will use existing credential manager)
    const client = await getAiClient(config);
    
    console.log('✅ AI client created with vended credentials\n');
    
    console.log('3. Testing AI completion...');
    
    // Make an AI call (will use mock response in dev mode)
    const response = await client.complete('Test prompt for integration');
    
    console.log('✅ AI completion successful\n');
    console.log('Response:', response.substring(0, 100) + '...\n');
    
    console.log('4. Testing credential retrieval...');
    
    // Test direct credential retrieval
    const anthropicKey = credentialManager.getCredential('anthropic');
    const openaiKey = credentialManager.getCredential('openai');
    
    console.log('✅ Retrieved credentials:');
    console.log(`  - AI Provider 1: ${anthropicKey}`);
    console.log(`  - AI Provider 2: ${openaiKey}\n`);
    
    console.log('5. Testing usage reporting...');
    
    // Report usage
    await credentialManager.reportUsage('anthropic', {
      tokensUsed: 1500,
      requestCount: 1
    });
    
    console.log('✅ Usage reported successfully\n');
    
    console.log('6. Cleanup...');
    
    credentialManager.cleanup();
    
    console.log('✅ Cleanup completed\n');
    
    console.log('=== INTEGRATION TEST COMPLETED SUCCESSFULLY ===');
    
  } catch (error) {
    console.error('❌ Integration test failed:', error);
    process.exit(1);
  } finally {
    // Stop mock server
    mockApiServer.stop();
  }
}

// Run the test
console.log('Starting mock RSOLV API server on port 4001...\n');
runIntegrationTest();