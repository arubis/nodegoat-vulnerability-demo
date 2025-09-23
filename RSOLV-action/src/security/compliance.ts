import { Vulnerability, VulnerabilityType } from './types.js';

export interface ComplianceReport {
  standard: string;
  summary: ComplianceSummary;
  categories: Record<string, ComplianceCategory>;
  recommendations: string[];
  timestamp: string;
}

export interface ComplianceSummary {
  totalVulnerabilities: number;
  compliance: {
    status: 'compliant' | 'partial' | 'non-compliant';
    score: number; // 0-100
  };
  bySeverity: Record<string, number>;
}

export interface ComplianceCategory {
  name: string;
  description: string;
  vulnerabilities: Vulnerability[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  requirements: string[];
  status: 'compliant' | 'partial' | 'non-compliant';
}

export interface Soc2Report {
  standard: string;
  trustPrinciples: Record<string, TrustPrinciple>;
  summary: ComplianceSummary;
  timestamp: string;
}

export interface TrustPrinciple {
  name: string;
  description: string;
  status: 'compliant' | 'partial' | 'non-compliant';
  findings: Vulnerability[];
  controlObjectives: string[];
}

export class ComplianceGenerator {
  generateOwaspComplianceReport(vulnerabilities: Vulnerability[]): ComplianceReport {
    const categories = this.categorizeByOwasp(vulnerabilities);
    const summary = this.calculateComplianceSummary(vulnerabilities);
    
    return {
      standard: 'OWASP Top 10 2021',
      summary,
      categories,
      recommendations: this.generateRecommendations(vulnerabilities),
      timestamp: new Date().toISOString()
    };
  }

  generateSoc2ComplianceReport(vulnerabilities: Vulnerability[]): Soc2Report {
    const trustPrinciples = this.mapToSoc2Principles(vulnerabilities);
    const summary = this.calculateComplianceSummary(vulnerabilities);

    return {
      standard: 'SOC 2 Type II',
      trustPrinciples,
      summary,
      timestamp: new Date().toISOString()
    };
  }

  generateMarkdownReport(report: ComplianceReport): string {
    let markdown = '# Security Compliance Report\n\n';
    markdown += `**Generated:** ${new Date(report.timestamp).toLocaleDateString()}\n\n`;
    
    markdown += `## ${report.standard}\n\n`;
    markdown += `**Status:** ${report.summary.compliance.status}\n`;
    markdown += `**Compliance Score:** ${report.summary.compliance.score}%\n`;
    markdown += `**Total Vulnerabilities:** ${report.summary.totalVulnerabilities}\n\n`;

    // Add severity breakdown
    markdown += '### Vulnerability Breakdown\n\n';
    for (const [severity, count] of Object.entries(report.summary.bySeverity)) {
      if (count > 0) {
        markdown += `- **${severity.charAt(0).toUpperCase() + severity.slice(1)}:** ${count}\n`;
      }
    }
    markdown += '\n';

    // Add categories
    markdown += '### Security Categories\n\n';
    for (const [categoryName, category] of Object.entries(report.categories)) {
      markdown += `#### ${categoryName}\n\n`;
      markdown += `**Status:** ${category.status}\n`;
      markdown += `**Risk Level:** ${category.riskLevel}\n`;
      markdown += `**Vulnerabilities:** ${category.vulnerabilities.length}\n\n`;
      
      if (category.vulnerabilities.length > 0) {
        markdown += '**Findings:**\n';
        for (const vuln of category.vulnerabilities) {
          markdown += `- Line ${vuln.line}: ${vuln.message} (${vuln.severity})\n`;
        }
        markdown += '\n';
      }
    }

    // Add recommendations
    if (report.recommendations.length > 0) {
      markdown += '### Recommendations\n\n';
      for (const rec of report.recommendations) {
        markdown += `- ${rec}\n`;
      }
    }

    return markdown;
  }

