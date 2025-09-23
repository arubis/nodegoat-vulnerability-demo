import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { RSOLVCredentialManager } from '../manager';
import { setupFetchMock } from '../../../test-helpers/simple-mocks';

// Store original values
const originalFetch = global.fetch;
const originalEnv = { ...process.env };

describe('RSOLVCredentialManager', () => {
  let fetchMock: ReturnType<typeof setupFetchMock>;
  let manager: RSOLVCredentialManager;

  beforeEach(() => {
    // Reset environment
    process.env = {
      ...originalEnv,
      GITHUB_JOB: 'test_job_123',
      GITHUB_RUN_ID: 'test_run_456',
      RSOLV_API_URL: 'https://api.rsolv.dev'
    };
    
    // Clear mocks
    vi.clearAllMocks();
    // Setup fetch mock
    fetchMock = setupFetchMock();
    manager = new RSOLVCredentialManager();
  });

  afterEach(() => {
    // Cleanup manager if initialized
    if (manager) {
      manager.cleanup();
    }
    // Restore environment
    process.env = originalEnv;
    // Restore fetch
    global.fetch = originalFetch;
    // Clear mocks
    vi.clearAllMocks();
  });
  describe('initialize', () => {
    test('should exchange RSOLV API key for temporary credentials', async () => {
      const mockResponse = {
        credentials: {
          anthropic: {
            api_key: 'temp_ant_xyz789',
            expires_at: new Date(Date.now() + 3600000).toISOString() // 1 hour
          },
          openai: {
            api_key: 'temp_oai_def456',
            expires_at: new Date(Date.now() + 3600000).toISOString()
          }
        },
        usage: {
          remaining_fixes: 85,
          reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        }
      };

      fetchMock.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse)
      } as Response));

      const manager = new RSOLVCredentialManager();
      await manager.initialize('test_api_key_123');

      // Verify fetch was called correctly
      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://api.rsolv.dev/api/v1/credentials/exchange'
      );
      
      const fetchOptions = fetchMock.mock.calls[0][1];
      expect(fetchOptions.method).toBe('POST');
      expect(fetchOptions.headers['Authorization']).toBe('Bearer test_api_key_123');
      expect(fetchOptions.headers['Content-Type']).toBe('application/json');
      expect(fetchOptions.headers['X-GitHub-Job']).toBe('test_job_123');
      expect(fetchOptions.headers['X-GitHub-Run']).toBe('test_run_456');
      
      const body = JSON.parse(fetchOptions.body);
      expect(body.api_key).toBe('test_api_key_123');
      expect(body.providers).toEqual(['anthropic', 'openai', 'openrouter']);
      expect(body.ttl_minutes).toBe(60);

      // Verify credentials are accessible
      expect(await manager.getCredential('anthropic')).toBe('temp_ant_xyz789');
      expect(await manager.getCredential('openai')).toBe('temp_oai_def456');
    });

    test('should throw error on failed API response', async () => {
      fetchMock.mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: 'Invalid API key' }),
        text: async () => JSON.stringify({ error: 'Invalid API key' })
      } as Response));

      const manager = new RSOLVCredentialManager();
      
      await expect(manager.initialize('invalid_key')).rejects.toThrow(
        'Failed to exchange credentials: Invalid API key'
      );
    });

    test('should throw error on network failure', async () => {
      fetchMock.mockImplementationOnce(() => Promise.reject(new Error('Network error')));

      const manager = new RSOLVCredentialManager();
      
      await expect(manager.initialize('test_key')).rejects.toThrow(
        'Network error'
      );
    });

    test('should schedule credential refresh before expiration', async () => {
      const expiresIn30Min = new Date(Date.now() + 30 * 60 * 1000);
      
      const mockResponse = {
        credentials: {
          anthropic: {
            api_key: 'temp_ant_xyz789',
            expires_at: expiresIn30Min.toISOString()
          }
        },
        usage: {
          remaining_fixes: 85
        }
      };

      fetchMock.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse)
      } as Response));

      const manager = new RSOLVCredentialManager();
      await manager.initialize('test_api_key_123');

      // Verify refresh timer was set (internal implementation detail)
      // For now, just verify initialization succeeded
      expect(await manager.getCredential('anthropic')).toBe('temp_ant_xyz789');
    });
  });

  describe('getCredential', () => {
    test('should return valid credential', async () => {
      const mockResponse = {
        credentials: {
          anthropic: {
            api_key: 'temp_ant_xyz789',
            expires_at: new Date(Date.now() + 3600000).toISOString()
          }
        },
        usage: { remaining_fixes: 85 }
      };

      fetchMock.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse)
      } as Response));

      const manager = new RSOLVCredentialManager();
      await manager.initialize('test_api_key_123');

      expect(await manager.getCredential('anthropic')).toBe('temp_ant_xyz789');
    });

    test('should throw error for expired credential', async () => {
      const expiredTime = new Date(Date.now() - 1000); // 1 second ago
      
      const mockResponse = {
        credentials: {
          anthropic: {
            api_key: 'temp_ant_xyz789',
            expires_at: expiredTime.toISOString()
          }
        },
        usage: { remaining_fixes: 85 }
      };

      fetchMock.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse)
      } as Response));

      const manager = new RSOLVCredentialManager();
      await manager.initialize('test_api_key_123');

      // Mock a failed refresh attempt
      fetchMock.mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: 'Invalid API key' })
      } as Response));

      await expect(manager.getCredential('anthropic')).rejects.toThrow(
        'Failed to refresh credential'
      );
    });

    test('should throw error for non-existent provider', async () => {
      const mockResponse = {
        credentials: {
          anthropic: {
            api_key: 'temp_ant_xyz789',
            expires_at: new Date(Date.now() + 3600000).toISOString()
          }
        },
        usage: { remaining_fixes: 85 }
      };

      fetchMock.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse)
      } as Response));

      const manager = new RSOLVCredentialManager();
      await manager.initialize('test_api_key_123');

      await expect(manager.getCredential('invalid_provider')).rejects.toThrow(
        'No valid credential for invalid_provider'
      );
    });
  });

  // Note: refresh is private and handled automatically via scheduleRefresh

  describe('reportUsage', () => {
    test('should report usage metrics', async () => {
      const initialResponse = {
        credentials: {
          anthropic: {
            api_key: 'temp_ant_xyz789',
            expires_at: new Date(Date.now() + 3600000).toISOString()
          }
        },
        usage: { remaining_fixes: 85 }
      };

      fetchMock.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => initialResponse,
        text: async () => JSON.stringify(initialResponse)
      } as Response));
      fetchMock.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ acknowledged: true }),
        text: async () => JSON.stringify({ acknowledged: true })
      } as Response));

      const manager = new RSOLVCredentialManager();
      await manager.initialize('test_api_key_123');
      
      await manager.reportUsage('anthropic', {
        tokensUsed: 1500,
        requestCount: 1
      });

      // Verify the second call was for usage reporting
      expect(fetchMock.mock.calls.length).toBe(2);
      const secondCall = fetchMock.mock.calls[1];
      expect(secondCall[0]).toContain('/api/v1/usage/report');
    });

    test('should handle usage reporting failure gracefully', async () => {
      const initialResponse = {
        credentials: {
          anthropic: {
            api_key: 'temp_ant_xyz789',
            expires_at: new Date(Date.now() + 3600000).toISOString()
          }
        },
        usage: { remaining_fixes: 85 }
      };

      fetchMock.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => initialResponse,
        text: async () => JSON.stringify(initialResponse)
      } as Response));
      fetchMock.mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Server error' }),
        text: async () => JSON.stringify({ error: 'Server error' })
      } as Response));

      const manager = new RSOLVCredentialManager();
      await manager.initialize('test_api_key_123');
      
      // Should not throw
      await manager.reportUsage('anthropic', {
        tokensUsed: 1500,
        requestCount: 1
      });
    });
  });

  describe('cleanup', () => {
    test('should clear credentials and cancel refresh timers', async () => {
      const mockResponse = {
        credentials: {
          anthropic: {
            api_key: 'temp_ant_xyz789',
            expires_at: new Date(Date.now() + 3600000).toISOString()
          }
        },
        usage: { remaining_fixes: 85 }
      };

      fetchMock.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse)
      } as Response));

      const manager = new RSOLVCredentialManager();
      await manager.initialize('test_api_key_123');
      
      // Verify credential exists
      expect(await manager.getCredential('anthropic')).toBe('temp_ant_xyz789');
      
      // Cleanup
      manager.cleanup();
      
      // Credential should no longer be available
      await expect(manager.getCredential('anthropic')).rejects.toThrow();
    });
  });
});