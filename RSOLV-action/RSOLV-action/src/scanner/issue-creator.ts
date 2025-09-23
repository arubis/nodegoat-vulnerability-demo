import { getGitHubClient } from '../github/api.js';
import { logger } from '../utils/logger.js';
import type { VulnerabilityGroup, CreatedIssue, ScanConfig } from './types.js';

export class IssueCreator {
  private github: ReturnType<typeof getGitHubClient>;

  constructor() {
    this.github = getGitHubClient();
  }

  async createIssuesFromGroups(
    groups: VulnerabilityGroup[],
    config: ScanConfig
  ): Promise<CreatedIssue[]> {
    const createdIssues: CreatedIssue[] = [];

    if (!config.createIssues) {
      logger.info('Issue creation disabled, skipping');
      return createdIssues;
    }

    // Apply max_issues limit if specified
    const maxIssues = config.maxIssues;
    const groupsToProcess = maxIssues ? groups.slice(0, maxIssues) : groups;

    logger.info(`Creating issues for ${groupsToProcess.length} vulnerability groups` +
                (maxIssues ? ` (limited by max_issues: ${maxIssues})` : ''));

    if (maxIssues && groups.length > maxIssues) {
      logger.info(`Note: ${groups.length - maxIssues} vulnerability groups will be skipped due to max_issues limit`);
    }

    for (const group of groupsToProcess) {
      try {
        const issue = await this.createIssueForGroup(group, config);
        createdIssues.push(issue);
        logger.info(`Created issue #${issue.number} for ${group.type} vulnerabilities`);
      } catch (error) {
        logger.error(`Failed to create issue for ${group.type}:`, error);
      }
    }

    return createdIssues;
  }

  private async createIssueForGroup(
    group: VulnerabilityGroup,
    config: ScanConfig
  ): Promise<CreatedIssue> {
    const title = this.generateIssueTitle(group);
    const body = this.generateIssueBody(group, config);
    
    // Build labels array - add rsolv:automate for demo mode
    const labels = ['rsolv:detected', 'security', group.severity, 'automated-scan'];
    
    // Add rsolv:automate label if in demo mode or auto-fix is enabled
    if (process.env.RSOLV_DEMO_MODE === 'true' || process.env.RSOLV_AUTO_FIX === 'true') {
      labels.push('rsolv:automate');
      labels.push('demo');
    }
    
    const { data: issue } = await this.github.issues.create({
      owner: config.repository.owner,
      repo: config.repository.name,
      title,
      body,
      labels
    });
    
    return {
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      vulnerabilityType: group.type,
      fileCount: group.files.length
    };
  }

  private generateIssueTitle(group: VulnerabilityGroup): string {
    const typeMap: Record<string, string> = {
      'sql-injection': 'SQL Injection',
      'xss': 'Cross-Site Scripting (XSS)',
      'command-injection': 'Command Injection',
      'path-traversal': 'Path Traversal',
      'weak-crypto': 'Weak Cryptography',
      'hardcoded-secret': 'Hardcoded Secrets',
      'insecure-random': 'Insecure Random Number Generation',
      'open-redirect': 'Open Redirect',
      'xxe': 'XML External Entity (XXE)',
      'ssrf': 'Server-Side Request Forgery (SSRF)',
      'nosql-injection': 'NoSQL Injection',
      'ldap-injection': 'LDAP Injection',
      'xpath-injection': 'XPath Injection',
      'weak-hash': 'Weak Hashing Algorithm',
      'insecure-deserialization': 'Insecure Deserialization'
    };
    
    // Handle undefined or null types
    const vulnType = group.type || 'security-vulnerability';
    const readableType = typeMap[vulnType] || vulnType.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const fileCount = group.files.length;
    const fileText = fileCount === 1 ? 'file' : 'files';
    
    return `🔒 ${readableType} vulnerabilities found in ${fileCount} ${fileText}`;
  }

