import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { detectIssues } from '../../src/github/issues.js';
import { createPullRequest } from '../../src/github/pr.js';
import { getRepositoryFiles } from '../../src/github/files.js';
import { IssueContext, ActionConfig, AnalysisData } from '../../src/types/index.js';

// Mock the logger module
vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    log: vi.fn()
  }
}));

// Mock AI client
vi.mock('../../src/ai/client.js', () => ({
  getAiClient: vi.fn(() => ({
    generateText: vi.fn(async () => 'Generated PR description'),
    name: 'test-ai'
  }))
}));

// Mock external API client
vi.mock('../../src/external/api-client.js', () => ({
  RsolvApiClient: class {
    recordPullRequestCreated() { return Promise.resolve(); }
  }
}));

// Mock the GitHub API client
vi.mock('../../src/github/api.js', () => ({
  getGitHubClient: vi.fn(() => ({
    repos: {
      get: vi.fn(async () => ({
        data: {
          default_branch: 'main',
          language: 'JavaScript'
        }
      })),
      getContent: vi.fn(async ({ owner, repo, path, ref }: any) => {
        if (path === 'not-found.js') {
          throw { status: 404, message: 'Not found' };
        }
        
        return {
          data: {
            type: 'file',
            sha: 'abc123',
            content: Buffer.from('// Mock file content').toString('base64')
          }
        };
      }),
      createOrUpdateFileContents: vi.fn(async () => ({ 
        data: { commit: { sha: 'def456' } } 
      }))
    },
    git: {
      getRef: vi.fn(async ({ ref }: any) => ({ 
        data: { object: { sha: '789xyz' } } 
      })),
      createRef: vi.fn(async () => ({ 
        data: { ref: 'refs/heads/test-branch' } 
      }))
    },
    pulls: {
      create: vi.fn(async ({ title, head, base }: any) => ({
        data: {
          number: 123,
          html_url: 'https://github.com/test-owner/test-repo/pull/123'
        }
      }))
    },
    issues: {
      get: vi.fn(async ({ issue_number }: any) => ({
        data: {
          id: 1001,
          number: issue_number,
          title: 'Security Issue',
          labels: [{ name: 'security' }],
          body: 'SQL injection vulnerability',
          created_at: new Date().toISOString(),
          assignees: [],
          pull_request: undefined
        }
      })),
      listForRepo: vi.fn(async ({ labels }: any) => ({
        data: (labels === 'security' || labels?.includes?.('security')) ? [
          {
            id: 1001,
            number: 1,
            title: 'Security Issue',
            labels: [{ name: 'security' }],
            body: 'SQL injection vulnerability',
            created_at: new Date().toISOString(),
            assignees: []
          }
        ] : []
      })),
      createComment: vi.fn(async () => ({ 
        data: { id: 999 } 
      })),
      addLabels: vi.fn(async () => ({ 
        data: { labels: [] } 
      }))
    }
  })),
  getRepositoryDetails: vi.fn(async () => ({
    defaultBranch: 'main',
    language: 'JavaScript'
  }))
}));

describe('GitHub Integration', () => {
  const originalEnv = process.env;
  
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up required environment variables
    process.env = { ...originalEnv };
    process.env.GITHUB_REPOSITORY = 'test-owner/test-repo';
    process.env.GITHUB_TOKEN = 'test-token';
  });

  afterEach(() => {
    vi.resetModules();
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Issue Detection', () => {
    test('should detect security issues with labels', async () => {
      const config: ActionConfig = {
        issueLabel: 'security',
        repository: {
          owner: 'test-owner',
          name: 'test-repo',
          fullName: 'test-owner/test-repo',
          defaultBranch: 'main'
        },
        token: 'test-token',
        workflow: {
          autoFix: true,
          createPullRequest: true
        },
        aiProvider: {
          provider: 'anthropic',
          apiKey: 'test-key'
        },
        configPath: '.github/rsolv.yml',
        apiKey: 'test-api-key'
      } as ActionConfig;

      const issues = await detectIssues(config);
      
      expect(issues).toHaveLength(1);
      expect(issues[0].title).toBe('Security Issue');
      expect(issues[0].labels).toContain('security');
    });

    test('should handle empty issue list', async () => {
      const config: ActionConfig = {
        issueLabel: 'non-existent',
        repository: {
          owner: 'test-owner',
          name: 'test-repo',
          fullName: 'test-owner/test-repo',
          defaultBranch: 'main'
        },
        token: 'test-token',
        workflow: {
          autoFix: true,
          createPullRequest: false
        },
        aiProvider: {
          provider: 'anthropic',
          apiKey: 'test-key'
        },
        configPath: '.github/rsolv.yml',
        apiKey: 'test-api-key'
      } as ActionConfig;

      const issues = await detectIssues(config);
      expect(issues).toHaveLength(0);
    });
  });

  describe('Pull Request Creation', () => {
    test('should create a pull request with fixes', async () => {
      const issue: IssueContext = {
        id: '123',
        number: 1,
        title: 'Security Issue',
        body: 'SQL injection in user.js',
        labels: [],
        repository: {
          owner: 'test-owner',
          name: 'test-repo',
          fullName: 'test-owner/test-repo'
        }
      };

      const analysisData: AnalysisData = {
        fixes: [
          {
            file: 'user.js',
            content: '// Fixed content',
            description: 'Fixed SQL injection'
          }
        ],
        summary: 'Fixed security vulnerability',
        issueNumber: 1
      };

      const config: ActionConfig = {
        repository: {
          owner: 'test-owner',
          name: 'test-repo',
          fullName: 'test-owner/test-repo',
          defaultBranch: 'main'
        },
        token: 'test-token',
        workflow: {
          autoFix: true,
          createPullRequest: true
        },
        aiProvider: {
          provider: 'anthropic',
          apiKey: 'test-key'
        },
        configPath: '.github/rsolv.yml',
        apiKey: 'test-api-key',
        issueLabel: 'rsolv'
      } as ActionConfig;

      const changes = {
        'user.js': '// Fixed content'
      };
      
      const pr = await createPullRequest(issue, changes, analysisData, config);
      
      expect(pr.success).toBe(true);
      expect(pr.pullRequestNumber).toBe(123);
      expect(pr.pullRequestUrl).toContain('github.com');
    });
  });

  describe('File Operations', () => {
    test('should get repository files', async () => {
      const issue: IssueContext = {
        id: 'test-issue-1',
        number: 1,
        title: 'Test Issue',
        body: 'Test issue body',
        labels: [],
        assignees: [],
        repository: {
          owner: 'test-owner',
          name: 'test-repo',
          fullName: 'test-owner/test-repo',
          defaultBranch: 'main'
        },
        source: 'github',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const files = await getRepositoryFiles(issue, ['src/index.js']);
      
      expect(Object.keys(files)).toHaveLength(1);
      expect(files['src/index.js']).toBeDefined();
    });

    test('should handle file not found', async () => {
      const issue: IssueContext = {
        id: 'test-issue-2',
        number: 2,
        title: 'Test Issue',
        body: 'Test issue body',
        labels: [],
        assignees: [],
        repository: {
          owner: 'test-owner',
          name: 'test-repo',
          fullName: 'test-owner/test-repo',
          defaultBranch: 'main'
        },
        source: 'github',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const files = await getRepositoryFiles(issue, ['not-found.js']);
      expect(Object.keys(files)).toHaveLength(0);
    });
  });
});