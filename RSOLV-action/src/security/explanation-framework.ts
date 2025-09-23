import { Vulnerability, VulnerabilityType } from './types.js';

export interface LineLevelExplanation {
  tier: 'line';
  vulnerabilityId: string;
  title: string;
  content: string;
  secureExample: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  lineNumber: number;
  codeSnippet: string;
}

export interface ConceptLevelExplanation {
  tier: 'concept';
  vulnerabilityType: VulnerabilityType;
  title: string;
  content: string;
  preventionMethods: string[];
  attackScenarios: string[];
  relatedConcepts: string[];
  affectedVulnerabilities: Vulnerability[];
}

export interface BusinessLevelExplanation {
  tier: 'business';
  title: string;
  content: string;
  businessImpact: {
    dataLoss: string;
    reputationalDamage: string;
    financialImpact: string;
    operationalDisruption: string;
  };
  complianceImpact: string[];
  riskScore: number; // 0-100
  priorities: string[];
  timeline: string;
}

export interface CompleteExplanation {
  lineLevelExplanations: LineLevelExplanation[];
  conceptLevelExplanations: ConceptLevelExplanation[];
  businessLevelExplanation: BusinessLevelExplanation;
  summary: {
    totalVulnerabilities: number;
    severityBreakdown: Record<string, number>;
    primaryRisks: string[];
    estimatedFixTime: string;
  };
  timestamp: string;
}

export class ThreeTierExplanationFramework {
  generateLineLevelExplanation(vulnerability: Vulnerability, codeSnippet: string): LineLevelExplanation {
    const title = `Line ${vulnerability.line}: ${this.getVulnerabilityDisplayName(vulnerability.type)} Vulnerability`;
    const content = this.generateLineLevelContent(vulnerability, codeSnippet);
    const secureExample = this.generateSecureExample(vulnerability.type, codeSnippet);

    return {
      tier: 'line',
      vulnerabilityId: `${vulnerability.type}-${vulnerability.line}`,
      title,
      content,
      secureExample,
      riskLevel: vulnerability.severity,
      lineNumber: vulnerability.line,
      codeSnippet
    };
  }

  generateConceptLevelExplanation(
    vulnerabilityType: VulnerabilityType,
    vulnerabilities: Vulnerability[]
  ): ConceptLevelExplanation {
    const title = `Understanding ${this.getVulnerabilityDisplayName(vulnerabilityType)}`;
    const content = this.generateConceptLevelContent(vulnerabilityType);
    const preventionMethods = this.getPreventionMethods(vulnerabilityType);
    const attackScenarios = this.getAttackScenarios(vulnerabilityType);
    const relatedConcepts = this.getRelatedConcepts(vulnerabilityType);

    return {
      tier: 'concept',
      vulnerabilityType,
      title,
      content,
      preventionMethods,
      attackScenarios,
      relatedConcepts,
      affectedVulnerabilities: vulnerabilities.filter(v => v.type === vulnerabilityType)
    };
  }

  generateBusinessLevelExplanation(vulnerabilities: Vulnerability[]): BusinessLevelExplanation {
    const riskScore = this.calculateRiskScore(vulnerabilities);
    const businessImpact = this.analyzeBusinessImpact(vulnerabilities);
    const complianceImpact = this.analyzeComplianceImpact(vulnerabilities);
    const priorities = this.determinePriorities(vulnerabilities);
    const timeline = this.estimateTimeline(vulnerabilities);

    return {
      tier: 'business',
      title: 'Security Risk Assessment and Business Impact',
      content: this.generateBusinessLevelContent(vulnerabilities),
      businessImpact,
      complianceImpact,
      riskScore,
      priorities,
      timeline
    };
  }

