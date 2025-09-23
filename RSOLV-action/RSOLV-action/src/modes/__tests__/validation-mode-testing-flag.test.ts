/**
 * Test suite for RFC-059 RSOLV_TESTING_MODE functionality
 * Tests that validation proceeds regardless of test results when in testing mode
 */

import { ValidationMode } from '../validation-mode';
import { IssueContext, ActionConfig } from '../../types/index';
import * as analyzer from '../../ai/analyzer';
import { TestGeneratingSecurityAnalyzer } from '../../ai/test-generating-security-analyzer';
import { GitBasedTestValidator } from '../../ai/git-based-test-validator';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Mock dependencies
jest.mock('../../ai/analyzer');
jest.mock('../../ai/test-generating-security-analyzer');
jest.mock('../../ai/git-based-test-validator');
jest.mock('child_process');
jest.mock('fs');

describe('ValidationMode - RSOLV_TESTING_MODE', () => {
  let validationMode: ValidationMode;
  let mockConfig: ActionConfig;
  let mockIssue: IssueContext;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };

    // Setup mocks
    mockConfig = {
      apiKey: 'test-key',
      rsolvApiKey: 'test-rsolv-key',
      githubToken: 'test-token',
      mode: 'validate'
    } as ActionConfig;

    mockIssue = {
      id: 'issue-123',
      number: 123,
      title: 'XSS vulnerability in NodeGoat',
      body: 'Known vulnerability in app/routes/profile.js',
      labels: ['rsolv:automate'],
      assignees: [],
      repository: {
        owner: 'RSOLV-dev',
        name: 'nodegoat-vulnerability-demo',
        fullName: 'RSOLV-dev/nodegoat-vulnerability-demo',
        defaultBranch: 'main'
      },
      source: 'github',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {}
    };

    validationMode = new ValidationMode(mockConfig);

    // Mock file system operations
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.readFileSync as jest.Mock).mockReturnValue('{}');
    (fs.writeFileSync as jest.Mock).mockImplementation(() => {});

    // Mock git operations
    (execSync as jest.Mock).mockImplementation((cmd: string) => {
      if (cmd.includes('git status')) return 'nothing to commit, working tree clean';
      if (cmd.includes('git rev-parse HEAD')) return 'abc123def456';
      if (cmd.includes('git checkout -b')) return '';
      if (cmd.includes('git add')) return '';
      if (cmd.includes('git commit')) return '';
      return '';
    });
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('Normal mode (RSOLV_TESTING_MODE not set)', () => {
    it('should mark as false positive when tests pass', async () => {
      // Setup: tests pass (no vulnerability)
      (analyzer.analyzeIssue as jest.Mock).mockResolvedValue({
        canBeFixed: true,
        isSecurityIssue: true
      });

      const mockTestGenerator = {
        generateTestsWithAnalysis: jest.fn().mockResolvedValue({
          generatedTests: {
            testSuite: 'test code here'
          }
        })
      };
      TestGeneratingSecurityAnalyzer.prototype.generateTestsWithAnalysis =
        mockTestGenerator.generateTestsWithAnalysis;

      const mockValidator = {
        validateFixWithTests: jest.fn().mockResolvedValue({
          success: true, // Tests pass = no vulnerability
          output: 'All tests passed'
        })
      };
      GitBasedTestValidator.prototype.validateFixWithTests =
        mockValidator.validateFixWithTests;

      const result = await validationMode.validateVulnerability(mockIssue);

      expect(result.validated).toBe(false);
      expect(result.falsePositiveReason).toBe('Tests passed on allegedly vulnerable code');
      expect(result.testingMode).toBeUndefined();
    });

    it('should mark as validated when tests fail', async () => {
      // Setup: tests fail (vulnerability exists)
      (analyzer.analyzeIssue as jest.Mock).mockResolvedValue({
        canBeFixed: true,
        isSecurityIssue: true
      });

      const mockTestGenerator = {
        generateTestsWithAnalysis: jest.fn().mockResolvedValue({
          generatedTests: {
            testSuite: 'test code here'
          }
        })
      };
      TestGeneratingSecurityAnalyzer.prototype.generateTestsWithAnalysis =
        mockTestGenerator.generateTestsWithAnalysis;

      const mockValidator = {
        validateFixWithTests: jest.fn().mockResolvedValue({
          success: false, // Tests fail = vulnerability exists
          output: 'Test failed: XSS vulnerability detected'
        })
      };
      GitBasedTestValidator.prototype.validateFixWithTests =
        mockValidator.validateFixWithTests;

      const result = await validationMode.validateVulnerability(mockIssue);

      expect(result.validated).toBe(true);
      expect(result.falsePositiveReason).toBeUndefined();
      expect(result.testingMode).toBeUndefined();
    });
  });

  describe('Testing mode (RSOLV_TESTING_MODE=true)', () => {
    beforeEach(() => {
      process.env.RSOLV_TESTING_MODE = 'true';
    });

    it('should mark as validated even when tests pass', async () => {
      // Setup: tests pass (would normally be false positive)
      (analyzer.analyzeIssue as jest.Mock).mockResolvedValue({
        canBeFixed: true,
        isSecurityIssue: true
      });

      const mockTestGenerator = {
        generateTestsWithAnalysis: jest.fn().mockResolvedValue({
          generatedTests: {
            testSuite: 'test code here'
          }
        })
      };
      TestGeneratingSecurityAnalyzer.prototype.generateTestsWithAnalysis =
        mockTestGenerator.generateTestsWithAnalysis;

      const mockValidator = {
        validateFixWithTests: jest.fn().mockResolvedValue({
          success: true, // Tests pass - would normally be false positive
          output: 'All tests passed'
        })
      };
      GitBasedTestValidator.prototype.validateFixWithTests =
        mockValidator.validateFixWithTests;

      const result = await validationMode.validateVulnerability(mockIssue);

      // In testing mode, should be validated even though tests passed
      expect(result.validated).toBe(true);
      expect(result.testingMode).toBe(true);
      expect(result.testingModeNote).toBe('Tests passed but proceeding due to RSOLV_TESTING_MODE');
      expect(result.falsePositiveReason).toBeUndefined();
    });

    it('should still mark as validated when tests fail', async () => {
      // Setup: tests fail (vulnerability exists)
      (analyzer.analyzeIssue as jest.Mock).mockResolvedValue({
        canBeFixed: true,
        isSecurityIssue: true
      });

      const mockTestGenerator = {
        generateTestsWithAnalysis: jest.fn().mockResolvedValue({
          generatedTests: {
            testSuite: 'test code here'
          }
        })
      };
      TestGeneratingSecurityAnalyzer.prototype.generateTestsWithAnalysis =
        mockTestGenerator.generateTestsWithAnalysis;

      const mockValidator = {
        validateFixWithTests: jest.fn().mockResolvedValue({
          success: false, // Tests fail = vulnerability exists
          output: 'Test failed: XSS vulnerability detected'
        })
      };
      GitBasedTestValidator.prototype.validateFixWithTests =
        mockValidator.validateFixWithTests;

      const result = await validationMode.validateVulnerability(mockIssue);

      // Should be validated normally
      expect(result.validated).toBe(true);
      expect(result.testingMode).toBeUndefined(); // Not set when tests fail normally
      expect(result.testingModeNote).toBeUndefined();
    });

    it('should include testing mode info in validation branch operations', async () => {
      // Setup for testing branch creation
      (analyzer.analyzeIssue as jest.Mock).mockResolvedValue({
        canBeFixed: true,
        isSecurityIssue: true
      });

      const mockTestGenerator = {
        generateTestsWithAnalysis: jest.fn().mockResolvedValue({
          generatedTests: {
            testSuite: 'test code here'
          }
        })
      };
      TestGeneratingSecurityAnalyzer.prototype.generateTestsWithAnalysis =
        mockTestGenerator.generateTestsWithAnalysis;

      const mockValidator = {
        validateFixWithTests: jest.fn().mockResolvedValue({
          success: true, // Tests pass
          output: 'All tests passed'
        })
      };
      GitBasedTestValidator.prototype.validateFixWithTests =
        mockValidator.validateFixWithTests;

      const result = await validationMode.validateVulnerability(mockIssue);

      // Verify branch operations still work in testing mode
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('git checkout -b'),
        expect.any(Object)
      );

      expect(result.validated).toBe(true);
      expect(result.branchName).toBeDefined();
      expect(result.testingMode).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should respect RSOLV_TESTING_MODE=false as normal mode', async () => {
      process.env.RSOLV_TESTING_MODE = 'false';

      // Setup: tests pass
      (analyzer.analyzeIssue as jest.Mock).mockResolvedValue({
        canBeFixed: true,
        isSecurityIssue: true
      });

      const mockTestGenerator = {
        generateTestsWithAnalysis: jest.fn().mockResolvedValue({
          generatedTests: {
            testSuite: 'test code here'
          }
        })
      };
      TestGeneratingSecurityAnalyzer.prototype.generateTestsWithAnalysis =
        mockTestGenerator.generateTestsWithAnalysis;

      const mockValidator = {
        validateFixWithTests: jest.fn().mockResolvedValue({
          success: true, // Tests pass
          output: 'All tests passed'
        })
      };
      GitBasedTestValidator.prototype.validateFixWithTests =
        mockValidator.validateFixWithTests;

      const result = await validationMode.validateVulnerability(mockIssue);

      // Should behave as normal mode
      expect(result.validated).toBe(false);
      expect(result.falsePositiveReason).toBe('Tests passed on allegedly vulnerable code');
      expect(result.testingMode).toBeUndefined();
    });

    it('should handle testing mode with test generation failure', async () => {
      process.env.RSOLV_TESTING_MODE = 'true';

      // Setup: test generation fails
      (analyzer.analyzeIssue as jest.Mock).mockResolvedValue({
        canBeFixed: true,
        isSecurityIssue: true
      });

      const mockTestGenerator = {
        generateTestsWithAnalysis: jest.fn().mockResolvedValue({
          generatedTests: null // Test generation failed
        })
      };
      TestGeneratingSecurityAnalyzer.prototype.generateTestsWithAnalysis =
        mockTestGenerator.generateTestsWithAnalysis;

      const result = await validationMode.validateVulnerability(mockIssue);

      // Even in testing mode, should fail if tests can't be generated
      expect(result.validated).toBe(false);
      expect(result.falsePositiveReason).toBe('Unable to generate validation tests');
      expect(result.testingMode).toBeUndefined();
    });

    it('should handle testing mode with analysis failure', async () => {
      process.env.RSOLV_TESTING_MODE = 'true';

      // Setup: analysis determines it can't be fixed
      (analyzer.analyzeIssue as jest.Mock).mockResolvedValue({
        canBeFixed: false,
        cannotFixReason: 'Not a real security issue',
        isSecurityIssue: false
      });

      const result = await validationMode.validateVulnerability(mockIssue);

      // Even in testing mode, should respect analysis results
      expect(result.validated).toBe(false);
      expect(result.falsePositiveReason).toBe('Not a real security issue');
      expect(result.testingMode).toBeUndefined();
    });
  });
});