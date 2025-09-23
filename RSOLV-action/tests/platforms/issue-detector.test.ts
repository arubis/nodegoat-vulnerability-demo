import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import type { ActionConfig } from '../../src/types';

// Mock the modules first with inline mock functions
vi.mock('../../src/github/issues', () => ({
  detectIssues: vi.fn(() => Promise.resolve([]))
}));

// Create mock functions that will be accessible in tests
const mockSearchIssues = vi.fn(() => Promise.resolve([]));
const mockSearchRsolvIssues = vi.fn(() => Promise.resolve([]));
const mockCreate = vi.fn();
const mockCreateAndAuthenticate = vi.fn();

vi.mock('../../src/platforms/platform-factory', () => {
  return {
    PlatformFactory: {
      create: (...args: any[]) => mockCreate(...args),
      createAndAuthenticate: (...args: any[]) => mockCreateAndAuthenticate(...args)
    }
  };
});

// Import after mocking
import { detectIssuesFromAllPlatforms } from '../../src/platforms/issue-detector';
import * as githubIssues from '../../src/github/issues';
import { PlatformFactory } from '../../src/platforms/platform-factory';

// Don't mock fetch globally - it interferes with other tests

describe('Multi-Platform Issue Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  let mockConfig: ActionConfig;

  beforeEach(() => {
    // Reset all mock implementations
    vi.mocked(githubIssues.detectIssues).mockImplementation(() => Promise.resolve([]));
    mockSearchIssues.mockImplementation(() => Promise.resolve([]));
    mockSearchRsolvIssues.mockImplementation(() => Promise.resolve([]));
    mockCreate.mockImplementation(() => ({
      searchIssues: mockSearchIssues,
      searchRsolvIssues: mockSearchRsolvIssues
    }));
    mockCreateAndAuthenticate.mockImplementation(() => Promise.resolve({
      searchIssues: mockSearchIssues,
      searchRsolvIssues: mockSearchRsolvIssues
    }));
    
    mockConfig = {
      issueLabel: 'rsolv:automate',
      enabled: true,
      permissions: {
        allowedRepositories: ['*'],
        deniedRepositories: [],
        allowedFiles: ['*'],
        deniedFiles: []
      },
      security: {
        preventSecrets: true,
        preventDestructive: true,
        requireApproval: false
      },
      limits: {
        maxIssuesPerRun: 10,
        maxFilesPerIssue: 20,
        maxChangesPerFile: 100
      },
      ai: {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        temperature: 0.2,
        maxTokens: 4000
      }
    };
  });

  test('should detect issues from GitHub only when no other platforms configured', async () => {
    // Mock GitHub issues
    const mockGitHubIssues = [
      {
        id: 'github-1',
        number: 1,
        title: 'Fix bug in auth',
        body: 'Authentication is broken',
        labels: ['rsolv:automate', 'bug'],
        source: 'github'
      }
    ];
    
    vi.mocked(githubIssues.detectIssues).mockImplementation(() => Promise.resolve(mockGitHubIssues as any));

    const issues = await detectIssuesFromAllPlatforms(mockConfig);

    expect(issues).toHaveLength(1);
    expect(issues[0].source).toBe('github');
    expect(vi.mocked(githubIssues.detectIssues)).toHaveBeenCalledWith(mockConfig);
  });

  test('should detect issues from both GitHub and Jira when configured', async () => {
    // Set Jira environment variables
    process.env.JIRA_HOST = 'test.atlassian.net';
    process.env.JIRA_EMAIL = 'test@example.com';
    process.env.JIRA_API_TOKEN = 'test-token';

    // Mock GitHub issues
    const mockGitHubIssues = [
      {
        id: 'github-1',
        number: 1,
        title: 'GitHub Issue',
        source: 'github'
      }
    ];
    vi.mocked(githubIssues.detectIssues).mockImplementation(() => Promise.resolve(mockGitHubIssues as any));

    // Mock Jira adapter
    mockSearchRsolvIssues.mockImplementation(() => Promise.resolve([
      {
        id: 'jira-1001',
        platform: 'jira',
        key: 'PROJ-123',
        title: 'Jira Issue',
        description: 'Repository: https://github.com/owner/repo',
        labels: ['autofix'],
        status: 'To Do',
        url: 'https://test.atlassian.net/browse/PROJ-123',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]));

    const issues = await detectIssuesFromAllPlatforms(mockConfig);

    expect(issues).toHaveLength(2);
    expect(issues[0].source).toBe('github');
    expect(issues[1].source).toBe('jira');
    expect(issues[1].metadata?.platformKey).toBe('PROJ-123');
    expect(issues[1].repository.owner).toBe('owner');
    expect(issues[1].repository.name).toBe('repo');

    // Clean up env vars
    delete process.env.JIRA_HOST;
    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_API_TOKEN;
  });

  test('should handle errors gracefully and continue with other platforms', async () => {
    // Set Jira environment variables
    process.env.JIRA_HOST = 'test.atlassian.net';
    process.env.JIRA_EMAIL = 'test@example.com';
    process.env.JIRA_API_TOKEN = 'test-token';

    // Mock GitHub to throw error
    vi.mocked(githubIssues.detectIssues).mockImplementation(() => Promise.reject(new Error('GitHub API error')));

    // Mock Jira to work normally
    mockSearchRsolvIssues.mockImplementation(() => Promise.resolve([
      {
        id: 'jira-1001',
        platform: 'jira',
        key: 'PROJ-123',
        title: 'Jira Issue',
        description: 'Test issue',
        labels: ['autofix'],
        status: 'To Do',
        url: 'https://test.atlassian.net/browse/PROJ-123',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]));

    const issues = await detectIssuesFromAllPlatforms(mockConfig);

    // Should still get Jira issues even though GitHub failed
    expect(issues).toHaveLength(1);
    expect(issues[0].source).toBe('jira');

    // Clean up env vars
    delete process.env.JIRA_HOST;
    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_API_TOKEN;
  });

  test('should extract repository info from Jira issue description', async () => {
    process.env.JIRA_HOST = 'test.atlassian.net';
    process.env.JIRA_EMAIL = 'test@example.com';
    process.env.JIRA_API_TOKEN = 'test-token';

    vi.mocked(githubIssues.detectIssues).mockImplementation(() => Promise.resolve([]));

    mockSearchRsolvIssues.mockImplementation(() => Promise.resolve([
      {
        id: 'jira-1001',
        platform: 'jira',
        key: 'PROJ-456',
        title: 'Fix security issue',
        description: `
          There's a security vulnerability in our auth system.
          
          Repository: https://github.com/myorg/myapp
          File: src/auth/validator.js
          
          Please fix ASAP.
        `,
        labels: ['autofix', 'security'],
        status: 'To Do',
        url: 'https://test.atlassian.net/browse/PROJ-456',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]));

    const issues = await detectIssuesFromAllPlatforms(mockConfig);

    expect(issues).toHaveLength(1);
    const issue = issues[0];
    expect(issue.repository.owner).toBe('myorg');
    expect(issue.repository.name).toBe('myapp');
    expect(issue.repository.fullName).toBe('myorg/myapp');
    expect(issue.labels).toContain('security');

    // Clean up env vars
    delete process.env.JIRA_HOST;
    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_API_TOKEN;
  });
});