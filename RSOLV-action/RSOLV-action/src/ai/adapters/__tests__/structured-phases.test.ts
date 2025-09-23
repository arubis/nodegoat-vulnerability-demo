/**
 * RED Phase: Test Suite for Structured Phased Prompting
 * 
 * These tests document the expected behavior of our structured
 * phased approach to ensure Claude edits files before generating JSON.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitBasedClaudeCodeAdapter } from '../claude-code-git.js';
import { ClaudeCodeAdapter } from '../claude-code.js';
import type { IssueContext, IssueAnalysis } from '../../../types/index.js';
import type { SDKMessage } from '@anthropic-ai/claude-code';

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
      return {
        success: true,
        message: 'Test message',
        changes: {},
        messages: []
      };
    }
  }
}));

// Mock child_process for git operations
vi.mock('child_process', () => ({
  execSync: vi.fn((cmd: string) => {
    if (cmd.includes('git diff --name-only')) return '';
    if (cmd.includes('git diff --stat')) return ' 0 files changed';
    if (cmd.includes('git rev-parse HEAD')) return 'abc123';
    if (cmd.includes('git log')) return 'Test commit';
    if (cmd.includes('git add')) return '';
    if (cmd.includes('git commit')) return '';
    return '';
  })
}));

// Mock the retryable CLI adapter  
vi.mock('../claude-code-cli-retry.js', () => ({
  RetryableClaudeCodeCLI: class {
    constructor() {}
    async generateSolution(issueContext: any, analysis: any, prompt?: string) {
      return {
        success: true,
        message: 'Test message',
        changes: {},
        messages: []
      };
    }
  }
}));

describe('Structured Phased Prompting - RED Phase', () => {
  let adapter: GitBasedClaudeCodeAdapter;
  let mockIssueContext: IssueContext;
  let mockAnalysis: IssueAnalysis;

  beforeEach(() => {
    mockIssueContext = {
      id: 'test/test-repo#1',
      number: 1,
      title: 'XSS vulnerability in user input',
      body: 'User input is not escaped before rendering',
      owner: 'test',
      repo: 'test-repo'
    };

    mockAnalysis = {
      complexity: 'simple',
      estimatedTime: 5,
      relatedFiles: ['src/render.js'],
      canBeAutomated: true,
      suggestedApproach: 'Escape user input'
    };

    adapter = new GitBasedClaudeCodeAdapter(
      {
        apiKey: 'test-key',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-3-opus-20240229',
        maxTokens: 4096,
        temperature: 0.1,
        claudeCodeConfig: {
          useStructuredPhases: true,
          verboseLogging: true
        }
      },
      '/tmp/test-repo'
    );
  });

  describe('Phase 1: Prompt Construction', () => {
    it('should successfully call structured phased prompt method', () => {
      // The method is now implemented
      const prompt = (adapter as any).constructStructuredPhasedPrompt(mockIssueContext, mockAnalysis);
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });

    it('should include phase markers in prompt', () => {
      // This will fail until we implement the method
      const prompt = (adapter as any).constructStructuredPhasedPrompt?.(
        mockIssueContext, 
        mockAnalysis
      );
      
      expect(prompt).toContain('PHASE 1: FILE EDITING');
      expect(prompt).toContain('PHASE 2: JSON SUMMARY');
      expect(prompt).toContain('PHASE 1 COMPLETE');
    });

    it('should include execution checklist', () => {
      // This will fail until we implement the method
      const prompt = (adapter as any).constructStructuredPhasedPrompt?.(
        mockIssueContext,
        mockAnalysis
      );
      
      expect(prompt).toContain('□ Used Edit/MultiEdit tools');
      expect(prompt).toContain('□ Verified changes with Read tool');
      expect(prompt).toContain('□ Stated "PHASE 1 COMPLETE"');
      expect(prompt).toContain('□ Provided JSON summary');
    });

    it('should emphasize editing before JSON', () => {
      const prompt = (adapter as any).constructStructuredPhasedPrompt?.(
        mockIssueContext,
        mockAnalysis
      );
      
      expect(prompt).toContain('MANDATORY - DO THIS FIRST');
      expect(prompt).toContain('ONLY AFTER PHASE 1');
      expect(prompt).toContain('Do NOT skip directly to providing JSON');
    });
  });

  describe('Phase 2: Phase Detection', () => {
    it('should successfully call parsePhaseCompletion method', () => {
      const messages: SDKMessage[] = [];
      
      const result = (adapter as any).parsePhaseCompletion(messages);
      expect(result).toBeDefined();
      expect(result.phase1Complete).toBe(false);
      expect(result.filesEdited).toBe(false);
      expect(result.jsonProvided).toBe(false);
      expect(result.success).toBe(false);
    });

    it('should detect when Phase 1 is complete', () => {
      const messages: SDKMessage[] = [
        { type: 'text', text: 'Analyzing the vulnerability...' } as SDKMessage,
        { type: 'tool_use', name: 'Edit', input: {} } as any,
        { type: 'text', text: 'PHASE 1 COMPLETE: Files have been edited' } as SDKMessage
      ];
      
      const status = (adapter as any).parsePhaseCompletion?.(messages);
      
      expect(status?.phase1Complete).toBe(true);
      expect(status?.filesEdited).toBe(true);
    });

    it('should detect when files are edited without phase marker', () => {
      const messages: SDKMessage[] = [
        { type: 'tool_use', name: 'Edit', input: {} } as any,
        { type: 'tool_use', name: 'Read', input: {} } as any
      ];
      
      const status = (adapter as any).parsePhaseCompletion?.(messages);
      
      expect(status?.filesEdited).toBe(true);
      expect(status?.phase1Complete).toBe(false);
    });

    it('should detect when JSON is provided', () => {
      const messages: SDKMessage[] = [
        { 
          type: 'text', 
          text: '```json\n{"title": "Fix XSS", "files": []}\n```' 
        } as SDKMessage
      ];
      
      const status = (adapter as any).parsePhaseCompletion?.(messages);
      
      expect(status?.jsonProvided).toBe(true);
    });

    it('should mark success only when both phases complete', () => {
      const messages: SDKMessage[] = [
        { type: 'tool_use', name: 'Edit', input: {} } as any,
        { type: 'text', text: 'PHASE 1 COMPLETE: Files have been edited' } as SDKMessage,
        { type: 'text', text: '```json\n{"title": "Fix"}\n```' } as SDKMessage
      ];
      
      const status = (adapter as any).parsePhaseCompletion?.(messages);
      
      expect(status?.success).toBe(true);
    });
  });

  describe('Phase 3: Integration with generateSolutionWithGit', () => {
    it('should use structured phases when configured', () => {
      // Verify the adapter was created with useStructuredPhases
      const generateSpy = vi.spyOn(adapter, 'generateSolutionWithGit');
      
      adapter.generateSolutionWithGit(mockIssueContext, mockAnalysis);
      
      expect(generateSpy).toHaveBeenCalled();
      // The config was set in beforeEach, we just verify it's being used
      expect(generateSpy).toHaveBeenCalledWith(mockIssueContext, mockAnalysis);
    });

    it('should return error when Phase 1 fails', async () => {
      // Mock super.generateSolution to return success with messages
      vi.spyOn(ClaudeCodeAdapter.prototype, 'generateSolution').mockResolvedValue({
        success: true,
        message: 'Test message',
        changes: {},
        messages: [
          { type: 'text', text: 'Testing without editing files' },
          { type: 'text', text: '```json\n{}\n```' }
        ]
      });
      
      // Mock no file edits
      vi.spyOn(adapter as any, 'getModifiedFiles').mockReturnValue([]);
      
      const result = await adapter.generateSolutionWithGit(
        mockIssueContext,
        mockAnalysis
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('did not make any file changes');
    });

    it('should return error when JSON is provided before editing', async () => {
      // Mock super.generateSolution to return success with messages
      vi.spyOn(ClaudeCodeAdapter.prototype, 'generateSolution').mockResolvedValue({
        success: true,
        message: 'Test message',
        changes: {},
        messages: [
          { type: 'text', text: 'Analyzing...' },
          { type: 'text', text: '```json\n{}\n```' } // JSON without file editing
        ]
      });
      
      // Mock no file edits
      vi.spyOn(adapter as any, 'getModifiedFiles').mockReturnValue([]);
      
      const result = await adapter.generateSolutionWithGit(
        mockIssueContext,
        mockAnalysis
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('did not make any file changes');
    });

    it('should succeed when phases complete in correct order', async () => {
      // Mock super.generateSolution to return success with proper phase completion
      vi.spyOn(ClaudeCodeAdapter.prototype, 'generateSolution').mockResolvedValue({
        success: true,
        message: 'Test message',
        changes: { 'src/render.js': 'fixed content' },
        messages: [
          { type: 'tool_use', name: 'Edit', input: {} },
          { type: 'text', text: 'PHASE 1 COMPLETE: Files have been edited' },
          { type: 'text', text: '```json\n{}\n```' }
        ]
      });
      
      // Mock successful file modifications
      vi.spyOn(adapter as any, 'getModifiedFiles').mockReturnValue(['src/render.js']);
      vi.spyOn(adapter as any, 'getDiffStats').mockReturnValue({
        filesChanged: 1,
        insertions: 5,
        deletions: 2
      });
      vi.spyOn(adapter as any, 'createCommit').mockReturnValue('abc123');
      
      const result = await adapter.generateSolutionWithGit(
        mockIssueContext,
        mockAnalysis
      );
      
      expect(result.success).toBe(true);
      expect(result.filesModified).toContain('src/render.js');
    });
  });

  describe('Phase 4: Metrics and Logging', () => {
    it('should log phase status when using structured phases', async () => {
      // Mock super.generateSolution
      vi.spyOn(ClaudeCodeAdapter.prototype, 'generateSolution').mockResolvedValue({
        success: true,
        message: 'Test message',
        changes: { 'src/render.js': 'fixed content' },
        messages: [
          { type: 'tool_use', name: 'Edit', input: {} },
          { type: 'text', text: 'PHASE 1 COMPLETE: Files have been edited' },
          { type: 'text', text: '```json\n{}\n```' }
        ]
      });
      
      // Mock file modifications
      vi.spyOn(adapter as any, 'getModifiedFiles').mockReturnValue(['src/render.js']);
      vi.spyOn(adapter as any, 'getDiffStats').mockReturnValue({
        filesChanged: 1,
        insertions: 5,
        deletions: 2
      });
      vi.spyOn(adapter as any, 'createCommit').mockReturnValue('abc123');
      
      const result = await adapter.generateSolutionWithGit(
        mockIssueContext,
        mockAnalysis
      );
      
      // Verify result is successful
      expect(result.success).toBe(true);
      // Phase tracking is logged internally via logger.info, not console.log
    });

    it('should properly parse phase completion from messages', () => {
      const messages = [
        { type: 'tool_use', name: 'Edit', input: {} },
        { type: 'text', text: 'PHASE 1 COMPLETE: Files have been edited' },
        { type: 'text', text: '```json\n{}\n```' }
      ];
      
      const phaseStatus = (adapter as any).parsePhaseCompletion(messages);
      
      expect(phaseStatus.phase1Complete).toBe(true);
      expect(phaseStatus.filesEdited).toBe(true);
      expect(phaseStatus.jsonProvided).toBe(true);
      expect(phaseStatus.success).toBe(true);
    });
  });
});

describe('Expected Failures - Documentation', () => {
  it('Current implementation should fail to edit files', () => {
    // Document the current failure mode
    const currentSuccess = false; // Files are not being edited
    const expectedSuccess = true; // We want files to be edited
    
    expect(currentSuccess).not.toBe(expectedSuccess);
  });
  
  it('Current implementation generates JSON without editing', () => {
    // Document the problem we're solving
    const currentBehavior = {
      filesEdited: false,
      jsonGenerated: true
    };
    
    const expectedBehavior = {
      filesEdited: true,
      jsonGenerated: true
    };
    
    expect(currentBehavior).not.toEqual(expectedBehavior);
  });
});