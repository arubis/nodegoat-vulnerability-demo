/**
 * TDD Tests for Claude Code Prompt Updates - Test Validation Context
 * 
 * These tests verify that Claude Code prompts include proper test validation
 * context when generating fixes, as specified in RFC-020.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitBasedClaudeCodeAdapter } from '../adapters/claude-code-git.js';
import type { IssueContext } from '../../types/index.js';
import type { AIConfig, IssueAnalysis } from '../types.js';
import type { AnalysisWithTestsResult } from '../test-generating-security-analyzer.js';
import type { ValidationResult } from '../git-based-test-validator.js';

// We'll test the prompt construction by extending the adapter
class TestableGitBasedClaudeCodeAdapter extends GitBasedClaudeCodeAdapter {
  // Expose protected method for testing
  public constructPrompt(
    issueContext: IssueContext,
    analysis: IssueAnalysis,
    enhancedPrompt?: string
  ): string {
    return super.constructPrompt(issueContext, analysis, enhancedPrompt);
  }
  
  // New method to construct prompt with test validation context
  public constructPromptWithTestContext(
    issueContext: IssueContext,
    analysis: IssueAnalysis,
    testResults?: AnalysisWithTestsResult,
    validationResult?: ValidationResult,
    iteration?: { current: number; max: number }
  ): string {
    let prompt = this.constructPrompt(issueContext, analysis);
    
    // Add test validation context
    if (testResults?.generatedTests?.success) {
      prompt += '\n\n## Generated Tests\n';
      prompt += 'The following tests have been generated to validate your fix:\n\n';
      testResults.generatedTests.tests.forEach(test => {
        prompt += `### ${test.framework} Test\n`;
        prompt += '```' + (test.framework === 'rspec' ? 'ruby' : 'javascript') + '\n';
        prompt += test.testCode;
        prompt += '\n```\n\n';
      });
      prompt += '**IMPORTANT**: Your fix must make these tests pass!\n';
      prompt += '- RED test should fail before your fix\n';
      prompt += '- GREEN test should pass after your fix\n';
      prompt += '- REFACTOR test should ensure functionality is maintained\n';
    }
    
    // Add validation failure context
    if (validationResult && !validationResult.success) {
      prompt += '\n\n## Previous Fix Attempt Failed\n';
      prompt += `This is attempt ${iteration?.current || 2} of ${iteration?.max || 3}.\n\n`;
      prompt += '### Test Failure Output:\n';
      prompt += '```\n';
      prompt += validationResult.testOutput || 'Tests failed to run';
      prompt += '\n```\n\n';
      
      if (validationResult.failedTests && validationResult.failedTests.length > 0) {
        prompt += '### Failed Tests:\n';
        validationResult.failedTests.forEach(test => {
          prompt += `- ${test.name}: ${test.reason}\n`;
        });
        prompt += '\n';
      }
      
      prompt += '**Please analyze the test failures and try a different approach.**\n';
      prompt += 'Consider:\n';
      prompt += '- Are you handling all edge cases?\n';
      prompt += '- Is the fix too restrictive or breaking functionality?\n';
      prompt += '- Do you need to adjust the implementation strategy?\n';
    }
    
    // Add iteration context
    if (iteration) {
      prompt += `\n\n## Iteration Context\n`;
      prompt += `You have ${iteration.max - iteration.current} attempts remaining.\n`;
      if (iteration.current === iteration.max) {
        prompt += '**This is your final attempt.** Ensure the fix is comprehensive.\n';
      }
    }
    
    // Add test running instructions
    prompt += '\n\n## Test Validation Instructions\n';
    prompt += '1. After implementing your fix, explain how to run the tests\n';
    prompt += '2. Specify which test framework is being used\n';
    prompt += '3. Include the test command (e.g., `bundle exec rspec` or `npm test`)\n';
    prompt += '4. Ensure all security tests pass before considering the fix complete\n';
    
    return prompt;
  }
}

describe('Claude Code Prompts - Test Validation Context', () => {
  let adapter: TestableGitBasedClaudeCodeAdapter;
  let mockIssue: IssueContext;
  let mockAIConfig: AIConfig;
  let mockAnalysis: IssueAnalysis;

  beforeEach(() => {
    mockAIConfig = {
      provider: 'anthropic',
      model: 'claude-3-sonnet-20240229',
      apiKey: 'test-key',
      temperature: 0.1,
      maxTokens: 4000
    };
    
    adapter = new TestableGitBasedClaudeCodeAdapter(mockAIConfig, '/test/repo');
    
    mockIssue = {
      id: 'test-1',
      number: 123,
      title: 'SQL Injection vulnerability',
      body: 'Found SQL injection in user controller',
      labels: ['security'],
      assignees: [],
      repository: {
        owner: 'test',
        name: 'test-repo',
        fullName: 'test/test-repo',
        defaultBranch: 'main',
        language: 'ruby'
      },
      source: 'github',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    mockAnalysis = {
      canBeFixed: true,
      files: ['app/controllers/users_controller.rb'],
      suggestedApproach: 'Use parameterized queries',
      filesToModify: ['app/controllers/users_controller.rb'],
      complexity: 'medium',
      relatedFiles: ['app/controllers/users_controller.rb']
    };
  });

  describe('Base Prompt Updates', () => {
    it('should include red-green-refactor validation in base prompt', () => {
      const prompt = adapter.constructPrompt(mockIssue, mockAnalysis);
      
      expect(prompt).toContain('Red-Green-Refactor Validation');
      expect(prompt).toContain('validate the vulnerability exists');
      expect(prompt).toContain('RED phase');
      expect(prompt).toContain('GREEN phase');
    });

    it('should include test running instructions in base prompt', () => {
      const prompt = adapter.constructPrompt(mockIssue, mockAnalysis);
      
      expect(prompt).toContain('Run them to establish baseline');
      expect(prompt).toContain('test that demonstrates the vulnerability');
    });
  });

  describe('Test Context Integration', () => {
    it('should include generated test code in prompt', () => {
      const testResults: AnalysisWithTestsResult = {
        canBeFixed: true,
        files: [],
        filesToModify: [],
        suggestedApproach: '',
        generatedTests: {
          success: true,
          tests: [{
            framework: 'rspec',
            testCode: 'RSpec.describe UsersController do\n  it "should prevent SQL injection" do\n    # test\n  end\nend',
            testSuite: {} as any
          }]
        }
      };
      
      const prompt = adapter.constructPromptWithTestContext(
        mockIssue, 
        mockAnalysis,
        testResults
      );
      
      expect(prompt).toContain('Generated Tests');
      expect(prompt).toContain('rspec Test');
      expect(prompt).toContain('RSpec.describe UsersController');
      expect(prompt).toContain('Your fix must make these tests pass!');
    });

    it('should include test failure context on retry', () => {
      const validationResult: ValidationResult = {
        success: false,
        testOutput: 'Failed: expected status 400 but got 200',
        failedTests: [{
          name: 'should prevent SQL injection',
          reason: 'Response status mismatch'
        }]
      };
      
      const prompt = adapter.constructPromptWithTestContext(
        mockIssue,
        mockAnalysis,
        undefined,
        validationResult,
        { current: 2, max: 3 }
      );
      
      expect(prompt).toContain('Previous Fix Attempt Failed');
      expect(prompt).toContain('This is attempt 2 of 3');
      expect(prompt).toContain('Test Failure Output:');
      expect(prompt).toContain('expected status 400 but got 200');
      expect(prompt).toContain('Failed Tests:');
      expect(prompt).toContain('should prevent SQL injection: Response status mismatch');
    });

    it('should include iteration context', () => {
      const prompt = adapter.constructPromptWithTestContext(
        mockIssue,
        mockAnalysis,
        undefined,
        undefined,
        { current: 3, max: 3 }
      );
      
      expect(prompt).toContain('Iteration Context');
      expect(prompt).toContain('0 attempts remaining');
      expect(prompt).toContain('This is your final attempt');
    });
  });

  describe('Test Validation Instructions', () => {
    it('should include test running instructions', () => {
      const prompt = adapter.constructPromptWithTestContext(
        mockIssue,
        mockAnalysis
      );
      
      expect(prompt).toContain('Test Validation Instructions');
      expect(prompt).toContain('explain how to run the tests');
      expect(prompt).toContain('test framework is being used');
      expect(prompt).toContain('Include the test command');
    });

    it('should emphasize security test validation', () => {
      const prompt = adapter.constructPromptWithTestContext(
        mockIssue,
        mockAnalysis
      );
      
      expect(prompt).toContain('Ensure all security tests pass');
      expect(prompt).toContain('before considering the fix complete');
    });
  });

  describe('Multiple Test Frameworks', () => {
    it('should handle multiple test frameworks in prompt', () => {
      const testResults: AnalysisWithTestsResult = {
        canBeFixed: true,
        files: [],
        filesToModify: [],
        suggestedApproach: '',
        generatedTests: {
          success: true,
          tests: [
            {
              framework: 'rspec',
              testCode: 'RSpec test code',
              testSuite: {} as any
            },
            {
              framework: 'jest',
              testCode: 'Jest test code',
              testSuite: {} as any
            }
          ]
        }
      };
      
      const prompt = adapter.constructPromptWithTestContext(
        mockIssue,
        mockAnalysis,
        testResults
      );
      
      expect(prompt).toContain('rspec Test');
      expect(prompt).toContain('jest Test');
      expect(prompt).toContain('RSpec test code');
      expect(prompt).toContain('Jest test code');
    });
  });
});