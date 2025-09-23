import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { processIssues } from '../unified-processor';
import { IssueContext } from '../../types';
import { ActionConfig } from '../../config';

// Mock the credential manager module
vi.mock('../../credentials/manager.js', () => ({
  RSOLVCredentialManager: class {
    private apiKey: string = '';
    
    async initialize(apiKey: string) {
      this.apiKey = apiKey;
      return Promise.resolve();
    }
    
    getCredential(provider: string) {
      if (provider === 'anthropic') {
        return 'vended-anthropic-key-test';
      }
      throw new Error(`No credential for ${provider}`);
    }
    
    cleanup() {}
    
    async reportUsage() {}
  }
}));

// Mock the credential manager singleton
vi.mock('../../credentials/singleton.js', () => ({
  CredentialManagerSingleton: {
    getInstance: vi.fn(async (apiKey: string) => {
      console.log('CredentialManagerSingleton.getInstance called with:', apiKey);
      const mockManager = {
        apiKey: apiKey,
        initialize: vi.fn(async () => Promise.resolve()),
        getCredential: vi.fn((provider: string) => {
          if (provider === 'anthropic') {
            return 'vended-anthropic-key-test';
          }
          throw new Error(`No credential for ${provider}`);
        }),
        cleanup: vi.fn(),
        reportUsage: vi.fn(async () => Promise.resolve())
      };
      await mockManager.initialize(apiKey);
      return mockManager;
    })
  }
}));

// Mock the enhanced claude code adapter using hoisted variables
const { mockCredentialManagerReceived } = vi.hoisted(() => {
  let credentialManager: any = undefined;
  return {
    mockCredentialManagerReceived: {
      get: () => credentialManager,
      set: (value: any) => { credentialManager = value; }
    }
  };
});

vi.mock('../adapters/claude-code-enhanced.js', () => ({
  EnhancedClaudeCodeAdapter: class {
    config: any;
    repoPath: string;
    credentialManager: any;
    
    constructor(config: any, repoPath: string, credentialManager?: any) {
      console.log('EnhancedClaudeCodeAdapter constructor called');
      console.log('Constructor args - config:', config?.provider, 'repoPath:', repoPath, 'credentialManager:', !!credentialManager);
      this.config = config;
      this.repoPath = repoPath;
      this.credentialManager = credentialManager;
      // Capture the credential manager for testing
      mockCredentialManagerReceived.set(credentialManager);
      console.log('Captured credentialManager:', !!credentialManager);
    }
    
    async gatherDeepContext() {
      return {
        architecture: {
          patterns: ['MVC'],
          structure: 'test',
          mainComponents: ['test']
        },
        codeConventions: {
          namingPatterns: ['camelCase'],
          fileOrganization: 'modular',
          importPatterns: ['ES6']
        },
        testingPatterns: {
          framework: 'jest',
          structure: 'colocated',
          conventions: ['describe/it']
        },
        dependencies: {
          runtime: ['express'],
          dev: ['jest'],
          patterns: ['npm']
        }
      };
    }
  }
}));

// Mock other dependencies
vi.mock('../analysis.js', () => ({
  analyzeIssue: async () => ({
    canBeFixed: true,
    issueType: 'bug',
    estimatedComplexity: 'medium',
    estimatedTime: 30,
    filesToModify: ['test.js'],
    suggestedApproach: 'Fix the bug'
  })
}));

vi.mock('../solution.js', () => ({
  generateSolution: async () => ({
    success: true,
    changes: {
      'test.js': 'fixed content'
    }
  })
}));

vi.mock('../../github/pr.js', () => ({
  createPullRequest: async () => ({
    success: true,
    pullRequestUrl: 'https://github.com/test/repo/pull/1',
    message: 'PR created'
  })
}));

describe('Unified Processor Credential Manager Passing', () => {
  let config: ActionConfig;
  let issue: IssueContext;
  
  beforeEach(() => {
    // Reset the captured credential manager
    mockCredentialManagerReceived.set(undefined);
    
    // Set NODE_ENV to test to ensure proper test behavior
    process.env.NODE_ENV = 'test';
    // Set RSOLV_API_KEY for vended credentials
    process.env.RSOLV_API_KEY = 'rsolv_test_key_123';
    
    config = {
      githubToken: 'test-token',
      aiProvider: {
        provider: 'claude-code',
        apiKey: '',
        model: 'claude-3-sonnet-20240229',
        useVendedCredentials: true
      },
      rsolvApiKey: 'rsolv_test_key_123',
      enableSecurityAnalysis: false,
      claudeCodeConfig: {
        enableDeepContext: true
      },
      issueLabel: 'rsolv:automate',
      dryRun: false
    } as ActionConfig;
    
    issue = {
      id: 'test-issue-123',
      number: 1,
      title: 'Test Issue',
      body: 'This is a test issue',
      labels: [],
      assignees: [],
      repository: {
        fullName: 'test/repo',
        language: 'JavaScript',
        defaultBranch: 'main'
      },
      author: 'testuser',
      createdAt: new Date().toISOString(),
      platform: 'github'
    };
  });
  
  afterEach(() => {
    // Clean up environment
    delete process.env.RSOLV_API_KEY;
    delete process.env.NODE_ENV;
    // Reset mock
    mockCredentialManagerReceived.set(undefined);
  });
  
  test('should create and pass credential manager to EnhancedClaudeCodeAdapter when using vended credentials', async () => {
    console.log('Test config before processIssues:', JSON.stringify(config.aiProvider, null, 2));
    
    const results = await processIssues([issue], config, {
      enableEnhancedContext: true
    });
    const result = results[0];
    
    // The credential manager should have been created and passed
    const capturedManager = mockCredentialManagerReceived.get();
    expect(capturedManager).toBeDefined();
    expect(capturedManager).not.toBeNull();
    expect(typeof capturedManager.getCredential).toBe('function');
    
    // Verify the credential manager returns the expected key
    const apiKey = capturedManager.getCredential('anthropic');
    expect(apiKey).toBe('vended-anthropic-key-test');
    
    // The result should be successful
    expect(result.success).toBe(true);
    expect(result.pullRequestUrl).toBeDefined();
  });
  
  test('should not create credential manager when useVendedCredentials is false', async () => {
    config.aiProvider.useVendedCredentials = false;
    config.aiProvider.apiKey = 'direct-api-key';
    
    const results = await processIssues([issue], config, {
      enableEnhancedContext: true
    });
    const result = results[0];
    
    // No credential manager should be passed
    expect(mockCredentialManagerReceived.get()).toBeUndefined();
    
    // The result should still be successful
    expect(result.success).toBe(true);
  });
  
  test('should not create credential manager when rsolvApiKey is missing', async () => {
    config.rsolvApiKey = undefined;
    
    const results = await processIssues([issue], config, {
      enableEnhancedContext: true
    });
    const result = results[0];
    
    // No credential manager should be passed
    expect(mockCredentialManagerReceived.get()).toBeUndefined();
    
    // The result should still be successful
    expect(result.success).toBe(true);
  });
  
  test('should handle credential manager creation errors gracefully', async () => {
    // Mock a failing credential manager
    vi.mock('../../credentials/manager.js', () => ({
      RSOLVCredentialManager: class {
        async initialize() {
          throw new Error('Failed to initialize credentials');
        }
      }
    }));
    
    // Should not throw, but should continue without credential manager
    const results = await processIssues([issue], config, {
      enableEnhancedContext: true
    });
    const result = results[0];
    
    // Should still complete but without credential manager
    expect(result).toBeDefined();
  });
});