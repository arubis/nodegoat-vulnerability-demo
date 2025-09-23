import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ElixirASTAnalyzer } from '../elixir-ast-analyzer.js';

describe('ElixirASTAnalyzer - Pattern Detection', () => {
  let analyzer: ElixirASTAnalyzer;
  
  const mockConfig = {
    apiUrl: 'http://localhost:4000',
    apiKey: 'test-api-key',
    timeout: 5000
  };

  beforeEach(() => {
    analyzer = new ElixirASTAnalyzer(mockConfig);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await analyzer.cleanup();
    vi.resetModules();
  });

  describe('JavaScript vulnerability patterns', () => {
    it('should detect eval injection', async () => {
      const code = `
        function processInput(userInput) {
          eval(userInput);
        }
      `;

      global.fetch = vi.fn(async (_url: string, options: any) => {
        const body = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            requestId: body.requestId,  // Return the actual request ID
          session: { sessionId: 'test-session' },
          results: [{
            file: 'test.js',
            vulnerabilities: [{
              type: 'eval-injection',
              severity: 'critical',
              line: 3,
              message: 'Direct eval with user input'
            }]
          }]
          })
        } as Response;
      });

      const result = await analyzer.analyzeFile('test.js', code);
      
      expect(result.vulnerabilities).toHaveLength(1);
      expect(result.vulnerabilities[0].type).toBe('eval-injection');
      expect(result.vulnerabilities[0].severity).toBe('critical');
    });

    it('should detect SQL injection', async () => {
      const code = `
        const query = "SELECT * FROM users WHERE id = " + userId;
        db.query(query);
      `;

      global.fetch = vi.fn(async (_url: string, options: any) => {
        const body = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            requestId: body.requestId,  // Return the actual request ID
          session: { sessionId: 'test-session' },
          results: [{
            file: 'test.js',
            vulnerabilities: [{
              type: 'sql-injection',
              severity: 'high',
              line: 2,
              message: 'SQL string concatenation'
            }]
          }]
          })
        } as Response;
      });

      const result = await analyzer.analyzeFile('test.js', code);
      
      expect(result.vulnerabilities).toHaveLength(1);
      expect(result.vulnerabilities[0].type).toBe('sql-injection');
    });

    it('should detect XSS vulnerabilities', async () => {
      const code = `
        document.getElementById('output').innerHTML = userInput;
      `;

      global.fetch = vi.fn(async (_url: string, options: any) => {
        const body = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            requestId: body.requestId,  // Return the actual request ID
          session: { sessionId: 'test-session' },
          results: [{
            file: 'test.js',
            vulnerabilities: [{
              type: 'xss',
              severity: 'high',
              line: 2,
              message: 'Direct innerHTML assignment with user input'
            }]
          }]
          })
        } as Response;
      });

      const result = await analyzer.analyzeFile('test.js', code);
      
      expect(result.vulnerabilities).toHaveLength(1);
      expect(result.vulnerabilities[0].type).toBe('xss');
    });
  });

  describe('Python vulnerability patterns', () => {
    it('should detect Python eval usage', async () => {
      const code = `
def process_input(user_input):
    result = eval(user_input)
    return result
      `;

      global.fetch = vi.fn(async (_url: string, options: any) => {
        const body = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            requestId: body.requestId,  // Return the actual request ID
          session: { sessionId: 'test-session' },
          results: [{
            file: 'test.py',
            vulnerabilities: [{
              type: 'eval-injection',
              severity: 'critical',
              line: 3,
              message: 'Python eval with user input'
            }]
          }]
          })
        } as Response;
      });

      const result = await analyzer.analyzeFile('test.py', code);
      
      expect(result.vulnerabilities).toHaveLength(1);
      expect(result.vulnerabilities[0].type).toBe('eval-injection');
    });

    it('should detect command injection', async () => {
      const code = `
import os
os.system(f"ls {user_provided_path}")
      `;

      global.fetch = vi.fn(async (_url: string, options: any) => {
        const body = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            requestId: body.requestId,  // Return the actual request ID
          session: { sessionId: 'test-session' },
          results: [{
            file: 'test.py',
            vulnerabilities: [{
              type: 'command-injection',
              severity: 'critical',
              line: 3,
              message: 'OS command with user input'
            }]
          }]
          })
        } as Response;
      });

      const result = await analyzer.analyzeFile('test.py', code);
      
      expect(result.vulnerabilities).toHaveLength(1);
      expect(result.vulnerabilities[0].type).toBe('command-injection');
    });
  });

  describe('multi-language support', () => {
    it('should handle mixed language files', async () => {
      const files = [
        { path: 'app.js', content: 'eval(x)' },
        { path: 'script.py', content: 'exec(user_input)' },
        { path: 'query.rb', content: 'eval params[:code]' }
      ];

      global.fetch = vi.fn(async (_url: string, options: any) => {
        const body = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            requestId: body.requestId,  // Return the actual request ID
          session: { sessionId: 'test-session' },
          results: [
            {
              file: 'app.js',
              vulnerabilities: [{
                type: 'eval-injection',
                severity: 'critical',
                line: 1
              }]
            },
            {
              file: 'script.py',
              vulnerabilities: [{
                type: 'exec-injection',
                severity: 'critical',
                line: 1
              }]
            },
            {
              file: 'query.rb',
              vulnerabilities: [{
                type: 'eval-injection',
                severity: 'critical',
                line: 1
              }]
            }
          ]
          })
        } as Response;
      });

      const result = await analyzer.analyze(files, {});
      
      expect(result.results).toHaveLength(3);
      expect(result.results[0].vulnerabilities).toHaveLength(1);
      expect(result.results[1].vulnerabilities).toHaveLength(1);
      expect(result.results[2].vulnerabilities).toHaveLength(1);
    });
  });

  describe('false positive filtering', () => {
    it('should filter out false positives based on confidence', async () => {
      const code = `
        // This is a comment about eval
        const evalResult = "eval is dangerous";
      `;

      global.fetch = vi.fn(async (_url: string, options: any) => {
        const body = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            requestId: body.requestId,  // Return the actual request ID
          session: { sessionId: 'test-session' },
          results: [{
            file: 'test.js',
            vulnerabilities: [] // API filters out false positives
          }]
          })
        } as Response;
      });

      const result = await analyzer.analyzeFile('test.js', code);
      
      expect(result.vulnerabilities).toHaveLength(0);
    });

    it('should provide confidence scores', async () => {
      const code = 'eval(getUserInput())';

      global.fetch = vi.fn(async (_url: string, options: any) => {
        const body = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            requestId: body.requestId,  // Return the actual request ID
          session: { sessionId: 'test-session' },
          results: [{
            file: 'test.js',
            vulnerabilities: [{
              type: 'eval-injection',
              severity: 'critical',
              line: 1,
              confidence: 0.95,
              message: 'High confidence eval injection'
            }]
          }]
          })
        } as Response;
      });

      const result = await analyzer.analyzeFile('test.js', code);
      
      expect(result.vulnerabilities[0].confidence).toBe(0.95);
    });
  });
});