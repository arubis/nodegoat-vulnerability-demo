import { describe, expect, test, vi, beforeEach } from 'vitest';
import { handleExternalWebhook, getRepositoryFromExternalIssue } from '../../src/external/webhook.js';
import { ActionConfig, IssueContext } from '../../src/types/index.js';

// Mock the logger module first
vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(() => {}),
    warn: vi.fn(() => {}),
    error: vi.fn(() => {}),
    debug: vi.fn(() => {}),
    log: vi.fn(() => {})
  }
}));

// Mock configuration for tests
const mockConfig: ActionConfig = {
  apiKey: 'test-api-key',
  configPath: '.github/rsolv.yml',
  issueLabel: 'rsolv:automate',
  aiProvider: {
    provider: 'anthropic',
    model: 'claude-3-sonnet-20240229'
  },
  containerConfig: {
    enabled: false
  },
  securitySettings: {
    disableNetworkAccess: true,
    preventSecretLeakage: true
  }
};

// Mock Jira webhook payload
const mockJiraPayload = {
  issue: {
    id: 'JIRA-123',
    key: 'PROJ-456',
    fields: {
      summary: 'Fix authentication bug',
      description: 'There is a bug in the authentication system',
      created: '2025-03-23T00:00:00.000Z',
      updated: '2025-03-23T01:00:00.000Z',
      labels: ['rsolv:automate', 'bug'],
      project: {
        key: 'PROJ',
        name: 'Test Project'
      },
      status: {
        name: 'Open'
      },
      priority: {
        name: 'High'
      },
      issuetype: {
        name: 'Bug'
      },
      assignee: {
        displayName: 'Test User'
      }
    }
  }
};

// Mock Linear webhook payload
const mockLinearPayload = {
  data: {
    id: 'LINEAR-123',
    number: 456,
    title: 'Fix authentication bug',
    description: 'There is a bug in the authentication system',
    createdAt: '2025-03-23T00:00:00.000Z',
    updatedAt: '2025-03-23T01:00:00.000Z',
    labels: {
      nodes: [
        { name: 'rsolv:automate' },
        { name: 'bug' }
      ]
    },
    team: {
      key: 'TEAM',
      name: 'Test Team'
    },
    state: {
      name: 'Open'
    },
    priority: 2,
    assignee: {
      name: 'Test User'
    },
    url: 'https://linear.app/test/issue/TEAM-456'
  }
};

describe('External Issue Tracker Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  beforeEach(() => {
    // Set environment variables for tests
    process.env.JIRA_BASE_URL = 'https://jira.example.com';
    process.env.JIRA_GITHUB_OWNER = 'test-owner';
    process.env.JIRA_GITHUB_REPO = 'test-repo';
    process.env.LINEAR_GITHUB_OWNER = 'test-owner';
    process.env.LINEAR_GITHUB_REPO = 'test-repo';
    process.env.RSOLV_REPOSITORY_MAPPING_PROJ = JSON.stringify({
      owner: 'mapped-owner',
      repo: 'mapped-repo',
      defaultBranch: 'main'
    });
  });
  
  test('handleExternalWebhook should process Jira issues', async () => {
    const issues = await handleExternalWebhook(mockJiraPayload, 'jira', mockConfig);
    
    expect(issues).toBeDefined();
    expect(issues.length).toBe(1);
    expect(issues[0].source).toBe('jira');
    expect(issues[0].title).toBe('Fix authentication bug');
    expect(issues[0].labels).toContain('rsolv:automate');
  });
  
  test('handleExternalWebhook should process Linear issues', async () => {
    const issues = await handleExternalWebhook(mockLinearPayload, 'linear', mockConfig);
    
    expect(issues).toBeDefined();
    expect(issues.length).toBe(1);
    expect(issues[0].source).toBe('linear');
    expect(issues[0].title).toBe('Fix authentication bug');
    expect(issues[0].labels).toContain('rsolv:automate');
  });
  
  test('handleExternalWebhook should handle unsupported sources', async () => {
    const issues = await handleExternalWebhook({ data: {} }, 'unsupported', mockConfig);
    
    expect(issues).toBeDefined();
    expect(issues.length).toBe(0);
  });
  
  test('handleExternalWebhook should skip issues without automation label', async () => {
    // Create payload without automation label
    const jiraPayloadNoLabel = {
      ...mockJiraPayload,
      issue: {
        ...mockJiraPayload.issue,
        fields: {
          ...mockJiraPayload.issue.fields,
          labels: ['bug'] // No automation label
        }
      }
    };
    
    const issues = await handleExternalWebhook(jiraPayloadNoLabel, 'jira', mockConfig);
    
    expect(issues).toBeDefined();
    expect(issues.length).toBe(0);
  });
  
  test('getRepositoryFromExternalIssue should map to GitHub repository', async () => {
    const jiraIssue: IssueContext = {
      id: 'jira-123',
      number: 456,
      title: 'Test Issue',
      body: 'Test description',
      labels: ['rsolv:automate'],
      assignees: [],
      repository: {
        owner: 'PROJ',
        name: 'Test Project',
        fullName: 'PROJ/Test Project',
        defaultBranch: 'main'
      },
      source: 'jira',
      createdAt: '2025-03-23T00:00:00.000Z',
      updatedAt: '2025-03-23T01:00:00.000Z'
    };
    
    const repoInfo = await getRepositoryFromExternalIssue(jiraIssue, mockConfig);
    
    expect(repoInfo).toBeDefined();
    expect(repoInfo?.owner).toBe('mapped-owner');
    expect(repoInfo?.repo).toBe('mapped-repo');
  });
  
  test('getRepositoryFromExternalIssue should fallback to environment variables', async () => {
    const linearIssue: IssueContext = {
      id: 'linear-123',
      number: 456,
      title: 'Test Issue',
      body: 'Test description',
      labels: ['rsolv:automate'],
      assignees: [],
      repository: {
        owner: 'TEAM',
        name: 'Test Team',
        fullName: 'TEAM/Test Team',
        defaultBranch: 'main'
      },
      source: 'linear',
      createdAt: '2025-03-23T00:00:00.000Z',
      updatedAt: '2025-03-23T01:00:00.000Z'
    };
    
    const repoInfo = await getRepositoryFromExternalIssue(linearIssue, mockConfig);
    
    expect(repoInfo).toBeDefined();
    expect(repoInfo?.owner).toBe('test-owner');
    expect(repoInfo?.repo).toBe('test-repo');
  });
});