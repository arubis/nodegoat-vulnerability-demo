import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RsolvApiClient } from '../api-client.js';
import { setupFetchMock } from '../../../test-helpers/simple-mocks';

describe('RsolvApiClient', () => {
  let client: RsolvApiClient;
  let fetchMock: ReturnType<typeof setupFetchMock>;
  let originalFetch: typeof fetch;
  
  beforeEach(() => {
    originalFetch = global.fetch;
    fetchMock = setupFetchMock();
    client = new RsolvApiClient({
      baseUrl: 'https://api.rsolv.dev',
      apiKey: 'test-key'
    });
  });
  
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('recordFixAttempt', () => {
    it('should successfully record a fix attempt', async () => {
      fetchMock.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        status: 201,
        json: async () => ({
          id: 123,
          status: 'pending',
          github_org: 'test-org',
          repo_name: 'test-repo',
          pr_number: 456
        }),
        text: async () => JSON.stringify({
          id: 123,
          status: 'pending',
          github_org: 'test-org',
          repo_name: 'test-repo',
          pr_number: 456
        })
      } as Response));
      
      const fixAttempt = {
        github_org: 'test-org',
        repo_name: 'test-repo',
        issue_number: 789,
        pr_number: 456,
        pr_title: '[RSOLV] Fix authentication vulnerability',
        pr_url: 'https://github.com/test-org/test-repo/pull/456',
        issue_title: 'Security vulnerability in login',
        issue_url: 'https://github.com/test-org/test-repo/issues/789',
        api_key_used: 'test-key',
        metadata: {
          branch: 'rsolv/789-fix-auth',
          labels: ['rsolv:automated', 'security'],
          created_by: 'rsolv-action'
        }
      };
      
      const result = await client.recordFixAttempt(fixAttempt);
      
      expect(fetchMock.mock.calls.length).toBe(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.rsolv.dev/api/v1/fix-attempts');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['Authorization']).toBe('Bearer test-key');
      expect(options.body).toBe(JSON.stringify(fixAttempt));
      
      expect(result).toEqual({
        success: true,
        data: {
          id: 123,
          status: 'pending',
          github_org: 'test-org',
          repo_name: 'test-repo',
          pr_number: 456
        }
      });
    });
    
    it('should handle PR without issue reference', async () => {
      fetchMock.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        status: 201,
        json: async () => ({
          id: 124,
          status: 'pending',
          github_org: 'test-org',
          repo_name: 'test-repo',
          pr_number: 789
        }),
        text: async () => JSON.stringify({
          id: 124,
          status: 'pending',
          github_org: 'test-org',
          repo_name: 'test-repo',
          pr_number: 789
        })
      } as Response));
      
      const fixAttempt = {
        github_org: 'test-org',
        repo_name: 'test-repo',
        pr_number: 789,
        pr_title: '[RSOLV] Performance improvements',
        pr_url: 'https://github.com/test-org/test-repo/pull/789',
        api_key_used: 'test-key',
        metadata: {
          branch: 'rsolv/perf-improvements',
          labels: ['rsolv:automated', 'performance'],
          created_by: 'rsolv-action'
        }
      };
      
      const result = await client.recordFixAttempt(fixAttempt);
      
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe(124);
    });
    
    it('should handle API errors gracefully', async () => {
      fetchMock.mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 422,
        json: async () => ({
          errors: {
            repo_name: ['can\'t be blank'],
            pr_number: ['can\'t be blank']
          }
        }),
        text: async () => JSON.stringify({
          errors: {
            repo_name: ['can\'t be blank'],
            pr_number: ['can\'t be blank']
          }
        })
      } as Response));
      
      const fixAttempt = {
        github_org: 'test-org',
        // Missing required fields
      };
      
      const result = await client.recordFixAttempt(fixAttempt as any);
      
      expect(result).toEqual({
        success: false,
        error: 'API Error: 422 - {"errors":{"repo_name":["can\'t be blank"],"pr_number":["can\'t be blank"]}}'
      });
    });
    
    it('should handle network errors', async () => {
      fetchMock.mockImplementationOnce(() => Promise.reject(new Error('Network error')));
      
      const fixAttempt = {
        github_org: 'test-org',
        repo_name: 'test-repo',
        pr_number: 456
      };
      
      const result = await client.recordFixAttempt(fixAttempt as any);
      
      expect(result).toEqual({
        success: false,
        error: 'Network error'
      });
    });
    
    it('should handle duplicate fix attempts', async () => {
      fetchMock.mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 409,
        json: async () => ({
          error: 'Fix attempt already exists for this PR'
        }),
        text: async () => JSON.stringify({
          error: 'Fix attempt already exists for this PR'
        })
      } as Response));
      
      const fixAttempt = {
        github_org: 'test-org',
        repo_name: 'test-repo',
        pr_number: 456
      };
      
      const result = await client.recordFixAttempt(fixAttempt as any);
      
      expect(result).toEqual({
        success: false,
        error: 'API Error: 409 - {"error":"Fix attempt already exists for this PR"}'
      });
    });
  });
});