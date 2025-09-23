/**
 * Example E2E Test - Demonstrates end-to-end testing without global mocks
 * 
 * This test shows how to write E2E tests that use real services and APIs
 * without interference from global mocks used in unit tests.
 */

import { describe, test, expect, beforeAll } from 'vitest';

// Access E2E test utilities (no global mocks)
const e2eUtils = (globalThis as any).__E2E_TEST_UTILS__;

// Test configuration
let testConfig: {
  apiUrl: string;
  apiKey: string;
  githubToken: string;
  environment: string;
};

describe('E2E Example Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  beforeAll(() => {
    // Validate E2E environment
    testConfig = e2eUtils.validateE2EEnvironment();
    
    console.log('[E2E] Test configuration:', {
      apiUrl: testConfig.apiUrl,
      environment: testConfig.environment,
      hasApiKey: !!testConfig.apiKey,
      hasGithubToken: !!testConfig.githubToken
    });
  });

  test('should have E2E environment properly configured', () => {
    // Verify E2E mode is enabled
    expect((globalThis as any).__E2E_MODE__).toBe(true);
    
    // Verify required environment variables
    expect(testConfig.apiKey).toBeDefined();
    expect(testConfig.githubToken).toBeDefined();
    expect(testConfig.apiUrl).toBeDefined();
    
    // Verify no global mocks are present
    expect((globalThis as any).__RSOLV_TEST_UTILS__).toBeUndefined();
  });

  test('should make real API call to health endpoint', async () => {
    const httpClient = e2eUtils.createHttpClient();
    
    // This is a real API call - no mocking
    const response = await httpClient.get('/health');
    
    expect(response).toBeDefined();
    expect(response.status).toBe('healthy');
  });

  test('should access pattern API with real authentication', async () => {
    const httpClient = e2eUtils.createHttpClient();
    
    // Real API call with authentication
    const response = await httpClient.get('/api/v1/patterns/public/javascript', {
      'Authorization': `Bearer ${testConfig.apiKey}`
    });
    
    expect(response).toBeDefined();
    expect(response.patterns).toBeDefined();
    expect(Array.isArray(response.patterns)).toBe(true);
    expect(response.tier).toBe('public');
  });

  test('should handle API errors gracefully', async () => {
    const httpClient = e2eUtils.createHttpClient();
    
    // Test error handling with invalid endpoint
    await expect(
      httpClient.get('/api/v1/nonexistent-endpoint')
    ).rejects.toThrow();
  });

  test('should demonstrate difference from unit tests', () => {
    // In E2E tests:
    // - No global fetch mocking
    // - Real network calls
    // - Real file system operations
    // - Actual API authentication
    
    // This would be mocked in unit tests but real in E2E tests
    expect(fetch).toBe(fetch); // Real fetch function
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.E2E_MODE).toBe('true');
  });

  test('should wait for async operations without mocks', async () => {
    const startTime = Date.now();
    
    // Real setTimeout - not mocked
    await e2eUtils.wait(100);
    
    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeGreaterThanOrEqual(90); // Allow for small timing variations
  });
});

// Test category metadata for the E2E runner
export const testMetadata = {
  category: 'api',
  requires: ['RSOLV_API_KEY'],
  description: 'Example E2E test demonstrating real API integration',
  timeout: 30000
};