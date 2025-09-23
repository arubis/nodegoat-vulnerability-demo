import { describe, test, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { SecurityDetectorV2 } from '../security/detector-v2';
import { PatternAPIClient } from '../security/pattern-api-client';
import type { SecurityPattern, SecurityIssue } from '../security/types';
import { VulnerabilityType } from '../security/types';

// Helper function to convert VulnerabilityType enum to API string format
function getApiTypeString(type: VulnerabilityType): string {
  const typeMap: Record<VulnerabilityType, string> = {
    [VulnerabilityType.SQL_INJECTION]: 'sql_injection',
    [VulnerabilityType.XSS]: 'xss',
    [VulnerabilityType.COMMAND_INJECTION]: 'command_injection',
    [VulnerabilityType.PATH_TRAVERSAL]: 'path_traversal',
    [VulnerabilityType.XXE]: 'xxe',
    [VulnerabilityType.SSRF]: 'ssrf',
    [VulnerabilityType.INSECURE_DESERIALIZATION]: 'insecure_deserialization',
    [VulnerabilityType.WEAK_CRYPTO]: 'weak_crypto',
    [VulnerabilityType.HARDCODED_SECRET]: 'hardcoded_secret',
    [VulnerabilityType.INSECURE_RANDOM]: 'insecure_random',
    [VulnerabilityType.OPEN_REDIRECT]: 'open_redirect',
    [VulnerabilityType.LDAP_INJECTION]: 'ldap_injection',
    [VulnerabilityType.XPATH_INJECTION]: 'xpath_injection',
    [VulnerabilityType.NOSQL_INJECTION]: 'nosql_injection',
    [VulnerabilityType.RCE]: 'rce',
    [VulnerabilityType.DOS]: 'dos',
    [VulnerabilityType.TIMING_ATTACK]: 'timing_attack',
    [VulnerabilityType.CSRF]: 'csrf',
    [VulnerabilityType.JWT]: 'jwt',
    [VulnerabilityType.INFORMATION_DISCLOSURE]: 'information_disclosure',
    [VulnerabilityType.CVE]: 'cve',
    [VulnerabilityType.UNKNOWN]: 'unknown'
  };
  return typeMap[type] || 'unknown';
}

// NOTE: This test uses MSW for mocking but would be an ideal candidate for RFC-048 Test Mode.
// Once RFC-048 is implemented, this test could use real fetch with test API keys like:
// - rsolv_test_* or test_* prefixes for safe, deterministic API testing
// This would provide better integration testing while remaining isolated from production.
describe('Pattern API E2E Integration with MSW', () => {
  const apiUrl = 'http://localhost:3000';
  
  // Sample patterns that would be served by the API
  const mockPatterns: SecurityPattern[] = [
    {
      id: 'sql-injection-001',
      type: VulnerabilityType.SQL_INJECTION,
      name: 'SQL Injection via String Concatenation',
      description: 'Detects SQL queries built with string concatenation',
      patterns: {
        regex: [/query\s*\(\s*['"`].*?\+.*?['"`]\s*\)/]
      },
      severity: 'critical',
      cweId: 'CWE-89',
      owaspCategory: 'A03:2021',
      languages: ['javascript'],
      remediation: 'Use parameterized queries or prepared statements',
      examples: {
        vulnerable: 'db.query("SELECT * FROM users WHERE id = " + userId)',
        secure: 'db.query("SELECT * FROM users WHERE id = ?", [userId])'
      }
    },
    {
      id: 'xss-001',
      type: VulnerabilityType.XSS,
      name: 'Cross-Site Scripting via innerHTML',
      description: 'Detects potential XSS via innerHTML with dynamic content',
      patterns: {
        regex: [/\.innerHTML\s*=\s*[^'"`]+(?:\+|$)/]
      },
      severity: 'high',
      cweId: 'CWE-79',
      owaspCategory: 'A03:2021',
      languages: ['javascript'],
      remediation: 'Use textContent or proper sanitization',
      examples: {
        vulnerable: 'element.innerHTML = userInput',
        secure: 'element.textContent = userInput'
      }
    },
    {
      id: 'hardcoded-secret-001',
      type: VulnerabilityType.HARDCODED_SECRET,
      name: 'Hardcoded API Key',
      description: 'Detects hardcoded API keys in source code',
      patterns: {
        regex: [/(?:api[_-]?key|apikey)\s*[:=]\s*['"`][a-zA-Z0-9]{20,}['"`]/i]
      },
      severity: 'high',
      cweId: 'CWE-798',
      owaspCategory: 'A02:2021',
      languages: ['javascript'],
      remediation: 'Use environment variables or secure key management',
      examples: {
        vulnerable: 'const API_KEY = "sk_live_abcd1234567890"',
        secure: 'const API_KEY = process.env.API_KEY'
      }
    }
  ];

  // Create MSW server with handlers
  const server = setupServer(
    http.get(`${apiUrl}/api/v1/patterns/javascript`, ({ request }) => {
      const url = new URL(request.url);
      if (url.searchParams.get('format') === 'enhanced') {
        const jsPatterns = mockPatterns.filter(p => p.languages.includes('javascript'));
        return HttpResponse.json({
          count: jsPatterns.length,
          accessible_tiers: ['public', 'protected'],
          patterns: jsPatterns.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description,
            type: getApiTypeString(p.type),
            severity: p.severity,
            languages: p.languages,
            patterns: p.patterns.regex?.map(r => r.source) || [],
            cwe_id: p.cweId,
            owasp_category: p.owaspCategory,
            recommendation: p.remediation,
            tier: 'public',
            test_cases: {
              vulnerable: [p.examples.vulnerable],
              safe: [p.examples.secure]
            }
          }))
        });
      }
      return HttpResponse.json({ count: 0, patterns: [] });
    }),
    
    http.get(`${apiUrl}/health`, () => {
      return HttpResponse.json({ status: 'healthy' });
    }),
    
    http.get(`${apiUrl}/api/v1/patterns/health`, () => {
      return HttpResponse.json({ status: 'healthy' });
    }),
    
    // Catch-all for other language patterns
    http.get(`${apiUrl}/api/v1/patterns/:language`, () => {
      return HttpResponse.json({
        count: 0,
        accessible_tiers: ['public'],
        patterns: []
      });
    })
  );

  beforeAll(() => {
    // Start the MSW server
    server.listen({ onUnhandledRequest: 'bypass' });
  });

  afterEach(() => {
    // Reset handlers between tests
    server.resetHandlers();
  });

  afterAll(() => {
    // Clean up
    server.close();
  });

  test('SecurityDetectorV2 fetches patterns from API and detects vulnerabilities', async () => {
    // Import ApiPatternSource
    const { ApiPatternSource } = await import('../security/pattern-source.js');
    
    // Create API pattern source
    const patternSource = new ApiPatternSource('test-key', `${apiUrl}/api/v1/patterns`);
    
    const detector = new SecurityDetectorV2(patternSource);

    // Code with multiple vulnerabilities
    const vulnerableCode = `
      // SQL Injection vulnerability
      function getUserData(userId) {
        const query = db.query("SELECT * FROM users WHERE id = " + userId);
        return query;
      }

      // XSS vulnerability
      function displayMessage(message) {
        document.getElementById('output').innerHTML = message;
      }

      // Hardcoded secret
      const API_KEY = "sk_live_1234567890abcdefghij";
      
      // Safe code
      function safeQuery(userId) {
        return db.query("SELECT * FROM users WHERE id = ?", [userId]);
      }
    `;

    const issues = await detector.detect(vulnerableCode, 'javascript');

    // Verify issues were detected
    expect(issues.length).toBe(3);

    // Verify SQL injection detection
    const sqlInjection = issues.find(i => i.patternId === 'sql-injection-001');
    expect(sqlInjection).toBeDefined();
    expect(sqlInjection?.severity).toBe('critical');
    expect(sqlInjection?.line).toBeGreaterThan(0);
    expect(sqlInjection?.column).toBeGreaterThan(0);
    expect(sqlInjection?.message).toContain('SQL Injection');

    // Verify XSS detection
    const xss = issues.find(i => i.patternId === 'xss-001');
    expect(xss).toBeDefined();
    expect(xss?.severity).toBe('high');
    expect(xss?.message).toContain('Cross-Site Scripting');

    // Verify hardcoded secret detection
    const secret = issues.find(i => i.patternId === 'hardcoded-secret-001');
    expect(secret).toBeDefined();
    expect(secret?.severity).toBe('high');
    expect(secret?.message).toContain('Hardcoded API Key');
  });

  test('SecurityDetectorV2 filters patterns by language', async () => {
    const { ApiPatternSource } = await import('../security/pattern-source.js');
    const patternSource = new ApiPatternSource('test-key', `${apiUrl}/api/v1/patterns`);
    const detector = new SecurityDetectorV2(patternSource);

    // Python code (should not match JavaScript patterns)
    const pythonCode = `
      # This looks like SQL injection but is Python
      query = f"SELECT * FROM users WHERE id = {user_id}"
    `;

    const issues = await detector.detectIssues({
      content: pythonCode,
      filePath: 'test.py',
      language: 'python'
    });

    // Should not detect issues since patterns are for JavaScript
    expect(issues.length).toBe(0);
  });

  test('SecurityDetectorV2 handles API errors gracefully', async () => {
    // Add a handler that returns an error
    server.use(
      http.get(`${apiUrl}/api/v1/patterns/javascript`, () => {
        return new HttpResponse(null, { status: 500 });
      })
    );
    
    const { ApiPatternSource, LocalPatternSource } = await import('../security/pattern-source.js');
    
    // Try with API first (will fail)
    const apiSource = new ApiPatternSource('test-key', `${apiUrl}/api/v1/patterns`);
    const apiDetector = new SecurityDetectorV2(apiSource);
    
    const vulnerableCode = `
      const query = db.query("SELECT * FROM users WHERE id = " + userId);
    `;

    // Should handle the error gracefully
    await expect(apiDetector.detect(vulnerableCode, 'javascript')).rejects.toThrow();
    
    // Now test with LocalPatternSource as fallback
    const localSource = new LocalPatternSource();
    const localDetector = new SecurityDetectorV2(localSource);
    
    // Should still detect the SQL injection using local patterns
    const issues = await localDetector.detect(vulnerableCode, 'javascript');
    expect(issues.length).toBe(1);
    expect(issues[0].patternId).toBe('sql-injection-001');
  });

  test('SecurityDetectorV2 respects severity filtering', async () => {
    const { ApiPatternSource } = await import('../security/pattern-source.js');
    const patternSource = new ApiPatternSource('test-key', `${apiUrl}/api/v1/patterns`);
    const detector = new SecurityDetectorV2(patternSource);

    const mixedCode = `
      // Critical: SQL Injection
      db.query("SELECT * FROM users WHERE id = " + userId);
      
      // High: XSS
      element.innerHTML = userInput;
    `;

    const issues = await detector.detectIssues({
      content: mixedCode,
      filePath: 'test.js',
      language: 'javascript'
    });

    // Should detect both issues (critical and high)
    expect(issues.length).toBe(2);
    
    const criticalIssue = issues.find(i => i.severity === 'critical');
    expect(criticalIssue?.patternId).toBe('sql-injection-001');
    
    const highIssue = issues.find(i => i.severity === 'high');
    expect(highIssue?.patternId).toMatch(/xss-001|hardcoded-secret-001/);
  });

  test('SecurityDetectorV2 provides detailed issue context', async () => {
    const { ApiPatternSource } = await import('../security/pattern-source.js');
    const patternSource = new ApiPatternSource('test-key', `${apiUrl}/api/v1/patterns`);
    const detector = new SecurityDetectorV2(patternSource);

    const codeWithContext = `
      function processUserInput(userId) {
        // This is vulnerable to SQL injection
        const query = db.query("SELECT * FROM users WHERE id = " + userId);
        return query.results;
      }
    `;

    const issues = await detector.detectIssues({
      content: codeWithContext,
      filePath: 'user-service.js',
      language: 'javascript'
    });

    expect(issues.length).toBe(1);
    
    const issue = issues[0];
    
    // Verify issue has complete context
    expect(issue.filePath).toBe('user-service.js');
    expect(issue.line).toBe(4); // Line with the vulnerability
    expect(issue.column).toBeGreaterThan(0);
    expect(issue.snippet).toContain('db.query');
    expect(issue.recommendation).toContain('parameterized queries');
    expect(issue.cwe).toBe('CWE-89');
    expect(issue.owasp).toBe('A03:2021');
    expect(issue.examples).toBeDefined();
    expect(issue.examples?.vulnerable).toContain('db.query');
    expect(issue.examples?.secure).toContain('?');
  });

  test('SecurityDetectorV2 batches multiple file scans efficiently', async () => {
    const { ApiPatternSource } = await import('../security/pattern-source.js');
    const patternSource = new ApiPatternSource('test-key', `${apiUrl}/api/v1/patterns`);
    const detector = new SecurityDetectorV2(patternSource);

    const files = [
      {
        content: 'db.query("SELECT * FROM users WHERE id = " + id)',
        filePath: 'file1.js',
        language: 'javascript' as const
      },
      {
        content: 'element.innerHTML = userInput',
        filePath: 'file2.js',
        language: 'javascript' as const
      },
      {
        content: 'const API_KEY = "sk_live_secret123456789012"',
        filePath: 'file3.js',
        language: 'javascript' as const
      }
    ];

    // Scan all files
    const allIssues: SecurityIssue[] = [];
    
    for (const file of files) {
      const issues = await detector.detectIssues(file);
      allIssues.push(...issues);
    }

    // Verify all vulnerabilities detected
    expect(allIssues.length).toBe(3);
    
    // Verify each file has correct issue
    expect(allIssues.find(i => i.filePath === 'file1.js')?.patternId).toBe('sql-injection-001');
    expect(allIssues.find(i => i.filePath === 'file2.js')?.patternId).toBe('xss-001');
    expect(allIssues.find(i => i.filePath === 'file3.js')?.patternId).toBe('hardcoded-secret-001');
  });

  test('Pattern API health check works', async () => {
    const apiClient = new PatternAPIClient({
      apiUrl: `${apiUrl}/api/v1/patterns`,
      apiKey: 'test-key'
    });

    const health = await apiClient.checkHealth();
    expect(health.status).toBe('healthy');
  });
});