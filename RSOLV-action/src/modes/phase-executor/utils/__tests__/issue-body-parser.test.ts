/**
 * TDD tests for IssueBodyParser
 * These tests define the expected behavior before implementation
 */

import { describe, test, expect, vi } from 'vitest';
import { parseIssueBody, enhanceValidationData } from '../issue-body-parser.js';
import type { 
  IssueBodyVulnerability,
  ParsedIssueBody,
  FileVulnerabilityMapping 
} from '../issue-body-parser.js';

describe('IssueBodyParser', () => {
  describe('parseIssueBody', () => {
    test('should parse single file with single vulnerability', () => {
      const issueBody = `## Security Vulnerability Report

**Type**: Weak_cryptography
**Severity**: MEDIUM

### Affected Files

#### \`app/assets/vendor/jquery.min.js\`

- **Line 4**: Math.random() is not cryptographically secure

### Recommendation`;

      const result: ParsedIssueBody = parseIssueBody(issueBody);

      expect(result.type).toBe('Weak_cryptography');
      expect(result.severity).toBe('MEDIUM');
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('app/assets/vendor/jquery.min.js');
      expect(result.files[0].vulnerabilities).toHaveLength(1);
      expect(result.files[0].vulnerabilities[0].line).toBe(4);
      expect(result.files[0].vulnerabilities[0].message).toBe('Math.random() is not cryptographically secure');
    });

    test('should parse multiple files with multiple vulnerabilities', () => {
      const issueBody = `## Security Vulnerability Report

**Type**: Information_disclosure
**Severity**: HIGH

### Affected Files

#### \`app/routes/index.js\`

- **Line 10**: Sensitive data in logs
- **Line 25**: Stack trace exposed to user

#### \`app/routes/admin.js\`

- **Line 5**: Debug mode enabled in production`;

      const result: ParsedIssueBody = parseIssueBody(issueBody);

      expect(result.files).toHaveLength(2);
      
      // First file
      expect(result.files[0].path).toBe('app/routes/index.js');
      expect(result.files[0].vulnerabilities).toHaveLength(2);
      expect(result.files[0].vulnerabilities[0].line).toBe(10);
      expect(result.files[0].vulnerabilities[1].line).toBe(25);
      
      // Second file
      expect(result.files[1].path).toBe('app/routes/admin.js');
      expect(result.files[1].vulnerabilities).toHaveLength(1);
      expect(result.files[1].vulnerabilities[0].line).toBe(5);
    });

    test('should handle files with no vulnerabilities gracefully', () => {
      const issueBody = `## Security Vulnerability Report

### Affected Files

#### \`app/config.js\`

### Recommendation`;

      const result: ParsedIssueBody = parseIssueBody(issueBody);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('app/config.js');
      expect(result.files[0].vulnerabilities).toHaveLength(0);
    });

    test('should handle malformed issue body without crashing', () => {
      const issueBody = `This is not a properly formatted issue body`;

      const result: ParsedIssueBody = parseIssueBody(issueBody);

      expect(result.type).toBeUndefined();
      expect(result.severity).toBeUndefined();
      expect(result.files).toHaveLength(0);
    });

    test('should extract vulnerability type correctly', () => {
      const testCases = [
        { input: '**Type**: Cross_site_scripting', expected: 'Cross_site_scripting' },
        { input: '**Type**: SQL_injection', expected: 'SQL_injection' },
        { input: '**Type**: Command_injection', expected: 'Command_injection' },
      ];


      testCases.forEach(({ input, expected }) => {
        const result = parseIssueBody(`## Report\n${input}\n### Files`);
        expect(result.type).toBe(expected);
      });
    });

    test('should handle special characters in file paths', () => {
      const issueBody = `### Affected Files

#### \`src/components/[id]/page.tsx\`

- **Line 42**: XSS vulnerability`;

      const result: ParsedIssueBody = parseIssueBody(issueBody);

      expect(result.files[0].path).toBe('src/components/[id]/page.tsx');
    });
  });

  describe('enhanceValidationData', () => {
    test('should replace unknown.js with actual filenames', () => {
      const validationData = {
        confidence: 'medium',
        vulnerabilities: [
          {
            file: 'unknown.js',
            line: 4,
            type: 'UNKNOWN',
            description: 'Detected from issue content'
          }
        ]
      };

      const parsedBody: ParsedIssueBody = {
        type: 'Weak_cryptography',
        severity: 'MEDIUM',
        files: [
          {
            path: 'app/assets/vendor/jquery.min.js',
            vulnerabilities: [
              { line: 4, message: 'Math.random() is not cryptographically secure' }
            ]
          }
        ]
      };

      const enhanced = enhanceValidationData(validationData, parsedBody);

      expect(enhanced.vulnerabilities[0].file).toBe('app/assets/vendor/jquery.min.js');
      expect(enhanced.vulnerabilities[0].line).toBe(4);
      expect(enhanced.vulnerabilities[0].type).toBe('Weak_cryptography'); // Should also fix type
    });

    test('should handle multiple vulnerabilities and match by line number', () => {
      const validationData = {
        vulnerabilities: [
          { file: 'unknown.js', line: 10, type: 'UNKNOWN' },
          { file: 'unknown.js', line: 25, type: 'UNKNOWN' },
          { file: 'unknown.js', line: 5, type: 'UNKNOWN' }
        ]
      };

      const parsedBody: ParsedIssueBody = {
        files: [
          {
            path: 'app/routes/index.js',
            vulnerabilities: [
              { line: 10, message: 'Issue 1' },
              { line: 25, message: 'Issue 2' }
            ]
          },
          {
            path: 'app/routes/admin.js',
            vulnerabilities: [
              { line: 5, message: 'Issue 3' }
            ]
          }
        ]
      };

      const enhanced = enhanceValidationData(validationData, parsedBody);

      // Should match vulnerabilities to correct files by line number
      const line10 = enhanced.vulnerabilities.find((v: any) => v.line === 10);
      const line25 = enhanced.vulnerabilities.find((v: any) => v.line === 25);
      const line5 = enhanced.vulnerabilities.find((v: any) => v.line === 5);

      expect(line10?.file).toBe('app/routes/index.js');
      expect(line25?.file).toBe('app/routes/index.js');
      expect(line5?.file).toBe('app/routes/admin.js');
    });

    test('should preserve validation data that cannot be matched', () => {
      const validationData = {
        confidence: 'high',
        vulnerabilities: [
          { file: 'unknown.js', line: 999, type: 'UNKNOWN' }, // No match
          { file: 'real-file.js', line: 1, type: 'XSS' } // Already has filename
        ]
      };

      const parsedBody: ParsedIssueBody = {
        files: [
          {
            path: 'app/test.js',
            vulnerabilities: [{ line: 10, message: 'Test' }]
          }
        ]
      };

      const enhanced = enhanceValidationData(validationData, parsedBody);

      // Should keep unmatched as-is
      expect(enhanced.vulnerabilities[0].file).toBe('unknown.js');
      // Should preserve already-good filenames
      expect(enhanced.vulnerabilities[1].file).toBe('real-file.js');
    });
  });
});