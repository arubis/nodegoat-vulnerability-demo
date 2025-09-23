import { describe, it, expect, beforeEach, vi, afterEach, vi } from 'vitest';
import { RsolvApiClient } from '../api-client.js';

// Mock node-fetch
const mockFetch = vi.fn();
vi.mock('node-fetch', () => ({
  default: mockFetch
}));

// Store original fetch
const originalFetch = global.fetch;

// Mock the PR creation workflow integration
describe('PR Integration with Fix Attempt Recording', () => {
  let apiClient: RsolvApiClient;

  beforeEach(() => {
    mockFetch.mockClear();
    global.fetch = mockFetch as any;
    apiClient = new RsolvApiClient({
      baseUrl: 'https://api.rsolv.dev',
      apiKey: 'test-api-key'
    });
  });

  afterEach(() => {
    // Clean up any environment variables
    delete process.env.RSOLV_API_KEY;
    delete process.env.RSOLV_API_URL;
    // Restore fetch
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should record fix attempt after successful PR creation', async () => {
    // Mock successful API response
    mockFetch.mockImplementationOnce(() => Promise.resolve({
      ok: true,
      status: 201,
      json: async () => ({
        id: 123,
        status: 'pending',
        github_org: 'test-org',
        repo_name: 'test-repo',
        pr_number: 456,
        billing_status: 'not_billed'
      }),
      text: async () => JSON.stringify({
        id: 123,
        status: 'pending',
        github_org: 'test-org',
        repo_name: 'test-repo',
        pr_number: 456,
        billing_status: 'not_billed'
      })
    } as Response));

    // Simulate PR data
    const issueContext = {
      number: 789,
      title: 'Fix security vulnerability',
      url: 'https://github.com/test-org/test-repo/issues/789',
      repository: {
        owner: 'test-org',
        name: 'test-repo'
      }
    };

    const prData = {
      number: 456,
      html_url: 'https://github.com/test-org/test-repo/pull/456',
      head: {
        ref: 'rsolv/789-fix-security'
      }
    };

    const prTitle = '[RSOLV] Fix security vulnerability (fixes #789)';

    // Record fix attempt
    const result = await apiClient.recordFixAttempt({
      github_org: issueContext.repository.owner,
      repo_name: issueContext.repository.name,
      issue_number: issueContext.number,
      pr_number: prData.number,
      pr_title: prTitle,
      pr_url: prData.html_url,
      issue_title: issueContext.title,
      issue_url: issueContext.url,
      api_key_used: 'test-api-key',
      metadata: {
        branch: prData.head.ref,
        labels: ['rsolv:automated'],
        created_by: 'rsolv-action'
      }
    });

    // Verify the API was called correctly
    expect(mockFetch.mock.calls.length).toBe(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.rsolv.dev/api/v1/fix-attempts');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers['Authorization']).toBe('Bearer test-api-key');
    
    const body = JSON.parse(options.body);
    expect(body.github_org).toBe('test-org');
    expect(body.repo_name).toBe('test-repo');
    expect(body.issue_number).toBe(789);
    expect(body.pr_number).toBe(456);
    expect(body.pr_title).toBe('[RSOLV] Fix security vulnerability (fixes #789)');
    expect(body.pr_url).toBe('https://github.com/test-org/test-repo/pull/456');
    expect(body.issue_title).toBe('Fix security vulnerability');
    expect(body.issue_url).toBe('https://github.com/test-org/test-repo/issues/789');
    expect(body.api_key_used).toBe('test-api-key');
    expect(body.metadata.branch).toBe('rsolv/789-fix-security');
    expect(body.metadata.labels).toEqual(['rsolv:automated']);
    expect(body.metadata.created_by).toBe('rsolv-action');

    // Verify successful result
    expect(result.success).toBe(true);
    expect(result.data?.id).toBe(123);
    expect(result.data?.billing_status).toBe('not_billed');
  });

  it('should handle PR without issue reference', async () => {
    // Mock successful API response
    mockFetch.mockImplementationOnce(() => Promise.resolve({
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

    // Simulate PR without issue reference
    const prData = {
      number: 789,
      html_url: 'https://github.com/test-org/test-repo/pull/789',
      head: {
        ref: 'rsolv/performance-improvements'
      }
    };

    const prTitle = '[RSOLV] Performance improvements';

    // Record fix attempt
    const result = await apiClient.recordFixAttempt({
      github_org: 'test-org',
      repo_name: 'test-repo',
      pr_number: prData.number,
      pr_title: prTitle,
      pr_url: prData.html_url,
      api_key_used: 'test-api-key',
      metadata: {
        branch: prData.head.ref,
        labels: ['rsolv:automated'],
        created_by: 'rsolv-action'
      }
    });

    // Verify the API was called without issue fields
    expect(mockFetch.mock.calls.length).toBe(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.rsolv.dev/api/v1/fix-attempts');
    
    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(requestBody.pr_number).toBe(789);

    // Should not contain issue fields
    expect(requestBody.issue_number).toBeUndefined();
    expect(requestBody.issue_title).toBeUndefined();
    expect(requestBody.issue_url).toBeUndefined();

    // Verify successful result
    expect(result.success).toBe(true);
    expect(result.data?.id).toBe(124);
  });

  it('should handle API errors gracefully without failing PR creation', async () => {
    // Mock API error response
    mockFetch.mockImplementationOnce(() => Promise.resolve({
      ok: false,
      status: 422,
      json: async () => ({
        errors: {
          repo_name: ['can\'t be blank']
        }
      }),
      text: async () => JSON.stringify({
        errors: {
          repo_name: ['can\'t be blank']
        }
      })
    } as Response));

    // Record fix attempt
    const result = await apiClient.recordFixAttempt({
      github_org: 'test-org',
      repo_name: '',  // Invalid data
      pr_number: 456,
      pr_title: '[RSOLV] Test fix',
      pr_url: 'https://github.com/test-org/test-repo/pull/456',
      api_key_used: 'test-api-key',
      metadata: {
        labels: ['rsolv:automated'],
        created_by: 'rsolv-action'
      }
    });

    // Verify error is handled gracefully
    expect(result.success).toBe(false);
    expect(result.error).toContain('API Error: 422');
    
    // This confirms that API errors won't break PR creation
    // In the actual implementation, this error is logged but doesn't throw
  });

  it('should handle network errors gracefully', async () => {
    // Mock network error
    mockFetch.mockImplementationOnce(() => Promise.reject(new Error('Connection timeout')));

    // Record fix attempt
    const result = await apiClient.recordFixAttempt({
      github_org: 'test-org',
      repo_name: 'test-repo',
      pr_number: 456,
      pr_title: '[RSOLV] Test fix',
      pr_url: 'https://github.com/test-org/test-repo/pull/456',
      api_key_used: 'test-api-key',
      metadata: {
        labels: ['rsolv:automated'],
        created_by: 'rsolv-action'
      }
    });

    // Verify network error is handled gracefully
    expect(result.success).toBe(false);
    expect(result.error).toBe('Connection timeout');
    
    // This confirms that network issues won't break PR creation
  });

  it('should use environment variables for configuration', async () => {
    // Set environment variables
    process.env.RSOLV_API_URL = 'https://staging-api.rsolv.dev';
    process.env.RSOLV_API_KEY = 'staging-key';

    // Create client with env vars
    const envClient = new RsolvApiClient({
      baseUrl: process.env.RSOLV_API_URL,
      apiKey: process.env.RSOLV_API_KEY
    });

    // Mock successful response
    mockFetch.mockImplementationOnce(() => Promise.resolve({
      ok: true,
      status: 201,
      json: async () => ({ id: 999 }),
      text: async () => JSON.stringify({ id: 999 })
    } as Response));

    // Make request
    await envClient.recordFixAttempt({
      github_org: 'test-org',
      repo_name: 'test-repo',
      pr_number: 123,
      pr_title: '[RSOLV] Test',
      pr_url: 'https://github.com/test-org/test-repo/pull/123',
      api_key_used: 'staging-key',
      metadata: {}
    });

    // Verify correct URL and auth header
    expect(mockFetch.mock.calls.length).toBe(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://staging-api.rsolv.dev/api/v1/fix-attempts');
    expect(options.headers['Authorization']).toBe('Bearer staging-key');
  });
});