  generateCompleteExplanation(
    vulnerabilities: Vulnerability[],
    codeContext: Record<string, string>
  ): CompleteExplanation {
    // Generate line-level explanations
    const lineLevelExplanations: LineLevelExplanation[] = [];
    for (const vuln of vulnerabilities) {
      const codeSnippet = this.extractCodeSnippet(vuln, codeContext);
      lineLevelExplanations.push(this.generateLineLevelExplanation(vuln, codeSnippet));
    }

    // Generate concept-level explanations (one per vulnerability type)
    const uniqueTypes = [...new Set(vulnerabilities.map(v => v.type))];
    const conceptLevelExplanations = uniqueTypes.map(type =>
      this.generateConceptLevelExplanation(type, vulnerabilities)
    );

    // Generate business-level explanation
    const businessLevelExplanation = this.generateBusinessLevelExplanation(vulnerabilities);

    // Generate summary
    const summary = this.generateSummary(vulnerabilities);

    return {
      lineLevelExplanations,
      conceptLevelExplanations,
      businessLevelExplanation,
      summary,
      timestamp: new Date().toISOString()
    };
  }

  formatAsMarkdown(explanation: LineLevelExplanation | ConceptLevelExplanation | BusinessLevelExplanation): string {
    if (explanation.tier === 'line') {
      return this.formatLineLevelMarkdown(explanation as LineLevelExplanation);
    } else if (explanation.tier === 'concept') {
      return this.formatConceptLevelMarkdown(explanation as ConceptLevelExplanation);
    } else {
      return this.formatBusinessLevelMarkdown(explanation as BusinessLevelExplanation);
    }
  }

  generateMarkdownReport(complete: CompleteExplanation): string {
    let markdown = '# Security Vulnerability Explanation\n\n';
    markdown += `**Generated:** ${new Date(complete.timestamp).toLocaleDateString()}\n\n`;

    // Summary
    markdown += '## Summary\n\n';
    markdown += `- **Total Vulnerabilities:** ${complete.summary.totalVulnerabilities}\n`;
    markdown += `- **Estimated Fix Time:** ${complete.summary.estimatedFixTime}\n`;
    markdown += `- **Risk Score:** ${complete.businessLevelExplanation.riskScore}/100\n\n`;

    // Line-level analysis
    markdown += '## Line-Level Analysis\n\n';
    for (const explanation of complete.lineLevelExplanations) {
      markdown += this.formatLineLevelMarkdown(explanation) + '\n';
    }

    // Concept-level analysis
    markdown += '## Concept-Level Analysis\n\n';
    for (const explanation of complete.conceptLevelExplanations) {
      markdown += this.formatConceptLevelMarkdown(explanation) + '\n';
    }

    // Business impact analysis
    markdown += '## Business Impact Analysis\n\n';
    markdown += this.formatBusinessLevelMarkdown(complete.businessLevelExplanation);

    return markdown;
  }

  private generateLineLevelContent(vulnerability: Vulnerability, _codeSnippet: string): string {
    const templates: Record<string, string> = {
      [VulnerabilityType.SQL_INJECTION]: 'This line contains a SQL injection vulnerability because it uses string concatenation to build a database query. User input is directly embedded into the SQL statement without proper sanitization, allowing attackers to manipulate the query logic.',
      [VulnerabilityType.XSS]: 'This line contains a cross-site scripting (XSS) vulnerability because it directly assigns user-controlled content to innerHTML without sanitization. This allows attackers to inject malicious scripts that execute in other users\' browsers.',
      [VulnerabilityType.BROKEN_ACCESS_CONTROL]: 'This endpoint lacks proper access control checks, allowing unauthorized users to access restricted functionality or data.',
      [VulnerabilityType.SENSITIVE_DATA_EXPOSURE]: 'This line exposes sensitive data in plain text, making it vulnerable to unauthorized access or accidental disclosure.'
    };

    return templates[vulnerability.type] || `This line contains a ${vulnerability.type} vulnerability that poses security risks.`;
  }

