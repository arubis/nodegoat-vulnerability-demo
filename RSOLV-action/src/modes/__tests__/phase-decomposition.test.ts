/**
 * Tests for phase decomposition of processIssueWithGit
 * Testing the extracted phases from processIssueWithGit
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { PhaseExecutor } from '../phase-executor/index.js';
import { IssueContext, ActionConfig } from '../../types/index.js';
import * as childProcess from 'child_process';

describe('Phase Decomposition - processIssueWithGit refactoring', () => {
  let executor: PhaseExecutor;
  let mockConfig: ActionConfig;
  let mockIssue: IssueContext;

  beforeEach(() => {
    // Reset mocks
    vi.restoreAllMocks();
    
    // Mock analyzeIssue to return proper structure
    vi.mock('../../ai/analyzer.js', () => ({
      analyzeIssue: vi.fn(() => Promise.resolve({
        canBeFixed: true,
        issueType: 'sql-injection',
        filesToModify: ['user.js'],
        suggestedApproach: 'Use parameterized queries',
        estimatedComplexity: 'medium',
        vulnerabilityType: 'SQL_INJECTION',
        severity: 'high'
      }))
    }));
    
    // Mock git status to be clean by default
    vi.mock('child_process', () => ({
      execSync: vi.fn((cmd: string) => {
        if (cmd.includes('git status')) {
          return ''; // Clean status
        }
        if (cmd.includes('git rev-parse HEAD')) {
          return 'abc123def456';
        }
        return '';
      })
    }));
    
    mockConfig = {
      aiProvider: {
        provider: 'anthropic',
        apiKey: 'test-key',
        model: 'claude-3',
        maxTokens: 4000
      },
      enableSecurityAnalysis: true,
      fixValidation: {
        enabled: true,
        maxIterations: 3
      },
      testGeneration: {
        enabled: true,
        validateFixes: true
      }
    } as ActionConfig;

    mockIssue = {
      id: 'issue-123',
      number: 123,
      title: 'SQL Injection in user.js',
      body: 'Found SQL injection vulnerability',
      labels: ['rsolv:automate'],
      assignees: [],
      repository: {
        owner: 'test',
        name: 'repo',
        fullName: 'test/repo',
        defaultBranch: 'main',
        language: 'JavaScript'
      },
      source: 'github',
      createdAt: '2025-08-06T10:00:00Z',
      updatedAt: '2025-08-06T10:00:00Z',
      metadata: {}
    };

    executor = new PhaseExecutor(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Scan Phase Extraction', () => {
    test('executeScanForIssue should analyze issue and determine if fixable', async () => {
      // This method doesn't exist yet - RED phase
      const result = await executor.executeScanForIssue(mockIssue);
      
      expect(result.success).toBe(true);
      expect(result.phase).toBe('scan');
      expect(result.data).toHaveProperty('canBeFixed');
      expect(result.data).toHaveProperty('analysisData');
      expect(result.data).toHaveProperty('gitStatus');
    });

    test('executeScanForIssue should fail if git has uncommitted changes', async () => {
      // Mock dirty git state
      const mockCheckGitStatus = vi.fn(() => ({
        clean: false,
        modifiedFiles: ['file1.js', 'file2.js']
      }));
      
      executor.checkGitStatus = mockCheckGitStatus;
      
      const result = await executor.executeScanForIssue(mockIssue);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Uncommitted changes');
    });

    test('executeScanForIssue should store scan results in PhaseDataClient', async () => {
      const storeSpy = vi.fn(() => Promise.resolve());
      executor.phaseDataClient.storePhaseResults = storeSpy;
      
      await executor.executeScanForIssue(mockIssue);
      
      expect(storeSpy).toHaveBeenCalledWith(
        'scan',
        expect.objectContaining({
          scan: expect.objectContaining({
            analysisData: expect.any(Object),
            canBeFixed: expect.any(Boolean)
          })
        }),
        expect.any(Object)
      );
    });
  });

  describe('Validate Phase Extraction', () => {
    test('executeValidateForIssue should generate tests for vulnerability', async () => {
      // This method doesn't exist yet - RED phase
      const scanData = {
        analysisData: {
          canBeFixed: true,
          issueType: 'sql-injection',
          filesToModify: ['user.js']
        }
      };
      
      const result = await executor.executeValidateForIssue(mockIssue, scanData);
      
      expect(result.success).toBe(true);
      expect(result.phase).toBe('validate');
      expect(result.data).toHaveProperty('validation');
      // The validation is structured as { 'issue-123': { validated, redTests, testResults, ... } }
      const issueKey = `issue-${mockIssue.number}`;
      expect(result.data.validation).toHaveProperty(issueKey);
      expect(result.data.validation[issueKey]).toHaveProperty('validated');
      expect(result.data.validation[issueKey]).toHaveProperty('testResults');
    });

    test('executeValidateForIssue should use TestGeneratingSecurityAnalyzer', async () => {
      const mockAnalyzer = {
        analyzeWithTestGeneration: vi.fn(() => Promise.resolve({
          generatedTests: {
            success: true,
            testSuite: 'test code here',
            tests: [{
              testCode: 'test code',
              framework: 'jest'
            }]
          }
        }))
      };
      
      executor.testGeneratingAnalyzer = mockAnalyzer;
      
      const scanData = {
        analysisData: {
          canBeFixed: true,
          filesToModify: ['user.js']
        }
      };
      
      const result = await executor.executeValidateForIssue(mockIssue, scanData);
      
      expect(mockAnalyzer.analyzeWithTestGeneration).toHaveBeenCalled();
      // Check the validation structure
      const issueKey = `issue-${mockIssue.number}`;
      expect(result.data.validation[issueKey]).toHaveProperty('validated');
      expect(result.data.validation[issueKey].testResults).toBeDefined();
    });

    test('executeValidateForIssue should store validation results', async () => {
      const storeSpy = vi.fn(() => Promise.resolve());
      executor.phaseDataClient.storePhaseResults = storeSpy;
      
      const scanData = {
        analysisData: {
          canBeFixed: true,
          filesToModify: ['user.js']
        }
      };
      
      await executor.executeValidateForIssue(mockIssue, scanData);
      
      // The storePhaseResults is called with the phase name and data
      expect(storeSpy).toHaveBeenCalled();
      expect(storeSpy).toHaveBeenCalledWith(
        'validate',
        expect.any(Object), // The actual structure varies
        expect.any(Object)
      );
    });
  });

  describe('Mitigate Phase Extraction', () => {
    test('executeMitigateForIssue should apply fix using Claude Code', async () => {
      // Mock the Claude Code adapter
      vi.mock('../../ai/adapters/claude-code-git.js', () => ({
        GitBasedClaudeCodeAdapter: class {
          constructor() {}
          async generateSolutionWithGit() {
            return {
              success: true,
              commitHash: 'fix-commit-123',
              summary: { title: 'Fix SQL injection' },
              filesModified: ['user.js'],
              diffStats: { insertions: 10, deletions: 5, filesChanged: 1 }
            };
          }
        }
      }));
      
      // Mock PR creation
      vi.mock('../../github/pr-git-educational.js', () => ({
        createEducationalPullRequest: vi.fn(() => Promise.resolve({
          success: true,
          pullRequestUrl: 'https://github.com/test/repo/pull/1',
          pullRequestNumber: 1
        }))
      }));
      
      vi.mock('../../github/pr-git.js', () => ({
        createPullRequestFromGit: vi.fn(() => Promise.resolve({
          success: true,
          pullRequestUrl: 'https://github.com/test/repo/pull/1',
          pullRequestNumber: 1
        }))
      }));
      
      // Mock test validator directly on executor instance
      executor.gitBasedValidator = {
        validateFixWithTests: vi.fn(() => Promise.resolve({
          isValidFix: true,
          fixedCommit: {
            redTestPassed: true,
            greenTestPassed: true,
            refactorTestPassed: true
          }
        }))
      } as any;
      
      const validationData = {
        generatedTests: {
          success: true,
          testSuite: {
            red: {
              testName: 'SQL Injection RED test',
              testCode: 'assert(vulnerabilityExists())',
              expectedBehavior: 'Should detect vulnerability'
            },
            green: {
              testName: 'SQL Injection GREEN test',
              testCode: 'assert(!vulnerabilityExists())',
              expectedBehavior: 'Should pass after fix'
            },
            refactor: {
              testName: 'Refactor validation test',
              testCode: 'assert(functionalityPreserved())',
              expectedBehavior: 'Should maintain functionality'
            }
          },
          tests: [{
            testCode: 'test',
            framework: 'jest'
          }]
        }
      };
      
      const scanData = {
        analysisData: {
          canBeFixed: true,
          issueType: 'sql-injection',
          suggestedApproach: 'Use parameterized queries'
        }
      };
      
      const result = await executor.executeMitigateForIssue(
        mockIssue, 
        scanData,
        validationData
      );
      
      if (!result.success) {
        console.log('Test result:', result);
      }
      expect(result.success).toBe(true);
      expect(result.phase).toBe('mitigate');
      // The data is structured as { 'issue-123': { fixed, prUrl, fixCommit, timestamp } }
      const issueKey = `issue-${mockIssue.number}`;
      expect(result.data).toHaveProperty(issueKey);
      expect(result.data[issueKey]).toHaveProperty('fixed', true);
      expect(result.data[issueKey]).toHaveProperty('prUrl');
      expect(result.data[issueKey]).toHaveProperty('fixCommit');
    });

    test('executeMitigateForIssue should validate fix with generated tests', async () => {
      const mockValidator = {
        validateFixWithTests: vi.fn(() => Promise.resolve({
          isValidFix: true,
          fixedCommit: {
            redTestPassed: true,
            greenTestPassed: true,
            refactorTestPassed: true
          }
        }))
      };
      
      executor.gitBasedValidator = mockValidator;
      
      const validationData = {
        generatedTests: {
          success: true,
          testSuite: 'test code'
        }
      };
      
      const scanData = {
        analysisData: {
          canBeFixed: true
        }
      };
      
      await executor.executeMitigateForIssue(mockIssue, scanData, validationData);
      
      expect(mockValidator.validateFixWithTests).toHaveBeenCalled();
    });

    test('executeMitigateForIssue should retry on validation failure', async () => {
      let attemptCount = 0;
      const mockValidator = {
        validateFixWithTests: vi.fn(() => {
          attemptCount++;
          return Promise.resolve({
            isValidFix: attemptCount >= 2, // Fail first, succeed second
            fixedCommit: {
              redTestPassed: attemptCount >= 2,
              greenTestPassed: true,
              refactorTestPassed: true
            }
          });
        })
      };
      
      executor.gitBasedValidator = mockValidator;
      executor.maxIterations = 3;
      
      const validationData = {
        generatedTests: {
          success: true,
          testSuite: 'test code'
        }
      };
      
      const scanData = {
        analysisData: {
          canBeFixed: true
        }
      };
      
      const result = await executor.executeMitigateForIssue(
        mockIssue, 
        scanData, 
        validationData
      );
      
      expect(attemptCount).toBe(2);
      expect(result.success).toBe(true);
    });
  });

  describe('Full Three-Phase Execution', () => {
    test('executeThreePhaseForIssue should run all phases sequentially', async () => {
      // This method doesn't exist yet - RED phase
      const result = await executor.executeThreePhaseForIssue(mockIssue);
      
      expect(result.success).toBe(true);
      expect(result.phase).toBe('three-phase');
      expect(result.data).toHaveProperty('scan');
      expect(result.data).toHaveProperty('validation');
      expect(result.data).toHaveProperty('mitigation');
    });

    test('executeThreePhaseForIssue should abort if scan determines not fixable', async () => {
      executor.executeScanForIssue = vi.fn(() => Promise.resolve({
        success: true,
        phase: 'scan',
        data: {
          canBeFixed: false,
          analysisData: {
            canBeFixed: false,
            reason: 'Too complex'
          }
        }
      }));
      
      const result = await executor.executeThreePhaseForIssue(mockIssue);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('cannot be fixed');
      expect(result.data).not.toHaveProperty('validation');
      expect(result.data).not.toHaveProperty('mitigation');
    });

    test('executeThreePhaseForIssue should pass data between phases', async () => {
      const scanSpy = vi.fn(() => Promise.resolve({
        success: true,
        phase: 'scan',
        data: { canBeFixed: true, analysisData: { test: 'scan' } }
      }));
      
      const validateSpy = vi.fn(() => Promise.resolve({
        success: true,
        phase: 'validate',
        data: { generatedTests: { test: 'validate' } }
      }));
      
      const mitigateSpy = vi.fn(() => Promise.resolve({
        success: true,
        phase: 'mitigate',
        data: { pullRequestUrl: 'https://github.com/pr/1' }
      }));
      
      executor.executeScanForIssue = scanSpy;
      executor.executeValidateForIssue = validateSpy;
      executor.executeMitigateForIssue = mitigateSpy;
      
      await executor.executeThreePhaseForIssue(mockIssue);
      
      // Validate should receive scan data
      expect(validateSpy).toHaveBeenCalledWith(
        mockIssue,
        expect.objectContaining({ analysisData: { test: 'scan' } })
      );
      
      // Mitigate should receive both scan and validation data
      expect(mitigateSpy).toHaveBeenCalledWith(
        mockIssue,
        expect.objectContaining({ analysisData: { test: 'scan' } }),
        expect.objectContaining({ generatedTests: { test: 'validate' } })
      );
    });
  });

});