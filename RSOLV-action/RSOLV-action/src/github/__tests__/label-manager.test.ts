import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(() => {}),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

import { ensureLabelsExist } from '../label-manager.js';

// Track created labels globally
let createdLabels: string[] = [];

describe('Label Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createdLabels = [];
    
    // Mock fetch globally
    global.fetch = vi.fn().mockImplementation(async (url: string, options?: any) => {
      // GET request to fetch existing labels
      if (url.includes('/labels') && !options?.method) {
        return {
          ok: true,
          json: async () => [
            { name: 'security', color: 'D93F0B' }
          ]
        };
      }
      
      // POST request to create labels
      if (url.includes('/labels') && options?.method === 'POST') {
        const body = JSON.parse(options.body);
        createdLabels.push(body.name);
        return { ok: true, json: async () => ({ name: body.name }) };
      }
      
      return { ok: false };
    });
  });

  it('should create missing labels', async () => {
    try {
      await ensureLabelsExist('test-owner', 'test-repo', 'test-token');
    } catch (error) {
      console.error('Error calling ensureLabelsExist:', error);
    }
    
    console.log('Created labels:', createdLabels);
    console.log('Mock fetch calls:', (global.fetch as any).mock.calls.length);
    
    // Should have created all missing labels
    expect(createdLabels).toContain('rsolv:detected');
    expect(createdLabels).toContain('rsolv:validate');
    expect(createdLabels).toContain('rsolv:automate');
    expect(createdLabels).toContain('critical');
    expect(createdLabels).toContain('high');
    expect(createdLabels).toContain('medium');
    expect(createdLabels).toContain('low');
    expect(createdLabels).toContain('automated-scan');
    
    // Should NOT recreate existing label
    expect(createdLabels).not.toContain('security');
  });
  
  it('should handle API errors gracefully', async () => {
    // Override the default mock for this test
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403
    });
    
    // Should not throw - just log warning
    await expect(
      ensureLabelsExist('test-owner', 'test-repo', 'test-token')
    ).resolves.not.toThrow();
  });
  
  it('should be case-insensitive when checking existing labels', async () => {
    const localCreatedLabels: string[] = [];
    
    // Override the default mock for this test
    global.fetch = vi.fn().mockImplementation(async (url: string, options?: any) => {
      // First call - return existing labels with different case
      if (url.includes('/labels') && !options?.method) {
        return {
          ok: true,
          json: async () => [
            { name: 'RSOLV:Detected' },  // Different case
            { name: 'Security' }
          ]
        };
      }
      
      // POST to create labels
      if (options?.method === 'POST') {
        const body = JSON.parse(options.body);
        localCreatedLabels.push(body.name);
        return { ok: true, json: async () => ({ name: body.name }) };
      }
      return { ok: false };
    });
    
    await ensureLabelsExist('test-owner', 'test-repo', 'test-token');
    
    // Should not recreate labels that exist with different case
    expect(localCreatedLabels).not.toContain('rsolv:detected');
    expect(localCreatedLabels).not.toContain('security');
  });
});