  private categorizeByOwasp(vulnerabilities: Vulnerability[]): Record<string, ComplianceCategory> {
    const categories: Record<string, ComplianceCategory> = {};

    for (const vuln of vulnerabilities) {
      const categoryName = vuln.owaspCategory || 'Uncategorized';
      
      if (!categories[categoryName]) {
        categories[categoryName] = {
          name: categoryName,
          description: this.getOwaspCategoryDescription(categoryName),
          vulnerabilities: [],
          riskLevel: 'low',
          requirements: this.getOwaspRequirements(categoryName),
          status: 'compliant'
        };
      }

      categories[categoryName].vulnerabilities.push(vuln);
    }

    // Calculate risk levels and status for each category
    for (const category of Object.values(categories)) {
      category.riskLevel = this.calculateCategoryRisk(category.vulnerabilities);
      category.status = this.calculateCategoryStatus(category.vulnerabilities);
    }

    return categories;
  }

  private mapToSoc2Principles(vulnerabilities: Vulnerability[]): Record<string, TrustPrinciple> {
    const principles: Record<string, TrustPrinciple> = {
      security: {
        name: 'Security',
        description: 'Protection against unauthorized access',
        status: 'compliant',
        findings: [],
        controlObjectives: [
          'Access controls are implemented',
          'Data is protected during transmission and storage',
          'Security incidents are identified and addressed'
        ]
      },
      availability: {
        name: 'Availability',
        description: 'System availability and operational performance',
        status: 'compliant',
        findings: [],
        controlObjectives: [
          'Systems are available for operation and use',
          'Performance monitoring is in place'
        ]
      },
      confidentiality: {
        name: 'Confidentiality',
        description: 'Protection of confidential information',
        status: 'compliant',
        findings: [],
        controlObjectives: [
          'Confidential information is protected',
          'Access to confidential data is restricted'
        ]
      }
    };

    // Map vulnerabilities to SOC 2 principles
    for (const vuln of vulnerabilities) {
      if (this.affectsSecurityPrinciple(vuln)) {
        principles.security.findings.push(vuln);
      }
      if (this.affectsConfidentialityPrinciple(vuln)) {
        principles.confidentiality.findings.push(vuln);
      }
    }

    // Calculate status for each principle
    for (const principle of Object.values(principles)) {
      principle.status = this.calculatePrincipleStatus(principle.findings);
    }

    return principles;
  }

  private calculateComplianceSummary(vulnerabilities: Vulnerability[]): ComplianceSummary {
    const bySeverity = this.groupBySeverity(vulnerabilities);
    const score = this.calculateComplianceScore(vulnerabilities);
    const status = this.determineComplianceStatus(score, vulnerabilities);

    return {
      totalVulnerabilities: vulnerabilities.length,
      compliance: { status, score },
      bySeverity
    };
  }

  private groupBySeverity(vulnerabilities: Vulnerability[]): Record<string, number> {
    const bySeverity: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0
    };

    for (const vuln of vulnerabilities) {
      bySeverity[vuln.severity]++;
    }

    return bySeverity;
  }

  private calculateComplianceScore(vulnerabilities: Vulnerability[]): number {
    if (vulnerabilities.length === 0) return 100;

    let score = 100;
    for (const vuln of vulnerabilities) {
      switch (vuln.severity) {
      case 'critical':
        score -= 25;
        break;
      case 'high':
        score -= 15;
        break;
      case 'medium':
        score -= 10;
        break;
      case 'low':
        score -= 5;
        break;
      }
    }

    return Math.max(0, score);
  }

  private determineComplianceStatus(score: number, vulnerabilities: Vulnerability[]): 'compliant' | 'partial' | 'non-compliant' {
    if (vulnerabilities.length === 0) return 'compliant';
    
    const hasCritical = vulnerabilities.some(v => v.severity === 'critical');
    const hasHigh = vulnerabilities.some(v => v.severity === 'high');

    if (hasCritical || hasHigh) return 'non-compliant';
    if (score < 80) return 'partial';
    return 'partial'; // Any vulnerabilities = at least partial non-compliance
  }

