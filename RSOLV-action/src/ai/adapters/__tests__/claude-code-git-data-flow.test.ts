import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitBasedClaudeCodeAdapter } from '../claude-code-git.js';
import { IssueContext } from '../../../types/index.js';

// Mock the logger at module level
vi.mock('../../../utils/logger.js', () => ({
  Logger: class {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    debug = vi.fn();
  },
  logger: {
    debug: vi.fn(() => {}),
    info: vi.fn(() => {}),
    warn: vi.fn(() => {}),
    error: vi.fn(() => {})
  }
}));

// Mock child_process for git commands
vi.mock('child_process', () => ({
  execSync: vi.fn((cmd: string) => {
    if (cmd.includes('git diff --name-only')) return '';
    if (cmd.includes('git rev-parse HEAD')) return 'abc123';
    if (cmd.includes('git status --porcelain')) return '';
    return '';
  })
}));

// Mock the CLI adapters
vi.mock('../claude-code-cli.js', () => ({
  ClaudeCodeCLIAdapter: vi.fn().mockImplementation(() => ({
    generateSolution: vi.fn().mockResolvedValue({
      success: true,
      message: 'Fixed',
      changes: {}
    })
  }))
}));

vi.mock('../claude-code-cli-retry.js', () => ({
  RetryableClaudeCodeCLI: vi.fn().mockImplementation(() => ({
    generateSolution: vi.fn().mockResolvedValue({
      success: true,
      message: 'Fixed',
      changes: {}
    })
  }))
}));