  private generateIssueBody(group: VulnerabilityGroup, config: ScanConfig): string {
    const sections: string[] = [];
    
    // Header
    sections.push('## Security Vulnerability Report');
    sections.push('');
    const vulnType = group.type || 'security-vulnerability';
    sections.push(`**Type**: ${vulnType.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`);
    sections.push(`**Severity**: ${group.severity.toUpperCase()}`);
    sections.push(`**Total Instances**: ${group.count}`);
    sections.push(`**Affected Files**: ${group.files.length}`);
    sections.push('');
    
    // Description
    sections.push('### Description');
    sections.push(this.getVulnerabilityDescription(vulnType));
    sections.push('');
    
    // Affected Files
    sections.push('### Affected Files');
    sections.push('');
    
    // Group vulnerabilities by file
    const fileGroups = new Map<string, typeof group.vulnerabilities>();
    for (const vuln of group.vulnerabilities) {
      if (!vuln.filePath) continue;
      
      if (!fileGroups.has(vuln.filePath)) {
        fileGroups.set(vuln.filePath, []);
      }
      fileGroups.get(vuln.filePath)!.push(vuln);
    }
    
    // List each file and its vulnerabilities
    for (const [filePath, vulns] of fileGroups) {
      sections.push(`#### \`${filePath}\``);
      sections.push('');
      
      for (const vuln of vulns.slice(0, 3)) { // Show max 3 examples per file
        sections.push(`- **Line ${vuln.line}**: ${vuln.description}`);
        if (vuln.snippet) {
          sections.push('  ```' + this.detectLanguageFromPath(filePath));
          sections.push('  ' + vuln.snippet.trim());
          sections.push('  ```');
        }
      }
      
      if (vulns.length > 3) {
        sections.push(`- ... and ${vulns.length - 3} more instances`);
      }
      sections.push('');
    }
    
    // Recommendation
    sections.push('### Recommendation');
    sections.push(this.getVulnerabilityRecommendation(vulnType));
    sections.push('');
    
    // Footer
    sections.push('---');
    sections.push('*This issue was automatically generated by RSOLV security scanner*');
    sections.push(`*Repository: ${config.repository.owner}/${config.repository.name}*`);
    sections.push(`*Branch: ${config.repository.defaultBranch}*`);
    sections.push(`*Scan Date: ${new Date().toISOString()}*`);
    
    return sections.join('\n');
  }

  private getVulnerabilityDescription(type: string): string {
    const descriptions: Record<string, string> = {
      'sql-injection': 'SQL injection vulnerabilities occur when user input is directly concatenated into SQL queries without proper sanitization or parameterization. This can allow attackers to execute arbitrary SQL commands.',
      'xss': 'Cross-Site Scripting (XSS) vulnerabilities occur when user input is rendered in HTML without proper escaping. This can allow attackers to inject malicious scripts that execute in other users\' browsers.',
      'command-injection': 'Command injection vulnerabilities occur when user input is passed directly to system commands. This can allow attackers to execute arbitrary system commands on the server.',
      'path-traversal': 'Path traversal vulnerabilities occur when user input is used to construct file paths without proper validation. This can allow attackers to access files outside the intended directory.',
      'weak-crypto': 'Weak cryptography vulnerabilities occur when outdated or insecure cryptographic algorithms are used. This can make encrypted data vulnerable to decryption by attackers.',
      'hardcoded-secret': 'Hardcoded secrets in source code can be exposed if the code is leaked or accessed by unauthorized parties. This includes API keys, passwords, and other sensitive credentials.',
      'insecure-random': 'Using insecure random number generators for security-critical operations can make systems predictable and vulnerable to attacks.',
      'open-redirect': 'Open redirect vulnerabilities occur when user input is used to construct redirect URLs without validation. This can be used in phishing attacks.',
      'xxe': 'XML External Entity (XXE) vulnerabilities occur when XML parsers process external entity references. This can lead to file disclosure, SSRF, or denial of service.',
      'ssrf': 'Server-Side Request Forgery (SSRF) vulnerabilities occur when user input is used to make HTTP requests from the server. This can allow access to internal resources.',
      'nosql-injection': 'NoSQL injection vulnerabilities occur when user input is used in NoSQL queries without proper sanitization. This can allow attackers to manipulate queries and access unauthorized data.',
      'ldap-injection': 'LDAP injection vulnerabilities occur when user input is used in LDAP queries without proper escaping. This can allow attackers to modify LDAP queries and bypass authentication.',
      'xpath-injection': 'XPath injection vulnerabilities occur when user input is used in XPath queries without proper sanitization. This can allow attackers to extract sensitive data from XML documents.',
      'weak-hash': 'Weak hashing algorithms like MD5 or SHA1 are vulnerable to collision attacks and should not be used for security-critical operations.',
      'insecure-deserialization': 'Insecure deserialization vulnerabilities occur when untrusted data is deserialized without proper validation. This can lead to remote code execution.'
    };
    
    return descriptions[type] || 'This type of vulnerability can compromise the security of your application.';
  }

