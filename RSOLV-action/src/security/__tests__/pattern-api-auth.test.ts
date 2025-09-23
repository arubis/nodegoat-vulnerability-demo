import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PatternAPIClient } from '../pattern-api-client';

// Mock fetch globally
global.fetch = vi.fn();

describe('PatternAPIClient Authentication', () => {
  let client: PatternAPIClient;
  const mockApiKey = 'test_api_key_123';
  const mockApiUrl = 'https://api.rsolv.dev';

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fetch mock
    (global.fetch as any).mockReset();
  });

  describe('x-api-key header usage', () => {
    it('should use x-api-key header for pattern fetching', async () => {
      client = new PatternAPIClient({
        apiKey: mockApiKey,
        apiUrl: mockApiUrl
      });

      // Mock successful response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          patterns: [],
          metadata: { count: 0 }
        })
      });

      await client.fetchPatterns('javascript');

      // Verify fetch was called with correct headers
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/patterns'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': mockApiKey,
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should NOT use Authorization Bearer header', async () => {
      client = new PatternAPIClient({
        apiKey: mockApiKey,
        apiUrl: mockApiUrl
      });

      // Mock successful response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          patterns: [],
          metadata: { count: 0 }
        })
      });

      await client.fetchPatterns('javascript');

      // Verify fetch was NOT called with Authorization header
      const callArgs = (global.fetch as any).mock.calls[0];
      const headers = callArgs[1].headers;
      expect(headers).not.toHaveProperty('Authorization');
      expect(headers).not.toHaveProperty('authorization');
    });

    it('should use query parameter for language', async () => {
      client = new PatternAPIClient({
        apiKey: mockApiKey,
        apiUrl: mockApiUrl
      });

      // Mock successful response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          patterns: [],
          metadata: { count: 0 }
        })
      });

      await client.fetchPatterns('python');

      // Verify correct URL format with query parameter
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/v1\/patterns\?language=python/),
        expect.any(Object)
      );
    });

    it('should handle API key from environment variable', async () => {
      // Set environment variable
      process.env.RSOLV_API_KEY = 'env_api_key';

      client = new PatternAPIClient({
        apiUrl: mockApiUrl
      });

      // Mock successful response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          patterns: [],
          metadata: { count: 0 }
        })
      });

      await client.fetchPatterns('javascript');

      // Verify environment API key was used
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'env_api_key'
          })
        })
      );

      // Clean up
      delete process.env.RSOLV_API_KEY;
    });

    it('should handle missing API key gracefully', async () => {
      client = new PatternAPIClient({
        apiUrl: mockApiUrl
        // No API key provided
      });

      // Mock successful response (demo patterns)
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          patterns: [],
          metadata: { count: 0, access_level: 'demo' }
        })
      });

      await client.fetchPatterns('javascript');

      // Verify fetch was called without x-api-key header
      const callArgs = (global.fetch as any).mock.calls[0];
      const headers = callArgs[1].headers;
      expect(headers).not.toHaveProperty('x-api-key');
    });

    it('should handle 401 unauthorized response', async () => {
      client = new PatternAPIClient({
        apiKey: 'invalid_key',
        apiUrl: mockApiUrl,
        fallbackToLocal: false
      });

      // Mock 401 response
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      });

      // Should throw error when fallback is disabled
      await expect(client.fetchPatterns('javascript')).rejects.toThrow('401 Unauthorized');
    });

    it('should use consistent authentication across all endpoints', async () => {
      client = new PatternAPIClient({
        apiKey: mockApiKey,
        apiUrl: mockApiUrl
      });

      // Mock multiple responses
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          patterns: [],
          metadata: { count: 0 }
        })
      });

      // Test multiple languages
      await client.fetchPatterns('javascript');
      await client.fetchPatterns('python');
      await client.fetchPatterns('ruby');

      // All calls should use x-api-key
      const calls = (global.fetch as any).mock.calls;
      expect(calls).toHaveLength(3);

      calls.forEach((call: any) => {
        expect(call[1].headers).toHaveProperty('x-api-key', mockApiKey);
        expect(call[1].headers).not.toHaveProperty('Authorization');
      });
    });
  });

  describe('Regression prevention for ADR-027', () => {
    it('should never use Bearer token for RSOLV API', async () => {
      // This test ensures we never regress to Bearer tokens
      const apiUrls = [
        'https://api.rsolv.dev',
        'https://api.rsolv-staging.com',
        'http://localhost:4000'
      ];

      for (const url of apiUrls) {
        vi.clearAllMocks();

        client = new PatternAPIClient({
          apiKey: mockApiKey,
          apiUrl: url
        });

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            patterns: [],
            metadata: { count: 0 }
          })
        });

        await client.fetchPatterns('javascript');

        const headers = (global.fetch as any).mock.calls[0][1].headers;
        expect(headers).toHaveProperty('x-api-key');
        expect(headers).not.toHaveProperty('Authorization');
      }
    });

    it('should use correct endpoint format with query parameters', async () => {
      client = new PatternAPIClient({
        apiKey: mockApiKey,
        apiUrl: mockApiUrl
      });

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          patterns: [],
          metadata: { count: 0 }
        })
      });

      await client.fetchPatterns('javascript');

      // Should NOT use path parameter format
      expect(global.fetch).not.toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/patterns/javascript'),
        expect.any(Object)
      );

      // Should use query parameter format
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/patterns?language=javascript'),
        expect.any(Object)
      );
    });
  });
});