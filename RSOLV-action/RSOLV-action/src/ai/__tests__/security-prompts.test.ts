import { describe, it, expect, vi } from 'vitest';
import { 
  buildSecuritySolutionPrompt,
  buildSecurityExplanationPrompt,
  buildSecurityPrDescriptionPrompt
} from '../security-prompts.js';
import { IssueContext } from '../../types/index.js';
import { Vulnerability, VulnerabilityType } from '../../security/index.js';
import { SecurityAnalysisResult } from '../security-analyzer.js';

describe('Security Prompts', () => {
  const mockIssue: IssueContext = {
    number: 123,
    title: 'Fix SQL injection vulnerability',
    body: 'User input is not properly sanitized',
    labels: ['security', 'high-priority'],
    assignee: 'security-team',
    author: 'reporter',
    createdAt: '2023-01-01T00:00:00Z',
    url: 'https://github.com/test/repo/issues/123',
    repository: {
      owner: 'test',
      name: 'repo',
      fullName: 'test/repo',
      defaultBranch: 'main',
      language: 'JavaScript'
    }
  };

  const mockVulnerabilities: Vulnerability[] = [
    {
      type: VulnerabilityType.SQL_INJECTION,
      severity: 'high',
      line: 42,
      message: 'SQL injection vulnerability in user query',
      description: 'User input concatenated directly into SQL query',
      cweId: 'CWE-89',
      owaspCategory: 'A03:2021 - Injection',
      remediation: 'Use parameterized queries',
      confidence: 95
    },
    {
      type: VulnerabilityType.XSS,
      severity: 'high',
      line: 15,
      message: 'XSS vulnerability in DOM manipulation',
      description: 'User input inserted into DOM without sanitization',
      cweId: 'CWE-79',
      owaspCategory: 'A03:2021 - Injection',
      remediation: 'Use textContent instead of innerHTML',
      confidence: 90
    }
  ];

  const mockSecurityAnalysis: SecurityAnalysisResult = {
    hasSecurityIssues: true,
    vulnerabilities: mockVulnerabilities,
    riskLevel: 'high',
    recommendations: [
      'Implement parameterized queries throughout the codebase',
      'Use secure DOM manipulation methods',
      'Add input validation and sanitization'
    ],
    affectedFiles: ['src/database.js', 'src/frontend.js']
  };

  const mockAnalysisData = {
    issueType: 'security',
    estimatedComplexity: 'medium',
    suggestedApproach: 'Fix security vulnerabilities using secure coding practices'
  };

  const mockFileContents = {
    'src/database.js': 'const query = "SELECT * FROM users WHERE id = " + userId;',
    'src/frontend.js': 'element.innerHTML = userInput;'
  };

  describe('buildSecuritySolutionPrompt', () => {
    it('should include security analysis results', () => {
      const prompt = buildSecuritySolutionPrompt(
        mockIssue,
        mockAnalysisData,
        mockFileContents,
        mockSecurityAnalysis
      );

      expect(prompt).toContain('SECURITY ANALYSIS RESULTS');
      expect(prompt).toContain('Risk Level: HIGH');
      expect(prompt).toContain('Vulnerabilities Found: 2');
    });

    it('should include vulnerability details', () => {
      const prompt = buildSecuritySolutionPrompt(
        mockIssue,
        mockAnalysisData,
        mockFileContents,
        mockSecurityAnalysis
      );

      expect(prompt).toContain('SQL_INJECTION: SQL injection vulnerability in user query');
      expect(prompt).toContain('XSS: XSS vulnerability in DOM manipulation');
      expect(prompt).toContain('CWE-89');
      expect(prompt).toContain('CWE-79');
      expect(prompt).toContain('A03:2021 - Injection');
    });

    it('should include security recommendations', () => {
      const prompt = buildSecuritySolutionPrompt(
        mockIssue,
        mockAnalysisData,
        mockFileContents,
        mockSecurityAnalysis
      );

      expect(prompt).toContain('SECURITY RECOMMENDATIONS');
      expect(prompt).toContain('Implement parameterized queries throughout the codebase');
      expect(prompt).toContain('Use secure DOM manipulation methods');
    });

    it('should include security fix templates', () => {
      const prompt = buildSecuritySolutionPrompt(
        mockIssue,
        mockAnalysisData,
        mockFileContents,
        mockSecurityAnalysis
      );

      expect(prompt).toContain('SQL INJECTION FIX TEMPLATE');
      expect(prompt).toContain('XSS (CROSS-SITE SCRIPTING) FIX TEMPLATE');
      expect(prompt).toContain('Use parameterized queries/prepared statements ALWAYS');
      expect(prompt).toContain('Use textContent instead of innerHTML');
    });

    it('should mark affected files', () => {
      const prompt = buildSecuritySolutionPrompt(
        mockIssue,
        mockAnalysisData,
        mockFileContents,
        mockSecurityAnalysis
      );

      expect(prompt).toContain('src/database.js (CONTAINS VULNERABILITIES)');
      expect(prompt).toContain('src/frontend.js (CONTAINS VULNERABILITIES)');
    });

    it('should include security requirements', () => {
      const prompt = buildSecuritySolutionPrompt(
        mockIssue,
        mockAnalysisData,
        mockFileContents,
        mockSecurityAnalysis
      );

      expect(prompt).toContain('SECURITY-FOCUSED SOLUTION REQUIREMENTS');
      expect(prompt).toContain('Address ALL identified vulnerabilities');
      expect(prompt).toContain('Follow security best practices');
      expect(prompt).toContain('eliminate all 2 identified vulnerabilities');
    });
  });

  describe('buildSecurityExplanationPrompt', () => {
    it('should include three-tier explanation structure', () => {
      const prompt = buildSecurityExplanationPrompt(
        mockVulnerabilities,
        mockFileContents
      );

      expect(prompt).toContain('TIER 1: LINE-LEVEL TECHNICAL EXPLANATION');
      expect(prompt).toContain('TIER 2: CONCEPT-LEVEL SECURITY PRINCIPLES');
      expect(prompt).toContain('TIER 3: BUSINESS-LEVEL IMPACT AND COMPLIANCE');
    });

    it('should include vulnerability details', () => {
      const prompt = buildSecurityExplanationPrompt(
        mockVulnerabilities,
        mockFileContents
      );

      expect(prompt).toContain('sql_injection: SQL injection vulnerability in user query (high)');
      expect(prompt).toContain('xss: XSS vulnerability in DOM manipulation (high)');
    });

    it('should include fixes implemented', () => {
      const prompt = buildSecurityExplanationPrompt(
        mockVulnerabilities,
        mockFileContents
      );

      expect(prompt).toContain('FIXES IMPLEMENTED');
      expect(prompt).toContain('src/database.js, src/frontend.js');
    });

    it('should include specific tier requirements', () => {
      const prompt = buildSecurityExplanationPrompt(
        mockVulnerabilities,
        mockFileContents
      );

      expect(prompt).toContain('What exact lines were modified');
      expect(prompt).toContain('What security principle was violated');
      expect(prompt).toContain('Business risk reduction achieved');
      expect(prompt).toContain('Compliance implications (SOC2, GDPR, etc.)');
    });
  });

  describe('buildSecurityPrDescriptionPrompt', () => {
    it('should include security impact summary', () => {
      const prompt = buildSecurityPrDescriptionPrompt(
        mockIssue,
        mockSecurityAnalysis,
        mockFileContents
      );

      expect(prompt).toContain('SECURITY IMPACT');
      expect(prompt).toContain('Risk Level: HIGH');
      expect(prompt).toContain('Vulnerabilities Fixed: 2');
      expect(prompt).toContain('Vulnerability Types: sql_injection, xss');
    });

    it('should include vulnerability details', () => {
      const prompt = buildSecurityPrDescriptionPrompt(
        mockIssue,
        mockSecurityAnalysis,
        mockFileContents
      );

      expect(prompt).toContain('VULNERABILITY DETAILS');
      expect(prompt).toContain('sql_injection (high): SQL injection vulnerability in user query');
      expect(prompt).toContain('xss (high): XSS vulnerability in DOM manipulation');
    });

    it('should include PR description structure', () => {
      const prompt = buildSecurityPrDescriptionPrompt(
        mockIssue,
        mockSecurityAnalysis,
        mockFileContents
      );

      expect(prompt).toContain('🔒 Security Fix Summary');
      expect(prompt).toContain('🛡️ Changes Made');
      expect(prompt).toContain('⚠️ Risk Assessment');
      expect(prompt).toContain('🧪 Security Testing');
      expect(prompt).toContain('📋 Compliance Impact');
      expect(prompt).toContain('🔍 Review Checklist');
    });

    it('should emphasize critical nature', () => {
      const prompt = buildSecurityPrDescriptionPrompt(
        mockIssue,
        mockSecurityAnalysis,
        mockFileContents
      );

      expect(prompt).toContain('critical security fixes');
      expect(prompt).toContain('security-focused language');
      expect(prompt).toContain('critical nature of these fixes');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty vulnerabilities', () => {
      const emptyAnalysis: SecurityAnalysisResult = {
        hasSecurityIssues: false,
        vulnerabilities: [],
        riskLevel: 'low',
        recommendations: [],
        affectedFiles: []
      };

      const prompt = buildSecuritySolutionPrompt(
        mockIssue,
        mockAnalysisData,
        mockFileContents,
        emptyAnalysis
      );

      expect(prompt).toContain('Vulnerabilities Found: 0');
      expect(prompt).toContain('eliminate all 0 identified vulnerabilities');
    });

    it('should handle single vulnerability type', () => {
      const singleVulnAnalysis: SecurityAnalysisResult = {
        hasSecurityIssues: true,
        vulnerabilities: [mockVulnerabilities[0]],
        riskLevel: 'high',
        recommendations: ['Use parameterized queries'],
        affectedFiles: ['src/database.js']
      };

      const prompt = buildSecuritySolutionPrompt(
        mockIssue,
        mockAnalysisData,
        mockFileContents,
        singleVulnAnalysis
      );

      expect(prompt).toContain('SQL INJECTION FIX TEMPLATE');
      expect(prompt).not.toContain('XSS (CROSS-SITE SCRIPTING) FIX TEMPLATE');
    });
  });
});