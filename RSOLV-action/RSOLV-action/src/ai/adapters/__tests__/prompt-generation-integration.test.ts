import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitBasedClaudeCodeAdapter } from '../claude-code-git.js';
import { IssueContext } from '../../../types/index.js';

describe('Prompt Generation Integration Tests', () => {
  let adapter: GitBasedClaudeCodeAdapter;
  
  beforeEach(() => {
    adapter = new GitBasedClaudeCodeAdapter(
      {
        workingDir: '/tmp/test',
        config: {},
        aiProvider: {
          model: 'claude-3',
          apiKey: 'test-key'
        }
      },
      '/tmp/test'
    );
  });

  describe('End-to-end prompt generation with specificVulnerabilities', () => {
    it('should generate complete prompt with all vulnerability details', () => {
      // Arrange: Real-world issue structure from MITIGATE phase
      const issueFromMitigate: IssueContext = {
        number: 301,
        title: '🔒 Insecure_deserialization vulnerabilities found in 2 files',
        body: `## Summary
Unsafe use of eval() function detected in multiple locations.

## Vulnerabilities
- app/routes/contributions.js: Lines 32-34
- Severity: Critical
- CWE-94: Code Injection`,
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
          },
          {
            file: 'app/routes/contributions.js',
            line: 34,
            message: 'Deserializing untrusted data can lead to remote code execution',
            snippet: 'const roth = eval(req.body.roth);',
            remediation: 'Replace eval with safe parsing like parseInt()',
            confidence: 'high'
          }
        ]
      } as any;

      const analysis = {
        complexity: 'medium' as const,
        relatedFiles: ['app/routes/contributions.js'],
        requiresTests: true,
        suggestedApproach: 'Replace eval with parseInt for numeric inputs'
      };

      // Act: Generate the actual prompt
      const prompt = (adapter as any).constructPromptWithTestContext(
        issueFromMitigate,
        analysis
      );

      // Assert: Comprehensive validation of prompt contents
      
      // 1. Should include the specific vulnerabilities section
      expect(prompt).toContain('SPECIFIC VULNERABILITIES TO FIX');
      
      // 2. Should include all three vulnerable lines
      expect(prompt).toContain('Line 32');
      expect(prompt).toContain('Line 33');
      expect(prompt).toContain('Line 34');
      
      // 3. Should include the actual vulnerable code
      expect(prompt).toContain('eval(req.body.preTax)');
      expect(prompt).toContain('eval(req.body.afterTax)');
      expect(prompt).toContain('eval(req.body.roth)');
      
      // 4. Should include remediation guidance
      expect(prompt).toContain('Replace eval with safe parsing like parseInt()');
      
      // 5. Should include test protection constraints
      expect(prompt).toContain('NEVER MODIFY TEST FILES');
      expect(prompt).toContain('NEVER BYPASS TESTS');
      
      // 6. Should include test execution instructions
      expect(prompt).toContain('npm test');
      expect(prompt).toContain('Bash tool to run tests');
      
      // 7. Should include eval-specific guidance
      expect(prompt).toContain('EVAL/DESERIALIZATION FIX GUIDANCE');
      expect(prompt).toContain('parseInt(value, 10)');
      
      // 8. Should group by file
      expect(prompt).toContain('File: app/routes/contributions.js');
      
      // 9. Should include focus constraints
      expect(prompt).toContain('DO NOT fix issues in other files');
      expect(prompt).toContain('Focus ONLY on the vulnerabilities listed above');
    });

    it('should handle missing specificVulnerabilities gracefully', () => {
      const issueWithoutVulns: IssueContext = {
        number: 302,
        title: 'Generic security issue',
        body: 'Some security concern',
        state: 'open',
        labels: ['rsolv:automate']
      } as any;

      const analysis = {
        complexity: 'low' as const,
        relatedFiles: [],
        requiresTests: false,
        suggestedApproach: 'General security fix'
      };

      // Should not throw
      const prompt = (adapter as any).constructPromptWithTestContext(
        issueWithoutVulns,
        analysis
      );

      // Should still have basic structure
      expect(prompt).toContain('You are an expert security engineer');
      expect(prompt).toContain('CRITICAL CONSTRAINTS');
      
      // Should NOT have specific vulnerabilities section
      expect(prompt).not.toContain('SPECIFIC VULNERABILITIES TO FIX');
    });

    it('should preserve vulnerabilities through validation iterations', () => {
      const issueWithVulns: IssueContext = {
        number: 303,
        title: 'XSS vulnerability',
        body: 'Unescaped output detected',
        state: 'open',
        labels: ['rsolv:automate'],
        specificVulnerabilities: [
          {
            file: 'views/user.pug',
            line: 42,
            message: 'Unescaped user input creates XSS vulnerability',
            snippet: '!{user.bio}',
            remediation: 'Use escaped output: #{user.bio}',
            confidence: 'high'
          }
        ]
      } as any;

      const analysis = {
        complexity: 'low' as const,
        relatedFiles: ['views/user.pug'],
        requiresTests: true,
        suggestedApproach: 'Escape HTML output'
      };

      const validationResult = {
        success: false,
        fixedCommit: {
          redTestPassed: false,
          greenTestPassed: false,
          refactorTestPassed: true
        },
        vulnerableCommit: {
          redTestPassed: true,
          greenTestPassed: false,
          refactorTestPassed: true
        }
      };

      const iteration = { current: 2, max: 3 };

      // Generate prompt with validation failure context
      const prompt = (adapter as any).constructPromptWithTestContext(
        issueWithVulns,
        analysis,
        undefined,
        validationResult,
        iteration
      );

      // Should still include specific vulnerabilities
      expect(prompt).toContain('SPECIFIC VULNERABILITIES TO FIX');
      expect(prompt).toContain('views/user.pug');
      expect(prompt).toContain('Line 42');
      expect(prompt).toContain('!{user.bio}');
      
      // Should also include iteration context
      expect(prompt).toContain('Previous Fix Attempt Failed');
      expect(prompt).toContain('attempt 2 of 3');
    });
  });

  describe('Prompt structure validation', () => {
    it('should order prompt sections correctly', () => {
      const issue: IssueContext = {
        number: 304,
        title: 'Test ordering',
        body: 'Test',
        state: 'open',
        labels: [],
        specificVulnerabilities: [
          {
            file: 'test.js',
            line: 1,
            message: 'Test vulnerability',
            snippet: 'vulnerable()',
            remediation: 'Fix it',
            confidence: 'high'
          }
        ]
      } as any;

      const analysis = {
        complexity: 'low' as const,
        relatedFiles: ['test.js'],
        requiresTests: false,
        suggestedApproach: 'Fix'
      };

      const prompt = (adapter as any).constructPromptWithTestContext(issue, analysis);

      // Check order of major sections
      const constraintsIndex = prompt.indexOf('CRITICAL CONSTRAINTS');
      const vulnerabilitiesIndex = prompt.indexOf('SPECIFIC VULNERABILITIES TO FIX');
      const testExecutionIndex = prompt.indexOf('TEST EXECUTION CAPABILITY');
      
      // Constraints should come first
      expect(constraintsIndex).toBeGreaterThan(-1);
      expect(constraintsIndex).toBeLessThan(vulnerabilitiesIndex);
      
      // Vulnerabilities should come after constraints but before test execution
      expect(vulnerabilitiesIndex).toBeGreaterThan(constraintsIndex);
      expect(vulnerabilitiesIndex).toBeLessThan(testExecutionIndex);
    });
  });
});