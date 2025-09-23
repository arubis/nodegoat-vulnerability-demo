/**
 * Test suite for validation phase GitHub label updates
 * Tests that 'rsolv:validated' label is added after successful validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PhaseExecutor, ExecuteOptions } from '../index.js';
import { ActionConfig, IssueContext } from '../../../types/index.js';

// Mock all dependencies to isolate the label update behavior
vi.mock('../../../github/api.js', () => ({
  getIssuesByLabel: vi.fn(),
  addLabels: vi.fn(),
  removeLabel: vi.fn(),
}));

vi.mock('../../../ai/analyzer.js', () => ({
  analyzeIssue: vi.fn()
}));

vi.mock('../../validation-mode.js', () => ({
  ValidationMode: vi.fn()
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn()
}));

vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

describe('PhaseExecutor - Validation Label Updates', () => {
  let executor: PhaseExecutor;
  let mockConfig: ActionConfig;
  let mockIssue: IssueContext;

  // Import mocked modules
  const githubApi = await import('../../../github/api.js');
  const analyzer = await import('../../../ai/analyzer.js');
  const { ValidationMode } = await import('../../validation-mode.js');
  const fs = await import('fs');
  const { execSync } = await import('child_process');

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Setup mock config
    mockConfig = {
      apiKey: 'test-key',
      rsolvApiKey: 'test-rsolv-key',
      githubToken: 'test-token',
      mode: 'validate',
      aiProvider: {
        apiKey: 'test-ai-key',
        model: 'claude-3',
        maxTokens: 4000,
        useVendedCredentials: false
      }
    } as ActionConfig;

    mockIssue = {
      id: 'issue-456',
      number: 456,
      title: 'XSS vulnerability in login',
      body: 'Vulnerability in login.js',
      labels: ['rsolv:detected'],
      assignees: [],
      repository: {
        owner: 'test-owner',
        name: 'test-repo',
        fullName: 'test-owner/test-repo',
        defaultBranch: 'main'
      },
      source: 'github',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {}
    };

    executor = new PhaseExecutor(mockConfig);

    // Setup default mock behaviors
    (fs.existsSync as any).mockReturnValue(false);
    (fs.readFileSync as any).mockReturnValue('{}');
    (fs.writeFileSync as any).mockImplementation(() => {});
    (execSync as any).mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('git rev-parse HEAD')) return 'abc123def456';
      return '';
    });
    (githubApi.getIssuesByLabel as any).mockResolvedValue([mockIssue]);
    (githubApi.addLabels as any).mockResolvedValue(undefined);
    (githubApi.removeLabel as any).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Successful validation', () => {
    it('should add rsolv:validated label when vulnerability is validated', async () => {
      // Mock successful analysis
      (analyzer.analyzeIssue as any).mockResolvedValue({
        canBeFixed: true,
        isSecurityIssue: true
      });

      // Mock successful validation
      const mockValidationResult = {
        issueId: mockIssue.number,
        validated: true,
        branchName: 'validation-issue-456',
        redTests: { testSuite: 'test code' },
        testResults: { success: false, output: 'Tests failed as expected' },
        timestamp: new Date().toISOString(),
        commitHash: 'abc123def456'
      };

      (ValidationMode as any).mockImplementation(() => ({
        validateVulnerability: vi.fn().mockResolvedValue(mockValidationResult)
      }));

      // Execute validation
      const options: ExecuteOptions = {
        issues: [mockIssue]
      };

      const result = await executor.executeValidateStandalone(options);

      // Check validation succeeded
      expect(result.success).toBe(true);
      expect(result.phase).toBe('validate');

      // Verify labels were updated
      expect(githubApi.addLabels).toHaveBeenCalledWith(
        mockIssue.repository.owner,
        mockIssue.repository.name,
        mockIssue.number,
        ['rsolv:validated']
      );

      // Verify old label was removed
      expect(githubApi.removeLabel).toHaveBeenCalledWith(
        mockIssue.repository.owner,
        mockIssue.repository.name,
        mockIssue.number,
        'rsolv:detected'
      );
    });
  });

  describe('False positive handling', () => {
    it('should NOT add rsolv:validated label for false positives', async () => {
      // Mock successful analysis
      (analyzer.analyzeIssue as any).mockResolvedValue({
        canBeFixed: true,
        isSecurityIssue: true
      });

      // Mock false positive result
      const mockValidationResult = {
        issueId: mockIssue.number,
        validated: false,
        falsePositiveReason: 'Tests passed on allegedly vulnerable code',
        timestamp: new Date().toISOString(),
        commitHash: 'abc123def456'
      };

      (ValidationMode as any).mockImplementation(() => ({
        validateVulnerability: vi.fn().mockResolvedValue(mockValidationResult)
      }));

      const options: ExecuteOptions = {
        issues: [mockIssue]
      };

      await executor.executeValidateStandalone(options);

      // Should NOT add validated label
      expect(githubApi.addLabels).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.arrayContaining(['rsolv:validated'])
      );

      // Should add false-positive label instead
      expect(githubApi.addLabels).toHaveBeenCalledWith(
        mockIssue.repository.owner,
        mockIssue.repository.name,
        mockIssue.number,
        ['rsolv:false-positive']
      );
    });
  });

  describe('Testing mode', () => {
    it('should add rsolv:validated label even in testing mode', async () => {
      // Enable testing mode
      process.env.RSOLV_TESTING_MODE = 'true';

      (analyzer.analyzeIssue as any).mockResolvedValue({
        canBeFixed: true,
        isSecurityIssue: true
      });

      // Mock testing mode result
      const mockValidationResult = {
        issueId: mockIssue.number,
        validated: true,
        testingMode: true,
        testingModeNote: 'Tests passed but proceeding due to RSOLV_TESTING_MODE',
        timestamp: new Date().toISOString(),
        commitHash: 'abc123def456'
      };

      (ValidationMode as any).mockImplementation(() => ({
        validateVulnerability: vi.fn().mockResolvedValue(mockValidationResult)
      }));

      const options: ExecuteOptions = {
        issues: [mockIssue]
      };

      await executor.executeValidateStandalone(options);

      // Should still add validated label
      expect(githubApi.addLabels).toHaveBeenCalledWith(
        mockIssue.repository.owner,
        mockIssue.repository.name,
        mockIssue.number,
        ['rsolv:validated']
      );

      // Clean up
      delete process.env.RSOLV_TESTING_MODE;
    });
  });
});