  private generateSecureExample(vulnerabilityType: VulnerabilityType, _codeSnippet: string): string {
    const examples: Record<string, string> = {
      [VulnerabilityType.SQL_INJECTION]: `const query = "SELECT * FROM users WHERE id = ?";
db.query(query, [userId], callback);`,
      [VulnerabilityType.XSS]: `element.textContent = userInput;
// or use a sanitization library:
element.innerHTML = DOMPurify.sanitize(userInput);`,
      [VulnerabilityType.BROKEN_ACCESS_CONTROL]: `app.get("/admin/users", authenticateUser, authorizeAdmin, (req, res) => {
  // handler code
});`,
      [VulnerabilityType.SENSITIVE_DATA_EXPOSURE]: `const hashedPassword = await bcrypt.hash(password, 10);
// Never log sensitive data`
    };

    return examples[vulnerabilityType] || 'Use secure coding practices for this vulnerability type.';
  }

  private generateConceptLevelContent(vulnerabilityType: VulnerabilityType): string {
    const templates: Record<string, string> = {
      [VulnerabilityType.SQL_INJECTION]: 'SQL injection is a code injection technique that exploits vulnerabilities in an application\'s database layer. Attackers insert malicious SQL code into application queries, potentially gaining unauthorized access to sensitive data, modifying database contents, or executing administrative operations.',
      [VulnerabilityType.XSS]: 'Cross-Site Scripting (XSS) allows attackers to inject client-side scripts into web pages viewed by other users. When successful, XSS attacks can access sensitive page content, session tokens, or other sensitive information, and can perform actions on behalf of the victim.',
      [VulnerabilityType.BROKEN_ACCESS_CONTROL]: 'Broken access control occurs when applications fail to properly restrict what authenticated users are allowed to do. This can lead to unauthorized information disclosure, modification, or destruction of data, or performing business functions outside the user\'s limits.'
    };

    return templates[vulnerabilityType] || `${vulnerabilityType} represents a security vulnerability that requires attention.`;
  }

  private getPreventionMethods(vulnerabilityType: VulnerabilityType): string[] {
    const methods: Record<string, string[]> = {
      [VulnerabilityType.SQL_INJECTION]: [
        'Use parameterized queries or prepared statements',
        'Implement input validation and sanitization',
        'Apply principle of least privilege for database accounts'
      ],
      [VulnerabilityType.XSS]: [
        'Output encoding and escaping',
        'Input validation and sanitization',
        'Content Security Policy (CSP) implementation'
      ],
      [VulnerabilityType.BROKEN_ACCESS_CONTROL]: [
        'Implement proper authentication mechanisms',
        'Use role-based access control (RBAC)',
        'Apply principle of least privilege'
      ]
    };

    return methods[vulnerabilityType] || ['Implement secure coding practices'];
  }

  private getAttackScenarios(vulnerabilityType: VulnerabilityType): string[] {
    const scenarios: Record<string, string[]> = {
      [VulnerabilityType.SQL_INJECTION]: [
        'Data extraction through UNION-based attacks',
        'Authentication bypass via boolean-based attacks'
      ],
      [VulnerabilityType.XSS]: [
        'Script injection to steal session cookies',
        'Phishing attacks through content manipulation'
      ],
      [VulnerabilityType.BROKEN_ACCESS_CONTROL]: [
        'Privilege escalation to admin functions',
        'Horizontal privilege escalation to other users\' data'
      ]
    };

    return scenarios[vulnerabilityType] || ['Various attack vectors possible'];
  }

  private getRelatedConcepts(vulnerabilityType: VulnerabilityType): string[] {
    const concepts: Record<string, string[]> = {
      [VulnerabilityType.SQL_INJECTION]: ['Input validation', 'Database security', 'Query parameterization'],
      [VulnerabilityType.XSS]: ['Content Security Policy', 'Input sanitization', 'Output encoding'],
      [VulnerabilityType.BROKEN_ACCESS_CONTROL]: ['Authentication', 'Authorization', 'Session management']
    };

    return concepts[vulnerabilityType] || ['Security fundamentals'];
  }

