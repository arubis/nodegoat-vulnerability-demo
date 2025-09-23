import { describe, expect, test, vi } from 'vitest';
import { analyzeIssue } from '../../src/ai/analyzer.js';
import { generateSolution } from '../../src/ai/solution.js';
import { processIssues } from '../../src/ai/unified-processor.js';
import { getAiClient } from '../../src/ai/client.js';
import { IssueContext, ActionConfig, AnalysisData } from '../../src/types/index.js';

// Mock the logger module first to prevent undefined function errors
vi.mock('../../src/utils/logger.js', () => ({
  Logger: class {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    debug = vi.fn();
    log = vi.fn();
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    log: vi.fn()
  }
}));

// Mock the AI client
vi.mock('../../src/ai/client.js', () => {
  return {
    getAiClient: () => ({
      complete: async (prompt: string) => {
        // Return different mock responses based on the prompt
        if (prompt.includes('analyze')) {
          return `This appears to be a bug in the authentication system where token validation is failing for valid tokens that contain special characters.

Files to modify:
- \`src/auth/tokenValidator.js\`
- \`src/utils/stringEscaping.js\`

This is a simple fix that requires updating the token validation function to handle special characters properly.

Suggested Approach:
Update the token validator to properly decode tokens before validation, and ensure that special characters are correctly handled throughout the authentication flow.`;
        } else if (prompt.includes('generate a solution for')) {
          return `Here's my solution:

--- src/auth/tokenValidator.js ---
\`\`\`
// Example token validator fix
function validateToken(token) {
  // Decode token before validation
  const decodedToken = decodeURIComponent(token);
  
  // Validate the decoded token
  return isValidToken(decodedToken);
}

function isValidToken(token) {
  // Existing validation logic
  return token && token.length > 10;
}

module.exports = { validateToken, isValidToken };
\`\`\`

--- src/utils/stringEscaping.js ---
\`\`\`
// String escaping utilities
function escapeSpecialChars(str) {
  return encodeURIComponent(str);
}

function unescapeSpecialChars(str) {
  return decodeURIComponent(str);
}

module.exports = { escapeSpecialChars, unescapeSpecialChars };
\`\`\`

This solution fixes the issue by properly decoding the token before validation, which ensures that special characters are handled correctly.`;
        } else {
          return 'Mock AI response';
        }
      }
    })
  };
});

// Mock the GitHub modules
vi.mock('../../src/github/files.js', () => {
  return {
    getRepositoryFiles: async () => ({
      'src/auth/tokenValidator.js': '// Original token validator code',
      'src/utils/stringEscaping.js': '// Original string escaping code'
    })
  };
});

vi.mock('../../src/github/pr.js', () => {
  return {
    createPullRequest: async () => ({
      success: true,
      message: 'Pull request created successfully',
      pullRequestUrl: 'https://github.com/example/repo/pull/123',
      pullRequestNumber: 123
    })
  };
});

// Test data
const mockIssue: IssueContext = {
  id: 'github-123',
  number: 42,
  title: 'Fix token validation for special characters',
  body: 'Tokens with special characters are not being validated correctly.',
  labels: ['bug', 'rsolv:automate'],
  assignees: [],
  repository: {
    owner: 'test-org',
    name: 'test-repo',
    fullName: 'test-org/test-repo',
    defaultBranch: 'main',
    language: 'JavaScript'
  },
  source: 'github',
  createdAt: '2025-03-23T12:00:00Z',
  updatedAt: '2025-03-23T12:00:00Z'
};

const mockConfig: ActionConfig = {
  apiKey: 'test-api-key',
  configPath: '.github/rsolv.yml',
  issueLabel: 'rsolv:automate',
  aiProvider: {
    provider: 'anthropic',
    model: 'claude-3-sonnet-20240229',
    temperature: 0.2,
    maxTokens: 4000
  },
  containerConfig: {
    enabled: false
  },
  securitySettings: {
    disableNetworkAccess: true,
    preventSecretLeakage: true
  }
};

describe('AI Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  test('analyzeIssue should analyze an issue and return structured data', async () => {
    const result = await analyzeIssue(mockIssue, mockConfig);
    
    expect(result).toBeDefined();
    expect(result.issueType).toBe('bug');
    expect(result.filesToModify.length).toBeGreaterThan(0);
    expect(result.filesToModify).toContain('src/auth/tokenValidator.js');
    expect(result.estimatedComplexity).toBe('simple');
    expect(result.suggestedApproach).toBeDefined();
  });
  
  test('generateSolution should create file changes based on analysis', async () => {
    const analysisData: AnalysisData = {
      issueType: 'bug',
      filesToModify: ['src/auth/tokenValidator.js', 'src/utils/stringEscaping.js'],
      estimatedComplexity: 'simple',
      requiredContext: [],
      suggestedApproach: 'Update token validation to handle special characters'
    };
    
    const result = await generateSolution(mockIssue, analysisData, mockConfig);
    
    expect(result.success).toBe(true);
    expect(result.changes).toBeDefined();
    expect(Object.keys(result.changes!).length).toBe(2);
    expect(result.changes!['src/auth/tokenValidator.js']).toBeDefined();
    expect(result.changes!['src/utils/stringEscaping.js']).toBeDefined();
  });
  
  test('processIssues should handle multiple issues', async () => {
    const issues = [mockIssue];
    const results = await processIssues(issues, mockConfig);
    
    expect(results.length).toBe(1);
    expect(results[0].success).toBe(true);
    expect(results[0].issueId).toBe(mockIssue.id);
    expect(results[0].pullRequestUrl).toBeDefined();
    expect(results[0].analysisData).toBeDefined();
  });
});