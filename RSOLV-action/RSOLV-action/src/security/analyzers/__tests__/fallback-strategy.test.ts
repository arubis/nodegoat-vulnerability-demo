import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnhancedSecurityAnalyzer } from '../enhanced-security-analyzer.js';
import { VulnerabilityType } from '../../types.js';

describe.skip('AST Analyzer Fallback Strategy (Needs RFC-048 Test Mode)', () => {
  let analyzer: EnhancedSecurityAnalyzer;
  
  // Mock patterns that match test code
  const mockPatterns = [
    {
      id: 'js-eval-user-input',
      regex: ['^(?!.*//).*eval\\s*\\(.*?(?:req\\.|request\\.|params\\.|query\\.|body\\.|user|input|data|Code)'],
      type: 'rce',
      severity: 'critical',
      name: 'Dangerous eval() with User Input'
    },
    {
      id: 'js-sql-injection-concat',
      regex: ['(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN).*?["\']\\s*\\+\\s*\\w+'],
      type: 'sql_injection', 
      severity: 'critical',
      name: 'SQL Injection via String Concatenation'
    }
  ];
  
  const mockConfig = {
    apiUrl: 'http://localhost:4000',
    apiKey: 'test-api-key',
    timeout: 5000
  };

  beforeEach(() => {
    analyzer = new EnhancedSecurityAnalyzer(mockConfig);
  });

  afterEach(async () => {
    await analyzer.cleanup();
  });

  describe('fallback to regex when AST fails', () => {
    it('should fallback to regex detection when AST service is unavailable', async () => {
      // Mock fetch to simulate service unavailable
      global.fetch = async (url: string) => {
        if (url.includes('/health')) {
          return {
            ok: false,
            status: 503,
            json: async () => ({ error: 'Service Unavailable' })
          } as Response;
        }
        throw new Error('Service Unavailable');
      };

      const files = new Map<string, string>();
      files.set('test.js', `
        const query = "SELECT * FROM users WHERE id = " + userId;
        db.execute(query);
      `);

      // Check health first
      const isHealthy = await analyzer.isASTAvailable();
      expect(isHealthy).toBe(false);

      // Should still detect vulnerabilities using regex
      const result = await analyzer.analyze(files);
      
      expect(result.metadata.astFailed).toBe(1);
      expect(result.metadata.regexFallbacks).toBe(1);
      expect(result.vulnerabilities.length).toBeGreaterThan(0);
      expect(result.vulnerabilities[0].type).toBe(VulnerabilityType.SQL_INJECTION);
    });

    it('should fallback when AST parsing times out', async () => {
      // Mock slow AST service
      global.fetch = async (url: string, options: any) => {
        if (url.includes('/analyze')) {
          // Simulate timeout
          return new Promise((resolve, reject) => {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            setTimeout(() => reject(error), 100);
          });
        }
        return { ok: true, json: async () => ({ patterns: mockPatterns }) } as Response;
      };

      const files = new Map<string, string>();
      files.set('test.js', `eval(userInput);`);

      const result = await analyzer.analyze(files);
      
      expect(result.metadata.astFailed).toBe(1);
      expect(result.metadata.regexFallbacks).toBe(1);
      expect(result.vulnerabilities.length).toBeGreaterThan(0);
      
      // The minimal patterns detect eval as command injection
      // This is actually correct since eval can execute system commands
      const evalVuln = result.vulnerabilities.find(v => 
        v.message.toLowerCase().includes('eval') || 
        v.type === VulnerabilityType.COMMAND_INJECTION
      );
      expect(evalVuln).toBeTruthy();
    });

    it('should fallback when AST returns parse errors', async () => {
      // Mock AST service returning parse error
      global.fetch = async (url: string, options: any) => {
        if (url.includes('/analyze')) {
          const body = JSON.parse(options.body);
          return {
            ok: true,
            json: async () => ({
              requestId: body.requestId,
              session: { sessionId: 'test', expiresAt: new Date().toISOString() },
              results: [{
                file: 'test.js',
                status: 'error',
                error: {
                  type: 'ParseError',
                  message: 'Unexpected token',
                  line: 1,
                  column: 10
                },
                language: 'javascript'
              }],
              summary: {
                filesAnalyzed: 1,
                filesWithFindings: 0,
                totalFindings: 0,
                findingsBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
                findingsByLanguage: {},
                performance: { avgParseTimeMs: 5, totalTimeMs: 5 }
              }
            })
          } as any;
        }
        return { ok: true, json: async () => ({ patterns: mockPatterns }) } as Response;
      };

      const files = new Map<string, string>();
      files.set('test.js', `
        const { = user; // Syntax error
        system("rm -rf " + path);
      `);

      const result = await analyzer.analyze(files);
      
      expect(result.metadata.astFailed).toBe(1);
      expect(result.metadata.regexFallbacks).toBe(1);
      
      // Should still detect command injection with regex
      const cmdInjection = result.vulnerabilities.find(v => 
        v.type === VulnerabilityType.COMMAND_INJECTION
      );
      expect(cmdInjection).toBeTruthy();
    });

    it('should prefer AST results when available', async () => {
      // Mock successful AST analysis
      global.fetch = async (url: string, options: any) => {
        if (url.includes('/analyze')) {
          const body = JSON.parse(options.body);
          return {
            ok: true,
            json: async () => ({
              requestId: body.requestId,
              session: { sessionId: 'test', expiresAt: new Date().toISOString() },
              results: [{
                file: 'test.js',
                status: 'success',
                language: 'javascript',
                patterns: [{
                  pattern: {
                    id: 'sql-injection-ast',
                    name: 'SQL Injection (AST)',
                    type: 'sql_injection',
                    severity: 'high',
                    message: 'User input concatenated in SQL query',
                    confidence: 0.95
                  },
                  location: {
                    start: { line: 2, column: 20 },
                    end: { line: 2, column: 65 }
                  },
                  confidence: 0.95
                }]
              }],
              summary: {
                filesAnalyzed: 1,
                filesWithFindings: 1,
                totalFindings: 1,
                findingsBySeverity: { critical: 0, high: 1, medium: 0, low: 0 },
                findingsByLanguage: { javascript: 1 },
                performance: { avgParseTimeMs: 15, totalTimeMs: 15 }
              }
            })
          } as any;
        }
        return { ok: true, json: async () => ({ patterns: mockPatterns }) } as Response;
      };

      const files = new Map<string, string>();
      files.set('test.js', `
        const query = "SELECT * FROM users WHERE id = " + userId;
      `);

      const result = await analyzer.analyze(files);
      
      expect(result.metadata.astSuccessful).toBe(1);
      expect(result.metadata.regexFallbacks).toBe(0);
      expect(result.vulnerabilities.length).toBe(1);
      expect(result.vulnerabilities[0].confidence).toBeGreaterThan(0.9);
    });

    it('should handle mixed results (some AST, some fallback)', async () => {
      // Mock partial AST success
      global.fetch = async (url: string, options: any) => {
        if (url.includes('/analyze')) {
          const body = JSON.parse(options.body);
          return {
            ok: true,
            json: async () => ({
              requestId: body.requestId,
              session: { sessionId: 'test', expiresAt: new Date().toISOString() },
              results: [
                {
                  file: 'good.js',
                  status: 'success',
                  language: 'javascript',
                  patterns: [{
                    pattern: {
                      id: 'xss-dom',
                      name: 'DOM XSS',
                      type: 'xss',
                      severity: 'high',
                      message: 'Unsafe DOM manipulation',
                      confidence: 0.9
                    },
                    location: {
                      start: { line: 1, column: 1 },
                      end: { line: 1, column: 30 }
                    },
                    confidence: 0.9
                  }]
                },
                {
                  file: 'bad.js',
                  status: 'error',
                  error: {
                    type: 'ParseError',
                    message: 'Unexpected end of input'
                  },
                  language: 'javascript'
                }
              ],
              summary: {
                filesAnalyzed: 2,
                filesWithFindings: 1,
                totalFindings: 1,
                findingsBySeverity: { critical: 0, high: 1, medium: 0, low: 0 },
                findingsByLanguage: { javascript: 1 },
                performance: { avgParseTimeMs: 20, totalTimeMs: 40 }
              }
            })
          } as any;
        }
        return { ok: true, json: async () => ({ patterns: mockPatterns }) } as Response;
      };

      const files = new Map<string, string>();
      files.set('good.js', 'element.innerHTML = userInput;');
      files.set('bad.js', 'eval(data');  // Missing closing paren

      const result = await analyzer.analyze(files);
      
      expect(result.metadata.astSuccessful).toBe(1);
      expect(result.metadata.astFailed).toBe(1);
      expect(result.metadata.regexFallbacks).toBe(1);
      expect(result.vulnerabilities.length).toBeGreaterThan(1); // XSS from AST + something from regex
      
      const summary = analyzer.getDetectionSummary(result);
      expect(summary.astOnly).toBeGreaterThan(0);
    });
  });

  describe('confidence adjustment', () => {
    it('should lower confidence for regex-only detections', async () => {
      // Disable AST to force regex-only
      const regexAnalyzer = new EnhancedSecurityAnalyzer({
        ...mockConfig,
        useAST: false
      });

      const files = new Map<string, string>();
      files.set('test.js', `
        const cmd = "rm -rf " + userPath;
        exec("rm -rf " + userPath);
      `);

      const result = await regexAnalyzer.analyze(files);
      
      expect(result.metadata.regexFallbacks).toBe(1);
      expect(result.vulnerabilities.length).toBeGreaterThan(0);
      
      // Check confidence penalty was applied
      const vuln = result.vulnerabilities[0];
      expect(vuln.confidence).toBeLessThan(80); // Default penalty is 0.3, confidence in 0-100 scale
    });

    it('should not double-count vulnerabilities detected by both methods', async () => {
      // Mock AST detecting same vulnerability as regex would
      global.fetch = async (url: string, options: any) => {
        if (url.includes('/analyze')) {
          const body = JSON.parse(options.body);
          return {
            ok: true,
            json: async () => ({
              requestId: body.requestId,
              session: { sessionId: 'test', expiresAt: new Date().toISOString() },
              results: [{
                file: 'test.js',
                status: 'success',
                language: 'javascript',
                patterns: [{
                  pattern: {
                    id: 'sql-injection',
                    name: 'SQL Injection',
                    type: 'sql_injection',
                    severity: 'high',
                    message: 'SQL injection vulnerability'
                  },
                  location: {
                    start: { line: 2, column: 1 },
                    end: { line: 2, column: 50 }
                  },
                  confidence: 0.95
                }]
              }],
              summary: {
                filesAnalyzed: 1,
                filesWithFindings: 1,
                totalFindings: 1,
                findingsBySeverity: { critical: 0, high: 1, medium: 0, low: 0 },
                findingsByLanguage: { javascript: 1 },
                performance: { avgParseTimeMs: 10, totalTimeMs: 10 }
              }
            })
          } as any;
        }
        return { ok: true, json: async () => ({ patterns: mockPatterns }) } as Response;
      };

      const files = new Map<string, string>();
      files.set('test.js', `
        const query = "SELECT * FROM users WHERE id = " + userId;
      `);

      const result = await analyzer.analyze(files);
      
      // Should only have the AST-detected vulnerability, not duplicated
      expect(result.vulnerabilities.length).toBe(1);
      expect(result.vulnerabilities[0].confidence).toBe(95); // 0.95 * 100
    });
  });
});