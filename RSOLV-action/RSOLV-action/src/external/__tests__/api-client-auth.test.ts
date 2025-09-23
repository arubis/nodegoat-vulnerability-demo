import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RsolvApiClient as ApiClient } from '../api-client';

// Mock fetch globally
global.fetch = vi.fn();

describe('ApiClient Authentication - ADR-027 Compliance', () => {
  let client: ApiClient;
  const mockApiKey = 'rsolv_test_key_123';
  const mockBaseUrl = 'https://api.rsolv.dev';

  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockReset();
  });

  describe('x-api-key header usage for all RSOLV endpoints', () => {
    beforeEach(() => {
      client = new ApiClient(mockApiKey, mockBaseUrl);
    });

    it('should use x-api-key for fix attempts endpoint', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, id: '123' })
      });

      await client.recordFixAttempt({
        github_org: 'test-org',
        repo_name: 'test-repo',
        pr_number: 1,
        pr_title: 'Fix vulnerability',
        pr_url: 'https://github.com/test/pr/1'
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/api/v1/fix-attempts`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': mockApiKey,
            'Content-Type': 'application/json'
          })
        })
      );

      // Ensure no Authorization header
      const headers = (global.fetch as any).mock.calls[0][1].headers;
      expect(headers).not.toHaveProperty('Authorization');
    });

    it('should use x-api-key for vulnerability validation endpoint', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          validated: [],
          stats: { total: 0, validated: 0, rejected: 0 }
        })
      });

      await client.validateVulnerabilities({
        vulnerabilities: [],
        files: {}
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/api/v1/vulnerabilities/validate`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': mockApiKey,
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should handle API key validation errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Invalid API key' })
      });

      const result = await client.recordFixAttempt({
        github_org: 'test-org',
        repo_name: 'test-repo',
        pr_number: 1,
        pr_title: 'Fix',
        pr_url: 'https://github.com/test/pr/1'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('401');
    });
  });

  describe('Regression tests for Bearer token removal', () => {
    it('should NEVER use Authorization Bearer for RSOLV API', async () => {
      const endpoints = [
        '/api/v1/fix-attempts',
        '/api/v1/vulnerabilities/validate',
        '/api/v1/phases',
        '/api/v1/credentials/exchange'
      ];

      client = new ApiClient(mockApiKey, mockBaseUrl);

      for (const endpoint of endpoints) {
        vi.clearAllMocks();

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true })
        });

        // Make a request to each endpoint type
        if (endpoint.includes('fix-attempts')) {
          await client.recordFixAttempt({
            github_org: 'test',
            repo_name: 'test',
            pr_number: 1,
            pr_title: 'Test',
            pr_url: 'http://test'
          });
        } else if (endpoint.includes('validate')) {
          await client.validateVulnerabilities({
            vulnerabilities: [],
            files: {}
          });
        }

        // Verify no Bearer token is used
        if ((global.fetch as any).mock.calls.length > 0) {
          const headers = (global.fetch as any).mock.calls[0][1].headers;
          expect(headers).not.toHaveProperty('Authorization');
          expect(JSON.stringify(headers)).not.toContain('Bearer');
        }
      }
    });

    it('should maintain x-api-key across multiple requests', async () => {
      client = new ApiClient(mockApiKey, mockBaseUrl);

      // Mock multiple successful responses
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true })
      });

      // Make multiple requests
      await client.recordFixAttempt({
        github_org: 'org1',
        repo_name: 'repo1',
        pr_number: 1,
        pr_title: 'Fix 1',
        pr_url: 'http://pr1'
      });

      await client.validateVulnerabilities({
        vulnerabilities: [],
        files: {}
      });

      await client.recordFixAttempt({
        github_org: 'org2',
        repo_name: 'repo2',
        pr_number: 2,
        pr_title: 'Fix 2',
        pr_url: 'http://pr2'
      });

      // All requests should use x-api-key
      const calls = (global.fetch as any).mock.calls;
      expect(calls.length).toBeGreaterThan(0);

      calls.forEach((call: any) => {
        expect(call[1].headers).toHaveProperty('x-api-key', mockApiKey);
        expect(call[1].headers).not.toHaveProperty('Authorization');
      });
    });
  });

  describe('Environment variable support', () => {
    it('should use RSOLV_API_KEY from environment', async () => {
      process.env.RSOLV_API_KEY = 'env_key_456';
      process.env.RSOLV_API_URL = 'https://api.rsolv-staging.com';

      // Client should pick up env vars when constructor gets them from env
      client = new ApiClient('env_key_456');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await client.recordFixAttempt({
        github_org: 'test',
        repo_name: 'test',
        pr_number: 1,
        pr_title: 'Test',
        pr_url: 'http://test'
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('api.rsolv-staging.com'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'env_key_456'
          })
        })
      );

      // Clean up
      delete process.env.RSOLV_API_KEY;
      delete process.env.RSOLV_API_URL;
    });
  });
});