describe('GitBasedClaudeCodeAdapter - Data Flow Tests', () => {
  let adapter: GitBasedClaudeCodeAdapter;
  
  beforeEach(() => {
    
    adapter = new GitBasedClaudeCodeAdapter({
      workingDir: '/tmp/test',
      config: {},
      aiProvider: {
        model: 'test',
        apiKey: 'test-key'
      }
    }, '/tmp/test');
  });

  describe('specificVulnerabilities data flow', () => {
    it('should pass specificVulnerabilities from issueContext to prompt', async () => {
      const issueWithVulns: IssueContext = {
        number: 301,
        title: '🔒 Insecure_deserialization vulnerabilities found in 2 files',
        body: 'Security vulnerabilities detected',
        state: 'open',
        labels: ['rsolv:automate', 'rsolv:validated'],
        specificVulnerabilities: [
          {
            file: 'app/routes/contributions.js',
            line: 32,
            message: 'Deserializing untrusted data can lead to remote code execution',
            snippet: 'const preTax = eval(req.body.preTax);',
            remediation: 'Replace eval with safe parsing like parseInt()',
            confidence: 'high'
          },
          {
            file: 'app/routes/contributions.js',
            line: 33,
            message: 'Deserializing untrusted data can lead to remote code execution',
            snippet: 'const afterTax = eval(req.body.afterTax);',
            remediation: 'Replace eval with safe parsing like parseInt()',
            confidence: 'high'
          }
        ]
      } as any;

      const analysis = { 
        relatedFiles: ['app/routes/contributions.js'],
        complexity: 'medium' as const,
        requiresTests: false,
        suggestedApproach: 'Replace eval with parseInt'
      };
      
      // Test the prompt construction directly
      const prompt = (adapter as any).constructPromptWithTestContext(issueWithVulns, analysis);
      
      // Verify the prompt includes specific vulnerability details
      expect(prompt).toContain('SPECIFIC VULNERABILITIES TO FIX');
      expect(prompt).toContain('File: app/routes/contributions.js');
      expect(prompt).toContain('Line 32');
      expect(prompt).toContain('Line 33');
      expect(prompt).toContain('eval(req.body.preTax)');
      expect(prompt).toContain('eval(req.body.afterTax)');
      expect(prompt).toContain('Replace eval with safe parsing like parseInt()');
    });

    it('should log debug info when specificVulnerabilities are present', async () => {
      const { logger } = await import('../../../utils/logger.js');
      const logSpy = vi.spyOn(logger, 'info');
      
      const issueWithVulns: IssueContext = {
        number: 301,
        title: 'Test issue',
        body: 'Test body',
        state: 'open',
        labels: [],
        specificVulnerabilities: [
          {
            file: 'test.js',
            line: 10,
            message: 'Test vulnerability'
          }
        ]
      } as any;
      
      const analysis = { 
        relatedFiles: ['test.js'],
        complexity: 'low' as const,
        requiresTests: false,
        suggestedApproach: 'Fix it'
      };
      
      // Construct prompt to trigger logging
      (adapter as any).constructPromptWithTestContext(issueWithVulns, analysis);
      
      // Check that debug logging was called
      const calls = logSpy.mock.calls;
      const debugCalls = calls.filter((call: any[]) => 
        call[0]?.includes('[DEBUG]')
      );
      
      // Should have logged about specificVulnerabilities
      expect(debugCalls.some((call: any[]) => 
        call[0].includes('specificVulnerabilities present')
      )).toBe(true);
      
      expect(debugCalls.some((call: any[]) => 
        call[0].includes('vulnerabilityCount') || call[0].includes('specificVulnerabilities length')
      )).toBe(true);
    });

    it('should handle missing specificVulnerabilities gracefully', async () => {
      const issueWithoutVulns: IssueContext = {
        number: 302,
        title: 'Generic security issue',
        body: 'Some issue without specific details',
        state: 'open',
        labels: ['rsolv:automate']
      } as any;

      const analysis = { 
        relatedFiles: [],
        complexity: 'low' as const,
        requiresTests: false,
        suggestedApproach: 'General fix'
      };
      
      // Should not throw
      const prompt = (adapter as any).constructPromptWithTestContext(issueWithoutVulns, analysis);
      
      // Should not include the specific vulnerabilities section
      expect(prompt).not.toContain('SPECIFIC VULNERABILITIES TO FIX');
      expect(prompt).toContain('You are an expert security engineer');
    });
  });

  describe('generateSolution data flow', () => {
    it('should preserve specificVulnerabilities through generateSolution call', async () => {
      // Mock the CLI adapter and parent generateSolution
      const localMockCliAdapter = {
        generateSolution: vi.fn(async (context, analysis, prompt) => {
          // Capture the arguments for assertion
          return {
            success: true,
            message: 'Fixed',
            changes: {
              'test.js': 'fixed content'
            }
          };
        })
      };
      
      (adapter as any).cliAdapter = localMockCliAdapter;
      
      const issueWithVulns: IssueContext = {
        number: 301,
        title: 'Test issue',
        body: 'Test body',
        state: 'open',
        labels: [],
        specificVulnerabilities: [
          {
            file: 'test.js',
            line: 10,
            message: 'Test vulnerability',
            remediation: 'Fix it'
          }
        ]
      } as any;
      
      const analysis = { 
        relatedFiles: ['test.js'],
        complexity: 'low' as const,
        requiresTests: false,
        suggestedApproach: 'Fix it'
      };
      
      // Set environment to use CLI
      process.env.RSOLV_USE_CLI = 'true';
      
      // Call generateSolutionWithGit which is the actual method
      await adapter.generateSolutionWithGit(issueWithVulns, analysis);
      
      // Check that the CLI adapter was called with the right context
      const calls = localMockCliAdapter.generateSolution.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      
      const [passedContext, passedAnalysis, passedPrompt] = calls[0];
      
      // The issueContext should still have specificVulnerabilities
      expect(passedContext.specificVulnerabilities).toBeDefined();
      expect(passedContext.specificVulnerabilities.length).toBe(1);
      expect(passedContext.specificVulnerabilities[0].file).toBe('test.js');
      
      // The prompt should include the vulnerability details if provided
      if (passedPrompt) {
        expect(passedPrompt).toContain('SPECIFIC VULNERABILITIES');
        expect(passedPrompt).toContain('test.js');
        expect(passedPrompt).toContain('10');
      }
      
      // Clean up
      delete process.env.RSOLV_USE_CLI;
    });
  });
});