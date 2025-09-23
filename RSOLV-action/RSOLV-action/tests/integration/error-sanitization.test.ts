import { describe, test, expect, vi, beforeEach } from 'vitest';
import { getAiClient } from '../../src/ai/client.js';
import { processIssues } from '../../src/ai/unified-processor.js';
import { IssueContext, ActionConfig } from '../../src/types/index.js';

// Mock the logger
vi.mock('../../src/utils/logger.js', () => ({
  Logger: class {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    debug = vi.fn();
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock modules to force errors
vi.mock('../../src/ai/analyzer.js', () => ({
  analyzeIssue: vi.fn(() => {
    throw new Error('Failed to connect to Anthropic API');
  })
}));

describe('Error Message Sanitization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  let mockIssue: IssueContext;
  let mockConfig: ActionConfig;

  beforeEach(() => {
    mockIssue = {
      id: 'test-123',
      number: 123,
      title: 'Test issue',
      body: 'Test issue body',
      author: 'testuser',
      labels: ['bug'],
      url: 'https://github.com/test/repo/issues/123',
      repoOwner: 'test',
      repoName: 'repo',
      files: [],
      repository: {
        fullName: 'test/repo',
        name: 'repo',
        owner: 'test'
      }
    };

    mockConfig = {
      githubToken: 'test-token',
      aiProvider: {
        provider: 'anthropic',
        apiKey: 'test-key',
        model: 'claude-3',
        useVendedCredentials: false
      },
      dryRun: true
    } as ActionConfig;
  });

  test('should sanitize Anthropic-specific errors', async () => {
    const results = await processIssues([mockIssue], mockConfig);
    
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].message).toBeDefined();
    
    // Should not contain provider-specific information
    expect(results[0].message).not.toContain('Anthropic');
    expect(results[0].message).not.toContain('anthropic');
    expect(results[0].message).not.toContain('Claude');
    expect(results[0].message).not.toContain('claude');
  });

  test('should sanitize OpenAI-specific errors', async () => {
    const openaiConfig = {
      ...mockConfig,
      aiProvider: {
        ...mockConfig.aiProvider,
        provider: 'openai' as const
      }
    };
    
    const results = await processIssues([mockIssue], openaiConfig);
    
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].message).toBeDefined();
    
    // Should not contain provider-specific information
    expect(results[0].message).not.toContain('OpenAI');
    expect(results[0].message).not.toContain('openai');
    expect(results[0].message).not.toContain('GPT');
    expect(results[0].message).not.toContain('gpt');
  });

  test('should handle API key errors generically', async () => {
    try {
      await getAiClient({
        provider: 'anthropic',
        apiKey: '',
        useVendedCredentials: false
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      
      // Should be a generic error message
      expect(message).toBe('AI provider API key is required');
      expect(message).not.toContain('Anthropic');
      expect(message).not.toContain('Claude');
    }
  });

  test('should handle unsupported provider errors without exposing internal details', async () => {
    try {
      await getAiClient({
        // @ts-expect-error - Testing invalid provider
        provider: 'secret-internal-provider',
        apiKey: 'test-key'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      
      // This error can include the provider name since it's user input
      expect(message).toBe('Unsupported AI provider: secret-internal-provider');
    }
  });

  test('should sanitize network errors', async () => {
    // Mock a network error
    vi.mock('../../src/ai/analyzer.js', () => ({
      analyzeIssue: vi.fn(() => {
        const error = new Error('Network error: Failed to fetch from https://api.anthropic.com/v1/messages');
        throw error;
      })
    }));
    
    const results = await processIssues([mockIssue], mockConfig);
    
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].message).toBeDefined();
    
    // Should not contain API URLs or provider names
    expect(results[0].message).not.toContain('api.anthropic.com');
    expect(results[0].message).not.toContain('api.openai.com');
    expect(results[0].message).not.toContain('/v1/messages');
    expect(results[0].message).not.toContain('/chat/completions');
  });

  test('should provide helpful error messages without exposing implementation details', async () => {
    const results = await processIssues([mockIssue], mockConfig);
    
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    
    // Error message should be helpful but generic
    expect(results[0].message).toBeTruthy();
    expect(results[0].message.length).toBeGreaterThan(0);
    
    // Should contain generic error language
    expect(results[0].message).toMatch(/error|failed|unable|problem/i);
  });
});

console.log('✅ Error sanitization tests created');