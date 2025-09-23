import { ComplianceDocumentationTemplate } from '../types.js';
import { VulnerabilityType } from '../types.js';

export const javascriptComplianceTemplates = new Map<VulnerabilityType, ComplianceDocumentationTemplate>([
  [VulnerabilityType.XSS, {
    framework: 'SOC2',
    controlMapping: {
      'CC6.1': 'Logical and Physical Access Controls',
      'CC7.1': 'System Operations', 
      'CC7.2': 'Change Management'
    },
    evidenceTemplate: `
# XSS Vulnerability Remediation Evidence

## Control: CC6.1 - Logical and Physical Access Controls
- **Issue**: Cross-Site Scripting (XSS) vulnerability allowing unauthorized script execution
- **Risk**: Potential for session hijacking, data theft, and unauthorized actions
- **Remediation**: 
  - Implemented input sanitization using DOMPurify library
  - Added Content Security Policy (CSP) headers
  - Enforced output encoding for all user-generated content
  - React: Replaced dangerouslySetInnerHTML with safe alternatives

## Implementation Details:
- **Technology**: JavaScript/TypeScript with React/Node.js
- **Libraries Used**: DOMPurify v3.x, helmet v7.x for CSP
- **Testing**: Automated XSS scanning with OWASP ZAP
- **Code Review**: Security-focused code review completed

## Verification Steps:
1. Input validation layer implemented at API endpoints
2. Output encoding verified in all view templates
3. CSP headers tested and validated
4. Penetration testing confirmed XSS mitigation
`,
    remediationSteps: [
      'Install DOMPurify: npm install dompurify @types/dompurify',
      'Implement input sanitization at all entry points',
      'Configure CSP headers using helmet middleware',
      'Replace innerHTML with textContent or sanitized alternatives',
      'Enable React strict mode for additional XSS protection',
      'Implement automated XSS scanning in CI/CD pipeline'
    ]
  }],

  [VulnerabilityType.SQL_INJECTION, {
    framework: 'PCI-DSS',
    controlMapping: {
      '6.5.1': 'Injection flaws, particularly SQL injection',
      '6.3': 'Secure software development',
      '11.3': 'Penetration testing'
    },
    evidenceTemplate: `
# SQL Injection Remediation Evidence

## Control: PCI-DSS 6.5.1 - Injection Flaws
- **Issue**: SQL injection vulnerability through string concatenation
- **Risk**: Database compromise, data breach, unauthorized data access
- **Remediation**:
  - Replaced string concatenation with parameterized queries
  - Implemented Sequelize ORM with built-in SQL injection protection
  - Added input validation layer using joi/yup
  - Enforced least privilege database access

## Implementation Details:
- **Database**: PostgreSQL/MySQL with Sequelize ORM
- **Query Method**: Parameterized queries using placeholders
- **Validation**: Schema validation with joi v17.x
- **Access Control**: Database user with minimal required privileges

## Code Examples:
\`\`\`javascript
// Before (Vulnerable)
const query = \`SELECT * FROM users WHERE id = \${userId}\`;

// After (Secure)
const user = await User.findOne({ 
  where: { id: userId },
  attributes: ['id', 'name', 'email']
});
\`\`\`

## Testing & Verification:
1. SQLMap testing shows no injection points
2. Code review verified all queries use parameterization
3. Database audit logs configured for monitoring
4. Automated SAST scanning integrated
`,
    remediationSteps: [
      'Install Sequelize ORM: npm install sequelize',
      'Migrate raw SQL queries to ORM methods',
      'Implement input validation with joi or yup',
      'Configure database connection with least privilege',
      'Enable SQL query logging for audit purposes',
      'Add SQLi detection to WAF rules'
    ]
  }],

  [VulnerabilityType.BROKEN_AUTHENTICATION, {
    framework: 'ISO27001',
    controlMapping: {
      'A.9.4.2': 'Secure authentication procedures',
      'A.9.4.3': 'Password management system',
      'A.14.2.5': 'Secure system engineering principles'
    },
    evidenceTemplate: `
# Authentication Security Remediation Evidence

## Control: ISO 27001 A.9.4.2 - Secure Authentication
- **Issue**: Weak authentication implementation
- **Risk**: Unauthorized access, session hijacking, credential theft
- **Remediation**:
  - Implemented bcrypt for password hashing (cost factor 12)
  - Added JWT with secure configuration (RS256)
  - Enforced secure session management
  - Implemented MFA using TOTP

## Implementation Details:
- **Password Hashing**: bcrypt with adaptive cost factor
- **Session Management**: express-session with secure flags
- **Token Management**: JWT with short expiration (15 min)
- **MFA**: TOTP implementation with speakeasy

## Security Configuration:
\`\`\`javascript
// Session Configuration
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true, // HTTPS only
    httpOnly: true, // No JS access
    maxAge: 1000 * 60 * 15, // 15 minutes
    sameSite: 'strict' // CSRF protection
  }
}));

// JWT Configuration
jwt.sign(payload, privateKey, {
  algorithm: 'RS256',
  expiresIn: '15m',
  issuer: 'your-app',
  audience: 'your-app-users'
});
\`\`\`

## Verification:
1. Password strength requirements enforced
2. Brute force protection implemented
3. Session fixation prevented
4. Token rotation on privilege escalation
`,
    remediationSteps: [
      'Install security packages: npm install bcrypt jsonwebtoken express-session',
      'Implement secure password hashing with bcrypt',
      'Configure session middleware with secure flags',
      'Implement JWT with RS256 algorithm',
      'Add rate limiting to authentication endpoints',
      'Enable account lockout after failed attempts',
      'Implement TOTP-based MFA'
    ]
  }],

  [VulnerabilityType.SENSITIVE_DATA_EXPOSURE, {
    framework: 'GDPR',
    controlMapping: {
      'Article 32': 'Security of processing',
      'Article 25': 'Data protection by design',
      'Article 35': 'Data protection impact assessment'
    },
    evidenceTemplate: `
# Sensitive Data Protection Evidence

## GDPR Article 32 - Security of Processing
- **Issue**: Sensitive data exposure in logs and responses
- **Risk**: PII disclosure, regulatory non-compliance
- **Remediation**:
  - Implemented field-level encryption for PII
  - Configured log sanitization
  - Added data masking in API responses
  - Enforced TLS 1.3 for data in transit

## Implementation Details:
- **Encryption**: AES-256-GCM for sensitive fields
- **Key Management**: AWS KMS / HashiCorp Vault
- **Logging**: Winston with custom sanitizers
- **API Security**: Response filtering middleware

## Data Classification & Protection:
\`\`\`javascript
// Field-level encryption
const encryptedData = {
  email: encrypt(userData.email, 'PII'),
  ssn: encrypt(userData.ssn, 'SENSITIVE'),
  name: userData.name // Public data
};

// Log sanitization
const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    sanitizeFormat() // Custom sanitizer
  )
});
\`\`\`

## Compliance Measures:
1. Data inventory maintained
2. Encryption at rest and in transit
3. Access logs with PII redaction
4. Regular data protection audits
5. Incident response plan in place
`,
    remediationSteps: [
      'Implement field-level encryption for PII',
      'Configure TLS 1.3 with strong ciphers',
      'Set up log sanitization rules',
      'Implement API response filtering',
      'Configure secure headers (HSTS, etc.)',
      'Set up key rotation schedule',
      'Document data retention policies'
    ]
  }],

  [VulnerabilityType.SECURITY_MISCONFIGURATION, {
    framework: 'NIST',
    controlMapping: {
      'CM-6': 'Configuration Settings',
      'CM-7': 'Least Functionality',
      'SC-8': 'Transmission Confidentiality'
    },
    evidenceTemplate: `
# Security Configuration Remediation Evidence

## NIST CM-6 - Configuration Settings
- **Issue**: Insecure default configurations
- **Risk**: Unauthorized access, information disclosure
- **Remediation**:
  - Hardened Express.js security configuration
  - Implemented secure CORS policy
  - Disabled unnecessary features
  - Configured security headers

## Security Headers Configuration:
\`\`\`javascript
// Helmet.js Configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS Configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
  credentials: true,
  optionsSuccessStatus: 200
}));
\`\`\`

## Hardening Measures:
1. Removed default error pages
2. Disabled X-Powered-By header
3. Configured secure cookie settings
4. Implemented request size limits
5. Enabled audit logging
`,
    remediationSteps: [
      'Install helmet: npm install helmet',
      'Configure comprehensive security headers',
      'Implement strict CORS policy',
      'Disable unnecessary HTTP methods',
      'Set up environment-specific configs',
      'Remove development endpoints in production',
      'Enable security monitoring'
    ]
  }],

  [VulnerabilityType.VULNERABLE_COMPONENTS, {
    framework: 'SOC2',
    controlMapping: {
      'CC7.1': 'System Operations',
      'CC8.1': 'Change Management',
      'CC9.2': 'Risk Assessment'
    },
    evidenceTemplate: `
# Vulnerable Components Remediation Evidence

## Control: CC7.1 - System Operations
- **Issue**: Outdated dependencies with known vulnerabilities
- **Risk**: Exploitation of known vulnerabilities
- **Remediation**:
  - Updated all dependencies to latest secure versions
  - Implemented automated dependency scanning
  - Configured Dependabot/Renovate
  - Added npm audit to CI/CD pipeline

## Dependency Management:
\`\`\`json
// package.json security scripts
{
  "scripts": {
    "audit": "npm audit --production",
    "audit:fix": "npm audit fix --force",
    "check:security": "snyk test",
    "update:security": "npm update && npm audit fix"
  }
}
\`\`\`

## Automated Scanning Results:
- npm audit: 0 vulnerabilities
- Snyk scan: All high/critical issues resolved
- OWASP Dependency Check: Passed
- License compliance: Verified

## Ongoing Protection:
1. Weekly automated dependency updates
2. Security patches applied within 24 hours
3. Quarterly manual dependency review
4. Pre-commit hooks for security checks
`,
    remediationSteps: [
      'Run npm audit and fix vulnerabilities',
      'Update package.json with fixed versions',
      'Configure Dependabot or Renovate',
      'Set up Snyk or similar scanning',
      'Add security checks to CI/CD',
      'Document dependency update process',
      'Create security patch SLA'
    ]
  }],

  [VulnerabilityType.INSUFFICIENT_LOGGING, {
    framework: 'SOC2',
    controlMapping: {
      'CC7.2': 'System Monitoring',
      'CC7.3': 'Detection and Response',
      'CC2.2': 'Risk Communication'
    },
    evidenceTemplate: `
# Security Logging Implementation Evidence

## Control: CC7.2 - System Monitoring
- **Issue**: Insufficient security event logging
- **Risk**: Inability to detect and respond to security incidents
- **Remediation**:
  - Implemented comprehensive security logging
  - Configured centralized log management
  - Added real-time alerting
  - Established log retention policies

## Logging Implementation:
\`\`\`javascript
// Security Event Logger
class SecurityLogger {
  logAuthFailure(req, reason) {
    logger.warn('AUTH_FAILURE', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      path: req.path,
      reason,
      timestamp: new Date().toISOString()
    });
  }
  
  logSuspiciousActivity(req, activity) {
    logger.error('SUSPICIOUS_ACTIVITY', {
      ip: req.ip,
      activity,
      headers: this.sanitizeHeaders(req.headers),
      timestamp: new Date().toISOString()
    });
  }
}
\`\`\`

## Monitoring Coverage:
1. Authentication attempts (success/failure)
2. Authorization violations
3. Input validation failures
4. System errors and exceptions
5. Data access patterns
6. API rate limit violations

## Log Management:
- Centralized logging: ELK Stack / Splunk
- Retention: 90 days hot, 1 year cold storage
- Real-time alerts for critical events
- Automated incident response triggers
`,
    remediationSteps: [
      'Implement Winston or Bunyan logger',
      'Configure structured JSON logging',
      'Set up centralized log aggregation',
      'Define security event categories',
      'Configure real-time alerting',
      'Establish log retention policies',
      'Create incident response playbooks'
    ]
  }],

  [VulnerabilityType.COMMAND_INJECTION, {
    framework: 'HIPAA',
    controlMapping: {
      '164.308(a)(5)': 'Security Awareness and Training',
      '164.312(a)(1)': 'Access Control',
      '164.312(c)(1)': 'Integrity Controls'
    },
    evidenceTemplate: `
# Command Injection Remediation Evidence

## HIPAA 164.312(c)(1) - Integrity Controls
- **Issue**: Command injection vulnerability in system calls
- **Risk**: System compromise, data breach, service disruption
- **Remediation**:
  - Eliminated direct shell command execution
  - Implemented safe alternatives using Node.js APIs
  - Added strict input validation
  - Configured process sandboxing

## Safe Implementation:
\`\`\`javascript
// Vulnerable Code Removed
// exec(\`ls \${userInput}\`);

// Secure Alternative
const { readdir } = require('fs').promises;
const path = require('path');

async function listDirectory(userInput) {
  const safePath = path.join(ALLOWED_DIR, path.basename(userInput));
  if (!safePath.startsWith(ALLOWED_DIR)) {
    throw new Error('Invalid path');
  }
  return await readdir(safePath);
}
\`\`\`

## Security Controls:
1. Input validation whitelist
2. Command execution disabled
3. Process isolation configured
4. Least privilege enforcement
5. Security monitoring enabled
`,
    remediationSteps: [
      'Replace exec/spawn with safe alternatives',
      'Implement strict input validation',
      'Use built-in Node.js APIs instead of shell',
      'Configure process sandboxing',
      'Disable shell access in production',
      'Monitor process execution',
      'Implement security policies'
    ]
  }]
]);

// Helper function to get compliance template
export function getComplianceTemplate(
  vulnerabilityType: VulnerabilityType,
  framework?: string
): ComplianceDocumentationTemplate | undefined {
  const template = javascriptComplianceTemplates.get(vulnerabilityType);
  if (!template || (framework && template.framework !== framework)) {
    return undefined;
  }
  return template;
}

// Get all available compliance frameworks for JavaScript
export function getAvailableFrameworks(): string[] {
  const frameworks = new Set<string>();
  javascriptComplianceTemplates.forEach(template => {
    frameworks.add(template.framework);
  });
  return Array.from(frameworks);
}