import { describe, test, expect, beforeEach, afterEach, mock, vi } from 'vitest';
import { PatternAPIClient } from './pattern-api-client.js';
import { VulnerabilityType } from './types.js';
import { getTestApiConfig } from '../../test/test-env-config.js';

describe('PatternAPIClient', () => {
  let client: PatternAPIClient;
  let originalApiUrl: string | undefined;
  let originalApiKey: string | undefined;
  let fetchMock: any;
  
  beforeEach(() => {
    // Create a fresh mock for fetch
    fetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({})
    }));
    global.fetch = fetchMock;
    
    // Save and clear environment variables
    originalApiUrl = process.env.RSOLV_API_URL;
    originalApiKey = process.env.RSOLV_API_KEY;
    delete process.env.RSOLV_API_URL;
    delete process.env.RSOLV_API_KEY;
  });

  afterEach(() => {
    // Restore environment variables
    if (originalApiUrl !== undefined) {
      process.env.RSOLV_API_URL = originalApiUrl;
    }
    if (originalApiKey !== undefined) {
      process.env.RSOLV_API_KEY = originalApiKey;
    }
  });

  describe('constructor', () => {
    test('should use default API URL if not provided', () => {
      client = new PatternAPIClient();
      expect(client).toBeDefined();
    });

    test('should use provided API URL', () => {
      client = new PatternAPIClient({ apiUrl: 'https://custom.api/patterns' });
      expect(client).toBeDefined();
    });

    test('should use API key from config', () => {
      client = new PatternAPIClient({ apiKey: 'test-key' });
      expect(client).toBeDefined();
    });

    test('should use API key from environment if not in config', () => {
      process.env.RSOLV_API_KEY = 'env-key';
      client = new PatternAPIClient();
      expect(client).toBeDefined();
    });
  });

  describe('fetchPatterns', () => {
    const testConfig = getTestApiConfig();
    
    beforeEach(() => {
      client = new PatternAPIClient({ 
        apiUrl: testConfig.apiUrl,
        apiKey: testConfig.apiKey || 'test-key' 
      });
    });

    test('should fetch patterns for a language', async () => {
      const mockResponse = {
        count: 2,
        language: 'javascript',
        accessible_tiers: ['public', 'protected'],
        patterns: [
          {
            id: 'js-sql-injection',
            name: 'SQL Injection',
            type: 'sql_injection',
            description: 'SQL injection vulnerability',
            severity: 'critical',
            patterns: ['SELECT.*\\+', 'INSERT.*\\+'],
            languages: ['javascript'],
            frameworks: [],
            recommendation: 'Use parameterized queries',
            cwe_id: 'CWE-89',
            owasp_category: 'A03:2021',
            test_cases: {
              vulnerable: ['query = "SELECT * FROM users WHERE id = " + userId'],
              safe: ['query = "SELECT * FROM users WHERE id = ?"']
            }
          }
        ]
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      });

      const patterns = await client.fetchPatterns('javascript');

      // Check that fetch was called
      expect(fetchMock).toHaveBeenCalledTimes(1);
      
      // Get the actual call arguments
      const [url, options] = fetchMock.mock.calls[0];
      const expectedBaseUrl = testConfig.apiUrl.includes('/api/v1/patterns') 
        ? testConfig.apiUrl 
        : `${testConfig.apiUrl}/api/v1/patterns`;
      expect(url).toBe(`${expectedBaseUrl}?language=javascript&format=enhanced`);
      expect(options.headers['Content-Type']).toBe('application/json');
      const expectedAuth = testConfig.apiKey || 'test-key';
      expect(options.headers['Authorization']).toBe(`Bearer ${expectedAuth}`);

      expect(patterns).toHaveLength(1);
      expect(patterns[0].id).toBe('js-sql-injection');
      expect(patterns[0].type).toBe(VulnerabilityType.SQL_INJECTION);
      expect(patterns[0].patterns.regex).toHaveLength(2);
      expect(patterns[0].patterns.regex[0]).toBeInstanceOf(RegExp);
    });

    test('should handle API errors gracefully', async () => {
      // Disable fallback for this test
      client = new PatternAPIClient({ apiKey: 'test-key', fallbackToLocal: false });
      
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(client.fetchPatterns('javascript')).rejects.toThrow(
        'Failed to fetch patterns: 500 Internal Server Error'
      );
    });

    test('should use cached patterns within TTL', async () => {
      const mockResponse = {
        count: 1,
        language: 'python',
        patterns: [
          {
            id: 'python-eval',
            name: 'Eval Usage',
            type: 'rce',
            description: 'Eval can execute arbitrary code',
            severity: 'critical',
            patterns: ['eval\\('],
            languages: ['python'],
            recommendation: 'Avoid eval',
            cwe_id: 'CWE-94',
            owasp_category: 'A03:2021',
            test_cases: { vulnerable: [], safe: [] }
          }
        ]
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      // First call - should fetch
      await client.fetchPatterns('python');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      await client.fetchPatterns('python');
      expect(fetchMock).toHaveBeenCalledTimes(1); // Still only 1 call
    });

    test('should handle patterns without API key (public only)', async () => {
      client = new PatternAPIClient({ fallbackToLocal: false });
      
      const mockResponse = {
        count: 1,
        language: 'javascript',
        patterns: [
          {
            id: 'js-eval',
            name: 'Eval Usage',
            type: 'rce',
            description: 'Eval can execute arbitrary code',
            severity: 'critical',
            patterns: ['eval\\('],
            languages: ['javascript'],
            recommendation: 'Avoid eval',
            cwe_id: 'CWE-94',
            owasp_category: 'A03:2021',
            test_cases: { vulnerable: [], safe: [] }
          }
        ]
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const patterns = await client.fetchPatterns('javascript');
      
      // Should not send Authorization header
      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers['Authorization']).toBeUndefined();
      
      expect(patterns).toHaveLength(1);
    });
  });

  describe('PatternAPIClient enhanced patterns', () => {
    test('should handle enhanced patterns with AST rules', async () => {
      client = new PatternAPIClient({ apiKey: 'test-key' });
      
      const mockResponse = {
        count: 1,
        language: 'javascript',
        patterns: [
          {
            id: 'js-xss-innerhtml',
            name: 'XSS via innerHTML',
            type: 'xss',
            description: 'XSS vulnerability via innerHTML',
            severity: 'high',
            patterns: ['innerHTML.*='],
            languages: ['javascript'],
            recommendation: 'Use textContent instead',
            cwe_id: 'CWE-79',
            owasp_category: 'A03:2021',
            test_cases: { vulnerable: [], safe: [] },
            // Enhanced pattern fields
            ast_rules: [
              {
                type: 'AssignmentExpression',
                pattern: {
                  left: {
                    type: 'MemberExpression',
                    property: { name: 'innerHTML' }
                  }
                }
              }
            ],
            context_rules: [
              {
                type: 'taint_tracking',
                source: 'user_input',
                sink: 'innerHTML'
              }
            ],
            confidence_rules: {
              high: ['Direct user input to innerHTML'],
              medium: ['Indirect flow to innerHTML'],
              low: ['Complex data flow']
            }
          }
        ]
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const patterns = await client.fetchPatterns('javascript');
      
      expect(patterns).toHaveLength(1);
      expect(patterns[0].patterns.ast).toBeDefined();
      expect(patterns[0].patterns.ast).toHaveLength(1);
      expect(patterns[0].contextRules).toBeDefined();
      expect(patterns[0].confidenceRules).toBeDefined();
    });

    test('should handle patterns without enhanced features', async () => {
      client = new PatternAPIClient({ apiKey: 'test-key' });
      
      const mockResponse = {
        count: 1,
        language: 'python',
        patterns: [
          {
            id: 'python-sql-injection',
            name: 'SQL Injection',
            type: 'sql_injection',
            description: 'SQL injection vulnerability',
            severity: 'critical',
            patterns: ['query.*\\+.*%'],
            languages: ['python'],
            recommendation: 'Use parameterized queries',
            cwe_id: 'CWE-89',
            owasp_category: 'A03:2021',
            test_cases: { vulnerable: [], safe: [] }
            // No enhanced pattern fields
          }
        ]
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const patterns = await client.fetchPatterns('python');
      
      expect(patterns).toHaveLength(1);
      expect(patterns[0].patterns.ast).toBeUndefined();
      expect(patterns[0].patterns.context).toBeUndefined();
      expect(patterns[0].confidence).toBeUndefined();
    });
  });
});