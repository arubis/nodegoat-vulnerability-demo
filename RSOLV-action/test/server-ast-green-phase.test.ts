import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecurityDetectorV3 } from '../src/security/detector-v3';
import { ElixirASTAnalyzer } from '../src/security/analyzers/elixir-ast-analyzer';

describe('GREEN Phase - Server AST Integration Working', () => {
  describe('New Detector with Server AST', () => {
    it('should use ElixirASTAnalyzer when API key is provided', () => {
      const detector = new SecurityDetectorV3({
        apiKey: 'test-key',
        apiUrl: 'https://api.rsolv-staging.com'
      });
      
      // Check internal state
      expect((detector as any).useServerAST).toBe(true);
      expect((detector as any).astAnalyzer).toBeInstanceOf(ElixirASTAnalyzer);
      expect((detector as any).astInterpreter).toBeUndefined();
    });

    it('should fall back to client-side AST when no API key', () => {
      // Don't set API key
      process.env.RSOLV_API_KEY = '';
      
      const detector = new SecurityDetectorV3();
      
      expect((detector as any).useServerAST).toBe(false);
      expect((detector as any).astAnalyzer).toBeUndefined();
      expect((detector as any).astInterpreter).toBeDefined();
    });

    it('should support multiple languages with server AST', () => {
      const detector = new SecurityDetectorV3({
        apiKey: 'test-key'
      });
      
      const languages = detector.getSupportedLanguages();
      
      expect(languages).toContain('javascript');
      expect(languages).toContain('typescript');
      expect(languages).toContain('python');
      expect(languages).toContain('ruby');
      expect(languages).toContain('php');
      expect(languages).toContain('java');
      expect(languages).toContain('go');
    });

    it('should only support JS/TS without server AST', () => {
      process.env.RSOLV_API_KEY = '';
      
      const detector = new SecurityDetectorV3();
      const languages = detector.getSupportedLanguages();
      
      expect(languages).toEqual(['javascript', 'typescript']);
    });
  });

  describe('Mock Server AST Detection', () => {
    it.skip('should handle Python code through server AST', async () => {
      // Create detector with mock analyzer
      const mockAnalyzer = {
        analyzeFile: async (path: string, content: string) => {
          // Mock response for Python SQL injection
          if (content.includes('cursor.execute') && content.includes('+')) {
            return {
              findings: [{
                pattern_type: 'sql-injection',
                severity: 'critical',
                line: 2,
                message: 'SQL injection vulnerability detected',
                confidence: 95,
                cwe_id: 'CWE-89'
              }]
            };
          }
          return { findings: [] };
        }
      };

      const detector = new SecurityDetectorV3({
        apiKey: 'test-key'
      });
      
      // Replace with mock
      (detector as any).astAnalyzer = mockAnalyzer;

      const pythonCode = `
query = "SELECT * FROM users WHERE id = " + user_id
cursor.execute(query)
`;

      const results = await detector.detect(pythonCode, 'python', 'test.py');
      
      expect(results.length).toBe(1);
      expect(results[0].type).toBe('sql-injection');
      expect(results[0].severity).toBe('critical');
      expect(results[0].confidence).toBe(95);
    });

    it('should reject unsupported languages gracefully', async () => {
      const detector = new SecurityDetectorV3({
        apiKey: 'test-key'
      });

      const results = await detector.detect('some code', 'cobol', 'test.cbl');
      
      expect(results).toEqual([]);
    });
  });

  describe('Configuration Options', () => {
    it('should respect useServerAST=false even with API key', () => {
      const detector = new SecurityDetectorV3({
        apiKey: 'test-key',
        useServerAST: false
      });
      
      expect((detector as any).useServerAST).toBe(false);
      expect((detector as any).astInterpreter).toBeDefined();
      expect((detector as any).astAnalyzer).toBeUndefined();
    });

    it('should use environment variables as fallback', () => {
      process.env.RSOLV_API_KEY = 'env-test-key';
      process.env.RSOLV_API_URL = 'https://api.rsolv-staging.com';
      
      const detector = new SecurityDetectorV3();
      
      expect((detector as any).useServerAST).toBe(true);
      expect((detector as any).astAnalyzer).toBeDefined();
    });
  });
});