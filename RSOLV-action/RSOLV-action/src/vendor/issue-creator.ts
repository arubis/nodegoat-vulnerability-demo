/**
 * RFC-047: Vendor-specific Issue Creation
 */

import { VendorVulnerability, Issue } from './types.js';

export class VendorIssueCreator {
  async createIssue(vulnerability: VendorVulnerability): Promise<Issue> {
    const title = this.generateTitle(vulnerability);
    const body = this.generateBody(vulnerability);
    const labels = this.generateLabels(vulnerability);
    
    return {
      title,
      body,
      labels,
      createsPR: false // Never create PRs for vendor files
    };
  }
  
  private generateTitle(vulnerability: VendorVulnerability): string {
    const library = vulnerability.library;
    return `🔒 Update ${library.name} to fix ${vulnerability.type} vulnerability`;
  }
  
  private generateBody(vulnerability: VendorVulnerability): string {
    const lines: string[] = [];
    
    lines.push('## 📦 Vendor Library Vulnerability Detected');
    lines.push('');
    lines.push(`**Library**: ${vulnerability.library.name}`);
    lines.push(`**Version**: ${vulnerability.library.version}`);
    lines.push(`**File**: \`${vulnerability.file}\``);
    lines.push(`**Vulnerability**: ${vulnerability.type}`);
    lines.push(`**Severity**: ${vulnerability.severity}`);
    lines.push('');
    
    // Security details
    lines.push('### 🔒 Security Details');
    if (vulnerability.description) {
      lines.push(vulnerability.description);
    } else {
      lines.push(`A ${vulnerability.severity.toLowerCase()} severity ${vulnerability.type} vulnerability was detected in ${vulnerability.library.name}.`);
    }
    lines.push('');
    
    if (vulnerability.cve) {
      lines.push(`**CVE**: ${vulnerability.cve}`);
      lines.push('');
    }
    
    // Recommended actions
    lines.push('### 🔧 Recommended Actions');
    lines.push('');
    lines.push('#### Option 1: Update Library (Recommended)');
    lines.push('```bash');
    lines.push(vulnerability.updateCommand || `npm update ${vulnerability.library.name}`);
    lines.push('```');
    
    if (vulnerability.recommendedVersion) {
      lines.push(`This will update to version ${vulnerability.recommendedVersion} which fixes this vulnerability.`);
    }
    lines.push('');
    
    // Workaround if available
    if (vulnerability.workaround) {
      lines.push('#### Option 2: Workaround');
      lines.push(vulnerability.workaround);
      lines.push('');
    } else {
      lines.push('#### Option 2: Workaround');
      lines.push('No safe workaround available. Library update required.');
      lines.push('');
    }
    
    // Accept risk option
    lines.push('#### Option 3: Accept Risk');
    lines.push('If this is a false positive or the risk is acceptable for your use case, you can:');
    lines.push('1. Add this file to `.rsolvignore`');
    lines.push('2. Mark this issue as "won\'t fix"');
    lines.push('');
    
    // References
    lines.push('### 📚 References');
    if (vulnerability.advisoryUrl) {
      lines.push(`- [${vulnerability.library.name} Security Advisories](${vulnerability.advisoryUrl})`);
    }
    lines.push(`- [NPM Audit Report](https://www.npmjs.com/advisories/search?q=${vulnerability.library.name})`);
    
    if (vulnerability.cve) {
      lines.push(`- [CVE Details](https://cve.mitre.org/cgi-bin/cvename.cgi?name=${vulnerability.cve})`);
    }
    lines.push('');
    
    // Important note
    lines.push('### ⚠️ Important Note');
    lines.push('**Do not manually patch vendor library files.** Changes will be lost when the library updates.');
    lines.push('');
    lines.push('---');
    lines.push('*This issue was created by RSOLV vulnerability scanner*');
    lines.push('*Vendor libraries require different handling than application code*');
    
    return lines.join('\n');
  }
  
  private generateLabels(vulnerability: VendorVulnerability): string[] {
    const labels = [
      'security',
      'vendor-library',
      'dependency-update'
    ];
    
    // Add severity label
    labels.push(vulnerability.severity.toLowerCase());
    
    // Add vulnerability type label
    if (vulnerability.type) {
      labels.push(vulnerability.type.toLowerCase().replace(/_/g, '-'));
    }
    
    // Add library-specific label
    if (vulnerability.library.name) {
      labels.push(`lib:${vulnerability.library.name}`);
    }
    
    return labels;
  }
}