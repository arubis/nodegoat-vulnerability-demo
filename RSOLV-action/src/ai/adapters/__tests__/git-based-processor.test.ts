import { describe, expect, test, beforeEach, vi } from 'vitest';

// Use vi.hoisted to ensure mocks are available before imports
const { mockExecSync, mockAnalyzeIssue, mockCreatePullRequestFromGit, mockCreateEducationalPullRequest } = vi.hoisted(() => {
  return {
    mockExecSync: vi.fn(),
    mockAnalyzeIssue: vi.fn(),
    mockCreatePullRequestFromGit: vi.fn(),
    mockCreateEducationalPullRequest: vi.fn()
  };
});

// Mock child_process module
vi.mock('child_process', () => ({
  execSync: mockExecSync
}));

// Mock the analyzer module
vi.mock('../../analyzer.js', () => ({
  analyzeIssue: mockAnalyzeIssue
}));

// Mock the PR creation module
vi.mock('../../../github/pr-git.js', () => ({
  createPullRequestFromGit: mockCreatePullRequestFromGit
}));

// Mock the educational PR creation module
vi.mock('../../../github/pr-git-educational.js', () => ({
  createEducationalPullRequest: mockCreateEducationalPullRequest
}));

// Mock credentials manager
vi.mock('../../../credentials/manager.js', () => ({
  RSOLVCredentialManager: class {
    async initialize() {}
  }
}));

// Mock GitBasedClaudeCodeAdapter
vi.mock('../claude-code-git.js', () => ({
  GitBasedClaudeCodeAdapter: class {
    async generateSolutionWithGit() {
      return {
        success: true,
        message: 'Fixed vulnerabilities',
        filesModified: ['src/routes/users.js'],
        commitHash: 'abc123def456',
        diffStats: {
          filesChanged: 1,
          insertions: 10,
          deletions: 5
        },
        summary: {
          title: 'Fix SQL injection',
          description: 'Replaced string concat with params',
          securityImpact: 'Prevents SQL injection',
          tests: ['Test with malicious input']
        }
      };
    }
  }
}));

// Import after mocks
import { processIssueWithGit } from '../../git-based-processor.js';

// Helper function to setup git command responses
function setupGitMocks(overrides: Record<string, string | Buffer> = {}) {
  const defaults: Record<string, string> = {
    'git status --porcelain': '',
    'git rev-parse HEAD': 'abc123def456789\n',
    'git diff': '+ fixed code\n- vulnerable code',
    'git log': 'commit abc123\nAuthor: Test\nDate: 2024-01-01\n\nTest commit'
  };

  const responses = { ...defaults, ...overrides };

  mockExecSync.mockImplementation((command: string, options?: any) => {
    // Check if encoding is specified
    const hasEncoding = options?.encoding === 'utf-8' || options?.encoding === 'utf8';
    
    // Find matching command
    for (const [cmd, response] of Object.entries(responses)) {
      if (command.includes(cmd) || command === cmd) {
        return hasEncoding ? response : Buffer.from(response as string);
      }
    }
    
    // Default return
    return hasEncoding ? '' : Buffer.from('');
  });
}

describe('Git-based Issue Processor', () => {
  const mockIssue = {
    id: '123',
    number: 42,
    title: 'SQL injection vulnerability',
    body: 'User input is concatenated directly',
    labels: [],  // Add labels array
    repository: {
      fullName: 'test/repo',
      defaultBranch: 'main'
    }
  };
  
  const mockConfig = {
    aiProvider: {
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'claude-3',
      temperature: 0.1,
      useVendedCredentials: false
    },
    rsolvApiKey: 'test-rsolv-key'
  };
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mocks
    mockAnalyzeIssue.mockResolvedValue({
      canBeFixed: true,
      summary: 'SQL injection vulnerability',
      complexity: 'medium',
      estimatedTime: 30,
      relatedFiles: ['src/routes/users.js']
    });
    
    mockCreatePullRequestFromGit.mockResolvedValue({
      success: true,
      pullRequestUrl: 'https://github.com/test/repo/pull/123',
      pullRequestNumber: 123,
      branchName: 'rsolv/fix-issue-42'
    });
    
    mockCreateEducationalPullRequest.mockResolvedValue({
      success: true,
      pullRequestUrl: 'https://github.com/test/repo/pull/123',
      pullRequestNumber: 123,
      branchName: 'rsolv/fix-issue-42'
    });
    
    // Setup default git mocks
    setupGitMocks();
  });
  
  test('should process issue successfully with git-based approach', async () => {
    const result = await processIssueWithGit(mockIssue as any, mockConfig as any);
    
    expect(result.success).toBe(true);
    expect(result.issueId).toBe('123');
    expect(result.pullRequestUrl).toBe('https://github.com/test/repo/pull/123');
    expect(result.pullRequestNumber).toBe(123);
    expect(result.filesModified).toEqual(['src/routes/users.js']);
    expect(result.diffStats).toEqual({
      filesChanged: 1,
      insertions: 10,
      deletions: 5
    });
  });
  
  test('should fail if repository has uncommitted changes', async () => {
    // Setup git mocks with uncommitted changes
    setupGitMocks({
      'git status --porcelain': 'M src/some-file.js\n'
    });
    
    const result = await processIssueWithGit(mockIssue as any, mockConfig as any);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Uncommitted changes');
  });
  
  test('should fail if issue cannot be fixed', async () => {
    mockAnalyzeIssue.mockResolvedValueOnce({
      canBeFixed: false,
      summary: 'Too complex to fix automatically'
    });
    
    const result = await processIssueWithGit(mockIssue as any, mockConfig as any);
    
    expect(result.success).toBe(false);
    expect(result.message).toContain('cannot be automatically fixed');
  });
  
  test('should use vended credentials when configured', async () => {
    const vendedConfig = {
      ...mockConfig,
      aiProvider: {
        ...mockConfig.aiProvider,
        useVendedCredentials: true
      },
      rsolvApiKey: 'test-rsolv-api-key' // Required for vended credentials
    };
    
    const result = await processIssueWithGit(mockIssue as any, vendedConfig as any);
    
    expect(result.success).toBe(true);
    // Verify credential manager was initialized
  });
});