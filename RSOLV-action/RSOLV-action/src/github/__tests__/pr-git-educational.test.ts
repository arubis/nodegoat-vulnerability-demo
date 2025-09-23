/**
 * TDD tests for PR creation with educational content
 * Follows RED-GREEN-REFACTOR methodology
 */

import { describe, test, expect, beforeEach, mock, vi } from 'vitest';
import { createEducationalPullRequest } from '../pr-git-educational.js';

// Track git commands globally
let globalGitCommands: string[] = [];

// Mock child_process module
vi.mock('child_process', () => ({
  execSync: vi.fn((cmd: string) => {
    globalGitCommands.push(cmd);
    return Buffer.from('');
  })
}));

// Store PR body globally for assertion
let globalPRBody = '';

// Mock GitHub API module
vi.mock('../api.js', () => ({
  getGitHubClient: vi.fn(() => ({
    pulls: {
      create: vi.fn((params: any) => {
        // Capture PR body for assertion
        globalPRBody = params?.body || '';
        // Return different URLs based on the repository
        const repoName = params?.owner === 'RSOLV-dev' ? 'RSOLV-dev/demo' : 'user/repo';
        return Promise.resolve({
          data: {
            number: 100,
            html_url: `https://github.com/${repoName}/pull/100`
          }
        });
      }),
      list: vi.fn(() => Promise.resolve({ data: [] }))
    }
  }))
}));

describe('Educational PR Creation', () => {
  beforeEach(() => {
    // Reset mocks before each test
    globalGitCommands = [];
    globalPRBody = '';
  });

  describe('RED Phase - Educational Content Generation', () => {
    test('should include educational vulnerability explanation', async () => {
      const issue = {
        id: '123',
        number: 48,
        title: 'XSS vulnerability in config',
        body: 'Security issue found',
        repository: {
          fullName: 'user/repo',
          defaultBranch: 'main'
        }
      };

      const summary = {
        title: 'Fix XSS vulnerability',
        description: 'Fixed XSS by sanitizing input',
        vulnerabilityType: 'XSS',
        severity: 'high'
      };

      // GitHub API already mocked at module level

      const result = await createEducationalPullRequest(
        issue,
        'abc123',
        summary,
        { rsolvApiKey: 'test' }
      );

      // Mocks are reset in beforeEach

      // GREEN: Educational content should be included
      expect(result.educationalContent).toBeDefined();
      expect(result.educationalContent).toContain('What is Cross-Site Scripting');
      expect(result.educationalContent).toContain('How this fix prevents');
      expect(result.educationalContent).toContain('Best practices');
      expect(result.educationalContent).toContain('RSOLV');
    });

    test('should include AI-specific vulnerability context for slopsquatting', async () => {
      const issue = {
        id: '124',
        number: 49,
        title: 'Slopsquatting vulnerability detected',
        body: 'AI hallucinated package',
        repository: {
          fullName: 'user/repo',
          defaultBranch: 'main'
        }
      };

      const summary = {
        title: 'Fix slopsquatting vulnerability',
        description: 'Removed hallucinated package reference',
        vulnerabilityType: 'slopsquatting',
        severity: 'critical',
        isAiGenerated: true
      };

      // execSync already mocked at module level

      // GitHub API already mocked at module level

      const result = await createEducationalPullRequest(
        issue,
        'def456',
        summary,
        { rsolvApiKey: 'test' }
      );

      // Mocks are reset in beforeEach

      // GREEN: Should include AI-specific education
      expect(result.educationalContent).toContain('AI-Specific Vulnerability');
      expect(result.educationalContent).toContain('19.6% of AI package suggestions');
      expect(result.educationalContent).toContain('hallucinated');
    });

    test('should include RSOLV value proposition', async () => {
      const issue = {
        id: '125',
        number: 50,
        title: 'SQL Injection in query',
        body: 'Unsanitized input',
        repository: {
          fullName: 'user/repo',
          defaultBranch: 'main'
        }
      };

      const summary = {
        title: 'Fix SQL injection',
        description: 'Used parameterized queries',
        vulnerabilityType: 'SQLi',
        severity: 'critical'
      };

      // execSync already mocked at module level

      // GitHub API already mocked at module level

      const result = await createEducationalPullRequest(
        issue,
        'ghi789',
        summary,
        { rsolvApiKey: 'test' }
      );

      // Mocks are reset in beforeEach

      // GREEN: Should include RSOLV's unique value
      expect(result.educationalContent).toContain('RSOLV');
      expect(result.educationalContent).toContain('181 patterns');
      expect(result.educationalContent).toContain('Success-based pricing');
      expect(result.educationalContent).toContain('only pay for deployed fixes');
    });
  });

  describe('GREEN Phase - Complete Flow', () => {
    test('should create educational PR with all components', async () => {
      const issue = {
        id: '128',
        number: 53,
        title: 'XSS in user input',
        body: 'Unsanitized HTML',
        repository: {
          fullName: 'RSOLV-dev/demo',
          defaultBranch: 'main'
        }
      };

      const summary = {
        title: 'Fix XSS vulnerability in user input',
        description: 'Sanitized HTML output using DOMPurify',
        vulnerabilityType: 'XSS',
        severity: 'high',
        cwe: 'CWE-79',
        tests: [
          'Verify malicious scripts are blocked',
          'Ensure legitimate HTML still works'
        ]
      };

      // Mock execSync
      // Git commands are tracked globally

      // GitHub API already mocked at module level

      const result = await createEducationalPullRequest(
        issue,
        'pqr678',
        summary,
        { rsolvApiKey: 'test' },
        { insertions: 10, deletions: 5, filesChanged: 1 }
      );

      // Mocks are reset in beforeEach

      // REFACTOR: Complete flow should work
      expect(result.success).toBe(true);
      expect(result.pullRequestUrl).toBe('https://github.com/RSOLV-dev/demo/pull/100');
      expect(result.pullRequestNumber).toBe(100);
      expect(result.branchName).toBe('rsolv/fix-issue-53');
      
      // Verify git commands were called
      expect(globalGitCommands.length).toBeGreaterThan(0);
      expect(globalGitCommands.some(cmd => cmd === 'git config user.email' || cmd.includes('git config user.email'))).toBe(true);
      expect(globalGitCommands.some(cmd => cmd.includes('git checkout'))).toBe(true);
      expect(globalGitCommands.some(cmd => cmd.includes('git push'))).toBe(true);
      
      // Verify PR body includes educational content
      expect(globalPRBody).toContain('📚 Understanding This Fix');
      expect(globalPRBody).toContain('🛡️ What is Cross-Site Scripting');
      expect(globalPRBody).toContain('🔧 How This Fix Works');
      expect(globalPRBody).toContain('✅ Best Practices');
      expect(globalPRBody).toContain('🤖 About RSOLV');
      expect(globalPRBody).toContain('Success-based pricing');
      expect(globalPRBody).toContain('181+ patterns');
    });
  });
});