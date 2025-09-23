import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vi as vitestVi } from 'vitest';

// Create mock functions
const gatherDeepContextMock = vi.fn();

// Mock modules - factories must be self-contained
vi.mock('../src/ai/analyzer', () => ({
  analyzeIssue: vi.fn()
}));

vi.mock('../src/ai/adapters/claude-code-enhanced', () => ({
  EnhancedClaudeCodeAdapter: vi.fn().mockImplementation(() => ({
    gatherDeepContext: gatherDeepContextMock,
    generateSolution: vi.fn().mockRejectedValue(new Error('Mock error'))
  }))
}));

// Now import after mocks are set up
import { processIssues } from '../src/ai/unified-processor';
import { IssueContext, ActionConfig } from '../src/types';
import { analyzeIssue } from '../src/ai/analyzer';

describe('Enhanced Context Default Behavior', () => {
  const mockIssue: IssueContext = {
    id: 'test-1',
    number: 1,
    title: 'Test vulnerability',
    body: 'Test issue body',
    labels: ['rsolv:automate'],
    assignees: [],
    repository: {
      owner: 'test',
      name: 'repo',
      fullName: 'test/repo',
      defaultBranch: 'main'
    },
    source: 'github',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const mockConfig: ActionConfig = {
    githubToken: 'test-token',
    aiProvider: {
      provider: 'claude-code',  // Changed to claude-code for enhanced context
      model: 'claude-3-sonnet',
      apiKey: 'test-key'
    },
    securitySettings: {},
    rsolvApiKey: 'test-rsolv-key',
    issueLabel: 'rsolv:automate',
    configPath: '.rsolv/config.yaml',
    apiKey: 'test-api-key',
    containerConfig: {
      useContainer: false
    }
  } as ActionConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock behavior
    vi.mocked(analyzeIssue).mockImplementation(async () => ({
      canBeFixed: true,
      issueType: 'security',
      filesToModify: ['test.js'],
      estimatedComplexity: 'simple',
      requiredContext: [],
      suggestedApproach: 'Fix vulnerability'
    }));
    
    gatherDeepContextMock.mockImplementation(async () => ({
      architecture: { patterns: [], structure: '', mainComponents: [] },
      codeConventions: { namingPatterns: [], fileOrganization: '', importPatterns: [] },
      testingPatterns: { framework: '', structure: '', conventions: [] },
      dependencies: { runtime: [], dev: [], patterns: [] },
      relatedComponents: { files: [], modules: [], interfaces: [] },
      styleGuide: { formatting: '', documentation: '', errorHandling: '' }
    }));
  });

  it('should NOT enable enhanced context by default', async () => {
    // Test with no options (should use defaults)
    try {
      await processIssues([mockIssue], mockConfig);
    } catch (error) {
      // Expected to fail without full mocks
    }

    // Enhanced context should NOT be called by default
    expect(gatherDeepContextMock).not.toHaveBeenCalled();
  });

  it('should enable enhanced context only when explicitly requested', async () => {
    // Test with enhanced context explicitly enabled
    const options = {
      enableEnhancedContext: true,
      enableSecurityAnalysis: false
    };

    try {
      await processIssues([mockIssue], mockConfig, options);
    } catch (error) {
      // Expected to fail without full mocks
    }

    // Should be called when explicitly enabled
    expect(gatherDeepContextMock).toHaveBeenCalled();
  });
});