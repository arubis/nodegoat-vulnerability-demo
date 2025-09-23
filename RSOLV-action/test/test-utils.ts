/**
 * Centralized test utilities and mock configurations
 * 
 * TECHNICAL DEBT: This file is a band-aid to get tests green.
 * TODO: Refactor test architecture after achieving green suite.
 */

import { IssueContext, ActionConfig, AnalysisData } from '../src/types';

// Standard test configuration
export const createTestConfig = (overrides?: Partial<ActionConfig>): ActionConfig => ({
  apiKey: 'test-api-key',
  configPath: '.github/rsolv.yml',
  issueLabel: 'rsolv',
  aiProvider: {
    provider: 'anthropic',
    apiKey: 'test-api-key',
    model: 'claude-3-sonnet',
    temperature: 0.2,
    maxTokens: 2000
  },
  containerConfig: {
    enabled: false
  },
  securitySettings: {
    disableNetworkAccess: true
  },
  ...overrides
});

// Standard issue factory
export const createTestIssue = (overrides?: Partial<IssueContext>): IssueContext => ({
  id: 'test-issue-123',
  number: 123,
  title: 'Test issue',
  body: 'Test issue body',
  labels: ['test'],
  assignees: [],
  repository: {
    owner: 'test-owner',
    name: 'test-repo',
    fullName: 'test-owner/test-repo',
    defaultBranch: 'main',
    language: 'JavaScript'
  },
  source: 'github',
  createdAt: '2023-01-01T00:00:00Z',
  updatedAt: '2023-01-01T00:00:00Z',
  ...overrides
});

// Standard analysis data factory
export const createTestAnalysisData = (overrides?: Partial<AnalysisData>): AnalysisData => ({
  issueType: 'bug',
  filesToModify: ['src/test.js'],
  estimatedComplexity: 'simple',
  requiredContext: [],
  suggestedApproach: 'Fix the bug',
  canBeFixed: true,
  confidenceScore: 0.8,
  ...overrides
});

// Mock AI client response factory
export const createMockAIResponse = (type: 'analysis' | 'solution' | 'generic' = 'generic'): string => {
  switch (type) {
    case 'analysis':
      return `This is a bug in the code that needs to be fixed.

Files to modify:
- src/test.js
- src/utils.js

This is a simple fix that requires updating the logic.

Suggested Approach:
Fix the bug by updating the condition check.`;
    
    case 'solution':
      return `Here's the solution:

\`\`\`javascript
// Fixed code
function test() {
  return true;
}
\`\`\`

This fixes the issue.`;
    
    default:
      return 'Mock AI response';
  }
};

// Standard mock implementations
export const mockAIClient = {
  complete: jest.fn().mockImplementation((prompt: string) => {
    // Return different responses based on prompt content
    if (prompt.includes('analyze')) {
      return Promise.resolve(createMockAIResponse('analysis'));
    } else if (prompt.includes('solution')) {
      return Promise.resolve(createMockAIResponse('solution'));
    }
    return Promise.resolve(createMockAIResponse('generic'));
  })
};

// TECHNICAL DEBT: These mocks are overly simplistic and don't represent
// real behavior. They're just to get tests passing.
export const standardMocks = {
  aiClient: mockAIClient,
  getAiClient: jest.fn().mockReturnValue(mockAIClient),
  analyzeIssue: jest.fn().mockResolvedValue(createTestAnalysisData()),
  generateSolution: jest.fn().mockResolvedValue({
    success: true,
    message: 'Solution generated',
    changes: { 'src/test.js': 'fixed content' }
  }),
  createPullRequest: jest.fn().mockResolvedValue({
    success: true,
    message: 'PR created',
    pullRequestUrl: 'https://github.com/test/repo/pull/1',
    pullRequestNumber: 1
  })
};