import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { GitBasedClaudeCodeAdapter } from '../claude-code-git.js';
import { AIConfig } from '../../types.js';
import type { SDKMessage } from '@anthropic-ai/claude-code';

// Use vi.hoisted for mocks that need to be available during module initialization
const { mockExecSync, mockQueryFunction, mockSpawn } = vi.hoisted(() => {
  const execSync = vi.fn((command: string) => {
    if (command === 'git diff --name-only') {
      return 'src/routes/users.js\nsrc/utils/db.js\n';
    }
    if (command === 'git diff --stat') {
      return '2 files changed, 12 insertions(+), 8 deletions(-)';
    }
    if (command === 'git rev-parse HEAD') {
      return 'abc123def456789';
    }
    return '';
  });
  
  const queryFunction = vi.fn(async function* () {
    // Simulate Claude Code execution that returns a solution in code blocks
    yield { 
      type: 'text', 
      text: `After fixing the vulnerabilities, here's the summary:

\`\`\`json
{
  "title": "Fix SQL injection in user routes",
  "description": "Replaced string concatenation with parameterized queries",
  "files": [
    {
      "path": "src/routes/users.js",
      "changes": "Fixed SQL injection vulnerability"
    }
  ],
  "tests": ["Test with malicious inputs"]
}
\`\`\``
    } as SDKMessage;
  });
  
  const spawn = vi.fn(() => ({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn((event: string, cb: Function) => {
      if (event === 'close') setTimeout(() => cb(0), 10);
    })
  }));
  
  return {
    mockExecSync: execSync,
    mockQueryFunction: queryFunction,
    mockSpawn: spawn
  };
});

vi.mock('child_process', () => ({
  execSync: mockExecSync,
  spawn: mockSpawn
}));

vi.mock('@anthropic-ai/claude-code', () => ({
  query: mockQueryFunction
}));

// Mock the parent class methods
vi.mock('../claude-code.js', () => {
  return {
    ClaudeCodeAdapter: class MockClaudeCodeAdapter {
      repoPath: string;
      config: AIConfig;
      claudeConfig: any;
      
      constructor(config: AIConfig, repoPath: string) {
        this.repoPath = repoPath;
        this.config = config;
        this.claudeConfig = config.claudeCodeConfig || {};
      }
      
      async generateSolution() {
        return {
          success: true,
          message: 'Solution generated with Claude Code SDK',
          changes: {
            'src/routes/users.js': 'Fixed SQL injection vulnerability'
          },
          metadata: {
            title: 'Fix SQL injection in user routes',
            description: 'Replaced string concatenation with parameterized queries',
            tests: ['Test with malicious inputs']
          },
          messages: [] // Add messages array for phase parsing
        };
      }
      
      protected extractSolutionFromText(text: string) {
        try {
          // Try to find JSON in code blocks
          const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (jsonBlockMatch) {
            const solution = JSON.parse(jsonBlockMatch[1]);
            if (solution.title && solution.description && Array.isArray(solution.files)) {
              return solution;
            }
          }
          
          // Try direct JSON parse
          const parsed = JSON.parse(text);
          if (parsed.title && parsed.description) {
            return parsed;
          }
          return null;
        } catch {
          return null;
        }
      }
      
      async isAvailable() {
        return true;
      }
      
      getUsageData() {
        return [];
      }
      
      getAnalyticsSummary() {
        return {
          total: 0,
          successful: 0,
          successRate: '0%',
          avgDuration: 0
        };
      }
    }
  };
});

// Mock fs 
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn()
  },
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn()
}));

