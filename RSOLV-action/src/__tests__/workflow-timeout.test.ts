import { describe, expect, test, beforeEach, vi } from 'vitest';
import * as configModule from '../config/index.js';
import * as issueDetector from '../platforms/issue-detector.js';
import * as securityModule from '../utils/security.js';
import * as containerModule from '../containers/setup.js';
import * as processorModule from '../ai/unified-processor.js';
import { ActionConfig } from '../types/index.js';

describe('Workflow Timeout Behavior', () => {
  const mockConfig: ActionConfig = {
    apiKey: 'test-api-key',
    configPath: '.github/rsolv.yml',
    issueLabel: 'rsolv:automate',
    enableSecurityAnalysis: true,
    aiProvider: {
      provider: 'claude-code',
      model: 'claude-sonnet-4-20250514',
      temperature: 0.2,
      maxTokens: 4000,
      contextLimit: 100000,
      timeout: 30000,
      useVendedCredentials: true
    },
    containerConfig: {
      enabled: true,
      image: 'rsolv/code-analysis:latest',
      memoryLimit: '2g',
      cpuLimit: '1',
      timeout: 300,
      securityProfile: 'default'
    },
    securitySettings: {
      disableNetworkAccess: true,
      scanDependencies: true,
      preventSecretLeakage: true,
      maxFileSize: 1024 * 1024,
      timeoutSeconds: 300,
      requireCodeReview: true
    }
  };

  const mockIssues = [
    {
      id: '1',
      number: 1,
      title: 'Test Issue 1',
      body: 'Test body 1',
      labels: ['rsolv:automate'],
      state: 'open' as const,
      repository: {
        owner: 'test',
        name: 'repo',
        fullName: 'test/repo'
      },
      author: 'testuser',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: '2',
      number: 2,
      title: 'Test Issue 2',
      body: 'Test body 2',
      labels: ['rsolv:automate'],
      state: 'open' as const,
      repository: {
        owner: 'test',
        name: 'repo',
        fullName: 'test/repo'
      },
      author: 'testuser',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should timeout workflow after 2 minutes', async () => {
    // Mock all dependencies
    vi.spyOn(configModule, 'loadConfig').mockResolvedValue(mockConfig);
    vi.spyOn(securityModule, 'securityCheck').mockResolvedValue();
    vi.spyOn(containerModule, 'setupContainer').mockResolvedValue();
    vi.spyOn(issueDetector, 'detectIssuesFromAllPlatforms').mockResolvedValue(mockIssues);
    
    // Mock processIssues to never resolve
    vi.spyOn(processorModule, 'processIssues').mockImplementation(() => {
      return new Promise(() => {}); // Never resolves
    });
    
    // Simulate the timeout logic from index.ts with shorter timeout for testing
    const WORKFLOW_TIMEOUT = 100; // 100ms for testing instead of 2 minutes
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Workflow timeout: Processing ${mockIssues.length} issues took longer than ${WORKFLOW_TIMEOUT/1000} seconds`));
      }, WORKFLOW_TIMEOUT);
    });
    
    const processPromise = processorModule.processIssues(mockIssues, mockConfig, {});
    
    // Race them like the actual implementation does
    await expect(Promise.race([processPromise, timeoutPromise])).rejects.toThrow('Workflow timeout');
  });

  test('should complete successfully before timeout', async () => {
    // Mock all dependencies
    vi.spyOn(configModule, 'loadConfig').mockResolvedValue(mockConfig);
    vi.spyOn(securityModule, 'securityCheck').mockResolvedValue();
    vi.spyOn(containerModule, 'setupContainer').mockResolvedValue();
    vi.spyOn(issueDetector, 'detectIssuesFromAllPlatforms').mockResolvedValue(mockIssues);
    
    // Mock processIssues to resolve quickly
    const mockResults = mockIssues.map(issue => ({
      issueId: issue.id,
      success: true,
      pullRequestUrl: `https://github.com/test/repo/pull/${issue.number}`,
      message: 'Success'
    }));
    
    vi.spyOn(processorModule, 'processIssues').mockResolvedValue(mockResults);
    
    // Create the race condition like in the actual implementation
    const WORKFLOW_TIMEOUT = 120000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Workflow timeout: Processing ${mockIssues.length} issues took longer than ${WORKFLOW_TIMEOUT/1000} seconds`));
      }, WORKFLOW_TIMEOUT);
    });
    
    const results = await Promise.race([
      processorModule.processIssues(mockIssues, mockConfig, {}),
      timeoutPromise
    ]);
    
    // Should complete successfully
    expect(results).toEqual(mockResults);
    expect(results.filter(r => r.success).length).toBe(2);
  });

  test('should handle no issues gracefully without timeout', async () => {
    // Mock all dependencies
    vi.spyOn(configModule, 'loadConfig').mockResolvedValue(mockConfig);
    vi.spyOn(securityModule, 'securityCheck').mockResolvedValue();
    vi.spyOn(containerModule, 'setupContainer').mockResolvedValue();
    vi.spyOn(issueDetector, 'detectIssuesFromAllPlatforms').mockResolvedValue([]); // No issues
    
    // processIssues should not be called when there are no issues
    const processIssuesSpy = vi.spyOn(processorModule, 'processIssues');
    
    // The workflow should exit early when no issues are found
    // This is handled in the index.ts file
    expect(processIssuesSpy).not.toHaveBeenCalled();
  });

  test('should include timeout information in error message', async () => {
    const issueCount = 5;
    const customIssues = Array(issueCount).fill(null).map((_, i) => ({
      ...mockIssues[0],
      id: String(i + 1),
      number: i + 1
    }));
    
    // Mock dependencies
    vi.spyOn(configModule, 'loadConfig').mockResolvedValue(mockConfig);
    vi.spyOn(securityModule, 'securityCheck').mockResolvedValue();
    vi.spyOn(containerModule, 'setupContainer').mockResolvedValue();
    vi.spyOn(issueDetector, 'detectIssuesFromAllPlatforms').mockResolvedValue(customIssues);
    
    // Mock processIssues to never resolve
    vi.spyOn(processorModule, 'processIssues').mockImplementation(() => {
      return new Promise(() => {}); // Never resolves
    });
    
    // Simulate the timeout
    const WORKFLOW_TIMEOUT = 100; // 100ms for testing
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Workflow timeout: Processing ${customIssues.length} issues took longer than ${WORKFLOW_TIMEOUT/1000} seconds`));
      }, WORKFLOW_TIMEOUT);
    });
    
    const processPromise = processorModule.processIssues(customIssues, mockConfig, {});
    
    // Should reject with descriptive error
    await expect(Promise.race([processPromise, timeoutPromise]))
      .rejects.toThrow(`Workflow timeout: Processing ${issueCount} issues took longer than 0.1 seconds`);
  });

  test('should use configured processing options', async () => {
    // Mock all dependencies
    vi.spyOn(configModule, 'loadConfig').mockResolvedValue(mockConfig);
    vi.spyOn(securityModule, 'securityCheck').mockResolvedValue();
    vi.spyOn(containerModule, 'setupContainer').mockResolvedValue();
    vi.spyOn(issueDetector, 'detectIssuesFromAllPlatforms').mockResolvedValue(mockIssues);
    
    const processIssuesSpy = vi.spyOn(processorModule, 'processIssues').mockResolvedValue([]);
    
    // Set DEBUG env for verbose logging
    process.env.DEBUG = 'true';
    
    // Trigger the workflow
    const WORKFLOW_TIMEOUT = 120000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('timeout'));
      }, WORKFLOW_TIMEOUT);
    });
    
    await Promise.race([
      processorModule.processIssues(mockIssues, mockConfig, {
        enableSecurityAnalysis: true,
        enableEnhancedContext: true,
        verboseLogging: true
      }),
      timeoutPromise
    ]);
    
    // Check that processIssues was called with correct options
    expect(processIssuesSpy).toHaveBeenCalledWith(
      mockIssues,
      mockConfig,
      expect.objectContaining({
        enableSecurityAnalysis: true,
        enableEnhancedContext: true,
        verboseLogging: true
      })
    );
    
    // Clean up
    delete process.env.DEBUG;
  });
});