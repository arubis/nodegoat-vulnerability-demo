import { describe, expect, test, beforeEach, vi } from 'vitest';
import { ClaudeCodeAdapter } from '../adapters/claude-code.js';
import { getAiClient } from '../client.js';
import { AIConfig, IssueAnalysis } from '../types.js';
import type { IssueContext } from '../../types/index.js';

// Check if we should use real APIs
const USE_REAL_APIS = process.env.USE_REAL_CLAUDE_CODE === 'true';

// Use vi.hoisted for mock functions
const { mockExistsSync, mockReadFileSync, mockWriteFileSync, mockMkdirSync, mockRmSync } = vi.hoisted(() => {
  return {
    mockExistsSync: vi.fn(() => true),
    mockReadFileSync: vi.fn(() => '{}'),
    mockWriteFileSync: vi.fn(),
    mockMkdirSync: vi.fn(),
    mockRmSync: vi.fn()
  };
});

// Mock modules outside of beforeEach for proper hoisting
vi.mock('../../utils/logger', () => ({
  Logger: class {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    debug = vi.fn();
  },
  logger: {
    debug: vi.fn(() => {}),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn((event: string, cb: Function) => {
      if (event === 'close') setTimeout(() => cb(0), 10);
    })
  }))
}));

vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync: mockMkdirSync,
    rmSync: mockRmSync
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
  rmSync: mockRmSync
}));

vi.mock('@anthropic-ai/claude-code', () => ({
  query: vi.fn(async function* () {
    // First yield exploration phase
    yield {
      type: 'assistant',
      message: {
        content: [{
          type: 'text',
          text: 'Analyzing the issue...'
        }]
      }
    };
    
    // Then yield the solution with correct structure
    yield {
      type: 'assistant',
      text: 'Generated solution using Claude Code SDK\n\n```json\n' + JSON.stringify({
        title: 'Fix: Test issue',
        description: 'Test solution',
        files: [{
          path: 'src/test.ts',
          changes: 'console.log("fixed");'
        }],
        tests: ['Test case 1']
      }) + '\n```',
      message: {
        content: [{
          type: 'text',
          text: 'Generated solution using Claude Code SDK\n\n```json\n' + JSON.stringify({
            title: 'Fix: Test issue',
            description: 'Test solution',
            files: [{
              path: 'src/test.ts',
              changes: 'console.log("fixed");'
            }],
            tests: ['Test case 1']
          }) + '\n```'
        }]
      }
    };
  })
}));

