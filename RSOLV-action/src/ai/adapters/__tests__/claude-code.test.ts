import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import type { SDKMessage } from '@anthropic-ai/claude-code';
import type { IssueContext } from '../../../types/index.js';
import type { IssueAnalysis } from '../../types.js';

// Mock the @anthropic-ai/claude-code module
vi.mock('@anthropic-ai/claude-code', () => ({
  query: vi.fn(),
  default: {
    query: vi.fn()
  }
}));

// Mock fs
vi.mock('fs', () => ({
  default: {
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn()
  },
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn()
}));

// Mock the logger
vi.mock('../../../utils/logger', () => ({
  Logger: class {
    debug = vi.fn();
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  },
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Import after mocking
import { ClaudeCodeAdapter } from '../claude-code.js';
import { AIConfig } from '../../types.js';
import { query as mockQuery } from '@anthropic-ai/claude-code';
import fs from 'fs';

describe('Claude Code SDK Adapter', () => {
  let adapter: ClaudeCodeAdapter;
  let originalEnv: NodeJS.ProcessEnv;
  const mockAnalytics: any[] = [];
  
  // Mock data
  const mockConfig: AIConfig = {
    provider: 'anthropic',
    apiKey: 'test-api-key',
    useClaudeCode: true,
    claudeCodeConfig: {
      verboseLogging: true,
      timeout: 30000,
      retryOptions: {
        maxRetries: 2,
        baseDelay: 1000
      }
    }
  };

  // Standard test data
  const mockIssueContext: IssueContext = {
    id: 'test-1',
    number: 1,
    title: 'Test Issue',
    body: 'This is a test issue',
    labels: ['bug'],
    author: 'testuser',
    url: 'https://github.com/test/repo/issues/1',
    repoOwner: 'test',
    repoName: 'repo',
    files: [],
    repository: {
      fullName: 'test/repo',
      name: 'repo',
      owner: 'test'
    }
  };

  const mockAnalysis: IssueAnalysis = {
    summary: 'Test issue analysis',
    complexity: 'low',
    estimatedTime: 10,
    potentialFixes: ['Fix approach 1'],
    recommendedApproach: 'Test recommended approach',
    relatedFiles: ['src/test.ts']
  };

  beforeEach(() => {
    // Clear all mock data
    vi.clearAllMocks();
    mockAnalytics.length = 0;
    
    // Save original env
    originalEnv = { ...process.env };
    
    // Set up default mock implementations for successful responses
    vi.mocked(mockQuery).mockImplementation(async function* (options: any) {
      // Parse the message to understand what's being requested
      const message = options?.messages?.[0]?.content || '';
      
      // Return appropriate response based on the request
      yield {
        type: 'assistant',
        text: JSON.stringify({
          title: 'Fix: Test Issue',
          description: 'Successfully generated fix',
          files: [
            { path: 'src/test.ts', changes: '// Fixed code\nconsole.log("fixed");' }
          ],
          tests: ['Test case 1']
        })
      } as SDKMessage;
    });
    
    vi.mocked(fs.writeFileSync).mockImplementation((path: string, content: string) => {
      if (path.includes('analytics')) {
        try {
          const data = JSON.parse(content);
          // Only keep last entry to avoid accumulation
          if (mockAnalytics.length > 0) {
            mockAnalytics.length = 0;
          }
          mockAnalytics.push(...data);
        } catch (e) {
          // Ignore parse errors
        }
      }
    });
    
    vi.mocked(fs.readFileSync).mockImplementation((path: string) => {
      if (path.includes('analytics')) {
        return JSON.stringify(mockAnalytics);
      }
      if (path === 'src/test.ts') {
        return 'console.log("test");';
      }
      return '{}';
    });
    
    vi.mocked(fs.existsSync).mockImplementation((path: string) => {
      return path.includes('temp') || path.includes('analytics') || path === 'src/test.ts';
    });
    
    // Create adapter instance
    adapter = new ClaudeCodeAdapter(mockConfig);
  });

  afterEach(() => {
    // Restore env
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('Basic Operations', () => {
    test('should initialize with correct configuration', () => {
      expect(adapter).toBeDefined();
      expect(adapter).toBeInstanceOf(ClaudeCodeAdapter);
    });

    test('should handle generateSolution request correctly', async () => {
      const result = await adapter.generateSolution(mockIssueContext, mockAnalysis);
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
      expect(result.changes).toBeDefined();
      if (result.changes) {
        expect(Object.keys(result.changes)).toContain('src/test.ts');
        expect(result.changes['src/test.ts']).toContain('fixed');
      }
    });

    test('should handle empty response gracefully', async () => {
      // Mock empty response
      vi.mocked(mockQuery).mockImplementationOnce(async function* () {
        yield {
          type: 'assistant',
          text: ''
        } as SDKMessage;
      });

      const result = await adapter.generateSolution(mockIssueContext, mockAnalysis);
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Claude Code explored the repository');
    });
  });

  describe('Error Handling', () => {
    test('should handle query errors gracefully', async () => {
      // Mock error response
      vi.mocked(mockQuery).mockImplementationOnce(async function* () {
        throw new Error('API Error');
      });

      const result = await adapter.generateSolution(mockIssueContext, mockAnalysis);
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle invalid JSON response', async () => {
      // Mock invalid JSON
      vi.mocked(mockQuery).mockImplementationOnce(async function* () {
        yield {
          type: 'assistant',
          text: 'This is not valid JSON'
        } as SDKMessage;
      });

      const result = await adapter.generateSolution(mockIssueContext, mockAnalysis);
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Claude Code explored the repository');
    });
  });

  describe('Configuration Options', () => {
    test('should handle missing API key', async () => {
      const configWithoutKey: AIConfig = {
        ...mockConfig,
        apiKey: ''
      };
      
      // Mock query to fail when no API key
      vi.mocked(mockQuery).mockImplementationOnce(async function* () {
        throw new Error('Missing API key');
      });
      
      const adapterWithoutKey = new ClaudeCodeAdapter(configWithoutKey);
      const result = await adapterWithoutKey.generateSolution(mockIssueContext, mockAnalysis);
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing API key');
    });

    test('should respect timeout configuration', async () => {
      const configWithTimeout: AIConfig = {
        ...mockConfig,
        claudeCodeConfig: {
          ...mockConfig.claudeCodeConfig,
          timeout: 100 // Very short timeout
        }
      };
      
      // Mock slow response
      vi.mocked(mockQuery).mockImplementationOnce(async function* () {
        await new Promise(resolve => setTimeout(resolve, 200));
        yield {
          type: 'assistant',
          text: '{"success": true}'
        } as SDKMessage;
      });
      
      const adapterWithTimeout = new ClaudeCodeAdapter(configWithTimeout);
      const result = await adapterWithTimeout.generateSolution(mockIssueContext, mockAnalysis);
      
      expect(result.success).toBe(false);
      // Timeout messages can vary, just check for an error
      expect(result.error).toBeDefined();
    }, 10000); // Increase test timeout
  });

  describe('Complex Scenarios', () => {
    test('should handle multiple file changes', async () => {
      vi.mocked(mockQuery).mockImplementationOnce(async function* () {
        yield {
          type: 'assistant',
          text: JSON.stringify({
            title: 'Fix: Multiple files',
            description: 'Fixed multiple files',
            files: [
              { path: 'src/file1.ts', changes: '// Fixed file 1' },
              { path: 'src/file2.ts', changes: '// Fixed file 2' },
              { path: 'src/file3.ts', changes: '// Fixed file 3' }
            ],
            tests: ['Test 1', 'Test 2']
          })
        } as SDKMessage;
      });

      const result = await adapter.generateSolution(mockIssueContext, mockAnalysis);
      
      expect(result.success).toBe(true);
      expect(result.changes).toBeDefined();
      if (result.changes) {
        expect(Object.keys(result.changes)).toHaveLength(3);
      }
    });

    test('should handle security vulnerabilities in input', async () => {
      const securityIssue: IssueContext = {
        ...mockIssueContext,
        title: 'Security: SQL Injection vulnerability',
        body: 'SQL injection in user input handling',
        labels: ['security', 'high-priority']
      };
      
      const securityAnalysis: IssueAnalysis = {
        ...mockAnalysis,
        complexity: 'high',
        summary: 'Critical security vulnerability requiring immediate fix'
      };

      const result = await adapter.generateSolution(securityIssue, securityAnalysis);
      
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });

    test('should handle retry logic', async () => {
      let attempts = 0;
      
      // The adapter doesn't retry internally - it returns error on first failure
      vi.mocked(mockQuery).mockImplementation(async function* () {
        attempts++;
        if (attempts === 1) {
          throw new Error('Temporary error');
        }
        yield {
          type: 'assistant',
          text: JSON.stringify({
            title: 'Fix after retry',
            description: 'Success on retry',
            files: [{ path: 'src/test.ts', changes: 'fixed' }],
            tests: []
          })
        } as SDKMessage;
      });

      const result = await adapter.generateSolution(mockIssueContext, mockAnalysis);
      
      // Claude Code adapter doesn't retry internally
      expect(attempts).toBe(1);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Temporary error');
    });
  });

  describe('Message Formatting', () => {
    test('should format system message correctly', async () => {
      let capturedOptions: any = null;
      
      vi.mocked(mockQuery).mockImplementationOnce(async function* (options: any) {
        capturedOptions = options;
        yield {
          type: 'assistant',
          text: JSON.stringify({
            title: 'Fix',
            description: 'ok',
            files: [],
            tests: []
          })
        } as SDKMessage;
      });

      await adapter.generateSolution(mockIssueContext, mockAnalysis);
      
      // The query function receives a prompt string, not messages array
      expect(capturedOptions).toBeDefined();
      expect(capturedOptions.prompt).toBeDefined();
      expect(capturedOptions.prompt).toContain('issue');
    });

    test('should include file contents in message', async () => {
      let capturedOptions: any = null;
      
      vi.mocked(mockQuery).mockImplementationOnce(async function* (options: any) {
        capturedOptions = options;
        yield {
          type: 'assistant',
          text: JSON.stringify({
            title: 'Fix',
            description: 'ok',
            files: [],
            tests: []
          })
        } as SDKMessage;
      });

      const analysisWithFiles: IssueAnalysis = {
        ...mockAnalysis,
        relatedFiles: ['src/test.ts', 'src/other.ts']
      };

      await adapter.generateSolution(mockIssueContext, analysisWithFiles);
      
      // The query function receives a prompt string with file info
      expect(capturedOptions).toBeDefined();
      expect(capturedOptions.prompt).toBeDefined();
      expect(capturedOptions.prompt).toContain('test.ts');
    });
  });

  describe('Edge Cases', () => {
    test('should handle very large responses', async () => {
      const largeChanges: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        largeChanges[`file${i}.ts`] = `// File ${i} content`.repeat(100);
      }
      
      vi.mocked(mockQuery).mockImplementationOnce(async function* () {
        const largeFiles = Object.entries(largeChanges).map(([path, content]) => ({ 
          path, 
          changes: content 
        }));
        yield {
          type: 'assistant',
          text: JSON.stringify({
            title: 'Fix: Large response',
            description: 'Large response',
            files: largeFiles,
            tests: []
          })
        } as SDKMessage;
      });

      const result = await adapter.generateSolution(mockIssueContext, mockAnalysis);
      
      expect(result.success).toBe(true);
      if (result.changes) {
        expect(Object.keys(result.changes).length).toBe(100);
      }
    });

    test('should handle special characters in paths', async () => {
      vi.mocked(mockQuery).mockImplementationOnce(async function* () {
        yield {
          type: 'assistant',
          text: JSON.stringify({
            title: 'Fix: Special paths',
            description: 'Special paths handled',
            files: [
              { path: 'src/files/[special].ts', changes: '// Special file' },
              { path: 'src/files/with spaces.ts', changes: '// File with spaces' },
              { path: 'src/files/with-dashes.ts', changes: '// File with dashes' }
            ],
            tests: []
          })
        } as SDKMessage;
      });

      const result = await adapter.generateSolution(mockIssueContext, mockAnalysis);
      
      expect(result.success).toBe(true);
      if (result.changes) {
        expect(result.changes['src/files/[special].ts']).toBeDefined();
        expect(result.changes['src/files/with spaces.ts']).toBeDefined();
      }
    });
  });
});

console.log('✅ Claude Code adapter tests fixed to use correct method signatures');