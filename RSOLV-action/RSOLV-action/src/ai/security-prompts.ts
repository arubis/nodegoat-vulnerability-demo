import { IssueContext } from '../types/index.js';
import { Vulnerability, VulnerabilityType } from '../security/index.js';
import { SecurityAnalysisResult } from './security-analyzer.js';

/**
 * Build a security-focused solution prompt that incorporates vulnerability analysis
 */
export function buildSecuritySolutionPrompt(
  issue: IssueContext,
  analysisData: any,
  fileContents: Record<string, string>,
  securityAnalysis: SecurityAnalysisResult
): string {
  let prompt = `I need you to generate a comprehensive security-focused solution for the following issue:

Issue Title: ${issue.title}

Issue Description:
${issue.body}

Repository: ${issue.repository.fullName}
Primary Language: ${issue.repository.language || 'Unknown'}

SECURITY ANALYSIS RESULTS:
Risk Level: ${securityAnalysis.riskLevel.toUpperCase()}
Vulnerabilities Found: ${securityAnalysis.vulnerabilities.length}

CRITICAL SECURITY VULNERABILITIES DETECTED:
`;

  // Add vulnerability details
  for (const vuln of securityAnalysis.vulnerabilities) {
    prompt += `
- ${vuln.type.toUpperCase()}: ${vuln.message}
  Location: Line ${vuln.line}
  Severity: ${vuln.severity.toUpperCase()}
  CWE: ${vuln.cweId}
  OWASP: ${vuln.owaspCategory}
  Remediation: ${vuln.remediation}
`;
  }

  prompt += `
SECURITY RECOMMENDATIONS:
`;
  for (const recommendation of securityAnalysis.recommendations) {
    prompt += `- ${recommendation}\n`;
  }

  // Add specific security fix templates based on vulnerability types
  const vulnTypes = [...new Set(securityAnalysis.vulnerabilities.map(v => v.type))];
  for (const vulnType of vulnTypes) {
    prompt += getSecurityFixTemplate(vulnType);
  }

  prompt += `
AFFECTED FILES:
`;

  // Add file contents for affected files
  for (const [filePath, content] of Object.entries(fileContents)) {
    if (securityAnalysis.affectedFiles.includes(filePath)) {
      prompt += `\n--- ${filePath} (CONTAINS VULNERABILITIES) ---\n\`\`\`\n${content}\n\`\`\`\n`;
    } else {
      prompt += `\n--- ${filePath} ---\n\`\`\`\n${content}\n\`\`\`\n`;
    }
  }

  prompt += `

SECURITY-FOCUSED SOLUTION REQUIREMENTS:

1. **Address ALL identified vulnerabilities**: Every vulnerability must be fixed with secure alternatives
2. **Follow security best practices**: Implement defense-in-depth principles
3. **Use secure coding patterns**: Follow established security patterns for the language
4. **Add input validation**: Validate and sanitize all user inputs
5. **Implement error handling**: Don't expose sensitive information in error messages
6. **Add security tests**: Include tests that verify security fixes work correctly

CRITICAL: You MUST modify EXISTING files only. DO NOT create new files. Make changes in-place to fix the vulnerability.

For each file that needs to be modified, use this exact format:

--- filename.ext ---
\`\`\`language
[complete secure file content goes here]
\`\`\`

IMPORTANT: Your solution must completely eliminate all ${securityAnalysis.vulnerabilities.length} identified vulnerabilities while maintaining functionality.

After providing all file changes, include:
1. **Security Impact**: Explain how each vulnerability was addressed
2. **Risk Mitigation**: Describe how the solution reduces the overall risk level
3. **Testing Strategy**: Suggest security tests to validate the fixes
4. **Additional Recommendations**: Any other security improvements for the codebase

Generate secure, production-ready code that follows security best practices.`;

  return prompt;
}

/**
 * Get security fix templates for specific vulnerability types
 */