  private calculateRiskScore(vulnerabilities: Vulnerability[]): number {
    let score = 0;
    for (const vuln of vulnerabilities) {
      switch (vuln.severity) {
      case 'critical': score += 25; break;
      case 'high': score += 20; break;
      case 'medium': score += 15; break;
      case 'low': score += 10; break;
      }
    }
    return Math.min(100, score);
  }

  private analyzeBusinessImpact(vulnerabilities: Vulnerability[]) {
    const hasHighSeverity = vulnerabilities.some(v => v.severity === 'critical' || v.severity === 'high');
    
    return {
      dataLoss: hasHighSeverity ? 'High risk of sensitive data exposure or theft' : 'Moderate risk of data exposure',
      reputationalDamage: hasHighSeverity ? 'Severe impact on customer trust and brand reputation' : 'Potential minor impact on reputation',
      financialImpact: hasHighSeverity ? 'Significant costs from breaches, compliance fines, and recovery' : 'Minimal direct financial impact',
      operationalDisruption: hasHighSeverity ? 'Potential system compromise affecting business operations' : 'Limited operational impact'
    };
  }

  private analyzeComplianceImpact(vulnerabilities: Vulnerability[]): string[] {
    const impacts = [];
    
    if (vulnerabilities.some(v => v.type === VulnerabilityType.SQL_INJECTION || v.type === VulnerabilityType.XSS)) {
      impacts.push('OWASP Top 10 compliance violation');
    }
    
    if (vulnerabilities.some(v => v.type === VulnerabilityType.SENSITIVE_DATA_EXPOSURE)) {
      impacts.push('GDPR/CCPA data protection requirements at risk');
    }
    
    return impacts.length > 0 ? impacts : ['Monitor compliance requirements'];
  }

  private determinePriorities(vulnerabilities: Vulnerability[]): string[] {
    const priorities = [];
    
    if (vulnerabilities.some(v => v.severity === 'critical')) {
      priorities.push('Immediate action required for critical vulnerabilities');
    }
    
    if (vulnerabilities.some(v => v.severity === 'high')) {
      priorities.push('High priority fixes should be completed within 24-48 hours');
    }
    
    priorities.push('Implement comprehensive security testing');
    
    return priorities;
  }

  private estimateTimeline(vulnerabilities: Vulnerability[]): string {
    const criticalCount = vulnerabilities.filter(v => v.severity === 'critical').length;
    const highCount = vulnerabilities.filter(v => v.severity === 'high').length;
    
    if (criticalCount > 0) return 'Immediate (within 24 hours)';
    if (highCount > 0) return 'Urgent (within 48 hours)';
    return 'Standard (within 1 week)';
  }

  private generateBusinessLevelContent(vulnerabilities: Vulnerability[]): string {
    const riskScore = this.calculateRiskScore(vulnerabilities);
    const severityCounts = this.groupBySeverity(vulnerabilities);
    
    return `Your application has ${vulnerabilities.length} security vulnerabilities with a risk score of ${riskScore}/100. 
    This includes ${severityCounts.critical} critical, ${severityCounts.high} high, ${severityCounts.medium} medium, 
    and ${severityCounts.low} low severity issues. These vulnerabilities pose significant risks to your business 
    operations, customer data, and regulatory compliance.`;
  }

  private extractCodeSnippet(vulnerability: Vulnerability, codeContext: Record<string, string>): string {
    // Find the file containing this vulnerability and extract the relevant line
    for (const content of Object.values(codeContext)) {
      const lines = content.split('\n');
      if (vulnerability.line <= lines.length) {
        return lines[vulnerability.line - 1] || 'Code snippet not available';
      }
    }
    return 'Code snippet not available';
  }

