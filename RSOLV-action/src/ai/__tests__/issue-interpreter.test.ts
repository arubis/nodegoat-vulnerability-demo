/**
 * Issue Interpreter Tests
 * 
 * Phase 5C: Extract vulnerability context from issue descriptions
 * These tests follow TDD - RED phase (all should fail initially)
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { IssueInterpreter } from '../issue-interpreter.js';
import type { 
  InterpretedIssue, 
  VulnerabilityContext, 
  AffectedLocation,
  TestFrameworkHint 
} from '../issue-interpreter.js';

describe('IssueInterpreter (TDD - Red Phase)', () => {
  let interpreter: IssueInterpreter;
  
  beforeEach(() => {
    interpreter = new IssueInterpreter();
  });

  describe('Vulnerability Type Extraction', () => {
    test('should identify SQL injection from description', async () => {
      const issueBody = `
## Description
There's a SQL injection vulnerability in the user authentication system. 
The login endpoint concatenates user input directly into SQL queries without proper sanitization.

## Example
\`\`\`javascript
const query = "SELECT * FROM users WHERE username = '" + username + "'";
\`\`\`

## Impact
An attacker could bypass authentication or extract sensitive data from the database.
`;
      
      const result = await interpreter.interpret(issueBody);
      
      expect(result.vulnerabilityType).toBe('sql-injection');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      expect(result.keywords.some(k => k.includes('SQL injection'))).toBe(true);
      expect(result.keywords.some(k => k.includes('concatenat'))).toBe(true);
    });

    test('should identify XSS from description', async () => {
      const issueBody = `
## Security Issue: Cross-Site Scripting (XSS)

The application renders user-supplied data in the profile page without escaping HTML entities.
This allows attackers to inject malicious scripts.

### Vulnerable Code Location
File: /src/views/profile.ejs
Line: 45

The template uses <%= user.bio %> instead of <%- user.bio %>
`;
      
      const result = await interpreter.interpret(issueBody);
      
      expect(result.vulnerabilityType).toBe('xss');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      expect(result.affectedFiles).toContain('/src/views/profile.ejs');
      expect(result.affectedLines).toContain(45);
    });

    test('should identify multiple vulnerability types', async () => {
      const issueBody = `
## Multiple Security Issues Found

1. SQL Injection in search functionality
   - File: src/api/search.js
   - Direct query concatenation

2. Cross-Site Scripting in comments
   - File: src/views/comments.html
   - Unescaped user content

3. Path Traversal in file download
   - File: src/utils/fileHandler.js
   - No path validation
`;
      
      const result = await interpreter.interpret(issueBody);
      
      expect(result.vulnerabilityType).toBe('multiple');
      expect(result.multipleVulnerabilities).toHaveLength(3);
      expect(result.multipleVulnerabilities).toContainEqual({
        type: 'sql-injection',
        file: 'src/api/search.js',
        description: 'Direct query concatenation'
      });
    });

    test('should handle OWASP terminology', async () => {
      const issueBody = `
Found an A03:2021 – Injection vulnerability in the payment processing module.
This is a critical OWASP Top 10 issue that needs immediate attention.
`;
      
      const result = await interpreter.interpret(issueBody);
      
      expect(result.vulnerabilityType).toBe('injection');
      expect(result.owaspCategory).toBe('A03:2021');
      expect(result.severity).toBe('critical');
    });
  });

  describe('Affected File and Function Extraction', () => {
    test('should extract file paths from various formats', async () => {
      const issueBody = `
## Affected Files
- src/auth/validator.js (line 25-30)
- /app/models/user.rb:45
- File: controllers/api.py, Function: handle_request()
- \`utils/crypto.ts\` - encryptPassword function
`;
      
      const result = await interpreter.interpret(issueBody);
      
      expect(result.affectedFiles).toContain('src/auth/validator.js');
      expect(result.affectedFiles).toContain('/app/models/user.rb');
      expect(result.affectedFiles).toContain('controllers/api.py');
      expect(result.affectedFiles).toContain('utils/crypto.ts');
      
      const locations = result.affectedLocations;
      expect(locations).toHaveLength(4);
      expect(locations[0]).toMatchObject({
        file: 'src/auth/validator.js',
        lines: [25, 26, 27, 28, 29, 30]
      });
      expect(locations[2]).toMatchObject({
        file: 'controllers/api.py',
        function: 'handle_request'
      });
    });

    test('should extract function names from code snippets', async () => {
      const issueBody = `
## Vulnerable Code

\`\`\`javascript
function authenticateUser(username, password) {
  const query = \`SELECT * FROM users WHERE username = '\${username}'\`;
  return db.query(query);
}
\`\`\`

The authenticateUser function is vulnerable to SQL injection.
`;
      
      const result = await interpreter.interpret(issueBody);
      
      expect(result.affectedFunctions).toContain('authenticateUser');
      expect(result.codeSnippets).toHaveLength(1);
      expect(result.codeSnippets[0]).toMatchObject({
        language: 'javascript',
        code: expect.stringContaining('authenticateUser'),
        vulnerableLines: expect.any(Array)
      });
    });

    test('should handle relative and absolute paths', async () => {
      const issueBody = `
Files with vulnerabilities:
- ./src/utils/helper.js
- ../shared/validator.py
- /home/app/src/main.go
- C:\\Projects\\app\\security.cs
`;
      
      const result = await interpreter.interpret(issueBody);
      
      expect(result.affectedFiles).toHaveLength(4);
      expect(result.affectedFiles).toContain('./src/utils/helper.js');
      expect(result.affectedFiles).toContain('../shared/validator.py');
    });
  });

  describe('Severity Level Detection', () => {
    test('should detect critical severity', async () => {
      const issueBody = `
## CRITICAL: Remote Code Execution Vulnerability

This is a critical security issue that allows attackers to execute arbitrary code.
Immediate patching required!
`;
      
      const result = await interpreter.interpret(issueBody);
      
      expect(result.severity).toBe('critical');
      expect(result.urgency).toBe('immediate');
    });

    test('should detect severity from CVSS scores', async () => {
      const issueBody = `
## Vulnerability Details
CVSS Score: 9.8 (Critical)
CWE-89: SQL Injection

This vulnerability has been assigned CVE-2024-12345.
`;
      
      const result = await interpreter.interpret(issueBody);
      
      expect(result.severity).toBe('critical');
      expect(result.cvssScore).toBe(9.8);
      expect(result.cweId).toBe('CWE-89');
      expect(result.cveId).toBe('CVE-2024-12345');
    });

    test('should infer severity from language', async () => {
      const issueBody = `
Minor issue: The application logs might contain sensitive information in debug mode.
This is a low priority issue that should be addressed in the next release.
`;
      
      const result = await interpreter.interpret(issueBody);
      
      expect(result.severity).toBe('low');
      expect(result.urgency).toBe('planned');
    });
  });

  describe('Test Framework Detection', () => {
    test('should detect mentioned test frameworks', async () => {
      const issueBody = `
## How to Test

1. Add a test case in Jest to verify the SQL injection is fixed
2. The existing Mocha tests should still pass
3. Create a new Cypress E2E test for the login flow
`;
      
      const result = await interpreter.interpret(issueBody);
      
      expect(result.testFrameworks).toHaveLength(3);
      expect(result.testFrameworks).toContainEqual({
        name: 'jest',
        context: 'verify the SQL injection is fixed',
        suggested: true
      });
      expect(result.testFrameworks).toContainEqual({
        name: 'mocha',
        context: 'existing Mocha tests should still pass',
        existing: true
      });
    });

    test('should detect test file mentions', async () => {
      const issueBody = `
Make sure to update the tests in:
- src/__tests__/auth.test.js
- test/integration/login.spec.ts
- spec/models/user_spec.rb
`;
      
      const result = await interpreter.interpret(issueBody);
      
      expect(result.testFiles).toHaveLength(3);
      expect(result.suggestedTestStrategy).toBeDefined();
    });
  });

  describe('Natural Language to Pattern Mapping', () => {
    test('should map descriptions to AST patterns', async () => {
      const issueBody = `
The application uses string concatenation to build SQL queries with user input.
This happens in multiple database access functions.
`;
      
      const result = await interpreter.interpret(issueBody);
      
      expect(result.suggestedPatterns).toBeDefined();
      expect(result.suggestedPatterns[0]).toMatchObject({
        type: 'sql-injection',
        description: 'String concatenation in SQL queries',
        confidence: expect.any(Number)
      });
    });

    test('should extract fix suggestions', async () => {
      const issueBody = `
## Fix Recommendation

Replace the string concatenation with parameterized queries:
- Use prepared statements
- Sanitize all user inputs
- Add input validation

Example fix:
\`\`\`javascript
const query = 'SELECT * FROM users WHERE username = ?';
db.query(query, [username]);
\`\`\`
`;
      
      const result = await interpreter.interpret(issueBody);
      
      expect(result.fixSuggestions).toHaveLength(3);
      expect(result.fixSuggestions[0]).toBe('Use prepared statements');
      expect(result.fixExample).toBeDefined();
      expect(result.fixExample?.code).toContain('WHERE username = ?');
    });
  });

  describe('Context Enhancement', () => {
    test('should extract additional context from issue metadata', async () => {
      const issue = {
        title: '[SECURITY] SQL Injection in User Authentication',
        body: 'There is a vulnerability in the login system.',
        labels: ['security', 'bug', 'critical', 'sql-injection']
      };
      
      const result = await interpreter.interpretIssue(issue);
      
      expect(result.vulnerabilityType).toBe('sql-injection');
      expect(result.severity).toBe('critical');
      expect(result.category).toBe('security');
    });

    test('should handle markdown formatting', async () => {
      const issueBody = `
## **Critical Security Issue**

### Description
The \`processPayment()\` function in **payment.js** has a SQL injection vulnerability.

> This is a quote explaining the issue

- [ ] Fix SQL injection
- [ ] Add tests
- [x] Issue reported
`;
      
      const result = await interpreter.interpret(issueBody);
      
      expect(result.affectedFunctions).toContain('processPayment');
      expect(result.affectedFiles).toContain('payment.js');
      expect(result.todoItems).toHaveLength(2);
      expect(result.todoItems[0]).toBe('Fix SQL injection');
    });

    test('should extract referenced URLs and PRs', async () => {
      const issueBody = `
Related to #123 and PR #456
See https://owasp.org/www-community/attacks/SQL_Injection for more details
Similar issue was fixed in https://github.com/org/repo/pull/789
`;
      
      const result = await interpreter.interpret(issueBody);
      
      expect(result.references).toMatchObject({
        issues: ['#123'],
        pullRequests: ['#456', 'https://github.com/org/repo/pull/789'],
        urls: ['https://owasp.org/www-community/attacks/SQL_Injection']
      });
    });
  });

  describe('Complex Real-World Examples', () => {
    test('should handle GitHub security advisory format', async () => {
      const issueBody = `
**GitHub Security Advisory**
**Package**: express-validator
**Severity**: High
**Vulnerable versions**: < 6.14.3
**Patched version**: 6.14.3

## Summary
A SQL injection vulnerability exists in the validation middleware when using custom validators with database queries.

## Details
The \`check()\` function does not properly escape user input when used with custom validation functions that perform database lookups.

## PoC
\`\`\`javascript
app.post('/user', 
  check('username').custom(async (value) => {
    const user = await db.query(\`SELECT * FROM users WHERE username = '\${value}'\`);
    if (user) throw new Error('Username exists');
    return true;
  }),
  (req, res) => { /* ... */ }
);
\`\`\`

## Impact
An attacker can inject SQL commands through the username parameter.

## Remediation
Update to version 6.14.3 or later.
`;
      
      const result = await interpreter.interpret(issueBody);
      
      expect(result.vulnerabilityType).toBe('sql-injection');
      expect(result.severity).toBe('high');
      expect(result.package).toBe('express-validator');
      expect(result.vulnerableVersions).toBe('< 6.14.3');
      expect(result.patchedVersion).toBe('6.14.3');
      expect(result.affectedFunctions).toContain('check');
      expect(result.fixSuggestions).toContain('Update to version 6.14.3 or later');
    });

    test('should handle detailed vulnerability report', async () => {
      const issueBody = `
# Vulnerability Report: Authentication Bypass via SQL Injection

**Reported by**: security-researcher
**Date**: 2024-01-23
**Severity**: Critical (CVSS 9.8)

## Executive Summary
A SQL injection vulnerability in the login endpoint allows attackers to bypass authentication and potentially access all user data.

## Technical Details

### Affected Component
- **File**: src/controllers/authController.js
- **Function**: loginUser (lines 45-67)
- **Endpoint**: POST /api/auth/login

### Vulnerability Description
The application constructs SQL queries using template literals without proper parameterization:

\`\`\`javascript
// Vulnerable code at line 52
const user = await db.query(
  \`SELECT * FROM users WHERE email = '\${email}' AND password = '\${hashPassword(password)}'\`
);
\`\`\`

### Proof of Concept
Send the following payload as the email parameter:
\`\`\`
admin@example.com' OR '1'='1' --
\`\`\`

This results in the query:
\`\`\`sql
SELECT * FROM users WHERE email = 'admin@example.com' OR '1'='1' --' AND password = '...'
\`\`\`

### Impact Analysis
1. **Authentication Bypass**: Attackers can log in as any user
2. **Data Breach**: Access to all user records
3. **Privilege Escalation**: Potential admin access

### Recommended Fix
Replace the vulnerable query with a parameterized statement:

\`\`\`javascript
const user = await db.query(
  'SELECT * FROM users WHERE email = ? AND password = ?',
  [email, hashPassword(password)]
);
\`\`\`

### Testing Instructions
1. Ensure existing login tests pass
2. Add test case for SQL injection attempt
3. Verify audit logs capture failed injection attempts

### References
- CWE-89: Improper Neutralization of Special Elements
- OWASP SQL Injection Prevention Cheat Sheet
`;
      
      const result = await interpreter.interpret(issueBody);
      
      expect(result.vulnerabilityType).toBe('sql-injection');
      expect(result.severity).toBe('critical');
      expect(result.cvssScore).toBe(9.8);
      expect(result.reportedBy).toBe('security-researcher');
      expect(result.affectedLocations[0]).toMatchObject({
        file: 'src/controllers/authController.js',
        function: 'loginUser',
        lines: expect.arrayContaining([45, 52, 67]),
        endpoint: 'POST /api/auth/login'
      });
      expect(result.impact).toHaveLength(3);
      expect(result.proofOfConcept).toBeDefined();
      expect(result.testingInstructions).toHaveLength(3);
    });
  });
});

describe('IssueInterpreter Error Handling', () => {
  test('should handle empty issue body', async () => {
    const interpreter = new IssueInterpreter();
    const result = await interpreter.interpret('');
    
    expect(result.vulnerabilityType).toBe('unknown');
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.needsMoreInfo).toBe(true);
  });

  test('should handle non-security issues gracefully', async () => {
    const interpreter = new IssueInterpreter();
    const issueBody = `
## Feature Request: Add Dark Mode

It would be great to have a dark mode option in the settings.
This would improve user experience for night-time usage.
`;
    
    const result = await interpreter.interpret(issueBody);
    
    expect(result.isSecurityIssue).toBe(false);
    expect(result.issueType).toBe('feature-request');
  });
});