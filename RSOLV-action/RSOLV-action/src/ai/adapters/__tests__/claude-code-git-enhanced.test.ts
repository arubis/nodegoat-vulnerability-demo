import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitBasedClaudeCodeAdapter } from '../claude-code-git.js';
import { IssueContext } from '../../../types/index.js';

describe('GitBasedClaudeCodeAdapter - Enhanced Prompts', () => {
  let adapter: GitBasedClaudeCodeAdapter;
  
  beforeEach(() => {
    adapter = new GitBasedClaudeCodeAdapter({
      workingDir: '/tmp/test',
      config: {}
    });
  });

  describe('constructPromptWithTestContext with specific vulnerabilities', () => {
    it('should include specific vulnerability details when provided', () => {
      const issueWithVulns: any = {
        title: '🔒 Insecure_deserialization vulnerabilities found in 2 files',
        body: 'Security vulnerabilities detected',
        specificVulnerabilities: [
          {
            file: 'app/routes/contributions.js',
            line: 32,
            message: 'Deserializing untrusted data can lead to remote code execution',
            snippet: 'const preTax = eval(req.body.preTax);',
            remediation: 'Replace eval with safe parsing like parseInt()'
          },
          {
            file: 'app/routes/contributions.js',
            line: 33,
            message: 'Deserializing untrusted data can lead to remote code execution',
            snippet: 'const afterTax = eval(req.body.afterTax);',
            remediation: 'Replace eval with safe parsing like parseInt()'
          }
        ]
      };

      const analysis = { relatedFiles: ['app/routes/contributions.js'] };
      
      // This will fail initially - method doesn't exist yet
      const prompt = (adapter as any).constructPromptWithTestContext(issueWithVulns, analysis);
      
      // Should include specific vulnerability details
      expect(prompt).toContain('SPECIFIC VULNERABILITIES TO FIX');
      expect(prompt).toContain('Line 32');
      expect(prompt).toContain('eval(req.body.preTax)');
      expect(prompt).toContain('Replace eval with safe parsing');
      
      // Should include test protection constraints
      expect(prompt).toContain('NEVER MODIFY TEST FILES');
      expect(prompt).toContain('NEVER BYPASS TESTS');
      
      // Should include test execution instructions
      expect(prompt).toContain('npm test');
      expect(prompt).toContain('Bash tool to run tests');
      
      // Should include eval-specific guidance
      expect(prompt).toContain('eval() which executes arbitrary code');
      expect(prompt).toContain('parseInt(value, 10)');
    });

    it('should forbid modifying test files explicitly', () => {
      const issue: any = {
        title: 'Security vulnerability',
        body: 'Fix needed',
        specificVulnerabilities: []
      };
      
      const analysis = {};
      const prompt = (adapter as any).constructPromptWithTestContext(issue, analysis);
      
      // Should have strong test protection language
      expect(prompt).toContain('NEVER MODIFY TEST FILES');
      expect(prompt).toContain('test/, spec/, or __tests__ directories');
      expect(prompt).toContain('fix the IMPLEMENTATION, not the test');
      expect(prompt).toContain('Test files are READ-ONLY');
    });

    it('should group vulnerabilities by file', () => {
      const issueWithMultipleFiles: any = {
        title: 'Multiple vulnerabilities',
        body: 'Various issues',
        specificVulnerabilities: [
          {
            file: 'app/routes/contributions.js',
            line: 32,
            message: 'eval vulnerability'
          },
          {
            file: 'app/routes/contributions.js',
            line: 33,
            message: 'another eval'
          },
          {
            file: 'app/routes/index.js',
            line: 72,
            message: 'open redirect'
          }
        ]
      };
      
      const analysis = {};
      const prompt = (adapter as any).constructPromptWithTestContext(issueWithMultipleFiles, analysis);
      
      // Should group by file
      expect(prompt).toContain('File: app/routes/contributions.js');
      expect(prompt).toContain('File: app/routes/index.js');
      
      // Should list both issues under contributions.js
      expect(prompt.indexOf('Line 32')).toBeLessThan(prompt.indexOf('Line 33'));
      expect(prompt.indexOf('Line 33')).toBeLessThan(prompt.indexOf('File: app/routes/index.js'));
    });
  });
});