// Mock logger
vi.mock('../../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(() => {}),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('GitBasedClaudeCodeAdapter', () => {
  let adapter: GitBasedClaudeCodeAdapter;
  let config: AIConfig;
  
  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();
    
    config = {
      provider: 'claude-code',
      apiKey: 'test-api-key',
      model: 'claude-3-sonnet-20240229',
      temperature: 0.1,
      maxTokens: 4096,
      claudeCodeConfig: {
        verboseLogging: true,
        timeout: 30000
      }
    };
    
    adapter = new GitBasedClaudeCodeAdapter(config, '/test/repo');
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  test('should generate solution with git metadata', async () => {
    // Mock the CLI adapter to be used internally
    const cliAdapter = {
      generateSolution: vi.fn(async () => ({
        success: true,
        message: 'Solution generated via CLI',
        changes: {
          'src/routes/users.js': 'Fixed SQL injection'
        }
      }))
    };
    
    (adapter as any).cliAdapter = cliAdapter;
    
    const issue = {
      id: 'test-123',
      number: 42,
      title: 'SQL injection vulnerability',
      body: 'User input is directly concatenated',
      repository: {
        owner: 'test',
        name: 'repo',
        fullName: 'test/repo'
      }
    };
    
    const analysis = {
      complexity: 'medium',
      estimatedTime: 30,
      filesToModify: ['src/routes/users.js'],
      suggestedApproach: 'Use parameterized queries'
    };
    
    const result = await adapter.generateSolutionWithGit(issue as any, analysis as any);
    
    expect(result.success).toBe(true);
    expect(result.filesModified).toBeDefined();
    expect(result.filesModified.length).toBeGreaterThan(0);
    expect(result.commitHash).toBeDefined();
    expect(result.diffStats).toBeDefined();
    expect(result.summary).toBeDefined();
  });
  
  test('should handle git command failures gracefully', async () => {
    // First calls work, then git diff fails later
    let callCount = 0;
    mockExecSync.mockImplementation((command: string) => {
      callCount++;
      // Let first call succeed (checking for uncommitted changes)
      if (callCount === 1 && command === 'git diff --name-only') {
        return '';  // No uncommitted changes
      }
      // But fail when trying to get modified files after running Claude
      if (callCount > 1) {
        throw new Error('Not a git repository');
      }
      return '';
    });
    
    const issue = {
      id: 'test-456',
      number: 43,
      title: 'Test issue',
      body: 'Test body',
      repository: {
        owner: 'test',
        name: 'repo',
        fullName: 'test/repo'
      }
    };
    
    const analysis = {
      complexity: 'low',
      estimatedTime: 10,
      filesToModify: ['test.js']
    };
    
    const result = await adapter.generateSolutionWithGit(issue as any, analysis as any);
    
    // Should fail because no files were modified (git commands failed)
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('Claude Code did not make any file changes');
  });
  
  test('should use enhanced prompt for git-based workflow', async () => {
    // Mock successful git operations
    mockExecSync.mockImplementation((command: string) => {
      if (command === 'git diff --name-only') {
        return 'src/views/profile.js\n';
      }
      if (command === 'git diff --stat') {
        return '1 file changed, 5 insertions(+), 2 deletions(-)';
      }
      if (command === 'git rev-parse HEAD') {
        return 'def456abc789';
      }
      return '';
    });
    
    const issue = {
      id: 'test-789',
      number: 44,
      title: 'XSS vulnerability',
      body: 'Unescaped user input',
      repository: {
        owner: 'test',
        name: 'repo',
        fullName: 'test/repo'
      }
    };
    
    const analysis = {
      complexity: 'simple',
      estimatedTime: 15,
      filesToModify: ['src/views/profile.js']
    };
    
    const result = await adapter.generateSolutionWithGit(issue as any, analysis as any);
    
    // Should succeed with git-based workflow
    expect(result.success).toBe(true);
    expect(result.filesModified).toContain('src/views/profile.js');
    expect(result.diffStats).toBeDefined();
    expect(result.commitHash).toBeDefined();
  });
  
  test('should extract solution from various response formats', () => {
    const adapter = new GitBasedClaudeCodeAdapter(config, '/test/repo');
    
    // Test JSON in code block
    const codeBlockResponse = `Here's the fix:
\`\`\`json
{"title":"Fix","description":"Fixed","files":[{"path":"test.js","changes":"fixed"}],"tests":[]}
\`\`\``;
    
    const solution = (adapter as any).extractSolutionFromText(codeBlockResponse);
    expect(solution).not.toBeNull();
    expect(solution.title).toBe('Fix');
    
    // Test direct JSON
    const directJson = '{"title":"Direct","description":"JSON","files":[],"tests":[]}';
    const directSolution = (adapter as any).extractSolutionFromText(directJson);
    expect(directSolution).not.toBeNull();
    expect(directSolution.title).toBe('Direct');
    
    // Test invalid response
    const invalidResponse = 'This is not JSON';
    const invalidSolution = (adapter as any).extractSolutionFromText(invalidResponse);
    expect(invalidSolution).toBeNull();
  });
});