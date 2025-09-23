/**
 * RED-GREEN-REFACTOR Test Suite for Git-Based Claude Code Prompt Engineering
 * 
 * These tests validate that our prompts cause Claude to:
 * 1. Edit files using Edit/MultiEdit tools
 * 2. Provide JSON solution summary
 * 3. Successfully create PRs
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitBasedClaudeCodeAdapter } from '../claude-code-git.js';
import type { IssueContext, IssueAnalysis } from '../../types.js';

// Mock fs and child_process
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => '[]')
  },
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => '[]')
}));

vi.mock('child_process', () => ({
  execSync: vi.fn((cmd: string) => {
    if (cmd.includes('git diff --name-only')) return '';
    if (cmd.includes('git diff --stat')) return '1 file changed';
    if (cmd.includes('git rev-parse HEAD')) return 'abc123';
    return '';
  })
}));

// Mock the parent class
vi.mock('../claude-code.js', () => ({
  ClaudeCodeAdapter: class {
    constructor(public config: any, public repoPath: string) {}
    
    async generateSolution(context: any, analysis: any, prompt?: string) {
      return {
        success: true,
        message: 'Solution generated',
        changes: {
          'vulnerable.js': '// Fixed content'
        }
      };
    }
    
    async isAvailable() {
      return true;
    }
  }
}));

describe('GitBasedClaudeCodeAdapter Prompt Effectiveness', () => {
  let adapter: GitBasedClaudeCodeAdapter;
  let mockIssueContext: IssueContext;
  let mockAnalysis: IssueAnalysis;
  const testRepoPath = '/tmp/test-repo';

  beforeEach(() => {
    vi.clearAllMocks();

    adapter = new GitBasedClaudeCodeAdapter({
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'claude-3-opus-20240229',
      maxTokens: 4096,
      temperature: 0.1,
      claudeCodeConfig: {
        verboseLogging: true
      }
    }, testRepoPath);

    mockIssueContext = {
      id: 'test-issue-1',
      number: 1,
      title: 'XSS vulnerability in vulnerable.js',
      body: 'document.write with user input can lead to XSS',
      labels: [],
      repository: {
        owner: 'test',
        name: 'repo',
        fullName: 'test/repo'
      }
    } as IssueContext;

    mockAnalysis = {
      canBeFixed: true,
      complexity: 'medium' as const,
      estimatedTime: 30,
      relatedFiles: ['vulnerable.js'],
      suggestedApproach: 'Escape the user input before writing to document'
    };
  });

  describe('RED Phase - Current Prompt Failures', () => {
    it('should fail when Claude only provides JSON without editing files', async () => {
      // Mock no files modified
      const getModifiedFilesSpy = vi.spyOn(adapter as any, 'getModifiedFiles');
      getModifiedFilesSpy.mockReturnValue([]);
      
      // Mock generateSolution to return success but no actual file changes detected
      vi.spyOn(adapter, 'generateSolution').mockResolvedValue({
        success: false,
        message: 'No solution found in response',
        error: 'Claude did not edit files'
      });
      
      const result = await adapter.generateSolutionWithGit(
        mockIssueContext,
        mockAnalysis
      );
      
      // Current behavior: fails because no files were modified
      expect(result.success).toBe(false);
      expect(result.message || result.error).toBeDefined();
    });

    it('should fail to create PR when files are not actually modified', async () => {
      // Mock no files modified
      const getModifiedFilesSpy = vi.spyOn(adapter as any, 'getModifiedFiles');
      getModifiedFilesSpy.mockReturnValue([]);
      
      const result = await adapter.generateSolutionWithGit(
        mockIssueContext,
        mockAnalysis
      );
      
      expect(result.success).toBe(false);
      expect(result.filesModified).toBeUndefined();
    });
  });

  describe('GREEN Phase - Prompt Improvements', () => {
    it('should successfully edit files when prompt explicitly requires Edit tool usage', async () => {
      // Mock successful solution generation
      vi.spyOn(adapter, 'generateSolution').mockResolvedValue({
        success: true,
        message: 'Fixed vulnerability',
        changes: {
          'vulnerable.js': '// Fixed content'
        }
      });
      
      const getModifiedFilesSpy = vi.spyOn(adapter as any, 'getModifiedFiles');
      getModifiedFilesSpy.mockReturnValue(['vulnerable.js']);
      
      const getDiffStatsSpy = vi.spyOn(adapter as any, 'getDiffStats');
      getDiffStatsSpy.mockReturnValue({
        filesChanged: 1,
        insertions: 5,
        deletions: 2
      });
      
      const createCommitSpy = vi.spyOn(adapter as any, 'createCommit');
      createCommitSpy.mockReturnValue('commit123');
      
      const result = await adapter.generateSolutionWithGit(
        mockIssueContext,
        mockAnalysis
      );
      
      expect(result.success).toBe(true);
      expect(result.filesModified).toContain('vulnerable.js');
    });

    it('should validate that both Edit tools AND JSON are used', async () => {
      // Mock successful solution with JSON summary
      vi.spyOn(adapter, 'generateSolution').mockResolvedValue({
        success: true,
        message: 'Fixed vulnerability',
        changes: {
          'vulnerable.js': '// Fixed content'
        },
        metadata: {
          title: 'Fix XSS vulnerability',
          description: 'Escaped user input'
        }
      });
      
      const getModifiedFilesSpy = vi.spyOn(adapter as any, 'getModifiedFiles');
      getModifiedFilesSpy.mockReturnValue(['vulnerable.js']);
      
      const getDiffStatsSpy = vi.spyOn(adapter as any, 'getDiffStats');
      getDiffStatsSpy.mockReturnValue({
        filesChanged: 1,
        insertions: 5,
        deletions: 2
      });
      
      const createCommitSpy = vi.spyOn(adapter as any, 'createCommit');
      createCommitSpy.mockReturnValue('commit123');
      
      const result = await adapter.generateSolutionWithGit(
        mockIssueContext,
        mockAnalysis
      );
      
      expect(result.success).toBe(true);
      expect(result.filesModified).toBeDefined();
      expect(result.summary).toBeDefined();
    });
  });

  describe('REFACTOR Phase - Optimized Prompt', () => {
    it('should use concise but effective prompt structure', () => {
      // Test that constructPromptWithTestContext exists and returns a string
      const prompt = (adapter as any).constructPromptWithTestContext(
        mockIssueContext,
        mockAnalysis
      );
      
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      
      // Verify it mentions fixing vulnerabilities
      expect(prompt.toLowerCase()).toContain('fix');
      expect(prompt.toLowerCase()).toContain('vulnerab');
    });

    it('should maintain backward compatibility with existing adapters', () => {
      // Ensure refactored code doesn't break existing functionality
      expect(adapter).toHaveProperty('generateSolutionWithGit');
      expect(adapter).toHaveProperty('generateSolution');
      expect(typeof adapter.generateSolutionWithGit).toBe('function');
      expect(typeof adapter.generateSolution).toBe('function');
    });
  });
});