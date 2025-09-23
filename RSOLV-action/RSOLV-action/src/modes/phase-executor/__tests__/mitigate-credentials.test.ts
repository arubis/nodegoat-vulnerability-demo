import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PhaseExecutor } from '../index.js';
import { ActionConfig } from '../../../types/index.js';

describe('PhaseExecutor - Mitigate Phase Credential Handling', () => {
  let executor: PhaseExecutor;
  let mockConfig: ActionConfig;
  
  beforeEach(() => {
    // Setup mock config with vended credentials enabled
    mockConfig = {
      apiKey: undefined, // No direct API key
      rsolvApiKey: 'rsolv_test_key_123',
      aiProvider: {
        provider: 'claude-code',
        model: 'claude-sonnet-4',
        useVendedCredentials: true, // This should be true by default
        temperature: 0.2,
        maxTokens: 4000,
        contextLimit: 100000,
        timeout: 3600000
      },
      repository: {
        owner: 'test-owner',
        name: 'test-repo'
      },
      createIssues: false,
      useGitBasedEditing: true,
      enableSecurityAnalysis: true
    } as ActionConfig;
    
    // Set environment variables
    process.env.RSOLV_API_KEY = 'rsolv_test_key_123';
    process.env.GITHUB_TOKEN = 'github_test_token';
    process.env.GITHUB_REPOSITORY = 'test-owner/test-repo';
    
    executor = new PhaseExecutor(mockConfig);
  });
  
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.RSOLV_API_KEY;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPOSITORY;
  });
  
  it('should pass rsolvApiKey and useVendedCredentials to processIssues', async () => {
    // Mock the imports
    const mockProcessIssues = vi.fn().mockResolvedValue([{
      issueId: 'issue-1',
      success: true,
      pullRequestUrl: 'https://github.com/test/repo/pull/1'
    }]);
    
    // We'll spy on the actual processIssues call instead
    const processIssuesModule = await import('../../../ai/unified-processor.js');
    vi.spyOn(processIssuesModule, 'processIssues').mockImplementation(mockProcessIssues);
    
    // Mock GitHub API
    const githubApiModule = await import('../../../github/api.js');
    vi.spyOn(githubApiModule, 'getIssue').mockResolvedValue({
      id: 'issue-1',
      number: 123,
      title: 'Test Issue',
      body: '## Vulnerabilities\n- XSS in file.js:10',
      labels: ['rsolv:validated']
    });
    vi.spyOn(githubApiModule, 'addLabels').mockResolvedValue(undefined);
    vi.spyOn(githubApiModule, 'createIssueComment').mockResolvedValue(undefined);
    
    // Mock phase data client - need correct structure for validation data
    executor.phaseDataClient.getPhaseData = vi.fn().mockResolvedValue({
      phase: 'validate',
      data: {
        validation: {
          'issue-123': {  // Key should be issue-{number}
            confidence: 0.9,
            hasSpecificVulnerabilities: true,
            vulnerabilities: [{ file: 'test.js', line: 10, type: 'XSS' }]
          }
        },
        vulnerabilities: [{ file: 'test.js', line: 10, type: 'XSS' }]
      },
      timestamp: new Date().toISOString()
    });
    
    executor.phaseDataClient.retrievePhaseResults = vi.fn().mockResolvedValue({
      validation: {
        'issue-123': {
          confidence: 0.9,
          hasSpecificVulnerabilities: true,
          vulnerabilities: [{ file: 'test.js', line: 10, type: 'XSS' }]
        }
      }
    });
    
    executor.phaseDataClient.storePhaseData = vi.fn().mockResolvedValue(undefined);
    
    // Execute mitigate phase
    const result = await executor.executeMitigate({
      repository: {
        owner: 'test-owner',
        name: 'test-repo',
        defaultBranch: 'main'
      },
      issueNumber: 123
    });
    
    // Verify processIssues was called with correct config
    expect(mockProcessIssues).toHaveBeenCalled();
    const [issues, config] = mockProcessIssues.mock.calls[0];
    
    // Check that rsolvApiKey is passed
    expect(config.rsolvApiKey).toBe('rsolv_test_key_123');
    
    // Check that useVendedCredentials is true
    expect(config.aiProvider.useVendedCredentials).toBe(true);
    
    // Verify success
    expect(result.success).toBe(true);
  });
  
  it('should fail gracefully when rsolvApiKey is missing but vended credentials are enabled', async () => {
    // Remove rsolvApiKey
    delete mockConfig.rsolvApiKey;
    delete process.env.RSOLV_API_KEY;
    
    const executorNoKey = new PhaseExecutor(mockConfig);
    
    // Mock GitHub API
    const githubApiModule = await import('../../../github/api.js');
    vi.spyOn(githubApiModule, 'getIssue').mockResolvedValue({
      id: 'issue-1',
      number: 123,
      title: 'Test Issue',
      body: '## Vulnerabilities\n- XSS in file.js:10',
      labels: ['rsolv:validated']
    });
    
    // Mock phase data client with correct structure
    executorNoKey.phaseDataClient.getPhaseData = vi.fn().mockResolvedValue({
      phase: 'validate',
      data: {
        validation: {
          'issue-123': {
            confidence: 0.9,
            hasSpecificVulnerabilities: true,
            vulnerabilities: [{ file: 'test.js', line: 10, type: 'XSS' }]
          }
        },
        vulnerabilities: [{ file: 'test.js', line: 10, type: 'XSS' }]
      },
      timestamp: new Date().toISOString()
    });
    
    executorNoKey.phaseDataClient.retrievePhaseResults = vi.fn().mockResolvedValue({
      validation: {
        'issue-123': {
          confidence: 0.9,
          hasSpecificVulnerabilities: true,
          vulnerabilities: [{ file: 'test.js', line: 10, type: 'XSS' }]
        }
      }
    });
    
    // This should fail because vended credentials are enabled but no key is provided
    const result = await executorNoKey.executeMitigate({
      repository: {
        owner: 'test-owner',
        name: 'test-repo',
        defaultBranch: 'main'
      },
      issueNumber: 123
    });
    
    // Should fail with appropriate error
    expect(result.success).toBe(false);
    expect(result.error).toContain('RSOLV_API_KEY');
  });
});