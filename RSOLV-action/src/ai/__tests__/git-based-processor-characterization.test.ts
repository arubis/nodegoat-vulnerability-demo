/**
 * Characterization tests for processIssueWithGit function
 * These tests document the current behavior before refactoring to three-phase architecture
 * 
 * Test strategy:
 * 1. Mock all external dependencies (GitHub API, Claude Code, file system)
 * 2. Test each major code path through the function
 * 3. Verify exact behavior including error handling
 * 4. Document side effects (git operations, PR creation)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { processIssueWithGit, getMaxIterations } from '../git-based-processor.js';
import { IssueContext, ActionConfig } from '../../types/index.js';
import * as child_process from 'child_process';

// Hoist mock functions and classes so they're available in vi.mock factories
const { mockAnalyzeIssue, mockAnalyzeWithTestGeneration, mockValidateFixWithTests, mockCreatePullRequestFromGit, mockCreateEducationalPullRequest, mockGenerateSolutionWithGit, mockExistsSync, mockReadFileSync, mockExecSync, MockGitBasedClaudeCodeAdapter, MockTestGeneratingSecurityAnalyzer, MockGitBasedTestValidator } = vi.hoisted(() => {
  const analyzeIssue = vi.fn();
  const analyzeWithTestGeneration = vi.fn();
  const validateFixWithTests = vi.fn();
  const createPullRequestFromGit = vi.fn();
  const createEducationalPullRequest = vi.fn();
  const generateSolutionWithGit = vi.fn();
  const existsSync = vi.fn();
  const readFileSync = vi.fn();
  const execSync = vi.fn();
  
  class GitBasedClaudeCodeAdapter {
    generateSolutionWithGit = generateSolutionWithGit;
  }
  
  class TestGeneratingSecurityAnalyzer {
    analyzeWithTestGeneration = analyzeWithTestGeneration;
  }
  
  class GitBasedTestValidator {
    validateFixWithTests = validateFixWithTests;
  }
  
  return {
    mockAnalyzeIssue: analyzeIssue,
    mockAnalyzeWithTestGeneration: analyzeWithTestGeneration,
    mockValidateFixWithTests: validateFixWithTests,
    mockCreatePullRequestFromGit: createPullRequestFromGit,
    mockCreateEducationalPullRequest: createEducationalPullRequest,
    mockGenerateSolutionWithGit: generateSolutionWithGit,
    mockExistsSync: existsSync,
    mockReadFileSync: readFileSync,
    mockExecSync: execSync,
    MockGitBasedClaudeCodeAdapter: GitBasedClaudeCodeAdapter,
    MockTestGeneratingSecurityAnalyzer: TestGeneratingSecurityAnalyzer,
    MockGitBasedTestValidator: GitBasedTestValidator
  };
});

// Default mock return values
let gitStatusReturn = '';
let gitRevParseReturn = 'abc123def456\n';

// Set up default mock implementation
mockExecSync.mockImplementation((command: string, options?: any) => {
  if (command === 'git rev-parse HEAD') {
    return gitRevParseReturn;
  }
  if (command === 'git status --porcelain') {
    return gitStatusReturn;
  }
  if (command.startsWith('git reset --hard')) {
    return '';
  }
  return '';
});

// Mock child_process with dynamic returns
vi.mock('child_process', () => ({
  execSync: mockExecSync
}));

// Mock file system
vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync
  }
}));

// Mock logger with proper exports
vi.mock('../../utils/logger.js', () => ({
  Logger: class {
    info = vi.fn();
    error = vi.fn();
    warn = vi.fn();
    debug = vi.fn();
  },
  logger: {
    debug: vi.fn(() => {}),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

vi.mock('../analyzer.js', () => ({
  analyzeIssue: mockAnalyzeIssue
}));

vi.mock('../test-generating-security-analyzer.js', () => ({
  TestGeneratingSecurityAnalyzer: MockTestGeneratingSecurityAnalyzer
}));

vi.mock('../git-based-test-validator.js', () => ({
  GitBasedTestValidator: MockGitBasedTestValidator
}));

vi.mock('../../github/pr-git.js', () => ({
  createPullRequestFromGit: mockCreatePullRequestFromGit
}));

vi.mock('../../github/pr-git-educational.js', () => ({
  createEducationalPullRequest: mockCreateEducationalPullRequest
}));

vi.mock('../adapters/claude-code-git.js', () => ({
  GitBasedClaudeCodeAdapter: MockGitBasedClaudeCodeAdapter
}));

// Mock vulnerable file scanner
vi.mock('../vulnerable-file-scanner.js', () => ({
  getVulnerableFiles: vi.fn(async () => new Map())
}));

// Mock credential manager
class MockCredentialManager {}

vi.mock('../../credentials/singleton.js', () => ({
  CredentialManagerSingleton: {
    getInstance: vi.fn(async () => new MockCredentialManager())
  }
}));

describe('processIssueWithGit - Characterization Tests', () => {
  let mockIssue: IssueContext;
  let mockConfig: ActionConfig;

  beforeEach(() => {
    // Reset mock return values
    gitStatusReturn = '';
    gitRevParseReturn = 'abc123def456\n';
    
    // Reset all mocks
    mockAnalyzeIssue.mockClear();
    mockAnalyzeWithTestGeneration.mockClear();
    mockValidateFixWithTests.mockClear();
    mockCreatePullRequestFromGit.mockClear();
    mockCreateEducationalPullRequest.mockClear();
    mockGenerateSolutionWithGit.mockClear();
    mockExecSync.mockClear();
    
    // Reset execSync default implementation
    mockExecSync.mockImplementation((command: string, options?: any) => {
      if (command === 'git rev-parse HEAD') {
        return gitRevParseReturn;
      }
      if (command === 'git status --porcelain') {
        return gitStatusReturn;
      }
      if (command.startsWith('git reset --hard')) {
        return '';
      }
      return '';
    });
    
    // Setup default mock return values
    mockAnalyzeIssue.mockResolvedValue({
      canBeFixed: true,
      issueType: 'security',
      estimatedComplexity: 'simple',
      suggestedApproach: 'Fix SQL injection',
      filesToModify: ['src/auth/login.ts'],
      vulnerabilityType: 'sql-injection',
      severity: 'high',
      cwe: 'CWE-89'
    });
    
    mockAnalyzeWithTestGeneration.mockResolvedValue({
      analysis: { summary: 'SQL injection found' },
      generatedTests: {
        success: true,
        testSuite: 'test code here',
        tests: [{
          testCode: 'describe("SQL injection test")',
          framework: 'jest'
        }]
      }
    });
    
    mockValidateFixWithTests.mockResolvedValue({
      isValidFix: true,
      baselineCommit: {
        redTestPassed: false,
        greenTestPassed: true,
        refactorTestPassed: true
      },
      fixedCommit: {
        redTestPassed: true,
        greenTestPassed: true,
        refactorTestPassed: true
      }
    });
    
    mockCreatePullRequestFromGit.mockResolvedValue({
      success: true,
      message: 'PR created',
      pullRequestUrl: 'https://github.com/test/pr/1',
      pullRequestNumber: 1
    });
    
    mockCreateEducationalPullRequest.mockResolvedValue({
      success: true,
      message: 'Educational PR created',
      pullRequestUrl: 'https://github.com/test/pr/1',
      pullRequestNumber: 1
    });
    
    mockGenerateSolutionWithGit.mockResolvedValue({
      success: true,
      message: 'Fixed vulnerability',
      commitHash: 'fix123abc',
      filesModified: ['src/auth/login.ts'],
      diffStats: { insertions: 5, deletions: 3, filesChanged: 1 },
      summary: { description: 'Fixed SQL injection' }
    });
    
    // Setup default mock issue
    mockIssue = {
      id: 'github-123',
      number: 123,
      title: 'SQL Injection vulnerability in login',
      body: 'There is a SQL injection vulnerability in the login function',
      labels: ['rsolv:automate', 'security'],
      assignees: [],
      repository: {
        owner: 'test-owner',
        name: 'test-repo',
        fullName: 'test-owner/test-repo',
        defaultBranch: 'main',
        language: 'TypeScript'
      },
      source: 'github',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      metadata: {
        htmlUrl: 'https://github.com/test-owner/test-repo/issues/123',
        state: 'open',
        locked: false,
        draft: false
      }
    };

    // Setup default mock config
    mockConfig = {
      issueLabel: 'rsolv:automate',
      dryRun: false,
      autoMerge: false,
      aiProvider: {
        provider: 'anthropic',
        apiKey: 'test-api-key',
        model: 'claude-3-opus-20240229',
        maxTokens: 4096,
        useVendedCredentials: false
      },
      enableSecurityAnalysis: true,
      testGeneration: {
        enabled: true,
        validateFixes: true
      },
      fixValidation: {
        enabled: true,
        maxIterations: 3
      },
      useStructuredPhases: false
    } as ActionConfig;
  });

  describe('Phase 1: Git State Check', () => {
    test('should fail if repository has uncommitted changes', async () => {
      // Arrange
      gitStatusReturn = ' M src/index.ts\n M package.json';

      // Act
      const result = await processIssueWithGit(mockIssue, mockConfig);

      // Assert
      expect(result).toEqual({
        issueId: 'github-123',
        success: false,
        message: 'Repository has uncommitted changes',
        error: 'Uncommitted changes in: src/index.ts, package.json'
      });
    });

    test('should proceed with clean git state', async () => {
      // Arrange
      gitStatusReturn = '';
      mockAnalyzeIssue.mockResolvedValueOnce({
        canBeFixed: false,
        issueType: 'security',
        estimatedComplexity: 'simple',
        suggestedApproach: 'Fix SQL injection',
        filesToModify: []
      });

      // Act
      const result = await processIssueWithGit(mockIssue, mockConfig);

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toBe('Issue cannot be automatically fixed based on analysis');
    });
  });

  describe('Phase 2: Issue Analysis', () => {
    test('should stop if issue cannot be fixed', async () => {
      // Arrange
      gitStatusReturn = '';
      mockAnalyzeIssue.mockResolvedValueOnce({
        canBeFixed: false,
        issueType: 'documentation',
        estimatedComplexity: 'complex',
        suggestedApproach: 'Manual intervention required',
        filesToModify: []
      });

      // Act
      const result = await processIssueWithGit(mockIssue, mockConfig);

      // Assert
      expect(result).toEqual({
        issueId: 'github-123',
        success: false,
        message: 'Issue cannot be automatically fixed based on analysis'
      });
      expect(mockAnalyzeIssue).toHaveBeenCalledWith(mockIssue, mockConfig);
    });

    test('should proceed to test generation if issue can be fixed', async () => {
      // Arrange
      gitStatusReturn = '';
      
      // Act - run full flow with all mocks configured
      const result = await processIssueWithGit(mockIssue, mockConfig);

      // Assert
      expect(mockAnalyzeIssue).toHaveBeenCalled();
      expect(mockAnalyzeWithTestGeneration).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe('Phase 3: Test Generation', () => {
    test('should generate tests when test generation is enabled', async () => {
      // Arrange
      gitStatusReturn = '';
      
      // Act
      await processIssueWithGit(mockIssue, mockConfig);

      // Assert
      expect(mockAnalyzeWithTestGeneration).toHaveBeenCalledWith(
        mockIssue,
        mockConfig,
        expect.any(Map) // codebaseFiles
      );
    });

    test('should skip test generation when disabled', async () => {
      // Arrange
      gitStatusReturn = '';
      mockConfig.testGeneration = { enabled: false, validateFixes: false };
      mockConfig.fixValidation = { enabled: false };
      mockConfig.enableSecurityAnalysis = false;

      // Act
      await processIssueWithGit(mockIssue, mockConfig);

      // Assert
      expect(mockAnalyzeWithTestGeneration).not.toHaveBeenCalled();
    });
  });

  describe('Phase 4: Fix Validation Loop', () => {
    test('should validate fix when validation is enabled', async () => {
      // Arrange
      gitStatusReturn = '';
      
      // Act
      const result = await processIssueWithGit(mockIssue, mockConfig);

      // Assert
      expect(mockValidateFixWithTests).toHaveBeenCalledWith(
        'abc123def456', // beforeFixCommit (trimmed)
        'fix123abc',    // solution commit
        'test code here' // test suite
      );
      expect(result.success).toBe(true);
    });

    test('should retry fix when validation fails', async () => {
      // Arrange
      gitStatusReturn = '';
      let validationCount = 0;
      mockValidateFixWithTests.mockImplementation(async () => {
        validationCount++;
        return {
          isValidFix: validationCount >= 2, // Fail first, succeed second
          baselineCommit: {
            redTestPassed: false,
            greenTestPassed: true,
            refactorTestPassed: true
          },
          fixedCommit: {
            redTestPassed: validationCount >= 2,
            greenTestPassed: true,
            refactorTestPassed: true
          }
        };
      });

      // Act
      const result = await processIssueWithGit(mockIssue, mockConfig);

      // Assert
      expect(mockGenerateSolutionWithGit).toHaveBeenCalledTimes(2);
      expect(mockValidateFixWithTests).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
    });

    test('should fail after max iterations', async () => {
      // Arrange
      gitStatusReturn = '';
      mockConfig.fixValidation!.maxIterations = 2;

      mockValidateFixWithTests.mockResolvedValue({
        isValidFix: false,
        baselineCommit: {
          redTestPassed: false,
          greenTestPassed: true,
          refactorTestPassed: true
        },
        fixedCommit: {
          redTestPassed: false, // Always fail
          greenTestPassed: true,
          refactorTestPassed: true
        }
      });

      // Act
      const result = await processIssueWithGit(mockIssue, mockConfig);

      // Assert
      expect(mockGenerateSolutionWithGit).toHaveBeenCalledTimes(2);
      expect(mockValidateFixWithTests).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Fix validation failed after 2 attempts');
      expect(result.error).toContain('Fix validation failed - tests did not pass');
    });
  });

  describe('Phase 5: PR Creation', () => {
    test('should create educational PR by default', async () => {
      // Arrange
      gitStatusReturn = '';
      
      // Act
      const result = await processIssueWithGit(mockIssue, mockConfig);

      // Assert
      expect(mockCreateEducationalPullRequest).toHaveBeenCalledWith(
        mockIssue,
        'fix123abc',
        expect.objectContaining({
          description: 'Fixed SQL injection',
          vulnerabilityType: 'sql-injection',
          severity: 'high',
          cwe: 'CWE-89'
        }),
        mockConfig,
        { insertions: 5, deletions: 3, filesChanged: 1 }
      );
      expect(mockCreatePullRequestFromGit).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.pullRequestUrl).toBe('https://github.com/test/pr/1');
    });

    test('should use regular PR when educational is disabled', async () => {
      // Arrange
      gitStatusReturn = '';
      process.env.RSOLV_EDUCATIONAL_PR = 'false';

      // Act
      const result = await processIssueWithGit(mockIssue, mockConfig);

      // Assert
      expect(mockCreatePullRequestFromGit).toHaveBeenCalled();
      expect(mockCreateEducationalPullRequest).not.toHaveBeenCalled();
      expect(result.success).toBe(true);

      // Cleanup
      delete process.env.RSOLV_EDUCATIONAL_PR;
    });

    test('should rollback commit if PR creation fails', async () => {
      // Arrange
      gitStatusReturn = '';
      mockCreateEducationalPullRequest.mockResolvedValueOnce({
        success: false,
        message: 'PR creation failed',
        error: 'GitHub API error'
      });

      // Act
      const result = await processIssueWithGit(mockIssue, mockConfig);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('GitHub API error');
    });
  });

  describe('Error Handling', () => {
    test('should handle and rollback on unexpected errors', async () => {
      // Arrange
      gitStatusReturn = '';
      mockAnalyzeIssue.mockRejectedValueOnce(new Error('Analysis failed'));

      // Act
      const result = await processIssueWithGit(mockIssue, mockConfig);

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toBe('Error processing issue');
      expect(result.error).toBe('Analysis failed');
    });

    test('should handle git command failures gracefully', async () => {
      // Arrange - simulate git status command failure
      mockAnalyzeIssue.mockResolvedValue({
        canBeFixed: true,
        issueType: 'security',
        estimatedComplexity: 'simple',
        suggestedApproach: 'Fix injection',
        filesToModify: ['src/db.js'],
        vulnerabilityType: 'sql-injection',
        severity: 'high',
        cwe: 'CWE-89'
      });
      
      // Make execSync throw an error for git status
      mockExecSync.mockImplementation((command: string) => {
        if (command === 'git status --porcelain') {
          throw new Error('Not a git repository');
        }
        if (command === 'git rev-parse HEAD') {
          return gitRevParseReturn;
        }
        return '';
      });

      // Act
      const result = await processIssueWithGit(mockIssue, mockConfig);

      // Assert - When git status fails, it's treated as uncommitted changes
      expect(result.success).toBe(false);
      expect(result.message).toBe('Repository has uncommitted changes');
      expect(result.error).toBe('Uncommitted changes in: unknown');
    });
  });

  describe('getMaxIterations', () => {
    test('should use issue label override first', () => {
      // Arrange
      const issue = { ...mockIssue, labels: ['fix-validation-max-5', 'other'] };

      // Act
      const maxIterations = getMaxIterations(issue, mockConfig);

      // Assert
      expect(maxIterations).toBe(5);
    });

    test('should use global config if no label override', () => {
      // Arrange
      mockConfig.fixValidation = { enabled: true, maxIterations: 7 };

      // Act
      const maxIterations = getMaxIterations(mockIssue, mockConfig);

      // Assert
      expect(maxIterations).toBe(7);
    });

    test('should use default if no config', () => {
      // Arrange
      const config = { ...mockConfig, fixValidation: undefined };

      // Act
      const maxIterations = getMaxIterations(mockIssue, config);

      // Assert
      expect(maxIterations).toBe(3);
    });

    test('should handle vulnerability type specific config', () => {
      // Arrange
      mockConfig.fixValidation = {
        enabled: true,
        maxIterations: 3,
        maxIterationsByType: {
          'sql-injection': 5,
          'xss': 4
        }
      };
      const sqlIssue = {
        ...mockIssue,
        title: 'Fix SQL injection vulnerability',
        body: 'SQL injection in login'
      };

      // Act
      const maxIterations = getMaxIterations(sqlIssue, mockConfig);

      // Assert
      expect(maxIterations).toBe(5);
    });
  });
});