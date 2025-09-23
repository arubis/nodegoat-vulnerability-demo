/**
 * Tests for fix validation integration in git-based-processor
 * TDD Phase: RED - Writing failing tests first
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processIssueWithGit } from '../git-based-processor.js';
import { TestGeneratingSecurityAnalyzer } from '../test-generating-security-analyzer.js';
import { GitBasedTestValidator } from '../git-based-test-validator.js';
import { GitBasedClaudeCodeAdapter } from '../adapters/claude-code-git.js';
import { IssueContext, ActionConfig } from '../../types/index.js';
import { execSync } from 'child_process';
import nock from 'nock';

// Use vi.hoisted to define mock functions that need to be available during module initialization
const { 
  mockAnalyzeWithTestGeneration,
  mockValidateFixWithTests, 
  mockGenerateSolutionWithGit,
  mockCreatePullRequestFromGit,
  mockExecSync 
} = vi.hoisted(() => {
  return {
    mockAnalyzeWithTestGeneration: vi.fn(),
    mockValidateFixWithTests: vi.fn(),
    mockGenerateSolutionWithGit: vi.fn(),
    mockCreatePullRequestFromGit: vi.fn(),
    mockExecSync: vi.fn()
  };
});

// Mock modules
vi.mock('../test-generating-security-analyzer.js', () => ({
  TestGeneratingSecurityAnalyzer: vi.fn(() => ({
    analyzeWithTestGeneration: mockAnalyzeWithTestGeneration
  }))
}));

vi.mock('../git-based-test-validator.js', () => ({
  GitBasedTestValidator: vi.fn(() => ({
    validateFixWithTests: mockValidateFixWithTests
  }))
}));

vi.mock('../adapters/claude-code-git.js', () => ({
  GitBasedClaudeCodeAdapter: vi.fn(() => ({
    generateSolutionWithGit: mockGenerateSolutionWithGit
  }))
}));

vi.mock('../../github/pr-git.js', () => ({
  createPullRequestFromGit: mockCreatePullRequestFromGit
}));

// We'll use nock to mock GitHub API requests in the test setup

vi.mock('child_process', () => ({
  execSync: mockExecSync
}));

// Mock the analyzer
vi.mock('../analyzer.js', () => ({
  analyzeIssue: vi.fn(() => Promise.resolve({
    canBeFixed: true,
    issueType: 'security',
    estimatedComplexity: 'medium',
    suggestedApproach: 'Fix vulnerability',
    filesToModify: ['file.js'],
    requiredContext: []
  }))
}));

describe('Git-based processor with fix validation', () => {
  let mockConfig: ActionConfig;
  let mockIssue: IssueContext;
  let mockTestSuite: any;
  let mockValidationResult: any;

  beforeEach(() => {
    // Set up default mock implementations
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('git rev-parse HEAD')) {
        return 'abc123def456';
      }
      if (cmd.includes('git status --porcelain')) {
        return ''; // Clean working directory
      }
      if (cmd.includes('git diff')) {
        return '';
      }
      return '';
    });
    
    // Set GitHub token for tests
    process.env.GITHUB_TOKEN = 'test-github-token';
    
    // Set up nock to intercept GitHub API requests
    nock('https://api.github.com')
      .persist() // Allow multiple calls
      .get('/repos/test/repo')
      .reply(200, { default_branch: 'main' })
      .post('/repos/test/repo/pulls')
      .reply(201, {
        number: 1,
        html_url: 'https://github.com/test/repo/pull/1',
        id: 1,
        state: 'open'
      });
    
    // Setup test data
    mockConfig = {
      apiKey: 'test-key',
      githubToken: 'test-github-token',
      configPath: '',
      issueLabel: 'security',
      aiProvider: {
        provider: 'anthropic',
        model: 'claude-3',
        apiKey: 'test-key'
      },
      containerConfig: { enabled: false },
      securitySettings: {},
      enableSecurityAnalysis: true,
      fixValidation: {
        enabled: true,
        maxIterations: 3
      }
    };

    mockIssue = {
      id: 'test-1',
      number: 1,
      title: 'Security vulnerability',
      body: 'Found eval() usage',
      labels: ['security'],
      assignees: [],
      repository: {
        owner: 'test',
        name: 'repo',
        fullName: 'test/repo',
        defaultBranch: 'main',
        language: 'javascript'
      },
      source: 'test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    mockTestSuite = {
      red: {
        testName: 'should be vulnerable',
        testCode: 'test code',
        expectedBehavior: 'fails'
      },
      green: {
        testName: 'should be fixed',
        testCode: 'test code',
        expectedBehavior: 'passes'
      },
      refactor: {
        testName: 'should maintain functionality',
        testCode: 'test code',
        expectedBehavior: 'passes'
      }
    };

    mockValidationResult = {
      success: true,
      vulnerableCommit: {
        redTestPassed: false,
        greenTestPassed: false,
        refactorTestPassed: true
      },
      fixedCommit: {
        redTestPassed: true,
        greenTestPassed: true,
        refactorTestPassed: true
      },
      isValidFix: true
    };

    // Reset all mocks
    vi.clearAllMocks();
    
    // Re-apply default execSync mock after clearing
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('git rev-parse HEAD')) {
        return 'abc123def456';
      }
      if (cmd.includes('git status --porcelain')) {
        return ''; // Clean working directory
      }
      if (cmd.includes('git diff')) {
        return '';
      }
      return '';
    });
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GITHUB_TOKEN;
    nock.cleanAll();
  });

  describe('when fix validation is enabled', () => {
    it('should generate tests before creating fix', async () => {
      // Arrange
      mockAnalyzeWithTestGeneration.mockResolvedValue({
        canBeFixed: true,
        generatedTests: {
          success: true,
          testSuite: mockTestSuite,
          tests: [{
            framework: 'mocha',
            testCode: 'test code',
            testSuite: mockTestSuite
          }]
        }
      });
      
      // Also mock the git solution to proceed through the flow
      mockGenerateSolutionWithGit.mockResolvedValue({
        success: true,
        commitHash: 'fix123',
        filesModified: ['file.js'],
        summary: { title: 'Fix', description: 'Fixed' }
      });
      
      // Mock validation result
      mockValidateFixWithTests.mockResolvedValue({
        isValidFix: true,
        testResults: {
          beforeFix: { passed: false },
          afterFix: { passed: true }
        }
      });
      
      // Mock PR creation
      mockCreatePullRequestFromGit.mockResolvedValue({
        success: true,
        pullRequestUrl: 'https://github.com/test/repo/pull/1',
        pullRequestNumber: 1
      });

      // Act
      const result = await processIssueWithGit(mockIssue, mockConfig);
      
      // Debug output
      console.log('Result:', result);
      console.log('mockAnalyzeWithTestGeneration called:', mockAnalyzeWithTestGeneration.mock.calls.length);

      // Assert
      expect(mockAnalyzeWithTestGeneration).toHaveBeenCalledWith(
        mockIssue,
        mockConfig,
        expect.any(Map)
      );
    });

    it('should validate fix after generation', async () => {
      // Arrange
      // Mock test generation
      mockAnalyzeWithTestGeneration.mockResolvedValue({
        canBeFixed: true,
        generatedTests: {
          success: true,
          testSuite: mockTestSuite,
          tests: [{
            framework: 'mocha',
            testCode: 'test code',
            testSuite: mockTestSuite
          }]
        }
      });
      
      mockValidateFixWithTests.mockResolvedValue(mockValidationResult);
      
      mockGenerateSolutionWithGit.mockResolvedValue({
        success: true,
        commitHash: 'abc123',
        message: 'Fixed vulnerability',
        filesModified: ['file.js'],
        summary: { title: 'Fix', description: 'Fixed' }
      });
      
      mockCreatePullRequestFromGit.mockResolvedValue({
        success: true,
        pullRequestUrl: 'https://github.com/test/repo/pull/1',
        pullRequestNumber: 1
      });

      // Act
      await processIssueWithGit(mockIssue, mockConfig);

      // Assert
      expect(mockValidateFixWithTests).toHaveBeenCalledWith(
        expect.any(String), // before commit
        'abc123', // after commit
        mockTestSuite
      );
    });

    it('should retry with enhanced context when validation fails', async () => {
      // Arrange
      // Mock test generation
      mockAnalyzeWithTestGeneration.mockResolvedValue({
        canBeFixed: true,
        generatedTests: {
          success: true,
          testSuite: mockTestSuite,
          tests: [{
            framework: 'mocha',
            testCode: 'test code',
            testSuite: mockTestSuite
          }]
        }
      });
      
      const failedValidation = {
        ...mockValidationResult,
        isValidFix: false,
        fixedCommit: {
          redTestPassed: false, // Fix didn't work
          greenTestPassed: false,
          refactorTestPassed: true
        }
      };

      mockValidateFixWithTests
        .mockResolvedValueOnce(failedValidation) // First attempt fails
        .mockResolvedValueOnce(mockValidationResult); // Second attempt succeeds

      mockGenerateSolutionWithGit.mockResolvedValue({
        success: true,
        commitHash: 'abc123',
        message: 'Fixed vulnerability',
        filesModified: ['file.js'],
        summary: { title: 'Fix', description: 'Fixed' }
      });
      
      mockCreatePullRequestFromGit.mockResolvedValue({
        success: true,
        pullRequestUrl: 'https://github.com/test/repo/pull/1',
        pullRequestNumber: 1
      });

      // Act
      await processIssueWithGit(mockIssue, mockConfig);

      // Assert
      expect(mockGenerateSolutionWithGit).toHaveBeenCalledTimes(2);
      
      // Check second call has enhanced context
      const secondCallIssue = mockGenerateSolutionWithGit.mock.calls[1][0];
      expect(secondCallIssue.body).toContain('Previous Fix Attempt Failed');
      expect(secondCallIssue.body).toContain('RED test failed');
    });

    it('should respect configurable iteration limits', async () => {
      // Arrange
      mockConfig.fixValidation!.maxIterations = 2;
      
      // Mock test generation
      mockAnalyzeWithTestGeneration.mockResolvedValue({
        canBeFixed: true,
        generatedTests: {
          success: true,
          testSuite: mockTestSuite,
          tests: [{
            framework: 'mocha',
            testCode: 'test code',
            testSuite: mockTestSuite
          }]
        }
      });
      
      const failedValidation = {
        ...mockValidationResult,
        isValidFix: false
      };

      mockValidateFixWithTests.mockResolvedValue(failedValidation);

      mockGenerateSolutionWithGit.mockResolvedValue({
        success: true,
        commitHash: 'abc123',
        message: 'Fixed vulnerability',
        summary: { title: 'Fix', description: 'Fixed' }
      });

      // Act
      const result = await processIssueWithGit(mockIssue, mockConfig);

      // Assert
      expect(mockGenerateSolutionWithGit).toHaveBeenCalledTimes(2); // Not 3
      expect(result.success).toBe(false);
      expect(result.message).toContain('failed after 2 attempts');
    });

    it('should use label-based iteration override', async () => {
      // Arrange
      mockIssue.labels = ['security', 'fix-validation-max-5'];
      
      // Mock test generation
      mockAnalyzeWithTestGeneration.mockResolvedValue({
        canBeFixed: true,
        generatedTests: {
          success: true,
          testSuite: mockTestSuite,
          tests: [{
            framework: 'mocha',
            testCode: 'test code',
            testSuite: mockTestSuite
          }]
        }
      });
      
      const failedValidation = {
        ...mockValidationResult,
        isValidFix: false
      };

      mockValidateFixWithTests.mockResolvedValue(failedValidation);

      mockGenerateSolutionWithGit.mockResolvedValue({
        success: true,
        commitHash: 'abc123',
        message: 'Fixed'
      });

      // Act
      const result = await processIssueWithGit(mockIssue, mockConfig);

      // Assert
      expect(mockGenerateSolutionWithGit).toHaveBeenCalledTimes(5);
      expect(result.message).toContain('failed after 5 attempts');
    });

    it('should rollback changes when all iterations fail', async () => {
      // Arrange
      // Mock test generation
      mockAnalyzeWithTestGeneration.mockResolvedValue({
        canBeFixed: true,
        generatedTests: {
          success: true,
          testSuite: mockTestSuite,
          tests: [{
            framework: 'mocha',
            testCode: 'test code',
            testSuite: mockTestSuite
          }]
        }
      });
      
      const failedValidation = {
        ...mockValidationResult,
        isValidFix: false
      };

      mockValidateFixWithTests.mockResolvedValue(failedValidation);
      
      mockGenerateSolutionWithGit.mockResolvedValue({
        success: true,
        commitHash: 'abc123',
        message: 'Fixed vulnerability',
        summary: { title: 'Fix', description: 'Fixed' }
      });

      // Act
      await processIssueWithGit(mockIssue, mockConfig);

      // Assert
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('git reset --hard'),
        expect.any(Object)
      );
    });

    it('should skip validation when disabled', async () => {
      // Arrange
      mockConfig.fixValidation = { enabled: false };
      
      // Mock test generation even when validation is disabled
      mockAnalyzeWithTestGeneration.mockResolvedValue({
        canBeFixed: true,
        generatedTests: {
          success: true,
          testSuite: mockTestSuite,
          tests: [{
            framework: 'mocha',
            testCode: 'test code',
            testSuite: mockTestSuite
          }]
        }
      });
      
      mockGenerateSolutionWithGit.mockResolvedValue({
        success: true,
        commitHash: 'abc123',
        message: 'Fixed vulnerability',
        filesModified: ['file.js'],
        summary: { title: 'Fix', description: 'Fixed' }
      });
      
      mockCreatePullRequestFromGit.mockResolvedValue({
        success: true,
        pullRequestUrl: 'https://github.com/test/repo/pull/1',
        pullRequestNumber: 1
      });

      // Act
      await processIssueWithGit(mockIssue, mockConfig);

      // Assert
      expect(mockValidateFixWithTests).not.toHaveBeenCalled();
    });

    it('should create PR only when validation passes', async () => {
      // Arrange
      // Mock test generation
      mockAnalyzeWithTestGeneration.mockResolvedValue({
        canBeFixed: true,
        generatedTests: {
          success: true,
          testSuite: mockTestSuite,
          tests: [{
            framework: 'mocha',
            testCode: 'test code',
            testSuite: mockTestSuite
          }]
        }
      });
      
      mockValidateFixWithTests.mockResolvedValue(mockValidationResult);
      
      mockGenerateSolutionWithGit.mockResolvedValue({
        success: true,
        commitHash: 'abc123',
        message: 'Fixed vulnerability',
        filesModified: ['file.js'],
        summary: { title: 'Fix', description: 'Fixed' }
      });
      
      // PR mock is already configured at module level
      mockCreatePullRequestFromGit.mockResolvedValue({
        success: true,
        pullRequestUrl: 'https://github.com/test/repo/pull/456',  // Match MSW handler
        pullRequestNumber: 456  // Match MSW handler in src/test/mocks/handlers.ts
      });

      // Act
      const result = await processIssueWithGit(mockIssue, mockConfig);

      // Assert - PR should be created successfully
      expect(result.success).toBe(true);
      expect(result.pullRequestUrl).toBeDefined();
      expect(result.pullRequestUrl).toMatch(/https:\/\/github\.com\/test\/repo\/pull\/\d+/);
    });

    it('should include test code in enhanced context', async () => {
      // Arrange
      const failedValidation = {
        ...mockValidationResult,
        isValidFix: false
      };

      mockAnalyzeWithTestGeneration.mockResolvedValue({
        canBeFixed: true,
        generatedTests: {
          success: true,
          testSuite: mockTestSuite,
          tests: [{
            framework: 'jest',
            testCode: 'describe("security", () => { /* tests */ })',
            testSuite: mockTestSuite
          }]
        }
      });

      mockGenerateSolutionWithGit.mockResolvedValue({
        success: true,
        commitHash: 'abc123'
      });

      mockValidateFixWithTests.mockResolvedValue(failedValidation);

      // Act
      await processIssueWithGit(mockIssue, mockConfig);

      // Assert
      const enhancedCall = mockGenerateSolutionWithGit.mock.calls[1];
      expect(enhancedCall[0].body).toContain('describe("security"');
      expect(enhancedCall[0].body).toContain('Generated Test Code:');
    });

    it('should handle vulnerability type specific limits', async () => {
      // Arrange
      mockConfig.fixValidation = {
        enabled: true,
        maxIterations: 3,
        maxIterationsByType: {
          'sql-injection': 5,
          'command-injection': 4
        }
      };

      mockIssue.body = 'SQL injection vulnerability in user input';
      
      // Mock test generation
      mockAnalyzeWithTestGeneration.mockResolvedValue({
        canBeFixed: true,
        generatedTests: {
          success: true,
          testSuite: mockTestSuite,
          tests: [{
            framework: 'mocha',
            testCode: 'test code',
            testSuite: mockTestSuite
          }]
        }
      });

      const failedValidation = {
        ...mockValidationResult,
        isValidFix: false
      };

      mockValidateFixWithTests.mockResolvedValue(failedValidation);
      
      mockGenerateSolutionWithGit.mockResolvedValue({
        success: true,
        commitHash: 'abc123',
        message: 'Fixed vulnerability',
        summary: { title: 'Fix', description: 'Fixed' }
      });

      // Act
      const result = await processIssueWithGit(mockIssue, mockConfig);

      // Assert
      expect(result.message).toContain('failed after 5 attempts'); // SQL injection limit
    });
  });

  describe('when DISABLE_FIX_VALIDATION is set', () => {
    it('should skip validation when fixValidation.enabled is false', async () => {
      // Arrange
      mockConfig.fixValidation = {
        enabled: false, // This is set by DISABLE_FIX_VALIDATION='true'
        maxIterations: 3
      };

      mockAnalyzeWithTestGeneration.mockResolvedValue({
        canBeFixed: true,
        generatedTests: {
          success: true,
          testSuite: mockTestSuite,
          tests: []
        }
      });

      mockGenerateSolutionWithGit.mockResolvedValue({
        success: true,
        commitHash: 'abc123',
        message: 'Fixed vulnerability',
        filesModified: ['file.js'],
        summary: 'Fix applied',
        diffStats: '+10 -5'
      });

      // Configure the PR creation mock
      mockCreatePullRequestFromGit.mockResolvedValue({
        success: true,
        pullRequestNumber: 123,
        pullRequestUrl: 'https://github.com/test/repo/pull/123'
      });

      // Act
      const result = await processIssueWithGit(mockIssue, mockConfig);

      // Assert
      expect(mockValidateFixWithTests).not.toHaveBeenCalled();
      expect(mockGenerateSolutionWithGit).toHaveBeenCalledTimes(1);
      // The PR creation mock might not be called if real implementation is used with nock
      expect(result.success).toBe(true);
      expect(result.pullRequestUrl).toBeDefined();
    });

    it('should run validation when fixValidation.enabled is true', async () => {
      // Arrange
      mockConfig.fixValidation = {
        enabled: true, // This is the default when DISABLE_FIX_VALIDATION is not set
        maxIterations: 3
      };

      mockAnalyzeWithTestGeneration.mockResolvedValue({
        canBeFixed: true,
        generatedTests: {
          success: true,
          testSuite: mockTestSuite,
          tests: []
        }
      });

      mockGenerateSolutionWithGit.mockResolvedValue({
        success: true,
        commitHash: 'abc123',
        message: 'Fixed vulnerability',
        filesModified: ['file.js'],
        summary: { title: 'Fix', description: 'Fixed' }
      });

      mockValidateFixWithTests.mockResolvedValue(mockValidationResult);
      
      mockCreatePullRequestFromGit.mockResolvedValue({
        success: true,
        pullRequestUrl: 'https://github.com/test/repo/pull/1',
        pullRequestNumber: 1
      });

      // Act
      await processIssueWithGit(mockIssue, mockConfig);

      // Assert
      expect(mockValidateFixWithTests).toHaveBeenCalledWith(
        expect.any(String),
        'abc123',
        mockTestSuite
      );
    });

    it('should log when validation is skipped', async () => {
      // Arrange
      mockConfig.fixValidation = {
        enabled: false
      };
      
      // Mock test generation
      mockAnalyzeWithTestGeneration.mockResolvedValue({
        canBeFixed: true,
        generatedTests: {
          success: true,
          testSuite: mockTestSuite,
          tests: [{
            framework: 'mocha',
            testCode: 'test code',
            testSuite: mockTestSuite
          }]
        }
      });

      mockGenerateSolutionWithGit.mockResolvedValue({
        success: true,
        commitHash: 'abc123',
        message: 'Fixed',
        filesModified: ['file.js'],
        summary: 'Fix applied',
        diffStats: '+10 -5'
      });
      
      mockCreatePullRequestFromGit.mockResolvedValue({
        success: true,
        pullRequestUrl: 'https://github.com/test/repo/pull/1',
        pullRequestNumber: 1
      });

      // Import logger and spy on it directly
      const { logger } = await import('../../utils/logger.js');
      const loggerInfoSpy = vi.spyOn(logger, 'info');

      // Act  
      await processIssueWithGit(mockIssue, mockConfig);

      // Assert - check that logger.info was called with the expected message
      const logCalls = loggerInfoSpy.mock.calls;
      const hasSkipLog = logCalls.some((call: any[]) => 
        call[0]?.includes('Skipping fix validation') || 
        call[0]?.includes('DISABLE_FIX_VALIDATION')
      );
      
      expect(hasSkipLog).toBe(true);

      // Restore
      loggerInfoSpy.mockRestore();
    });
  });
});