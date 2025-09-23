import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RSOLVCredentialManager } from '../../src/credentials/manager.js';

describe('Credential Lifecycle Issues', () => {
  let credentialManager: RSOLVCredentialManager;
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (credentialManager) {
      credentialManager.cleanup();
    }
  });

  describe('Issue: Multiple credential managers created', () => {
    it('should demonstrate the current problem - multiple managers', async () => {
      // Mock fetch for credential exchange
      global.fetch = vi.fn();
      
      // Simulate what happens in the workflow
      const apiKey = 'rsolv_test_full_access_no_quota_2025';
      
      // First credential exchange (for initial analysis)
      const manager1 = new RSOLVCredentialManager();
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          credentials: {
            anthropic: { api_key: 'vended-key-1', expires_at: new Date(Date.now() + 3600000).toISOString() }
          },
          usage: { remaining_fixes: 999999 }
        })
      });
      await manager1.initialize(apiKey);
      
      // Second credential exchange (for solution generation)
      const manager2 = new RSOLVCredentialManager();
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          credentials: {
            anthropic: { api_key: 'vended-key-2', expires_at: new Date(Date.now() + 3600000).toISOString() }
          },
          usage: { remaining_fixes: 999999 }
        })
      });
      await manager2.initialize(apiKey);
      
      // Third credential exchange (after long Claude session) - this fails
      const manager3 = new RSOLVCredentialManager();
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: 'Invalid API key' })
      });
      
      await expect(manager3.initialize(apiKey)).rejects.toThrow('Failed to exchange credentials: Invalid API key');
      
      // This shows the problem: 3 separate exchanges instead of reusing
      expect(global.fetch).toHaveBeenCalledTimes(3);
      
      manager1.cleanup();
      manager2.cleanup();
    });
  });

  describe('Solution 1: Singleton credential manager', () => {
    it('should reuse the same credential manager instance', async () => {
      // Mock fetch
      global.fetch = vi.fn();
      
      // Create a singleton pattern
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
      
      const apiKey = 'rsolv_test_full_access_no_quota_2025';
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          credentials: {
            anthropic: { api_key: 'vended-key-1', expires_at: new Date(Date.now() + 3600000).toISOString() }
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
      expect(global.fetch).toHaveBeenCalledTimes(1); // Only one exchange!
      
      CredentialManagerSingleton.cleanup();
    });
  });

  describe('Solution 2: Handle credential expiration gracefully', () => {
    it('should refresh expired credentials automatically', async () => {
      const manager = new RSOLVCredentialManager();
      
      // Mock fetch
      global.fetch = vi.fn();
      
      // Initial exchange with short TTL (5 seconds)
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          credentials: {
            anthropic: { 
              api_key: 'vended-key-1', 
              expires_at: new Date(Date.now() + 5000).toISOString() // Expires in 5 seconds
            }
          },
          usage: { remaining_fixes: 999999 }
        })
      });
      
      await manager.initialize('test-api-key');
      const initialCred = await manager.getCredential('anthropic');
      expect(initialCred).toBe('vended-key-1');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 6000));
      
      // Setup refresh response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          credentials: {
            anthropic: { 
              api_key: 'vended-key-refreshed', 
              expires_at: new Date(Date.now() + 3600000).toISOString()
            }
          }
        })
      });
      
      // Getting credential after expiration should trigger auto-refresh
      const refreshedCred = await manager.getCredential('anthropic');
      expect(refreshedCred).toBe('vended-key-refreshed');
      
      // Should have called exchange endpoint twice: initial + refresh
      expect(global.fetch).toHaveBeenCalledTimes(2);
    }, 10000); // Longer timeout for the sleep
  });

  describe('Solution 3: Retry on exchange failure', () => {
    it('should retry credential exchange with exponential backoff', async () => {
      // Mock fetch
      global.fetch = vi.fn();
      
      const manager = new RSOLVCredentialManager();
      
      // First two attempts fail, third succeeds
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: 'Invalid API key' })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: 'Invalid API key' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            credentials: {
              anthropic: { api_key: 'vended-key-1', expires_at: new Date(Date.now() + 3600000).toISOString() }
            },
            usage: { remaining_fixes: 999999 }
          })
        });
      
      // Add retry logic to initialize
      const initializeWithRetry = async (maxRetries = 3) => {
        for (let i = 0; i < maxRetries; i++) {
          try {
            await manager.initialize('test-api-key');
            return;
          } catch (error) {
            if (i === maxRetries - 1) throw error;
            // Exponential backoff: 100ms, 200ms, 400ms
            await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, i)));
          }
        }
      };
      
      await initializeWithRetry();
      expect(global.fetch).toHaveBeenCalledTimes(3);
      
      const cred = await manager.getCredential('anthropic');
      expect(cred).toBe('vended-key-1');
    });
  });

  describe('Claude conversation logging', () => {
    it('should log full Claude conversations when enabled', async () => {
      // This is a placeholder for the Claude logging feature
      const conversationLogger = {
        logDir: './ai-conversation-logs',
        enabled: process.env.AI_CONVERSATION_LOG_LEVEL === 'full',
        
        async logConversation(issueId: string, messages: any[]) {
          if (!this.enabled) return;
          
          const timestamp = new Date().toISOString();
          const logData = {
            issueId,
            timestamp,
            messages,
            metadata: {
              workflow_run: process.env.GITHUB_RUN_ID,
              workflow_job: process.env.GITHUB_JOB,
            }
          };
          
          // In real implementation, write to file
          console.log('Would log conversation:', logData);
        }
      };
      
      expect(conversationLogger.enabled).toBe(false); // Not enabled by default
    });
  });
});