describe('Claude Code Integration Tests', () => {
  let config: AIConfig;
  
  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Reset all mocks before each test
    mockExistsSync.mockReturnValue(true);
    
    config = {
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY || 'test-key',
      model: 'claude-3-sonnet-20240229',
      temperature: 0.1,
      maxTokens: 4096,
      useClaudeCode: true,
      claudeCodeConfig: {
        verboseLogging: false,
        timeout: 30000,
        executablePath: '/mocked/path/to/claude-code'
      }
    };
  });
  
  test('should initialize Claude Code adapter', async () => {
    const adapter = new ClaudeCodeAdapter(config);
    expect(adapter).toBeDefined();
    
    const available = await adapter.isAvailable();
    if (USE_REAL_APIS) {
      // When using real APIs, availability depends on SDK installation
      expect(typeof available).toBe('boolean');
    } else {
      // In mock mode, should always be available
      expect(available).toBe(true);
    }
  });
  
  test('should generate solution with Claude Code when available', async () => {
    // Check if adapter is available first
    const adapter = new ClaudeCodeAdapter(config);
    const available = await adapter.isAvailable();
    
    // Skip test if not available in non-mock mode
    if (!USE_REAL_APIS && !available) {
      // In test mode, adapter should be available
      expect(available).toBe(true);
      return;
    }
    
    const issueContext: IssueContext = {
      id: 'test-123',
      number: 123,
      source: 'github',
      title: 'Fix XSS vulnerability',
      body: 'User input is not escaped',
      labels: ['bug', 'security'],
      assignees: [],
      repository: {
        owner: 'test',
        name: 'repo',
        fullName: 'test/repo',
        defaultBranch: 'main',
        language: 'JavaScript'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const analysis: IssueAnalysis = {
      summary: 'XSS vulnerability needs to be fixed by escaping user input',
      complexity: 'low',
      estimatedTime: 30,
      potentialFixes: ['Escape user input'],
      recommendedApproach: 'Escape user input',
      relatedFiles: ['src/input.js']
    };
    
    const result = await adapter.generateSolution(issueContext, analysis);
    
    // Debug output
    if (!result.success) {
      console.log('Result:', result);
    }
    
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.message).toContain('Claude Code');
    
    if (result.changes) {
      expect(Object.keys(result.changes).length).toBeGreaterThan(0);
    }
  });
  
  test('should fall back gracefully when Claude Code is not available', async () => {
    // Mock fs.existsSync to always return false
    mockExistsSync.mockReturnValue(false);
    
    // Force Claude Code to be unavailable by providing non-existent path
    const unavailableConfig: AIConfig = {
      ...config,
      claudeCodeConfig: {
        verboseLogging: false,
        timeout: 30000,
        executablePath: '/nonexistent/path/to/claude-code'
      }
    };
    
    const adapter = new ClaudeCodeAdapter(unavailableConfig);
    const available = await adapter.isAvailable();
    
    expect(available).toBe(false);
    
    // Restore mock
    mockExistsSync.mockReturnValue(true);
  });
  
  test('should handle errors gracefully', async () => {
    if (!USE_REAL_APIS) {
      // Mock an error scenario
      const errorAdapter = new ClaudeCodeAdapter(config);
      
      // Override the query function to throw an error
      vi.mocked(await import('@anthropic-ai/claude-code')).query.mockImplementationOnce(
        async function* () {
          throw new Error('Test error');
        }
      );
      
      const issueContext: IssueContext = {
        id: 'error-test',
        number: 999,
        source: 'github',
        title: 'Error test',
        body: 'This should fail',
        labels: [],
        assignees: [],
        repository: {
          owner: 'test',
          name: 'repo',
          fullName: 'test/repo',
          defaultBranch: 'main',
          language: 'JavaScript'
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      const analysis: IssueAnalysis = {
        summary: 'Test error case',
        complexity: 'low',
        estimatedTime: 10,
        potentialFixes: ['Will fail'],
        recommendedApproach: 'Will fail',
        relatedFiles: ['error.js']
      };
      
      const result = await errorAdapter.generateSolution(issueContext, analysis);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('error');
    }
  });
  
  test('should use vended credentials when configured', async () => {
    const vendedConfig: AIConfig = {
      ...config,
      useVendedCredentials: true
    };
    
    // Create mock credential manager
    const mockCredentialManager = {
      getCredential: vi.fn((provider: string) => {
        if (provider === 'anthropic') {
          return 'vended-api-key';
        }
        throw new Error('Unknown provider');
      })
    };
    
    const adapter = new ClaudeCodeAdapter(vendedConfig, process.cwd(), mockCredentialManager);
    
    const issueContext: IssueContext = {
      id: 'vended-test',
      number: 456,
      source: 'github',
      title: 'Test vended credentials',
      body: 'Testing vended credentials',
      labels: [],
      assignees: [],
      repository: {
        owner: 'test',
        name: 'repo',
        fullName: 'test/repo',
        defaultBranch: 'main',
        language: 'JavaScript'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const analysis: IssueAnalysis = {
      summary: 'Test vended credentials',
      complexity: 'low',
      estimatedTime: 15,
      potentialFixes: ['Use vended credentials'],
      recommendedApproach: 'Use vended credentials',
      relatedFiles: ['vended.js']
    };
    
    const result = await adapter.generateSolution(issueContext, analysis);
    
    // Verify credential manager was called
    if (!USE_REAL_APIS) {
      expect(mockCredentialManager.getCredential).toHaveBeenCalledWith('anthropic');
    }
    
    expect(result).toBeDefined();
  });
  
  test('should integrate with standard AI client', async () => {
    const aiConfig = {
      provider: 'anthropic' as const,
      apiKey: process.env.ANTHROPIC_API_KEY || 'test-key',
      model: 'claude-3-sonnet-20240229',
      useVendedCredentials: false
    };
    
    const client = await getAiClient(aiConfig);
    
    expect(client).toBeDefined();
    expect(typeof client.complete).toBe('function');
    
    // Only test actual completion with real APIs
    if (USE_REAL_APIS && process.env.ANTHROPIC_API_KEY) {
      const response = await client.complete('What is 2+2? Answer with just the number.');
      expect(response).toBeDefined();
      expect(typeof response).toBe('string');
    }
  });
});