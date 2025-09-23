/**
 * Test for git-based processor test mode behavior
 * In test mode, we should create PRs even when validation fails
 */

import { GitBasedProcessor } from '../git-based-processor';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('child_process');
jest.mock('fs');
jest.mock('../claude/sdk');
jest.mock('../../utils/logger');

describe('GitBasedProcessor - Test Mode', () => {
  let processor: GitBasedProcessor;
  const mockIssue = {
    id: '123',
    number: 1,
    title: 'Test vulnerability',
    body: 'Test issue body',
    repository: {
      fullName: 'test/repo',
      defaultBranch: 'main'
    },
    labels: ['bug'],
    specificVulnerabilities: []
  };

  const mockConfig = {
    aiProvider: {
      apiKey: 'test-key',
      model: 'claude-3'
    },
    fixValidation: {
      enabled: true,
      maxRetries: 3
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new GitBasedProcessor(mockConfig as any);

    // Mock git operations
    (execSync as jest.Mock).mockImplementation((cmd: string) => {
      if (cmd.includes('git diff')) {
        return 'diff --git a/file.js b/file.js\n+fixed code';
      }
      if (cmd.includes('git log')) {
        return 'commit abc123\nFix: test';
      }
      if (cmd.includes('git rev-parse')) {
        return 'abc123';
      }
      return '';
    });
  });

  describe('when RSOLV_TESTING_MODE is enabled', () => {
    beforeEach(() => {
      process.env.RSOLV_TESTING_MODE = 'true';
    });

    afterEach(() => {
      delete process.env.RSOLV_TESTING_MODE;
    });

    it('should create PR even when validation fails', async () => {
      // Mock validation failure
      const mockValidationResult = {
        success: false,
        error: 'Tests failed'
      };

      // Mock Claude SDK to return a fix
      jest.spyOn(processor as any, 'generateFixWithClaude').mockResolvedValue({
        files: {
          'file.js': {
            original: 'vulnerable code',
            fixed: 'fixed code',
            changes: 'fixed code'
          }
        }
      });

      // Mock validation to fail
      jest.spyOn(processor as any, 'validateFixWithTests').mockResolvedValue(mockValidationResult);

      const result = await processor.processIssue(mockIssue as any, mockConfig as any);

      // Should still return success with PR details
      expect(result.success).toBe(true);
      expect(result.message).toContain('test mode');
      expect(result.pullRequestUrl).toBeDefined();
      expect(result.testModeNote).toContain('validation failed but PR created');
    });

    it('should include validation failure details in PR body', async () => {
      // Mock validation failure with details
      const mockValidationResult = {
        success: false,
        error: 'Specific test failed: XSS still present',
        failedTests: ['test1', 'test2']
      };

      jest.spyOn(processor as any, 'generateFixWithClaude').mockResolvedValue({
        files: {
          'file.js': {
            original: 'vulnerable code',
            fixed: 'fixed code',
            changes: 'fixed code'
          }
        }
      });

      jest.spyOn(processor as any, 'validateFixWithTests').mockResolvedValue(mockValidationResult);

      const result = await processor.processIssue(mockIssue as any, mockConfig as any);

      expect(result.success).toBe(true);
      expect(result.prBody).toContain('⚠️ Test Mode');
      expect(result.prBody).toContain('Validation failed');
      expect(result.prBody).toContain('Specific test failed: XSS still present');
    });

    it('should not rollback changes when validation fails in test mode', async () => {
      const mockValidationResult = {
        success: false,
        error: 'Tests failed'
      };

      jest.spyOn(processor as any, 'generateFixWithClaude').mockResolvedValue({
        files: {
          'file.js': {
            original: 'vulnerable code',
            fixed: 'fixed code',
            changes: 'fixed code'
          }
        }
      });

      jest.spyOn(processor as any, 'validateFixWithTests').mockResolvedValue(mockValidationResult);

      await processor.processIssue(mockIssue as any, mockConfig as any);

      // Should not call git reset --hard (rollback)
      expect(execSync).not.toHaveBeenCalledWith(
        expect.stringContaining('git reset --hard'),
        expect.any(Object)
      );
    });

    it('should mark PR title as test mode', async () => {
      const mockValidationResult = {
        success: false,
        error: 'Tests failed'
      };

      jest.spyOn(processor as any, 'generateFixWithClaude').mockResolvedValue({
        files: {
          'file.js': {
            original: 'vulnerable code',
            fixed: 'fixed code',
            changes: 'fixed code'
          }
        }
      });

      jest.spyOn(processor as any, 'validateFixWithTests').mockResolvedValue(mockValidationResult);

      const result = await processor.processIssue(mockIssue as any, mockConfig as any);

      expect(result.prTitle).toContain('[TEST MODE]');
    });
  });

  describe('when RSOLV_TESTING_MODE is disabled', () => {
    beforeEach(() => {
      delete process.env.RSOLV_TESTING_MODE;
    });

    it('should not create PR when validation fails', async () => {
      const mockValidationResult = {
        success: false,
        error: 'Tests failed'
      };

      jest.spyOn(processor as any, 'generateFixWithClaude').mockResolvedValue({
        files: {
          'file.js': {
            original: 'vulnerable code',
            fixed: 'fixed code',
            changes: 'fixed code'
          }
        }
      });

      jest.spyOn(processor as any, 'validateFixWithTests').mockResolvedValue(mockValidationResult);

      const result = await processor.processIssue(mockIssue as any, mockConfig as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
      expect(result.pullRequestUrl).toBeUndefined();
    });

    it('should rollback changes when validation fails', async () => {
      const mockValidationResult = {
        success: false,
        error: 'Tests failed'
      };

      jest.spyOn(processor as any, 'generateFixWithClaude').mockResolvedValue({
        files: {
          'file.js': {
            original: 'vulnerable code',
            fixed: 'fixed code',
            changes: 'fixed code'
          }
        }
      });

      jest.spyOn(processor as any, 'validateFixWithTests').mockResolvedValue(mockValidationResult);

      await processor.processIssue(mockIssue as any, mockConfig as any);

      // Should call git reset --hard to rollback
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('git reset --hard'),
        expect.any(Object)
      );
    });
  });
});