  private generateSummary(vulnerabilities: Vulnerability[]) {
    const severityBreakdown = this.groupBySeverity(vulnerabilities);
    const primaryRisks = this.identifyPrimaryRisks(vulnerabilities);
    const estimatedFixTime = this.estimateFixTime(vulnerabilities);

    return {
      totalVulnerabilities: vulnerabilities.length,
      severityBreakdown,
      primaryRisks,
      estimatedFixTime
    };
  }

  private groupBySeverity(vulnerabilities: Vulnerability[]): Record<string, number> {
    const breakdown: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const vuln of vulnerabilities) {
      breakdown[vuln.severity]++;
    }
    return breakdown;
  }

  private identifyPrimaryRisks(vulnerabilities: Vulnerability[]): string[] {
    const riskTypes = [...new Set(vulnerabilities.map(v => this.getVulnerabilityDisplayName(v.type)))];
    return riskTypes.slice(0, 3); // Top 3 risk types
  }

  private estimateFixTime(vulnerabilities: Vulnerability[]): string {
    const totalHours = vulnerabilities.length * 2; // Rough estimate of 2 hours per vulnerability
    if (totalHours < 8) return `${totalHours} hours`;
    const days = Math.ceil(totalHours / 8);
    return `${days} days`;
  }

  private getVulnerabilityDisplayName(type: VulnerabilityType): string {
    const names: Record<string, string> = {
      [VulnerabilityType.SQL_INJECTION]: 'SQL Injection',
      [VulnerabilityType.XSS]: 'Cross-Site Scripting (XSS)',
      [VulnerabilityType.BROKEN_ACCESS_CONTROL]: 'Broken Access Control',
      [VulnerabilityType.SENSITIVE_DATA_EXPOSURE]: 'Sensitive Data Exposure',
      [VulnerabilityType.XML_EXTERNAL_ENTITIES]: 'XML External Entities (XXE)',
      [VulnerabilityType.SECURITY_MISCONFIGURATION]: 'Security Misconfiguration',
      [VulnerabilityType.VULNERABLE_COMPONENTS]: 'Vulnerable Components',
      [VulnerabilityType.BROKEN_AUTHENTICATION]: 'Broken Authentication',
      [VulnerabilityType.INSECURE_DESERIALIZATION]: 'Insecure Deserialization',
      [VulnerabilityType.INSUFFICIENT_LOGGING]: 'Insufficient Logging'
    };

    return names[type] || type;
  }

  private formatLineLevelMarkdown(explanation: LineLevelExplanation): string {
    return `### ${explanation.title}

**Risk Level:** ${explanation.riskLevel}

${explanation.content}

**Vulnerable Code:**
\`\`\`javascript
${explanation.codeSnippet}
\`\`\`

**Secure Example:**
\`\`\`javascript
${explanation.secureExample}
\`\`\`

`;
  }

  private formatConceptLevelMarkdown(explanation: ConceptLevelExplanation): string {
    let markdown = `### ${explanation.title}

${explanation.content}

**Prevention Methods:**
`;
    for (const method of explanation.preventionMethods) {
      markdown += `- ${method}\n`;
    }

    markdown += `\n**Common Attack Scenarios:**
`;
    for (const scenario of explanation.attackScenarios) {
      markdown += `- ${scenario}\n`;
    }

    return markdown + '\n';
  }

  private formatBusinessLevelMarkdown(explanation: BusinessLevelExplanation): string {
    return `### ${explanation.title}

**Risk Score:** ${explanation.riskScore}/100

${explanation.content}

**Business Impact:**
- **Data Loss Risk:** ${explanation.businessImpact.dataLoss}
- **Reputational Damage:** ${explanation.businessImpact.reputationalDamage}  
- **Financial Impact:** ${explanation.businessImpact.financialImpact}
- **Operational Disruption:** ${explanation.businessImpact.operationalDisruption}

**Timeline:** ${explanation.timeline}

`;
  }
}