function getSecurityFixTemplate(vulnType: VulnerabilityType): string {
  switch (vulnType) {
  case VulnerabilityType.SQL_INJECTION:
    return `
SQL INJECTION FIX TEMPLATE:
- Use parameterized queries/prepared statements ALWAYS
- Never concatenate user input into SQL strings
- Use ORM query builders when available
- Validate input data types before queries
- Example (JavaScript/Node.js):
  VULNERABLE: query = "SELECT * FROM users WHERE id = " + userId;
  SECURE: query = "SELECT * FROM users WHERE id = ?"; db.query(query, [userId]);
`;

  case VulnerabilityType.XSS:
    return `
XSS (CROSS-SITE SCRIPTING) FIX TEMPLATE:
- Use textContent instead of innerHTML for user data
- Sanitize HTML content using trusted libraries (DOMPurify, etc.)
- Implement Content Security Policy (CSP)
- Encode output based on context (HTML, JavaScript, CSS, URL)
- Example (JavaScript):
  VULNERABLE: element.innerHTML = userInput;
  SECURE: element.textContent = userInput; // or DOMPurify.sanitize(userInput)
`;

  case VulnerabilityType.BROKEN_AUTHENTICATION:
    return `
BROKEN AUTHENTICATION FIX TEMPLATE:
- Implement strong password policies
- Use secure session management
- Add multi-factor authentication
- Implement account lockout mechanisms
- Use secure password hashing (bcrypt, Argon2)
- Validate session tokens properly
`;

  case VulnerabilityType.SENSITIVE_DATA_EXPOSURE:
    return `
SENSITIVE DATA EXPOSURE FIX TEMPLATE:
- Encrypt sensitive data at rest and in transit
- Use HTTPS for all communications
- Implement proper key management
- Remove sensitive data from logs
- Use secure random number generators
- Apply data classification policies
`;

  case VulnerabilityType.BROKEN_ACCESS_CONTROL:
    return `
BROKEN ACCESS CONTROL FIX TEMPLATE:
- Implement role-based access control (RBAC)
- Validate permissions on server-side
- Use principle of least privilege
- Implement proper authorization checks
- Validate user ownership of resources
- Use secure direct object references
`;

  case VulnerabilityType.SECURITY_MISCONFIGURATION:
    return `
SECURITY MISCONFIGURATION FIX TEMPLATE:
- Remove default credentials and accounts
- Disable unnecessary services and features
- Implement security headers (HSTS, CSP, etc.)
- Keep frameworks and libraries updated
- Configure proper error handling
- Use secure configuration management
`;

  case VulnerabilityType.INSECURE_DESERIALIZATION:
    return `
INSECURE DESERIALIZATION FIX TEMPLATE:
- Validate object types before deserialization
- Use safe deserialization methods
- Implement integrity checks
- Avoid deserializing untrusted data
- Use schema validation
- Consider JSON instead of binary formats
`;

  default:
    return `
GENERAL SECURITY FIX TEMPLATE:
- Follow OWASP guidelines for this vulnerability type
- Implement input validation and sanitization
- Use secure coding practices
- Add proper error handling
- Include security tests
- Document security considerations
`;
  }
}

/**
 * Build a three-tier security explanation prompt
 */
export function buildSecurityExplanationPrompt(
  vulnerabilities: Vulnerability[],
  fixes: Record<string, string>
): string {
  return `Generate a comprehensive three-tier explanation for the security fixes implemented:

VULNERABILITIES ADDRESSED:
${vulnerabilities.map(v => `- ${v.type}: ${v.message} (${v.severity})`).join('\n')}

FIXES IMPLEMENTED:
${Object.keys(fixes).join(', ')}

Please provide:

## TIER 1: LINE-LEVEL TECHNICAL EXPLANATION
For each specific code change:
- What exact lines were modified
- Why each change was necessary
- Technical details of the security improvement

## TIER 2: CONCEPT-LEVEL SECURITY PRINCIPLES
For each vulnerability type:
- What security principle was violated
- How the fix addresses the root cause
- Security patterns and best practices applied

## TIER 3: BUSINESS-LEVEL IMPACT AND COMPLIANCE
For the overall security improvement:
- Business risk reduction achieved
- Compliance implications (SOC2, GDPR, etc.)
- Impact on user trust and data protection

Focus on making security concepts accessible while maintaining technical accuracy.`;
}

/**
 * Build a security-focused PR description prompt
 */
export function buildSecurityPrDescriptionPrompt(
  issue: IssueContext,
  securityAnalysis: SecurityAnalysisResult,
  changes: Record<string, string>
): string {
  const filesChanged = Object.keys(changes).join(', ');
  const vulnTypes = [...new Set(securityAnalysis.vulnerabilities.map(v => v.type))];
  
  return `Generate a comprehensive security-focused pull request description for these critical security fixes:

Issue: ${issue.title} (#${issue.number})

SECURITY IMPACT:
- Risk Level: ${securityAnalysis.riskLevel.toUpperCase()}
- Vulnerabilities Fixed: ${securityAnalysis.vulnerabilities.length}
- Vulnerability Types: ${vulnTypes.join(', ')}

Files Modified: ${filesChanged}

VULNERABILITY DETAILS:
${securityAnalysis.vulnerabilities.map(v => 
    `- ${v.type} (${v.severity}): ${v.message}`
  ).join('\n')}

Generate a pull request description that includes:

1. **🔒 Security Fix Summary**: Brief overview of vulnerabilities addressed
2. **🛡️ Changes Made**: Technical details of security improvements
3. **⚠️ Risk Assessment**: Before/after risk comparison
4. **🧪 Security Testing**: How to verify the fixes work
5. **📋 Compliance Impact**: Any compliance/regulatory considerations
6. **🔍 Review Checklist**: Security-specific items for reviewers

Use security-focused language and emphasize the critical nature of these fixes.
Include appropriate security emojis and formatting for visibility.`;
}