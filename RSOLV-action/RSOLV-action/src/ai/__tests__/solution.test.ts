import { describe, expect, test, vi } from 'vitest';
import { generateSolution } from '../solution.js';
import { IssueContext, ActionConfig, AnalysisData } from '../../types/index.js';

// Mock the AI client using require.resolve
// Removed require.resolve
vi.mock('../client', () => {
  return {
    getAiClient: () => ({
      complete: async () => `Here's the solution:

--- src/component.ts ---
\`\`\`
Updated component code with better error handling
\`\`\`

--- src/util.ts ---
\`\`\`
Added validation functions
\`\`\`

This fixes the error handling in the component.`
    })
  };
});

// Mock the Claude Code adapter
vi.mock('../adapters/claude-code', () => {
  return {
    ClaudeCodeAdapter: class MockClaudeCodeAdapter {
      constructor(_config: any, _repoPath: string) {}
      
      async generateSolution(_issue: any, _analysis: any) {
        return {
          success: true,
          changes: {
            'src/auth/login.js': 'Fixed SQL injection with parameterized queries',
            'src/auth/validation.js': 'Added input validation'
          },
          metadata: {
            model: 'claude-sonnet-4-20250514',
            contextGathering: 'enhanced',
            totalFiles: 15,
            analysisTime: 2500
          }
        };
      }
    }
  };
});

// Mock the credentials manager using require.resolve
// Removed require.resolve
vi.mock('../../credentials/manager', () => ({
  initialize: async () => {
    throw new Error('Test mode - using mock credentials');
  },
  exchangeForProviderCredentials: async () => ({
    provider: 'anthropic',
    apiKey: 'mock-api-key',
    model: 'claude-3-5-sonnet-20241022'
  })
}));

// Mock the GitHub files module using require.resolve
// Removed require.resolve
vi.mock('../../github/files', () => ({
  getRepositoryFiles: async () => ({
    'src/component.ts': '// Original component code',
    'src/util.ts': '// Original util code'
  })
}));