  private calculateCategoryRisk(vulnerabilities: Vulnerability[]): 'low' | 'medium' | 'high' | 'critical' {
    if (vulnerabilities.some(v => v.severity === 'critical')) return 'critical';
    if (vulnerabilities.some(v => v.severity === 'high')) return 'high';
    if (vulnerabilities.some(v => v.severity === 'medium')) return 'medium';
    return 'low';
  }

  private calculateCategoryStatus(vulnerabilities: Vulnerability[]): 'compliant' | 'partial' | 'non-compliant' {
    if (vulnerabilities.length === 0) return 'compliant';
    
    const hasCriticalOrHigh = vulnerabilities.some(v => v.severity === 'critical' || v.severity === 'high');
    return hasCriticalOrHigh ? 'non-compliant' : 'partial';
  }

  private calculatePrincipleStatus(findings: Vulnerability[]): 'compliant' | 'partial' | 'non-compliant' {
    if (findings.length === 0) return 'compliant';
    
    const hasCriticalOrHigh = findings.some(v => v.severity === 'critical' || v.severity === 'high');
    return hasCriticalOrHigh ? 'non-compliant' : 'partial';
  }

  private affectsSecurityPrinciple(vuln: Vulnerability): boolean {
    return ['broken_access_control', 'broken_authentication', 'security_misconfiguration'].includes(vuln.type as string);
  }

  private affectsConfidentialityPrinciple(vuln: Vulnerability): boolean {
    return ['sensitive_data_exposure', 'insecure_deserialization'].includes(vuln.type as string);
  }

  private getOwaspCategoryDescription(category: string): string {
    const descriptions: Record<string, string> = {
      'A01:2021 - Broken Access Control': 'Failures related to restrictions on authenticated users',
      'A02:2021 - Cryptographic Failures': 'Failures related to cryptography and data protection',
      'A03:2021 - Injection': 'User-supplied data not validated, filtered, or sanitized',
      'A04:2021 - Insecure Design': 'Missing or ineffective control design',
      'A05:2021 - Security Misconfiguration': 'Missing security hardening or improperly configured permissions',
      'A06:2021 - Vulnerable and Outdated Components': 'Use of vulnerable, unsupported, or outdated components',
      'A07:2021 - Identification and Authentication Failures': 'Authentication and session management implementation issues',
      'A08:2021 - Software and Data Integrity Failures': 'Assumptions about software updates and critical data',
      'A09:2021 - Security Logging and Monitoring Failures': 'Missing or insufficient security monitoring',
      'A10:2021 - Server-Side Request Forgery': 'SSRF flaws when web application fetches remote resources'
    };

    return descriptions[category] || 'Security vulnerability category';
  }

  private getOwaspRequirements(category: string): string[] {
    const requirements: Record<string, string[]> = {
      'A01:2021 - Broken Access Control': [
        'Implement proper access controls',
        'Enforce principle of least privilege',
        'Validate user permissions for each request'
      ],
      'A02:2021 - Cryptographic Failures': [
        'Use strong encryption algorithms',
        'Protect data in transit and at rest',
        'Implement proper key management'
      ],
      'A03:2021 - Injection': [
        'Use parameterized queries',
        'Validate and sanitize all input',
        'Apply input validation and output encoding'
      ]
    };

    return requirements[category] || ['Address security vulnerability'];
  }

  private generateRecommendations(vulnerabilities: Vulnerability[]): string[] {
    const recommendations: string[] = [];

    if (vulnerabilities.some(v => v.type === VulnerabilityType.SQL_INJECTION)) {
      recommendations.push('Implement parameterized queries and input validation');
    }
    if (vulnerabilities.some(v => v.type === VulnerabilityType.XSS)) {
      recommendations.push('Apply output encoding and use Content Security Policy');
    }
    if (vulnerabilities.some(v => v.type === VulnerabilityType.BROKEN_ACCESS_CONTROL)) {
      recommendations.push('Implement proper authentication and authorization controls');
    }

    if (recommendations.length === 0) {
      recommendations.push('Continue regular security assessments and monitoring');
    }

    return recommendations;
  }
}