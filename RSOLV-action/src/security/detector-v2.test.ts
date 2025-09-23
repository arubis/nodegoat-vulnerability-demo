import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecurityDetectorV2 } from './detector-v2.js';
import { LocalPatternSource, HybridPatternSource } from './pattern-source.js';
import { VulnerabilityType } from './types.js';

// Mock the logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(() => {}),
    info: vi.fn(() => {}),
    warn: vi.fn(() => {}),
    error: vi.fn(() => {})
  }
}));

describe('SecurityDetectorV2', () => {
  let detector: SecurityDetectorV2;

  beforeEach(() => {
    // Use local patterns for testing
    const patternSource = new LocalPatternSource();
    detector = new SecurityDetectorV2(patternSource);
  });

  describe('detect', () => {
    it('should detect SQL injection vulnerabilities', async () => {
      const code = `
        const query = "SELECT * FROM users WHERE id = " + req.params.id;
        db.execute(query);
      `;
      
      const vulnerabilities = await detector.detect(code, 'javascript');
      
      expect(vulnerabilities.length).toBeGreaterThan(0);
      expect(vulnerabilities[0].type).toBe(VulnerabilityType.SQL_INJECTION);
      expect(vulnerabilities[0].line).toBe(2);
    });

    it('should detect XSS vulnerabilities', async () => {
      const code = `
        // Direct innerHTML assignment with user input
        document.getElementById('output').innerHTML = req.query.userInput;
      `;
      
      const vulnerabilities = await detector.detect(code, 'javascript');
      
      const xssVulns = vulnerabilities.filter(v => v.type === VulnerabilityType.XSS);
      expect(xssVulns.length).toBeGreaterThan(0);
    });

    it('should not flag safe parameterized queries', async () => {
      const code = `
        const query = "SELECT * FROM users WHERE id = ?";
        db.execute(query, [userId]);
      `;
      
      const vulnerabilities = await detector.detect(code, 'javascript');
      
      expect(vulnerabilities.length).toBe(0);
    });

    it('should detect vulnerabilities in Python code', async () => {
      const code = `
        import os
        os.system("ls " + user_input)
      `;
      
      const vulnerabilities = await detector.detect(code, 'python');
      
      expect(vulnerabilities.length).toBeGreaterThan(0);
      expect(vulnerabilities[0].type).toBe(VulnerabilityType.COMMAND_INJECTION);
    });

    it('should handle empty code gracefully', async () => {
      const vulnerabilities = await detector.detect('', 'javascript');
      expect(vulnerabilities).toEqual([]);
    });

    it('should deduplicate vulnerabilities on the same line', async () => {
      const code = `
        const bad = "SELECT * FROM users WHERE name = '" + name + "' AND email = '" + email + "'";
      `;
      
      const vulnerabilities = await detector.detect(code, 'javascript');
      
      // Should only report one SQL injection for this line, not two
      const sqlVulns = vulnerabilities.filter(v => 
        v.type === VulnerabilityType.SQL_INJECTION && v.line === 2
      );
      expect(sqlVulns.length).toBe(1);
    });

    it('should assign confidence levels correctly', async () => {
      const code = `
        // High confidence - direct user input concatenation
        const query1 = "SELECT * FROM users WHERE id = " + req.params.id;
        
        // Should still be detected
        const query2 = "SELECT * FROM users WHERE id = " + someVariable;
      `;
      
      const vulnerabilities = await detector.detect(code, 'javascript');
      
      const highConfidence = vulnerabilities.find(v => v.line === 3);
      expect(highConfidence?.confidence).toBeGreaterThanOrEqual(75); // High confidence threshold
    });

    it('should detect dangerous function usage', async () => {
      const code = `
        // Dangerous innerHTML usage with user input
        document.getElementById('output').innerHTML = req.body.userContent;
      `;
      
      const vulnerabilities = await detector.detect(code, 'javascript');
      
      expect(vulnerabilities.length).toBeGreaterThan(0);
      const xssVuln = vulnerabilities.find(v => v.type === VulnerabilityType.XSS);
      expect(xssVuln).toBeTruthy();
      expect(xssVuln?.remediation).toBeTruthy();
      expect(xssVuln?.cweId).toBeTruthy();
      expect(xssVuln?.owaspCategory).toBeTruthy();
    });
  });

  describe('with API pattern source', () => {
    it('should use API patterns when configured', async () => {
      // Mock fetch for API
      const originalFetch = global.fetch;
      global.fetch = vi.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          patterns: [{
            id: 'test-api-pattern',
            name: 'Test API Pattern',
            type: 'sql_injection',
            severity: 'critical',
            patterns: { regex: ['SELECT.*\\+.*req\\.'] },
            languages: ['javascript'],
            description: 'API-based SQL injection pattern',
            recommendation: 'Use parameterized queries',
            cweId: 'CWE-89',
            owaspCategory: 'A03:2021',
            testCases: { vulnerable: [], safe: [] }
          }]
        })
      }));

      const hybridSource = new HybridPatternSource('test-api-key');
      const apiDetector = new SecurityDetectorV2(hybridSource);
      
      const code = 'const query = "SELECT * FROM users WHERE id = " + req.params.id;';
      const vulnerabilities = await apiDetector.detect(code, 'javascript');
      
      expect(vulnerabilities.length).toBeGreaterThan(0);
      expect(vulnerabilities[0].message).toContain('SQL injection');
      
      // Restore fetch
      global.fetch = originalFetch;
    });
  });

  describe('error handling', () => {
    it('should handle pattern source errors gracefully', async () => {
      // Create a mock pattern source that throws
      const errorSource = {
        getPatternsByLanguage: vi.fn(() => Promise.reject(new Error('API Error'))),
        getPatternsByType: vi.fn(() => Promise.reject(new Error('API Error'))),
        getAllPatterns: vi.fn(() => Promise.reject(new Error('API Error')))
      };
      
      const errorDetector = new SecurityDetectorV2(errorSource as any);
      
      const code = 'const query = "SELECT * FROM users WHERE id = " + userId;';
      const vulnerabilities = await errorDetector.detect(code, 'javascript');
      
      // Should return empty array instead of throwing
      expect(vulnerabilities).toEqual([]);
    });
  });
});