/**
 * Unified test environment configuration for API tests
 * 
 * Usage:
 *   import { getTestApiConfig } from '../test/test-env-config';
 *   const config = getTestApiConfig();
 * 
 * Environment variables (in order of precedence):
 *   1. TEST_API_URL - Override API URL (e.g., 'http://localhost:4000' for local)
 *   2. TEST_API_KEY - API key for testing
 *   3. TEST_ENV - 'local' | 'staging' | 'production' (default: 'staging')
 */

export interface TestApiConfig {
  apiUrl: string;
  apiKey: string;
  environment: 'local' | 'staging' | 'production';
  skipLiveTests: boolean;
  timeout: number;
}

export function getTestApiConfig(): TestApiConfig {
  const env = process.env.TEST_ENV || 'staging';
  
  // Get API key from environment - RSOLV_TEST_API_KEY takes precedence
  const apiKey = process.env.RSOLV_TEST_API_KEY || process.env.RSOLV_API_KEY;
  
  // Fail loudly if no API key is provided (unless explicitly skipping live tests)
  if (!apiKey && process.env.SKIP_LIVE_TESTS !== 'true') {
    const errorMsg = `
🔴 MISSING API KEY ERROR 🔴
============================
No API key found in environment!

Please set one of the following environment variables:
  - RSOLV_TEST_API_KEY (preferred for tests)
  - RSOLV_API_KEY

Example:
  export RSOLV_TEST_API_KEY="your-staging-api-key"
  
Or to skip live API tests:
  export SKIP_LIVE_TESTS=true

Current environment:
  TEST_ENV: ${env}
  RSOLV_TEST_API_KEY: ${process.env.RSOLV_TEST_API_KEY ? '[SET]' : '[NOT SET]'}
  RSOLV_API_KEY: ${process.env.RSOLV_API_KEY ? '[SET]' : '[NOT SET]'}
============================
`;
    console.error(errorMsg);
    throw new Error('API key required but not found in environment');
  }
  
  // Allow explicit URL override
  if (process.env.TEST_API_URL) {
    return {
      apiUrl: process.env.TEST_API_URL,
      apiKey: apiKey || '',
      environment: env as any,
      skipLiveTests: process.env.SKIP_LIVE_TESTS === 'true' || !apiKey,
      timeout: parseInt(process.env.TEST_TIMEOUT || '30000')
    };
  }
  
  // Default configurations by environment
  const configs = {
    local: {
      apiUrl: 'http://localhost:4000',
      apiKey: apiKey || '',
      environment: 'local' as const,
      skipLiveTests: !apiKey,
      timeout: 30000
    },
    staging: {
      apiUrl: 'https://api.rsolv-staging.com',
      apiKey: apiKey || '',
      environment: 'staging' as const,
      skipLiveTests: !apiKey,
      timeout: 30000
    },
    production: {
      apiUrl: 'https://api.rsolv.dev',
      apiKey: apiKey || '',
      environment: 'production' as const,
      skipLiveTests: !apiKey,
      timeout: 30000
    }
  };
  
  const config = configs[env as keyof typeof configs] || configs.staging;
  
  // Override with environment variables if set
  if (process.env.SKIP_LIVE_TESTS === 'true') {
    config.skipLiveTests = true;
  }
  
  return config;
}

/**
 * Check if API is available for testing
 */
export async function checkApiAvailability(config: TestApiConfig): Promise<boolean> {
  if (config.skipLiveTests) {
    return false;
  }
  
  if (!config.apiKey) {
    console.warn(`⚠️ No API key configured for ${config.environment} environment`);
    return false;
  }
  
  try {
    const healthUrl = `${config.apiUrl}/health`;
    const response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch (error) {
    console.warn(`⚠️ API not available at ${config.apiUrl}: ${error}`);
    return false;
  }
}

/**
 * Log test configuration (masks API key)
 */
export function logTestConfig(config: TestApiConfig): void {
  console.log('Test API Configuration:');
  console.log(`  Environment: ${config.environment}`);
  console.log(`  API URL: ${config.apiUrl}`);
  console.log(`  API Key: ${config.apiKey ? '***' + config.apiKey.slice(-4) : 'NOT SET'}`);
  console.log(`  Skip Live Tests: ${config.skipLiveTests}`);
  console.log(`  Timeout: ${config.timeout}ms`);
}