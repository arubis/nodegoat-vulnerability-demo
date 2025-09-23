import { describe, it, expect, vi } from 'vitest';
import { ThreeTierExplanationFramework } from '../explanation-framework.js';
import { VulnerabilityType } from '../types.js';

describe('ThreeTierExplanationFramework', () => {
  const framework = new ThreeTierExplanationFramework();

  const sampleVulnerability = {
    type: VulnerabilityType.SQL_INJECTION,
    severity: 'high' as const,
    line: 10,
    message: 'SQL injection vulnerability detected',
    description: 'Potential SQL injection in database query',
    cweId: 'CWE-89',
    owaspCategory: 'A03:2021 - Injection',
    confidence: 85
  };

  describe('Line-Level Explanations', () => {
    it('should generate line-level explanation for SQL injection', () => {
      const explanation = framework.generateLineLevelExplanation(
        sampleVulnerability,
        'const query = "SELECT * FROM users WHERE id = " + userId;'
      );

      expect(explanation.tier).toBe('line');
      expect(explanation.title).toContain('Line 10');
      expect(explanation.content).toContain('concatenation');
      expect(explanation.content).toContain('sanitization');
      expect(explanation.secureExample).toContain('?');
      expect(explanation.riskLevel).toBe('high');
    });

    it('should generate line-level explanation for XSS', () => {
      const xssVuln = {
        ...sampleVulnerability,
        type: VulnerabilityType.XSS,
        message: 'XSS vulnerability in innerHTML'
      };

      const explanation = framework.generateLineLevelExplanation(
        xssVuln,
        'element.innerHTML = userInput;'
      );

      expect(explanation.content).toContain('innerHTML');
      expect(explanation.secureExample).toContain('textContent');
    });
  });

  describe('Concept-Level Explanations', () => {
    it('should generate concept-level explanation for security concepts', () => {
      const explanation = framework.generateConceptLevelExplanation(
        VulnerabilityType.SQL_INJECTION,
        [sampleVulnerability]
      );

      expect(explanation.tier).toBe('concept');
      expect(explanation.title).toContain('SQL Injection');
      expect(explanation.content).toContain('injection');
      expect(explanation.content).toContain('database');
      expect(explanation.preventionMethods).toHaveLength(3);
      expect(explanation.attackScenarios).toHaveLength(2);
    });

    it('should include prevention methods and attack scenarios', () => {
      const explanation = framework.generateConceptLevelExplanation(
        VulnerabilityType.XSS,
        [{ ...sampleVulnerability, type: VulnerabilityType.XSS }]
      );

      expect(explanation.preventionMethods[0]).toContain('Output encoding');
      expect(explanation.attackScenarios[0]).toContain('Script injection');
    });
  });

  describe('Business-Level Explanations', () => {
    it('should generate business-level explanation with impact analysis', () => {
      const vulnerabilities = [
        sampleVulnerability,
        { ...sampleVulnerability, type: VulnerabilityType.XSS, severity: 'medium' as const }
      ];

      const explanation = framework.generateBusinessLevelExplanation(vulnerabilities);

      expect(explanation.tier).toBe('business');
      expect(explanation.title).toContain('Security Risk Assessment');
      expect(explanation.businessImpact).toBeDefined();
      expect(explanation.businessImpact.dataLoss).toBeDefined();
      expect(explanation.businessImpact.reputationalDamage).toBeDefined();
      expect(explanation.complianceImpact.length).toBeGreaterThanOrEqual(1);
      expect(explanation.riskScore).toBeGreaterThan(0);
    });

    it('should calculate appropriate risk scores based on severity', () => {
      const highRiskVulns = [
        { ...sampleVulnerability, severity: 'critical' as const },
        { ...sampleVulnerability, severity: 'high' as const }
      ];

      const lowRiskVulns = [
        { ...sampleVulnerability, severity: 'low' as const }
      ];

      const highRiskExplanation = framework.generateBusinessLevelExplanation(highRiskVulns);
      const lowRiskExplanation = framework.generateBusinessLevelExplanation(lowRiskVulns);

      expect(highRiskExplanation.riskScore).toBeGreaterThan(lowRiskExplanation.riskScore);
    });
  });

  describe('Complete Three-Tier Explanation', () => {
    it('should generate complete explanation with all three tiers', () => {
      const codeContext = {
        'app.js': 'const query = "SELECT * FROM users WHERE id = " + userId;'
      };

      const complete = framework.generateCompleteExplanation(
        [sampleVulnerability],
        codeContext
      );

      expect(complete.lineLevelExplanations).toHaveLength(1);
      expect(complete.conceptLevelExplanations).toHaveLength(1);
      expect(complete.businessLevelExplanation).toBeDefined();
      expect(complete.summary).toBeDefined();
      expect(complete.summary.totalVulnerabilities).toBe(1);
    });

    it('should organize explanations by vulnerability type', () => {
      const vulnerabilities = [
        sampleVulnerability,
        { ...sampleVulnerability, type: VulnerabilityType.XSS, line: 20 }
      ];

      const codeContext = {
        'app.js': 'const query = "SELECT * FROM users WHERE id = " + userId;\nelement.innerHTML = userInput;'
      };

      const complete = framework.generateCompleteExplanation(vulnerabilities, codeContext);

      expect(complete.conceptLevelExplanations).toHaveLength(2);
      expect(complete.lineLevelExplanations).toHaveLength(2);
    });
  });

  describe('Output Formatting', () => {
    it('should format explanation as markdown', () => {
      const explanation = framework.generateLineLevelExplanation(
        sampleVulnerability,
        'const query = "SELECT * FROM users WHERE id = " + userId;'
      );

      const markdown = framework.formatAsMarkdown(explanation);

      expect(markdown).toContain('### Line 10: SQL Injection Vulnerability');
      expect(markdown).toContain('**Secure Example:**');
      expect(markdown).toContain('```');
    });

    it('should generate comprehensive markdown report', () => {
      const vulnerabilities = [sampleVulnerability];
      const codeContext = { 'app.js': 'const query = "SELECT * FROM users WHERE id = " + userId;' };
      
      const complete = framework.generateCompleteExplanation(vulnerabilities, codeContext);
      const markdown = framework.generateMarkdownReport(complete);

      expect(markdown).toContain('# Security Vulnerability Explanation');
      expect(markdown).toContain('## Line-Level Analysis');
      expect(markdown).toContain('## Concept-Level Analysis');
      expect(markdown).toContain('## Business Impact Analysis');
      expect(markdown).toContain('## Summary');
    });
  });
});