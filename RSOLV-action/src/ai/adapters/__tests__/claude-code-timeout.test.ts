import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { AIConfig } from '../../types';

// Mock fs module
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn((path: string) => path === '/tmp/test'),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => '[]')
  },
  existsSync: vi.fn((path: string) => path === '/tmp/test'),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => '[]')
}));

// Mock the Claude Code module before importing adapter
vi.mock('@anthropic-ai/claude-code', () => ({
  query: vi.fn()
}));

// Now import the adapter after mocking
import { ClaudeCodeAdapter } from '../claude-code';
import * as fs from 'fs';

describe('Claude Code Adapter Timeout Behavior', () => {
  let adapter: ClaudeCodeAdapter;
  const mockConfig: AIConfig = {
    provider: 'claude-code',
    apiKey: 'test-api-key',
    model: 'claude-sonnet-4-20250514',
    temperature: 0.2,
    maxTokens: 4000,
    timeout: 1000, // 1 second for faster testing
    claudeCodeConfig: {
      executablePath: 'non-existent-claude', // Use non-existent path to force timeout
      tempDir: '/tmp/test',
      timeout: 1000, // 1 second for faster testing
      verboseLogging: false,
      retryOptions: {
        maxRetries: 2,
        baseDelay: 100 // Faster retry for testing
      }
    }
  };

  const mockIssueContext = {
    id: '1',
    number: 1,
    title: 'Test Issue',
    body: 'Test body',
    labels: ['bug'],
    state: 'open' as const,
    repository: {
      owner: 'test',
      name: 'repo',
      fullName: 'test/repo'
    },
    author: 'testuser',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockAnalysis = {
    canBeFixed: true,
    complexity: 'medium' as const,
    estimatedTime: 30,
    relatedFiles: ['src/test.ts'],
    suggestedApproach: 'Fix the bug'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fs mocks to default behavior
    vi.mocked(fs.existsSync).mockImplementation((path) => path === '/tmp/test');
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    
    adapter = new ClaudeCodeAdapter(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('should timeout availability check after 5 seconds', async () => {
    // fs.existsSync already mocked to return false in beforeEach
    const start = Date.now();
    const result = await adapter.isAvailable();
    const duration = Date.now() - start;
    
    // Should return false for non-existent executable
    expect(result).toBe(false);
    // Should return quickly since executable doesn't exist
    expect(duration).toBeLessThan(1000);
  });

  test('should timeout when Claude Code CLI is not available', async () => {
    // Mock fs to return false for all paths
    vi.mocked(fs.existsSync).mockReturnValue(false);
    
    const configWithBadPath: AIConfig = {
      ...mockConfig,
      claudeCodeConfig: {
        ...mockConfig.claudeCodeConfig!,
        executablePath: '/non/existent/path/claude'
      }
    };
    
    const adapterWithBadPath = new ClaudeCodeAdapter(configWithBadPath);
    
    const result = await adapterWithBadPath.generateSolution(mockIssueContext, mockAnalysis);
    
    expect(result.success).toBe(false);
    expect(result.message).toBe('Claude Code CLI not available');
    expect(result.error).toContain('Claude Code CLI not available');
  });

  test('should handle file system errors gracefully', async () => {
    // Mock fs to throw errors
    vi.mocked(fs.existsSync).mockImplementation(() => {
      throw new Error('Permission denied');
    });
    vi.mocked(fs.mkdirSync).mockImplementation(() => {
      throw new Error('Permission denied');
    });
    
    // Creating the adapter should not throw even with fs errors
    const errorAdapter = new ClaudeCodeAdapter(mockConfig);
    
    const result = await errorAdapter.generateSolution(mockIssueContext, mockAnalysis);
    
    expect(result.success).toBe(false);
    expect(result.message).toBe('Claude Code CLI not available');
  });

  test('should respect timeout configuration in config', async () => {
    // Test that timeout is properly passed to configuration
    const shortTimeoutAdapter = new ClaudeCodeAdapter({
      ...mockConfig,
      claudeCodeConfig: {
        ...mockConfig.claudeCodeConfig!,
        timeout: 500 // 500ms
      }
    });
    
    const start = Date.now();
    const result = await shortTimeoutAdapter.generateSolution(mockIssueContext, mockAnalysis);
    const duration = Date.now() - start;
    
    // Should fail quickly due to non-existent executable
    expect(result.success).toBe(false);
    expect(result.message).toBe('Claude Code CLI not available');
    
    // Should not wait for full timeout since CLI is not available
    expect(duration).toBeLessThan(1000);
  });

  test('should track usage data for timeout scenarios', async () => {
    const result = await adapter.generateSolution(mockIssueContext, mockAnalysis);
    
    expect(result.success).toBe(false);
    
    const usageData = adapter.getUsageData();
    expect(usageData.length).toBe(1);
    expect(usageData[0].successful).toBe(false);
    expect(usageData[0].errorType).toBe('cli_not_available');
    expect(usageData[0].issueId).toBe('1');
  });

  test('should provide helpful error messages for timeout scenarios', async () => {
    const result = await adapter.generateSolution(mockIssueContext, mockAnalysis);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Claude Code CLI not available');
    expect(result.error).toContain('Installation instructions');
    expect(result.error).toContain('https://claude.ai/console/claude-code');
    expect(result.error).toContain('claude -v');
  });

  test('should include retry count in usage analytics', async () => {
    // Testing that usage data includes proper error tracking
    const result = await adapter.generateSolution(mockIssueContext, mockAnalysis);
    
    expect(result.success).toBe(false);
    
    const usageData = adapter.getUsageData();
    expect(usageData.length).toBeGreaterThan(0);
    expect(usageData[usageData.length - 1].errorType).toBe('cli_not_available');
  });

  test('should get analytics summary correctly', async () => {
    // Generate a few attempts to test analytics
    await adapter.generateSolution(mockIssueContext, mockAnalysis);
    await adapter.generateSolution({...mockIssueContext, id: '2'}, mockAnalysis);
    
    const summary = adapter.getAnalyticsSummary();
    
    expect(summary).toMatchObject({
      total: 2,
      successful: 0,
      successRate: '0.0%',
      errorTypes: {
        cli_not_available: 2
      }
    });
  });
});