describe('Solution Generator', () => {
  test('generateSolution should return solution from AI client', async () => {
    const issueContext: IssueContext = {
      id: '123',
      number: 123,
      source: 'github',
      title: 'Test Issue',
      body: 'This is a test issue description',
      labels: ['bug', 'AUTOFIX'],
      assignees: [],
      repository: {
        owner: 'test-owner',
        name: 'test-repo',
        fullName: 'test-owner/test-repo',
        defaultBranch: 'main',
        language: 'JavaScript'
      },
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z'
    };
    
    const analysis: AnalysisData = {
      issueType: 'bug',
      filesToModify: ['src/component.ts', 'src/util.ts'],
      estimatedComplexity: 'medium',
      requiredContext: [],
      suggestedApproach: 'Fix error handling',
      canBeFixed: true,
      confidenceScore: 0.8
    };
    
    const config: ActionConfig = {
      apiKey: 'test-api-key',
      configPath: '.github/rsolv.yml',
      issueLabel: 'rsolv',
      aiProvider: {
        provider: 'anthropic',
        apiKey: 'test-api-key',
        model: 'claude-3-sonnet'
      },
      containerConfig: {
        enabled: false
      },
      securitySettings: {
        disableNetworkAccess: true
      }
    };
    
    const solution = await generateSolution(issueContext, analysis, config);
    
    expect(solution).toBeDefined();
    expect(solution.success).toBe(true);
    expect(solution.message).toBeDefined();
    expect(solution.changes).toBeDefined();
    expect(solution.changes!['src/component.ts']).toBeDefined();
    expect(solution.changes!['src/util.ts']).toBeDefined();
    expect(solution.changes!['src/component.ts']).toContain('Updated component code');
  });

  test('generateSolution should use Claude Code adapter when provider is claude-code', async () => {
    const issueContext: IssueContext = {
      id: '456',
      number: 456,
      source: 'github',
      title: 'SQL Injection Security Issue',
      body: 'Fix SQL injection vulnerabilities in authentication system',
      labels: ['security', 'rsolv:automate'],
      assignees: [],
      repository: {
        owner: 'demo-owner',
        name: 'demo-repo',
        fullName: 'demo-owner/demo-repo',
        defaultBranch: 'main',
        language: 'JavaScript'
      },
      url: 'https://github.com/demo-owner/demo-repo/issues/456',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const analysis: AnalysisData = {
      complexity: 'medium',
      estimatedTime: 45,
      issueType: 'security',
      filesToModify: ['src/auth/login.js', 'src/auth/validation.js'],
      relatedFiles: ['src/auth/login.js', 'src/auth/validation.js'],
      suggestedApproach: 'Fix SQL injection vulnerabilities',
      riskLevel: 'high',
      estimatedComplexity: 'medium',
      requiredContext: [],
      canBeFixed: true,
      confidenceScore: 0.8
    };

    const config: ActionConfig = {
      configPath: '.github/rsolv.yml',
      issueLabel: 'rsolv:automate',
      rsolvApiKey: 'test-key',
      aiProvider: {
        provider: 'claude-code',  // This should trigger Claude Code adapter
        model: 'claude-sonnet-4-20250514',
        temperature: 0.2,
        maxTokens: 4000,
        contextLimit: 100000,
        timeout: 60000,
        useVendedCredentials: false,  // Don't use vended credentials in test
        apiKey: 'test-api-key'  // Provide API key directly
      },
      enableSecurityAnalysis: true,
      containerConfig: {
        enabled: false,
        image: 'rsolv/code-analysis:latest',
        memoryLimit: '2g',
        cpuLimit: '1',
        timeout: 300,
        securityProfile: 'default'
      }
    };
    
    const solution = await generateSolution(issueContext, analysis, config);
    
    // Verify Claude Code adapter was used
    expect(solution).toBeDefined();
    expect(solution.success).toBe(true);
    expect(solution.message).toBe('Solution generated with Claude Code');
    expect(solution.changes).toBeDefined();
    expect(solution.changes!['src/auth/login.js']).toBe('Fixed SQL injection with parameterized queries');
    expect(solution.changes!['src/auth/validation.js']).toBe('Added input validation');
  });

  test('generateSolution should fallback to standard AI client for non-claude-code providers', async () => {
    const issueContext: IssueContext = {
      id: '789',
      number: 789,
      source: 'github',
      title: 'Standard Issue',
      body: 'Regular issue for standard processing',
      labels: ['bug', 'rsolv:automate'],
      assignees: [],
      repository: {
        owner: 'test-owner',
        name: 'test-repo',
        fullName: 'test-owner/test-repo',
        defaultBranch: 'main',
        language: 'JavaScript'
      },
      url: 'https://github.com/test-owner/test-repo/issues/789',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const analysis: AnalysisData = {
      complexity: 'low',
      estimatedTime: 15,
      issueType: 'bug',
      filesToModify: ['src/component.ts'],
      relatedFiles: ['src/component.ts'],
      suggestedApproach: 'Fix component error handling',
      riskLevel: 'low',
      estimatedComplexity: 'low',
      requiredContext: [],
      canBeFixed: true,
      confidenceScore: 0.9
    };

    const config: ActionConfig = {
      configPath: '.github/rsolv.yml',
      issueLabel: 'rsolv:automate',
      rsolvApiKey: 'test-key',
      aiProvider: {
        provider: 'anthropic',  // Standard Anthropic provider, not claude-code
        model: 'claude-3-sonnet-20240229',
        temperature: 0.2,
        maxTokens: 4000,
        contextLimit: 100000,
        timeout: 60000,
        useVendedCredentials: true
      },
      enableSecurityAnalysis: true,
      containerConfig: {
        enabled: false,
        image: 'rsolv/code-analysis:latest',
        memoryLimit: '2g',
        cpuLimit: '1',
        timeout: 300,
        securityProfile: 'default'
      }
    };
    
    const solution = await generateSolution(issueContext, analysis, config);
    
    // Verify standard AI client was used (not Claude Code adapter)
    expect(solution).toBeDefined();
    expect(solution.success).toBe(true);
    expect(solution.changes).toBeDefined();
    expect(solution.changes!['src/component.ts']).toContain('Updated component code');
  });
});