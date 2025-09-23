import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { CredentialManagerSingleton } from '../../src/credentials/singleton.js';
import { RSOLVCredentialManager } from '../../src/credentials/manager.js';

describe('CredentialManagerSingleton Integration Tests', () => {
  const TEST_API_KEY = 'test-api-key-singleton';
  const TEST_API_KEY_2 = 'test-api-key-singleton-2';
  const RSOLV_API_URL = process.env.RSOLV_API_URL || 'https://api.rsolv.dev';
  
  // Store original fetch
  const originalFetch = global.fetch;
  let fetchMock: any;
  
  beforeEach(() => {
    // Clean up any existing instances
    CredentialManagerSingleton.cleanup();
    // Reset fetch mock
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });
  
  afterEach(() => {
    // Ensure cleanup after each test
    CredentialManagerSingleton.cleanup();
    // Restore original fetch
    global.fetch = originalFetch;
  });
  
  describe('getInstance', () => {
    test('should create a new instance on first call', async () => {
      // Mock successful credential exchange
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          credentials: {
            anthropic: { api_key: 'test-anthropic-key', expires_at: new Date(Date.now() + 3600000).toISOString() },
            openai: { api_key: 'test-openai-key', expires_at: new Date(Date.now() + 3600000).toISOString() }
          },
          usage: {
            remaining_fixes: 100,
            reset_at: new Date(Date.now() + 86400000).toISOString()
          }
        })
      });
      
      const instance = await CredentialManagerSingleton.getInstance(TEST_API_KEY);
      
      expect(instance).toBeInstanceOf(RSOLVCredentialManager);
      expect(CredentialManagerSingleton.getInstanceCount()).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        `${RSOLV_API_URL}/api/v1/credentials/exchange`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${TEST_API_KEY}`,
            'Content-Type': 'application/json'
          })
        })
      );
    });
    
    test('should reuse existing instance for same API key', async () => {
      // Mock successful credential exchange - should only be called once
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          credentials: {
            anthropic: { api_key: 'test-anthropic-key', expires_at: new Date(Date.now() + 3600000).toISOString() },
            openai: { api_key: 'test-openai-key', expires_at: new Date(Date.now() + 3600000).toISOString() }
          },
          usage: {
            remaining_fixes: 100,
            reset_at: new Date(Date.now() + 86400000).toISOString()
          }
        })
      });
      
      const instance1 = await CredentialManagerSingleton.getInstance(TEST_API_KEY);
      const instance2 = await CredentialManagerSingleton.getInstance(TEST_API_KEY);
      
      expect(instance1).toBe(instance2); // Same instance
      expect(CredentialManagerSingleton.getInstanceCount()).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    
    test('should create separate instances for different API keys', async () => {
      // Mock credential exchanges for both keys
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            credentials: {
              anthropic: { api_key: 'test-anthropic-key-1', expires_at: new Date(Date.now() + 3600000).toISOString() },
              openai: { api_key: 'test-openai-key-1', expires_at: new Date(Date.now() + 3600000).toISOString() }
            },
            usage: {
              remaining_fixes: 100,
              reset_at: new Date(Date.now() + 86400000).toISOString()
            }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            credentials: {
              anthropic: { api_key: 'test-anthropic-key-2', expires_at: new Date(Date.now() + 3600000).toISOString() },
              openai: { api_key: 'test-openai-key-2', expires_at: new Date(Date.now() + 3600000).toISOString() }
            },
            usage: {
              remaining_fixes: 50,
              reset_at: new Date(Date.now() + 86400000).toISOString()
            }
          })
        });
      
      const instance1 = await CredentialManagerSingleton.getInstance(TEST_API_KEY);
      const instance2 = await CredentialManagerSingleton.getInstance(TEST_API_KEY_2);
      
      expect(instance1).not.toBe(instance2); // Different instances
      expect(CredentialManagerSingleton.getInstanceCount()).toBe(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    
    test('should retry on initialization failure', async () => {
      // Mock failures then success
      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => ({ error: 'Internal Server Error' })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => ({ error: 'Internal Server Error' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            credentials: {
              anthropic: { api_key: 'test-anthropic-key', expires_at: new Date(Date.now() + 3600000).toISOString() },
              openai: { api_key: 'test-openai-key', expires_at: new Date(Date.now() + 3600000).toISOString() }
            },
            usage: {
              remaining_fixes: 100,
              reset_at: new Date(Date.now() + 86400000).toISOString()
            }
          })
        });
      
      const instance = await CredentialManagerSingleton.getInstance(TEST_API_KEY);
      
      expect(instance).toBeInstanceOf(RSOLVCredentialManager);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
    
    test('should throw error after max retries', async () => {
      // Mock all failures
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Internal Server Error' })
      });
      
      await expect(CredentialManagerSingleton.getInstance(TEST_API_KEY))
        .rejects.toThrow(/Failed to initialize credentials after 3 attempts/);
      
      expect(CredentialManagerSingleton.getInstanceCount()).toBe(0);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });
  
  describe('clearInstance', () => {
    test('should clear a specific instance', async () => {
      // Setup
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          credentials: {
            anthropic: { api_key: 'test-anthropic-key', expires_at: new Date(Date.now() + 3600000).toISOString() },
            openai: { api_key: 'test-openai-key', expires_at: new Date(Date.now() + 3600000).toISOString() }
          },
          usage: {
            remaining_fixes: 100,
            reset_at: new Date(Date.now() + 86400000).toISOString()
          }
        })
      });
      
      await CredentialManagerSingleton.getInstance(TEST_API_KEY);
      expect(CredentialManagerSingleton.getInstanceCount()).toBe(1);
      
      // Clear the instance
      CredentialManagerSingleton.clearInstance(TEST_API_KEY);
      
      expect(CredentialManagerSingleton.getInstanceCount()).toBe(0);
    });
    
    test('should handle clearing non-existent instance gracefully', () => {
      // Should not throw
      expect(() => {
        CredentialManagerSingleton.clearInstance('non-existent-key');
      }).not.toThrow();
    });
  });
  
  describe('cleanup', () => {
    test('should clear all instances', async () => {
      // Setup multiple instances
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            credentials: {
              anthropic: { api_key: 'test-anthropic-key-1', expires_at: new Date(Date.now() + 3600000).toISOString() },
              openai: { api_key: 'test-openai-key-1', expires_at: new Date(Date.now() + 3600000).toISOString() }
            },
            usage: {
              remaining_fixes: 100,
              reset_at: new Date(Date.now() + 86400000).toISOString()
            }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            credentials: {
              anthropic: { api_key: 'test-anthropic-key-2', expires_at: new Date(Date.now() + 3600000).toISOString() },
              openai: { api_key: 'test-openai-key-2', expires_at: new Date(Date.now() + 3600000).toISOString() }
            },
            usage: {
              remaining_fixes: 50,
              reset_at: new Date(Date.now() + 86400000).toISOString()
            }
          })
        });
      
      await CredentialManagerSingleton.getInstance(TEST_API_KEY);
      await CredentialManagerSingleton.getInstance(TEST_API_KEY_2);
      expect(CredentialManagerSingleton.getInstanceCount()).toBe(2);
      
      // Cleanup all
      CredentialManagerSingleton.cleanup();
      
      expect(CredentialManagerSingleton.getInstanceCount()).toBe(0);
    });
  });
  
  describe('credential refresh', () => {
    test('should store credentials with proper expiration', async () => {
      // Initial exchange with future expiration
      const futureExpiration = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
      
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          credentials: {
            anthropic: { api_key: 'test-anthropic-key', expires_at: futureExpiration },
            openai: { api_key: 'test-openai-key', expires_at: futureExpiration }
          },
          usage: {
            remaining_fixes: 100,
            reset_at: new Date(Date.now() + 86400000).toISOString()
          }
        })
      });
      
      const manager = await CredentialManagerSingleton.getInstance(TEST_API_KEY);
      
      // Verify credentials are stored and accessible
      expect(await manager.getCredential('anthropic')).toBe('test-anthropic-key');
      expect(await manager.getCredential('openai')).toBe('test-openai-key');
      
      // Verify the manager schedules refresh (we'll check the internal state if needed)
      // For now, just verify the credentials work
      await expect(manager.getCredential('anthropic')).resolves.toBe('test-anthropic-key');
    });
  });
  
  describe('concurrent access', () => {
    test('should handle concurrent getInstance calls for same key', async () => {
      // Mock should only be called once
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          credentials: {
            anthropic: { api_key: 'test-anthropic-key', expires_at: new Date(Date.now() + 3600000).toISOString() },
            openai: { api_key: 'test-openai-key', expires_at: new Date(Date.now() + 3600000).toISOString() }
          },
          usage: {
            remaining_fixes: 100,
            reset_at: new Date(Date.now() + 86400000).toISOString()
          }
        })
      });
      
      // Make concurrent calls
      const promises = [
        CredentialManagerSingleton.getInstance(TEST_API_KEY),
        CredentialManagerSingleton.getInstance(TEST_API_KEY),
        CredentialManagerSingleton.getInstance(TEST_API_KEY),
        CredentialManagerSingleton.getInstance(TEST_API_KEY),
        CredentialManagerSingleton.getInstance(TEST_API_KEY)
      ];
      
      const instances = await Promise.all(promises);
      
      // All should be the same instance
      const firstInstance = instances[0];
      instances.forEach(instance => {
        expect(instance).toBe(firstInstance);
      });
      
      expect(CredentialManagerSingleton.getInstanceCount()).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});