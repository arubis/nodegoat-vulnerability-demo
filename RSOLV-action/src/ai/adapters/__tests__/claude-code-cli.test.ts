/**
 * Tests for Claude Code CLI adapter
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClaudeCodeCLIAdapter } from '../claude-code-cli.js';
import { AIConfig } from '../../types.js';
import { IssueContext } from '../../../types/index.js';
import { IssueAnalysis } from '../../types.js';

describe('ClaudeCodeCLIAdapter', () => {
  let adapter: ClaudeCodeCLIAdapter;
  let mockConfig: AIConfig;
  let mockIssueContext: IssueContext;
  let mockAnalysis: IssueAnalysis;

  beforeEach(() => {
    mockConfig = {
      provider: 'claude-code',
      model: 'claude-sonnet-4-20250514',
      useStructuredPhases: true
    };

    mockIssueContext = {
      id: '123',
      number: 123,
      title: 'XSS vulnerability in user input',
      body: 'User input is not sanitized'
    };

    mockAnalysis = {
      complexity: 'low',
      relatedFiles: ['app/controllers/user.js']
    };

    adapter = new ClaudeCodeCLIAdapter(mockConfig, '/test/repo');
  });

  describe('generateSolution', () => {
    it('should fail without ANTHROPIC_API_KEY', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const result = await adapter.generateSolution(mockIssueContext, mockAnalysis);

      expect(result.success).toBe(false);
      expect(result.error).toContain('ANTHROPIC_API_KEY environment variable or vended credentials required');
    });

  });

  describe('constructPrompt', () => {
    it('should generate structured phased prompt when enabled', () => {
      const adapter = new ClaudeCodeCLIAdapter(
        { ...mockConfig, useStructuredPhases: true },
        '/test/repo'
      );

      const prompt = (adapter as any).constructPrompt(mockIssueContext, mockAnalysis);

      expect(prompt).toContain('PHASE 1: RED - UNDERSTAND THE VULNERABILITY');
      expect(prompt).toContain('PHASE 2: GREEN - FIX THE VULNERABILITY');
      expect(prompt).toContain('PHASE 3: REFACTOR - ENSURE QUALITY');
    });

    it('should generate regular prompt when structured phases disabled', () => {
      const adapter = new ClaudeCodeCLIAdapter(
        { ...mockConfig, useStructuredPhases: false },
        '/test/repo'
      );

      const prompt = (adapter as any).constructPrompt(mockIssueContext, mockAnalysis);

      expect(prompt).not.toContain('PHASE 1: RED');
      expect(prompt).toContain('Test-Driven Development');
    });
  });
});