  private getVulnerabilityRecommendation(type: string): string {
    const recommendations: Record<string, string> = {
      'sql-injection': 'Use parameterized queries or prepared statements instead of string concatenation. Never trust user input and always validate and sanitize it before use in SQL queries.',
      'xss': 'Always escape user input before rendering it in HTML. Use context-appropriate escaping functions and consider using a templating engine that provides automatic escaping.',
      'command-injection': 'Avoid executing system commands with user input. If necessary, use a whitelist of allowed values and escape shell metacharacters. Consider using language-specific APIs instead of shell commands.',
      'path-traversal': 'Validate and sanitize file paths. Use a whitelist of allowed directories and files. Resolve paths to their canonical form and ensure they stay within allowed boundaries.',
      'weak-crypto': 'Replace weak cryptographic algorithms with strong, modern alternatives. Use AES for encryption, SHA-256 or better for hashing, and ensure proper key management.',
      'hardcoded-secret': 'Remove hardcoded secrets from source code. Use environment variables, secure key management systems, or configuration files that are not committed to version control.',
      'insecure-random': 'Use cryptographically secure random number generators (CSPRNGs) for security-critical operations. Most languages provide secure alternatives to standard random functions.',
      'open-redirect': 'Validate redirect URLs against a whitelist of allowed domains. Avoid using user input directly in redirect locations.',
      'xxe': 'Disable XML external entity processing in XML parsers. Configure parsers to not resolve external entities or DTDs.',
      'ssrf': 'Validate and whitelist URLs before making requests. Implement network segmentation to limit access to internal resources.',
      'nosql-injection': 'Sanitize and validate user input before using it in NoSQL queries. Use parameterized queries where available and avoid string concatenation.',
      'ldap-injection': 'Escape special LDAP characters in user input. Use parameterized LDAP queries and validate input against expected patterns.',
      'xpath-injection': 'Use parameterized XPath queries or escape user input properly. Validate input against expected patterns and avoid dynamic query construction.',
      'weak-hash': 'Replace MD5 and SHA1 with SHA-256 or better for security operations. For password hashing, use bcrypt, scrypt, or Argon2.',
      'insecure-deserialization': 'Avoid deserializing untrusted data. If necessary, use safe serialization formats like JSON and validate the structure before processing.'
    };
    
    return recommendations[type] || 'Review and fix the identified vulnerabilities according to security best practices.';
  }

  private detectLanguageFromPath(path: string): string {
    const ext = path.substring(path.lastIndexOf('.'));
    const langMap: Record<string, string> = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.rb': 'ruby',
      '.java': 'java',
      '.php': 'php',
      '.ex': 'elixir',
      '.exs': 'elixir'
    };
    
    return langMap[ext] || '';
  }
}