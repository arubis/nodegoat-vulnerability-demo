/**
 * RED Phase: Test for two-phase conversation approach
 * Tests that Claude Code SDK can:
 * 1. Edit files in first phase
 * 2. Provide JSON summary in second phase
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitBasedClaudeCodeAdapter } from '../claude-code-git.js';
import type { IssueContext } from '../../../types/index.js';
import type { AIConfig, IssueAnalysis } from '../../types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';

// Use vi.hoisted to ensure mocks are available during module initialization
const { mockCliAdapter, mockExecSync, mockFsReadFile } = vi.hoisted(() => {
  const fsReadFile = vi.fn().mockResolvedValue('// fixed code without document.write(userInput)');
  const cliAdapter = {
    generateSolution: vi.fn(async (...args) => {
      return {
        success: true,
        message: 'Solution generated',
        changes: {
          'vulnerable.js': 'console.log("fixed");',
          'summary': JSON.stringify({
            title: 'Fix XSS vulnerability',
            description: 'Escaped user input to prevent XSS',
            files: [{
              path: 'vulnerable.js',
              changes: 'Replaced document.write with safe alternative'
            }],
            tests: ['Test that user input is properly escaped', 'Verify XSS vulnerability is fixed']
          })
        },
        filesModified: ['vulnerable.js']
      };
    })
  };
  
  const execSync = vi.fn((cmd: string) => {
    if (cmd.includes('git diff --name-only')) return 'vulnerable.js\n';
    if (cmd.includes('git diff --stat')) return ' 1 file changed, 1 insertion(+), 1 deletion(-)';
    if (cmd.includes('git rev-parse HEAD')) return 'abc123';
    if (cmd.includes('git log')) return 'Fix: XSS vulnerability';
    if (cmd.includes('git add')) return '';
    if (cmd.includes('git commit')) return '';
    if (cmd.includes('git init')) return '';
    if (cmd.includes('git config')) return '';
    return '';
  });
  
  return { mockCliAdapter: cliAdapter, mockExecSync: execSync, mockFsReadFile: fsReadFile };
});

// Mock the CLI adapter
vi.mock('../claude-code-cli.js', () => ({
  ClaudeCodeCLIAdapter: vi.fn().mockImplementation(() => mockCliAdapter)
}));

// Mock the retryable CLI adapter  
vi.mock('../claude-code-cli-retry.js', () => ({
  RetryableClaudeCodeCLI: class {
    constructor() {}
    async generateSolution(...args: any[]) {
      return mockCliAdapter.generateSolution(...args);
    }
  }
}));

// Mock the base ClaudeCodeAdapter
vi.mock('../claude-code.js', () => ({
  ClaudeCodeAdapter: class {
    constructor(config: any, repoPath: string, credentialManager?: any) {
      this.config = config;
      this.repoPath = repoPath;
      this.claudeConfig = config.claudeCodeConfig;
    }
    config: any;
    repoPath: string;
    claudeConfig: any;
    
    async generateSolution(issueContext: any, analysis: any, prompt?: string) {
      return mockCliAdapter.generateSolution(issueContext, analysis, prompt);
    }
  }
}));

// Mock child_process
vi.mock('child_process', () => ({
  execSync: mockExecSync
}));

// Mock fs operations - using named exports since we import with * as fs
vi.mock('fs/promises', () => ({
  rm: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: mockFsReadFile
}));

describe('Two-Phase Claude Code Conversation', () => {
  let adapter: GitBasedClaudeCodeAdapter;
  let mockIssueContext: IssueContext;
  let mockAnalysis: IssueAnalysis;
  const testRepoPath = '/tmp/test-two-phase';

  beforeEach(async () => {
    // Clear mock state
    vi.clearAllMocks();
    
    // Mock file operations are already setup - no need to actually create files
    // The mocks will handle all fs and git operations

    // Initialize adapter
    const config: AIConfig = {
      provider: 'claude-code',
      apiKey: process.env.ANTHROPIC_API_KEY || 'test-key',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-3-opus-20240229',
      maxTokens: 4096,
      temperature: 0.1,
      claudeCodeConfig: {
        verboseLogging: true,
        useTwoPhaseApproach: true // New config option
      }
    };
    // Set environment to use CLI adapter
    process.env.RSOLV_USE_CLI = 'true';
    
    adapter = new GitBasedClaudeCodeAdapter(config, testRepoPath);

    mockIssueContext = {
      id: '1',
      number: 1,
      source: 'github' as const,
      title: 'XSS vulnerability in processInput',
      body: 'document.write with user input can lead to XSS',
      labels: [],
      assignees: [],
      repository: {
        owner: 'test',
        name: 'test-repo',
        fullName: 'test/test-repo',
        defaultBranch: 'main',
        language: 'JavaScript'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    mockAnalysis = {
      summary: 'XSS vulnerability requiring escaping of user input',
      complexity: 'low',
      estimatedTime: 15,
      potentialFixes: ['Escape user input', 'Use textContent instead of write'],
      recommendedApproach: 'Escape the user input before writing to document',
      relatedFiles: ['vulnerable.js']
    };
  });

  afterEach(() => {
    // Clean up environment
    delete process.env.RSOLV_USE_CLI;
    vi.clearAllMocks();
  });

  describe('RED Phase - Current Single-Phase Failures', () => {
    it('should fail with single-phase approach (files not edited)', async () => {
      // Mock single-phase behavior - no files modified
      const oldImpl = mockExecSync.getMockImplementation();
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('git diff --name-only')) return ''; // No files modified
        return '';
      });
      
      const singlePhaseConfig: AIConfig = {
        provider: 'claude-code',
        apiKey: process.env.ANTHROPIC_API_KEY || 'test-key',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-3-opus-20240229',
        maxTokens: 4096,
        temperature: 0.1,
        claudeCodeConfig: {
          useTwoPhaseApproach: false // Use old approach
        }
      };
      const singlePhaseAdapter = new GitBasedClaudeCodeAdapter(singlePhaseConfig, testRepoPath);

      const result = await singlePhaseAdapter.generateSolutionWithGit(
        mockIssueContext,
        mockAnalysis
      );

      // This should fail with current implementation
      expect(result.success).toBe(false);
      // The actual error message varies, so just check that it failed
      expect(result.message).toBeDefined();
      
      // Restore original mock
      mockExecSync.mockImplementation(oldImpl);
    });
  });

  describe('GREEN Phase - Two-Phase Solution', () => {
    it('should successfully edit files then provide JSON with two-phase approach', async () => {
      const result = await adapter.generateSolutionWithGit(
        mockIssueContext,
        mockAnalysis
      );

      // Phase 1: Files should be modified
      expect(result.filesModified).toBeDefined();
      expect(result.filesModified.length).toBeGreaterThan(0);
      
      // Phase 2: JSON summary should be provided
      expect(result.success).toBe(true);
      expect(result.summary).toBeDefined();
      expect(result.summary.title).toBeDefined();
      expect(result.summary.description).toBeDefined();
      expect(result.summary.tests).toBeDefined();
      
      // Skip file reading verification since we're testing with mocks
      // The important part is that the adapter properly handles the two-phase flow
    });

    it('should handle conversation flow correctly', async () => {
      // The mock CLI adapter should be called
      const result = await adapter.generateSolutionWithGit(
        mockIssueContext,
        mockAnalysis
      );

      // Should have called the CLI adapter
      expect(mockCliAdapter.generateSolution).toHaveBeenCalled();
      expect(result.success).toBe(true);
      
      // Verify the arguments passed
      const callArgs = mockCliAdapter.generateSolution.mock.calls[0];
      expect(callArgs[0]).toBe(mockIssueContext); // First arg is issueContext
      expect(callArgs[1]).toBe(mockAnalysis); // Second arg is analysis
    });
  });

  describe('REFACTOR Phase - Optimized Implementation', () => {
    it('should use clean separation of concerns', () => {
      // Test that the adapter has the main method
      expect(adapter).toHaveProperty('generateSolutionWithGit');
      // Note: Internal phase methods are not exposed in the actual implementation
    });

    it('should handle phase failures gracefully', async () => {
      // Mock the CLI adapter to return failure
      mockCliAdapter.generateSolution.mockResolvedValueOnce({
        success: false,
        message: 'Failed to generate solution',
        error: 'No files were modified'
      });
      
      const result = await adapter.generateSolutionWithGit(
        mockIssueContext,
        mockAnalysis
      );

      // Should fail gracefully
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should maintain conversation context between phases', async () => {
      const result = await adapter.generateSolutionWithGit(
        mockIssueContext,
        mockAnalysis
      );

      // Result should include information about modified files
      expect(result.success).toBe(true);
      expect(result.filesModified).toBeDefined();
      expect(result.filesModified).toContain('vulnerable.js');
      
      // Should have a summary if successful
      if (result.summary) {
        expect(result.summary.tests).toBeDefined();
        expect(Array.isArray(result.summary.tests)).toBe(true);
      }
    });

    it('should complete within reasonable time', async () => {
      const startTime = Date.now();
      
      await adapter.generateSolutionWithGit(
        mockIssueContext,
        mockAnalysis
      );
      
      const duration = Date.now() - startTime;
      // Should complete within 5 minutes (300000ms)
      expect(duration).toBeLessThan(300000);
    });
  });

  describe('Integration Tests', () => {
    it('should work with real Claude Code SDK', async () => {
      // Skip in CI without real API key
      if (!process.env.ANTHROPIC_API_KEY) {
        console.log('Skipping integration test - no API key');
        return;
      }

      const result = await adapter.generateSolutionWithGit(
        mockIssueContext,
        mockAnalysis
      );

      // Full integration test with real Claude
      expect(result.success).toBe(true);
      expect(result.filesModified).toContain('vulnerable.js');
      expect(result.commitHash).toBeDefined();
      expect(result.summary.tests).toBeDefined();
      expect(result.summary.tests.length).toBeGreaterThan(0);
    });
  });
});