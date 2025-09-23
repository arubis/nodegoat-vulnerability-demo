/**
 * Simplified tests for phase decomposition
 * Focus on testing that the methods exist and have correct signatures
 */

import { describe, test, expect, vi } from 'vitest';
import { PhaseExecutor } from '../phase-executor/index.js';
import { IssueContext, ActionConfig } from '../../types/index.js';

describe('Phase Decomposition - Simple Tests', () => {
  const mockConfig: ActionConfig = {
    aiProvider: {
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'claude-3',
      maxTokens: 4000
    }
  } as ActionConfig;

  const mockIssue: IssueContext = {
    id: 'issue-123',
    number: 123,
    title: 'Test Issue',
    body: 'Test body',
    labels: [],
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

  test('PhaseExecutor has all decomposed methods', () => {
    const executor = new PhaseExecutor(mockConfig);
    
    // Check that all new methods exist
    expect(typeof executor.executeScanForIssue).toBe('function');
    expect(typeof executor.executeValidateForIssue).toBe('function');
    expect(typeof executor.executeMitigateForIssue).toBe('function');
    expect(typeof executor.executeThreePhaseForIssue).toBe('function');
    expect(typeof executor.checkGitStatus).toBe('function');
  });

  test('executeScanForIssue returns correct structure', async () => {
    const executor = new PhaseExecutor(mockConfig);
    
    // Mock the git status check
    executor.checkGitStatus = () => ({ clean: true, modifiedFiles: [] });
    
    // Mock analyzeIssue
    executor.analyzer = {
      analyzeIssue: () => Promise.resolve({
        canBeFixed: true,
        issueType: 'test',
        filesToModify: [],
        suggestedApproach: 'test',
        vulnerabilityType: 'TEST',
        severity: 'low'
      })
    } as any;
    
    // Mock PhaseDataClient
    executor.phaseDataClient = {
      storePhaseResults: () => Promise.resolve()
    } as any;
    
    // Actually call the method
    const result = await executor.executeScanForIssue(mockIssue);
    
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('phase');
    expect(result.phase).toBe('scan');
    expect(result).toHaveProperty('data');
    expect(result.data).toHaveProperty('canBeFixed');
    expect(result.data).toHaveProperty('analysisData');
    expect(result.data).toHaveProperty('gitStatus');
  });

  test('executeValidateForIssue accepts scan data', async () => {
    const executor = new PhaseExecutor(mockConfig);
    
    const scanData = {
      analysisData: {
        canBeFixed: true,
        filesToModify: ['test.js']
      }
    };
    
    // Test method signature
    const methodSignature = executor.executeValidateForIssue.toString();
    expect(methodSignature).toContain('issue');
    expect(methodSignature).toContain('scanData');
  });

  test('executeMitigateForIssue accepts scan and validation data', async () => {
    const executor = new PhaseExecutor(mockConfig);
    
    // Test method signature
    const methodSignature = executor.executeMitigateForIssue.toString();
    expect(methodSignature).toContain('issue');
    expect(methodSignature).toContain('scanData');
    expect(methodSignature).toContain('validationData');
  });

  test('executeThreePhaseForIssue coordinates all phases', async () => {
    const executor = new PhaseExecutor(mockConfig);
    
    // Mock the individual phase methods
    executor.executeScanForIssue = async () => ({
      success: true,
      phase: 'scan',
      data: { canBeFixed: true, analysisData: {} }
    });
    
    executor.executeValidateForIssue = async () => ({
      success: true,
      phase: 'validate',
      data: { generatedTests: {} }
    });
    
    executor.executeMitigateForIssue = async () => ({
      success: true,
      phase: 'mitigate',
      data: { pullRequestUrl: 'test' }
    });
    
    const result = await executor.executeThreePhaseForIssue(mockIssue);
    
    expect(result.success).toBe(true);
    expect(result.phase).toBe('three-phase');
    expect(result.data).toHaveProperty('scan');
    expect(result.data).toHaveProperty('validation');
    expect(result.data).toHaveProperty('mitigation');
  });

  test('Phase data flows between phases correctly', async () => {
    const executor = new PhaseExecutor(mockConfig);
    
    let scanDataPassed: any;
    let validationDataPassed: any;
    
    executor.executeScanForIssue = async () => ({
      success: true,
      phase: 'scan',
      data: { 
        canBeFixed: true, 
        analysisData: { test: 'scan-data' } 
      }
    });
    
    executor.executeValidateForIssue = async (issue, scanData) => {
      scanDataPassed = scanData;
      return {
        success: true,
        phase: 'validate',
        data: { 
          generatedTests: { test: 'validate-data' } 
        }
      };
    };
    
    executor.executeMitigateForIssue = async (issue, scanData, validationData) => {
      validationDataPassed = validationData;
      return {
        success: true,
        phase: 'mitigate',
        data: { pullRequestUrl: 'test' }
      };
    };
    
    await executor.executeThreePhaseForIssue(mockIssue);
    
    // Verify data was passed correctly
    expect(scanDataPassed).toEqual({ 
      canBeFixed: true, 
      analysisData: { test: 'scan-data' } 
    });
    
    expect(validationDataPassed).toEqual({ 
      generatedTests: { test: 'validate-data' } 
    });
  });

  test('Aborts if scan determines issue cannot be fixed', async () => {
    const executor = new PhaseExecutor(mockConfig);
    
    executor.executeScanForIssue = async () => ({
      success: true,
      phase: 'scan',
      data: { canBeFixed: false, analysisData: {} }
    });
    
    const validateSpy = {
      called: false,
      call: async () => {
        validateSpy.called = true;
        return { success: true, phase: 'validate', data: {} };
      }
    };
    
    executor.executeValidateForIssue = validateSpy.call;
    
    const result = await executor.executeThreePhaseForIssue(mockIssue);
    
    expect(result.success).toBe(false);
    expect(result.message).toContain('cannot be fixed');
    expect(validateSpy.called).toBe(false); // Should not call validate
  });

  test('Helper methods are accessible', () => {
    const executor = new PhaseExecutor(mockConfig);
    
    // checkGitStatus is public
    const gitStatus = executor.checkGitStatus();
    expect(gitStatus).toHaveProperty('clean');
    expect(gitStatus).toHaveProperty('modifiedFiles');
  });
});