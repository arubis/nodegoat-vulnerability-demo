import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { getAiClient } from '../client';
import { AiProviderConfig } from '../../types';
import { setupFetchMock } from '../../../test-helpers/simple-mocks';

// Mock the credential manager module
const mockGetCredential = vi.fn(() => 'temp_credential_xyz');
const mockReportUsage = vi.fn(() => Promise.resolve());
const mockInitialize = vi.fn(() => Promise.resolve());

vi.mock('../../credentials/manager', () => ({
  RSOLVCredentialManager: class {
    initialize = mockInitialize;
    getCredential = mockGetCredential;
    reportUsage = mockReportUsage;
  }
}));

// Store originals
const originalFetch = global.fetch;
const originalEnv = { ...process.env };

// Setup for each test
let fetchMock: ReturnType<typeof setupFetchMock>;

beforeEach(() => {
  // Reset environment
  process.env = { 
    ...originalEnv,
    RSOLV_API_KEY: 'test-rsolv-api-key',
    NODE_ENV: 'production' // Avoid test mode fallbacks
  };
  // Reset mocks
  mockGetCredential.mockClear();
  mockReportUsage.mockClear();
  mockInitialize.mockClear();
  vi.clearAllMocks();
  // Setup fetch mock
  fetchMock = setupFetchMock();
});

afterEach(() => {
  // Restore environment
  process.env = originalEnv;
  // Restore fetch
  global.fetch = originalFetch;
  // Clear mocks
  vi.clearAllMocks();
});

// Test the credential vending system integration with AI clients
describe('AI Client with Credential Vending', () => {
  test('should use vended credentials for Anthropic API calls', async () => {
    // Update mock to return Anthropic-specific credential
    mockGetCredential.mockReturnValue('temp_ant_xyz789');

    // Mock AI API response
    const mockAIResponse = {
      content: [{
        text: 'This is a test response from Claude'
      }],
      usage: {
        total_tokens: 1500
      }
    };

    fetchMock.mockImplementationOnce(() => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => mockAIResponse,
      text: async () => JSON.stringify(mockAIResponse)
    } as Response));

    // Set RSOLV API key
    process.env.RSOLV_API_KEY = 'rsolv_test_key';

    // Create AI client with vended credentials
    const config: AiProviderConfig = {
      provider: 'anthropic',
      model: 'claude-3-sonnet-20240229',
      temperature: 0.2,
      maxTokens: 2000,
      useVendedCredentials: true
    };

    const client = await getAiClient(config);
    const response = await client.complete('Test prompt');

    // Verify credential was retrieved
    expect(mockGetCredential).toHaveBeenCalledWith('anthropic');

    // Verify API was called with vended credential
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-API-Key': 'temp_ant_xyz789'
        })
      })
    );

    // Verify usage was reported
    expect(mockReportUsage).toHaveBeenCalledWith('anthropic', {
      tokensUsed: 1500,
      requestCount: 1
    });

    expect(response).toBe('This is a test response from Claude');
  });

  test('should use vended credentials for OpenAI API calls', async () => {
    // Update mock to return OpenAI-specific credential
    mockGetCredential.mockReturnValue('temp_oai_def456');

    const mockAIResponse = {
      choices: [{
        message: {
          content: 'This is a test response from GPT-4'
        }
      }],
      usage: {
        total_tokens: 2000
      }
    };

    fetchMock.mockImplementationOnce(() => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => mockAIResponse,
      text: async () => JSON.stringify(mockAIResponse)
    } as Response));

    const config: AiProviderConfig = {
      provider: 'openai',
      model: 'gpt-4',
      temperature: 0.2,
      maxTokens: 2000,
      useVendedCredentials: true
    };

    const client = await getAiClient(config);
    const response = await client.complete('Test prompt');

    expect(mockGetCredential).toHaveBeenCalledWith('openai');
    
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer temp_oai_def456'
        })
      })
    );

    expect(response).toBe('This is a test response from GPT-4');
  });

  test('should handle credential refresh during long-running tasks', async () => {
    let callCount = 0;
    mockGetCredential.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? 'temp_ant_xyz789' : 'temp_ant_new123';
    });

    const mockAIResponse = {
      content: [{
        text: 'Response with refreshed credential'
      }],
      usage: {
        total_tokens: 1000
      }
    };

    fetchMock.mockImplementationOnce(() => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => mockAIResponse,
      text: async () => JSON.stringify(mockAIResponse)
    } as Response));

    const config: AiProviderConfig = {
      provider: 'anthropic',
      model: 'claude-3-sonnet-20240229',
      useVendedCredentials: true
    };

    const client = await getAiClient(config);
    
    // Simulate multiple API calls over time
    await client.complete('First prompt');
    await client.complete('Second prompt');

    // Verify both credentials were used
    expect(mockGetCredential).toHaveBeenCalledTimes(2);
    
    // The second API call should use the refreshed credential
    const calls = fetchMock.mock.calls;
    expect(calls[1][1].headers['X-API-Key']).toBe('temp_ant_new123');
  });

  test('should fallback to direct API key if vending is disabled', async () => {
    const mockAIResponse = {
      content: [{
        text: 'Response with direct API key'
      }]
    };

    fetchMock.mockImplementationOnce(() => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => mockAIResponse,
      text: async () => JSON.stringify(mockAIResponse)
    } as Response));

    const config: AiProviderConfig = {
      provider: 'anthropic',
      apiKey: 'direct_ant_key_123',
      model: 'claude-3-sonnet-20240229',
      useVendedCredentials: false
    };

    const client = await getAiClient(config);
    await client.complete('Test prompt');

    // Should use direct API key
    expect(fetchMock.mock.calls.length).toBe(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
    expect(fetchMock.mock.calls[0][1].headers['X-API-Key']).toBe('direct_ant_key_123');
  });

  test('should handle vended credential errors gracefully', async () => {
    mockGetCredential.mockImplementation(() => {
      throw new Error('No valid credential for anthropic');
    });
    
    const config: AiProviderConfig = {
      provider: 'anthropic',
      model: 'claude-3-sonnet-20240229',
      useVendedCredentials: true
    };

    const client = await getAiClient(config);
    
    await expect(client.complete('Test prompt')).rejects.toThrow(
      'Failed to retrieve API key'
    );
  });
});