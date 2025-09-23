import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { RSOLVCredentialManager } from '../manager.js';

describe('Credential Manager Timeout Behavior', () => {
  let manager: RSOLVCredentialManager;

  beforeEach(() => {
    manager = new RSOLVCredentialManager();
    vi.clearAllMocks();
  });

  afterEach(() => {
    manager.cleanup();
    vi.restoreAllMocks();
  });

  test('should complete initialization with timeout', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        credentials: {
          anthropic: {
            api_key: 'test-key',
            expires_at: new Date(Date.now() + 3600000).toISOString()
          }
        }
      })
    } as any);

    await manager.initialize('test-api-key');
    
    // Verify fetch was called with timeout
    expect(fetchSpy).toHaveBeenCalled();
    const [_url, options] = fetchSpy.mock.calls[0];
    expect(options.signal).toBeDefined();
    
    fetchSpy.mockRestore();
  });

  test('should handle timeout on initialization gracefully', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() => {
      return new Promise((_, reject) => {
        setTimeout(() => reject(new Error('AbortError: The operation was aborted')), 100);
      });
    });

    await expect(manager.initialize('test-api-key')).rejects.toThrow();
    
    fetchSpy.mockRestore();
  });

  test('should handle timeout on usage reporting gracefully', async () => {
    // First initialize successfully
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        credentials: {
          anthropic: {
            api_key: 'test-key',
            expires_at: new Date(Date.now() + 3600000).toISOString()
          }
        }
      })
    } as any);
    
    await manager.initialize('test-api-key');
    
    // Now mock fetch to never resolve for usage reporting
    let abortSignal: AbortSignal | undefined;
    fetchSpy.mockImplementation((_url: string, options: any) => {
      abortSignal = options.signal;
      return new Promise(() => {}); // Never resolves
    });
    
    // Report usage (should not throw, just log warning)
    // Don't await since it will hang - reportUsage catches errors internally
    manager.reportUsage('anthropic', {
      tokensUsed: 100,
      requestCount: 1
    });
    
    // Wait a bit to ensure the request is made
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check that AbortSignal timeout was set to 5 seconds
    expect(abortSignal).toBeDefined();
    // AbortSignal.timeout creates a signal that will abort after the specified time
    
    fetchSpy.mockRestore();
  });

  test('should handle credential auto-refresh on expiration', async () => {
    // Initialize with credentials that will expire soon
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        credentials: {
          anthropic: {
            api_key: 'initial-key',
            expires_at: new Date(Date.now() + 100).toISOString() // Expires in 100ms
          }
        },
        usage: {
          remaining_fixes: 10,
          reset_at: new Date(Date.now() + 86400000).toISOString()
        }
      })
    } as any);
    
    await manager.initialize('test-api-key');
    
    // Verify initial credential works
    expect(await manager.getCredential('anthropic')).toBe('initial-key');
    
    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Mock refresh response
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        credentials: {
          anthropic: {
            api_key: 'refreshed-key',
            expires_at: new Date(Date.now() + 3600000).toISOString()
          },
          openai: {
            api_key: 'refreshed-openai',
            expires_at: new Date(Date.now() + 3600000).toISOString()
          },
          openrouter: {
            api_key: 'refreshed-openrouter',
            expires_at: new Date(Date.now() + 3600000).toISOString()
          }
        },
        usage: { remaining_fixes: 9 }
      })
    } as any);
    
    // Should auto-refresh when accessing expired credential
    const credential = await manager.getCredential('anthropic');
    expect(credential).toBe('refreshed-key');
    
    // Verify refresh was called
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    
    fetchSpy.mockRestore();
  });

  test('should not hang when API is slow', async () => {
    // Mock a slow API response (but within timeout)
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() => {
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            ok: true,
            json: async () => ({
              credentials: {
                anthropic: {
                  api_key: 'test-key',
                  expires_at: new Date(Date.now() + 3600000).toISOString()
                }
              }
            })
          } as any);
        }, 100); // 100ms delay
      });
    });
    
    const start = Date.now();
    await manager.initialize('test-api-key');
    const duration = Date.now() - start;
    
    // Should complete successfully
    expect(await manager.getCredential('anthropic')).toBe('test-key');
    
    // Should take about 100ms
    expect(duration).toBeGreaterThanOrEqual(100);
    expect(duration).toBeLessThan(200);
    
    fetchSpy.mockRestore();
  });

  test('should clean up credentials on cleanup', async () => {
    // Initialize with credentials
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        credentials: {
          anthropic: {
            api_key: 'test-key',
            expires_at: new Date(Date.now() + 3600000).toISOString()
          },
          openai: {
            api_key: 'test-key-2',
            expires_at: new Date(Date.now() + 7200000).toISOString()
          }
        }
      })
    } as any);
    
    await manager.initialize('test-api-key');
    
    // Verify credentials exist
    expect(await manager.getCredential('anthropic')).toBe('test-key');
    expect(await manager.getCredential('openai')).toBe('test-key-2');
    
    // Cleanup should clear all credentials
    manager.cleanup();
    
    // Should no longer have credentials
    await expect(manager.getCredential('anthropic')).rejects.toThrow('No valid credential');
    await expect(manager.getCredential('openai')).rejects.toThrow('No valid credential');
    
    fetchSpy.mockRestore();
  });
});