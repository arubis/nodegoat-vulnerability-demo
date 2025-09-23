import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RSOLVCredentialManager } from '../../src/credentials/manager.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('Credential Lifecycle Issues - TDD', () => {
  let mockFetch: any;
  
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = global.fetch as any;
  });

  describe('Current Problem: Multiple credential exchanges', () => {
    it('should demonstrate the problem - multiple managers create multiple exchanges', async () => {
      const apiKey = 'rsolv_test_full_access_no_quota_2025';
      
      // Mock successful responses for each exchange
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            credentials: {
              anthropic: { api_key: 'vended-key-1', expires_at: new Date(Date.now() + 3600000).toISOString() }
            },
            usage: { remaining_fixes: 999999 }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            credentials: {
              anthropic: { api_key: 'vended-key-2', expires_at: new Date(Date.now() + 3600000).toISOString() }
            },
            usage: { remaining_fixes: 999999 }
          })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: 'Invalid API key' })
        });
      
      // Simulate what happens in the workflow
      const manager1 = new RSOLVCredentialManager();
      await manager1.initialize(apiKey);
      
      const manager2 = new RSOLVCredentialManager();
      await manager2.initialize(apiKey);
      
      const manager3 = new RSOLVCredentialManager();
      await expect(manager3.initialize(apiKey)).rejects.toThrow('Failed to exchange credentials');
      
      // This shows the problem: 3 separate exchanges
      expect(mockFetch).toHaveBeenCalledTimes(3);
      
      manager1.cleanup();
      manager2.cleanup();
    });
  });

  describe('Testing the Singleton Solution', () => {
    // First, let's create the singleton class TDD-style
    class CredentialManagerSingleton {
      private static instances = new Map<string, RSOLVCredentialManager>();
      
      static async getInstance(apiKey: string): Promise<RSOLVCredentialManager> {
        if (!this.instances.has(apiKey)) {
          const manager = new RSOLVCredentialManager();
          await manager.initialize(apiKey);
          this.instances.set(apiKey, manager);
        }
        return this.instances.get(apiKey)!;
      }
      
      static cleanup() {
        this.instances.forEach(manager => manager.cleanup());
        this.instances.clear();
      }
    }
    
    it('should reuse the same credential manager instance', async () => {
      const apiKey = 'rsolv_test_singleton';
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          credentials: {
            anthropic: { api_key: 'vended-singleton', expires_at: new Date(Date.now() + 3600000).toISOString() }
          },
          usage: { remaining_fixes: 999999 }
        })
      });
      
      // Multiple requests should return same instance
      const manager1 = await CredentialManagerSingleton.getInstance(apiKey);
      const manager2 = await CredentialManagerSingleton.getInstance(apiKey);
      const manager3 = await CredentialManagerSingleton.getInstance(apiKey);
      
      expect(manager1).toBe(manager2);
      expect(manager2).toBe(manager3);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only one exchange!
      
      CredentialManagerSingleton.cleanup();
    });
  });

  describe('Testing Error Handling', () => {
    it('should throw on network errors without retry', async () => {
      const apiKey = 'rsolv_test_network_error';
      
      // Mock fetch to fail with network error
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      
      const manager = new RSOLVCredentialManager();
      
      // Should throw immediately without retry
      await expect(manager.initialize(apiKey)).rejects.toThrow('Network error');
      
      // Should have been called exactly once (no retry)
      expect(mockFetch).toHaveBeenCalledTimes(1);
      
      manager.cleanup();
    });
  });

  describe('Testing Credential Expiration Handling', () => {
    it('should detect expired credentials', async () => {
      const apiKey = 'rsolv_test_expiry';
      
      // Mock response with very short TTL
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          credentials: {
            anthropic: { 
              api_key: 'vended-expiring', 
              expires_at: new Date(Date.now() + 100).toISOString() // Expires in 100ms
            }
          },
          usage: { remaining_fixes: 999999 }
        })
      });
      
      const manager = new RSOLVCredentialManager();
      await manager.initialize(apiKey);
      
      // Credential should be valid immediately
      const cred1 = await manager.getCredential('anthropic');
      expect(cred1).toBe('vended-expiring');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // After expiration, getCredential should auto-refresh
      // Mock the refresh response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          credentials: {
            anthropic: { 
              api_key: 'vended-refreshed', 
              expires_at: new Date(Date.now() + 3600000).toISOString()
            }
          },
          usage: { remaining_fixes: 999999 }
        })
      });
      
      const refreshedCred = await manager.getCredential('anthropic');
      expect(refreshedCred).toBe('vended-refreshed');
      
      manager.cleanup();
    });
  });
});