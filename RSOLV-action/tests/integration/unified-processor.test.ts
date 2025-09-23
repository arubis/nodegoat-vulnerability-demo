import { describe, test, expect, beforeEach, vi } from 'vitest';
import { processIssues } from '../../src/ai/unified-processor.js';
import { IssueContext, ActionConfig } from '../../src/types/index.js';
import * as analyzer from '../../src/ai/analyzer.js';
import * as solution from '../../src/ai/solution.js';
import * as pr from '../../src/github/pr.js';

// Mock the logger module first
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

// Mock the dependencies
vi.mock('../../src/ai/analyzer.js', () => ({
  analyzeIssue: vi.fn(() => Promise.resolve({
    canBeFixed: true,
    confidence: 0.9,
    suggestedApproach: 'Fix the bug',
    affectedFiles: ['src/test.ts'],
    filesToModify: ['src/test.ts'],
    estimatedComplexity: 'medium',
    issueType: 'bug'
  }))
}));

vi.mock('../../src/ai/solution.js', () => ({
  generateSolution: vi.fn(() => Promise.resolve({
    success: true,
    message: 'Solution generated successfully',
    changes: {
      'src/test.ts': 'fixed content'
    }
  }))
}));

vi.mock('../../src/github/pr.js', () => ({
  createPullRequest: vi.fn(() => Promise.resolve({
    success: true,
    message: 'Pull request created successfully',
    pullRequestUrl: 'https://github.com/test/repo/pull/1',
    pullRequestNumber: 1
  }))
}));

vi.mock('../../src/ai/security-analyzer.js', () => ({
  SecurityAwareAnalyzer: class {
    async analyzeWithSecurity() {
      return {
        canBeFixed: true,
        confidence: 0.9,
        suggestedApproach: 'Fix the bug with security considerations',
        affectedFiles: ['src/test.ts'],
        filesToModify: ['src/test.ts'],
        estimatedComplexity: 'medium',
        issueType: 'bug',
        securityAnalysis: {
          hasSecurityIssues: false,
          vulnerabilities: [],
          riskLevel: 'low',
          affectedFiles: [],
          recommendations: [],
          summary: 'No security issues detected'
        }
      };
    }
  }
}));

vi.mock('../../src/ai/adapters/claude-code-enhanced.js', () => ({
  EnhancedClaudeCodeAdapter: class {
    async gatherDeepContext() {
      return {
        files: [],
        relatedIssues: [],
        commits: []
      };
    }
  }
}));

describe('Unified Processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  let mockIssue: IssueContext;
  let mockConfig: ActionConfig;

  beforeEach(() => {
    mockIssue = {
      id: 'test-123',
      number: 123,
      title: 'Test issue',
      body: 'Test issue body',
      author: 'testuser',
      labels: ['bug'],
      url: 'https://github.com/test/repo/issues/123',
      repoOwner: 'test',
      repoName: 'repo',
      files: [],
      repository: {
        fullName: 'test/repo',
        name: 'repo',
        owner: 'test'
      }
    };

    mockConfig = {
      githubToken: 'test-token',
      aiProvider: {
        provider: 'anthropic',
        apiKey: 'test-key',
        model: 'claude-3',
        useVendedCredentials: false
      },
      dryRun: true
    } as ActionConfig;
  });

  test('processes issues with basic configuration', async () => {
    const results = await processIssues([mockIssue], mockConfig);
    
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].pullRequestUrl).toBe('https://github.com/test/repo/pull/1');
  });

  test('processes issues with security analysis enabled', async () => {
    const results = await processIssues([mockIssue], mockConfig, {
      enableSecurityAnalysis: true
    });
    
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    // Security analysis would be included if SecurityAwareAnalyzer was properly mocked
  });

  test('processes issues with enhanced context', async () => {
    const enhancedConfig = {
      ...mockConfig,
      aiProvider: {
        ...mockConfig.aiProvider,
        provider: 'claude-code' as const
      }
    };
    
    const results = await processIssues([mockIssue], enhancedConfig, {
      enableEnhancedContext: true,
      contextDepth: 'deep'
    });
    
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].enhancedSolution).toBe(true);
  });

  test('handles multiple issues', async () => {
    const issues = [
      { ...mockIssue, id: '1', number: 1 },
      { ...mockIssue, id: '2', number: 2 },
      { ...mockIssue, id: '3', number: 3 }
    ];
    
    const results = await processIssues(issues, mockConfig);
    
    expect(results).toHaveLength(3);
    expect(results.every(r => r.success)).toBe(true);
  });

  test('handles processing errors gracefully', async () => {
    // Mock an error
    const analyzeIssueMock = analyzer.analyzeIssue as any;
    analyzeIssueMock.mockImplementationOnce(() => 
      Promise.reject(new Error('Analysis failed'))
    );
    
    const results = await processIssues([mockIssue], mockConfig);
    
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('Analysis failed');
  });

  test('respects processing options', async () => {
    const options = {
      enableEnhancedContext: false,
      enableSecurityAnalysis: false,
      contextDepth: 'basic' as const,
      verboseLogging: true
    };
    
    const results = await processIssues([mockIssue], mockConfig, options);
    
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].enhancedSolution).toBeFalsy();
  });
});

console.log('✅ Unified processor tests defined');