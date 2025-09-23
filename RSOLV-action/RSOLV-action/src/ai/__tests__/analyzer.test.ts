import { describe, expect, test, vi, beforeEach, vi } from 'vitest';
import { analyzeIssue } from '../analyzer.js';
import { IssueContext, ActionConfig } from '../../types.js';

// Mock the AI client
vi.mock('../client', () => ({
  getAiClient: () => ({
    complete: async () => `This is a bug issue.

Files to modify:
- \`src/component.ts\`
- \`src/util.ts\`

This is a moderate issue that requires updating error handling.

Suggested Approach: Fix 1 - Update the error handling in the component to properly catch exceptions.`
  })
}));

// Mock the security detector
vi.mock('../../security/index', () => ({
  SecurityDetector: class {
    analyzeText = () => ({ vulnerabilities: [] });
    analyzeCode = () => ({ vulnerabilities: [] });
  }
}));

describe('Issue Analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('analyzeIssue should return analysis from AI client', async () => {
    const issueContext: IssueContext = {
      id: '123',
      source: 'github',
      title: 'Test Issue',
      body: 'This is a test issue description',
      labels: ['bug', 'AUTOFIX'],
      repository: {
        owner: 'test-owner',
        name: 'test-repo',
        branch: 'main'
      },
      metadata: {},
      url: 'https://github.com/test-owner/test-repo/issues/123'
    };
    
    const config: ActionConfig = {
      aiProvider: {
        type: 'anthropic',
        apiKey: 'test-api-key',
        model: 'claude-3-opus-20240229',
        temperature: 0.2,
        maxTokens: 2000,
        useVendedCredentials: false
      },
      skipTests: false,
      enableSecurity: false,
      enableReflection: false,
      enableDeepAnalysis: false,
      maxFilesToProcess: 10,
      skipPR: false,
      dryRun: false,
      reviewers: [],
      labels: [],
      prTemplatePath: undefined,
      baseBranch: 'main',
      workingBranch: 'fix/test-issue',
      token: 'test-token',
      repo: 'test-repo',
      owner: 'test-owner',
      issueNumber: 123
    };
    
    const analysis = await analyzeIssue(issueContext, config);
    
    expect(analysis).toBeDefined();
    expect(analysis.issueType).toBe('bug');
    expect(analysis.estimatedComplexity).toBe('medium');
    expect(analysis.filesToModify).toContain('src/component.ts');
    expect(analysis.filesToModify).toContain('src/util.ts');
    expect(analysis.suggestedApproach).toBe('Fix 1 - Update the error handling in the component to properly catch exceptions.');
    expect(analysis.confidenceScore).toBe(0.7);
    expect(analysis.canBeFixed).toBe(true);
  });
});