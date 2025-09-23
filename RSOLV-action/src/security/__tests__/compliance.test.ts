import { describe, it, expect, vi } from 'vitest';
import { ComplianceGenerator } from '../compliance.js';
import { VulnerabilityType } from '../types.js';

describe('ComplianceGenerator', () => {
  const generator = new ComplianceGenerator();

  describe('OWASP Compliance Report', () => {
    it('should generate basic OWASP compliance report', () => {
      const vulnerabilities = [
        {
          type: VulnerabilityType.SQL_INJECTION,
          severity: 'high' as const,
          line: 10,
          message: 'SQL injection vulnerability detected',
          description: 'Potential SQL injection in database query',
          cweId: 'CWE-89',
          owaspCategory: 'A03:2021 - Injection',
          confidence: 85
        }
      ];

      const report = generator.generateOwaspComplianceReport(vulnerabilities);

      expect(report).toBeDefined();
      expect(report.standard).toBe('OWASP Top 10 2021');
      expect(report.summary.totalVulnerabilities).toBe(1);
      expect(report.summary.compliance.status).toBe('non-compliant');
      expect(report.categories).toBeDefined();
      expect(report.categories['A03:2021 - Injection']).toBeDefined();
    });

    it('should categorize vulnerabilities by OWASP category', () => {
      const vulnerabilities = [
        {
          type: VulnerabilityType.SQL_INJECTION,
          severity: 'high' as const,
          line: 10,
          message: 'SQL injection detected',
          description: 'SQL injection vulnerability',
          cweId: 'CWE-89',
          owaspCategory: 'A03:2021 - Injection',
          confidence: 85
        },
        {
          type: VulnerabilityType.XSS,
          severity: 'medium' as const,
          line: 20,
          message: 'XSS detected',
          description: 'Cross-site scripting vulnerability',
          cweId: 'CWE-79',
          owaspCategory: 'A03:2021 - Injection',
          confidence: 90
        }
      ];

      const report = generator.generateOwaspComplianceReport(vulnerabilities);

      expect(report.categories['A03:2021 - Injection'].vulnerabilities).toHaveLength(2);
      expect(report.categories['A03:2021 - Injection'].riskLevel).toBe('high');
    });

    it('should calculate compliance status based on severity', () => {
      const lowVulns = [
        {
          type: VulnerabilityType.INSUFFICIENT_LOGGING,
          severity: 'low' as const,
          line: 10,
          message: 'Missing logging',
          description: 'Insufficient logging detected',
          cweId: 'CWE-778',
          owaspCategory: 'A09:2021 - Security Logging and Monitoring Failures',
          confidence: 70
        }
      ];

      const highVulns = [
        {
          type: VulnerabilityType.SQL_INJECTION,
          severity: 'critical' as const,
          line: 10,
          message: 'Critical SQL injection',
          description: 'Critical SQL injection vulnerability',
          cweId: 'CWE-89',
          owaspCategory: 'A03:2021 - Injection',
          confidence: 95
        }
      ];

      const lowReport = generator.generateOwaspComplianceReport(lowVulns);
      const highReport = generator.generateOwaspComplianceReport(highVulns);

      expect(lowReport.summary.compliance.status).toBe('partial');
      expect(highReport.summary.compliance.status).toBe('non-compliant');
    });
  });

  describe('SOC 2 Compliance Report', () => {
    it('should generate SOC 2 compliance report', () => {
      const vulnerabilities = [
        {
          type: VulnerabilityType.BROKEN_ACCESS_CONTROL,
          severity: 'high' as const,
          line: 15,
          message: 'Missing access control',
          description: 'Endpoint lacks proper authentication',
          cweId: 'CWE-862',
          owaspCategory: 'A01:2021 - Broken Access Control',
          confidence: 80
        }
      ];

      const report = generator.generateSoc2ComplianceReport(vulnerabilities);

      expect(report).toBeDefined();
      expect(report.standard).toBe('SOC 2 Type II');
      expect(report.trustPrinciples).toBeDefined();
      expect(report.trustPrinciples.security).toBeDefined();
      expect(report.trustPrinciples.security.status).toBe('non-compliant');
    });
  });

  describe('Report Generation', () => {
    it('should generate markdown compliance report', () => {
      const vulnerabilities = [
        {
          type: VulnerabilityType.SQL_INJECTION,
          severity: 'high' as const,
          line: 10,
          message: 'SQL injection',
          description: 'SQL injection vulnerability detected',
          cweId: 'CWE-89',
          owaspCategory: 'A03:2021 - Injection',
          confidence: 85
        }
      ];

      const owaspReport = generator.generateOwaspComplianceReport(vulnerabilities);
      const markdown = generator.generateMarkdownReport(owaspReport);

      expect(markdown).toContain('# Security Compliance Report');
      expect(markdown).toContain('## OWASP Top 10 2021');
      expect(markdown).toContain('**Status:** non-compliant');
      expect(markdown).toContain('### A03:2021 - Injection');
    });

    it('should handle empty vulnerability lists', () => {
      const report = generator.generateOwaspComplianceReport([]);

      expect(report.summary.totalVulnerabilities).toBe(0);
      expect(report.summary.compliance.status).toBe('compliant');
      expect(Object.keys(report.categories)).toHaveLength(0);
    });
  });
});