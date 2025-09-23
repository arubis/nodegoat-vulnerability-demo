/**
 * TDD RED Test: PhaseExecutor ValidationMode Integration
 *
 * This test defines the expected behavior for RFC-058 integration:
 * PhaseExecutor should use ValidationMode class instead of inline validation logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PhaseExecutor } from '../../modes/phase-executor/index.js';
import { ValidationMode } from '../../modes/validation-mode.js';
import { ActionConfig, IssueContext } from '../../types/index.js';

// Mock ValidationMode to verify it's being called
vi.mock('../../modes/validation-mode.js', () => ({
  ValidationMode: vi.fn().mockImplementation(() => ({
    validateVulnerability: vi.fn().mockResolvedValue({
      issueId: 123,
      validated: true,
      branchName: 'rsolv/validate/issue-123',
      redTests: 'test content',
      timestamp: new Date().toISOString(),
      commitHash: 'abc123'
    }),
    validateBatch: vi.fn().mockResolvedValue([
      {
        issueId: 123,
        validated: true,
        branchName: 'rsolv/validate/issue-123'
      },
      {
        issueId: 124,
        validated: false,
        falsePositiveReason: 'Tests passed on vulnerable code'
      }
    ])
  }))
}));

// Mock GitHub API
vi.mock('../../github/api.js', () => ({
  getIssue: vi.fn().mockResolvedValue({
    number: 123,
    title: 'SQL Injection in user input',
    body: 'Test issue body',
    labels: [{ name: 'security' }],
    assignees: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })
}));

describe('PhaseExecutor ValidationMode Integration', () => {
  let phaseExecutor: PhaseExecutor;
  let mockConfig: ActionConfig;
  let mockIssue: IssueContext;

  beforeEach(() => {
    mockConfig = {
      rsolvApiKey: 'test-key',
      mode: 'validate',
      aiProvider: {
        provider: 'anthropic',
        apiKey: 'test-anthropic-key',
        model: 'claude-3-5-sonnet-20241022',
        maxTokens: 8192,
        temperature: 0.1,
        useVendedCredentials: false
      }
    };

    mockIssue = {
      id: 'test-123',
      number: 123,
      title: 'SQL Injection in user input',
      body: 'Test issue body',
      labels: ['security'],
      assignees: [],
      repository: {
        owner: 'test-org',
        name: 'test-repo',
        fullName: 'test-org/test-repo',
        defaultBranch: 'main'
      },
      source: 'github',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {}
    };

    phaseExecutor = new PhaseExecutor(mockConfig);

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('RED Test: ValidationMode Integration', () => {
    it('should use ValidationMode class for validation instead of inline logic', async () => {
      // This test will FAIL until we integrate ValidationMode into PhaseExecutor

      // Execute validation mode
      const result = await phaseExecutor.execute('validate', {
        repository: mockIssue.repository,
        issueNumber: mockIssue.number
      });

      // Verify ValidationMode was instantiated and called
      expect(ValidationMode).toHaveBeenCalledWith(
        expect.objectContaining({
          rsolvApiKey: 'test-key',
          aiProvider: expect.objectContaining({
            provider: 'anthropic',
            model: 'claude-3-5-sonnet-20241022'
          })
        }),
        expect.any(String) // repoPath
      );

      // Verify validateVulnerability was called
      const mockValidationInstance = vi.mocked(ValidationMode).mock.results[0].value;
      expect(mockValidationInstance.validateVulnerability).toHaveBeenCalledWith(
        expect.objectContaining({
          number: mockIssue.number,
          repository: mockIssue.repository
        })
      );

      // Verify result includes RFC-058 features
      expect(result.success).toBe(true);
      expect(result.phase).toBe('validate');
      expect(result.data).toMatchObject({
        validation: expect.objectContaining({
          validated: true,
          branchName: 'rsolv/validate/issue-123'
        })
      });
    });

    it('should pass correct configuration to ValidationMode', async () => {
      // Execute validation
      await phaseExecutor.execute('validate', {
        repository: mockIssue.repository,
        issueNumber: mockIssue.number
      });

      // Verify ValidationMode was created with proper config
      expect(ValidationMode).toHaveBeenCalledWith(
        expect.objectContaining({
          // Core config
          rsolvApiKey: 'test-key',
          mode: 'validate',

          // AI provider config
          aiProvider: expect.objectContaining({
            provider: 'anthropic',
            apiKey: 'test-anthropic-key',
            model: 'claude-3-5-sonnet-20241022',
            maxTokens: 8192,
            temperature: 0.1,
            useVendedCredentials: false
          })
        }),
        process.cwd() // default repo path
      );
    });

    it('should handle ValidationMode errors gracefully', async () => {
      // Create a fresh ValidationMode mock that throws an error
      vi.doMock('../../modes/validation-mode.js', () => ({
        ValidationMode: vi.fn().mockImplementation(() => ({
          validateVulnerability: vi.fn().mockRejectedValue(
            new Error('Validation failed')
          )
        }))
      }));

      // Create new PhaseExecutor instance
      const errorPhaseExecutor = new PhaseExecutor(mockConfig);

      // Execute validation
      const result = await errorPhaseExecutor.execute('validate', {
        repository: mockIssue.repository,
        issueNumber: mockIssue.number
      });

      // Should handle error gracefully
      expect(result.success).toBe(false);
      expect(result.phase).toBe('validate');
      expect(result.error).toContain('Validation failed');
    });

    it('should support batch validation through ValidationMode', async () => {
      // Execute with multiple issues (this uses executeValidateStandalone)
      const mockIssue2 = { ...mockIssue, number: 124 };
      const result = await phaseExecutor.execute('validate', {
        issues: [mockIssue, mockIssue2]
      });

      // Verify ValidationMode was called for each issue individually in batch mode
      const mockValidationClass = vi.mocked(ValidationMode);

      // Should have instantiated ValidationMode instances for each issue
      expect(mockValidationClass).toHaveBeenCalledTimes(2);

      // Should process multiple issues
      expect(result.success).toBe(true);
      expect(result.data?.validations).toHaveLength(2);

      // Verify batch contains the issues
      expect(result.data?.validations[0].issueNumber).toBe(123);
      expect(result.data?.validations[1].issueNumber).toBe(124);
    });
  });

  describe('RFC-058 Feature Verification', () => {
    it('should create validation branches during validation phase', async () => {
      const result = await phaseExecutor.execute('validate', {
        repository: mockIssue.repository,
        issueNumber: mockIssue.number
      });

      // Verify branch creation is enabled in result
      expect(result.data?.validation?.branchName).toBe('rsolv/validate/issue-123');
    });

    it('should store branch reference for mitigation phase', async () => {
      const result = await phaseExecutor.execute('validate', {
        repository: mockIssue.repository,
        issueNumber: mockIssue.number
      });

      // ValidationMode should store branch reference in phase data
      const mockValidationInstance = vi.mocked(ValidationMode).mock.results[0]?.value;
      expect(mockValidationInstance.validateVulnerability).toHaveBeenCalled();

      // Result should include branch reference for mitigation
      expect(result.data?.validation).toMatchObject({
        validated: true,
        branchName: expect.stringMatching(/^rsolv\/validate\/issue-\d+$/)
      });
    });
  });
});