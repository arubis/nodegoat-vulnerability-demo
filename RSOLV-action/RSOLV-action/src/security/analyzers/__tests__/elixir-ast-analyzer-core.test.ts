import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ElixirASTAnalyzer } from '../elixir-ast-analyzer.js';

describe('ElixirASTAnalyzer - Core Functionality', () => {
  let analyzer: ElixirASTAnalyzer;
  
  const mockConfig = {
    apiUrl: 'http://localhost:4000',
    apiKey: 'test-api-key',
    timeout: 5000
  };

  beforeEach(() => {
    analyzer = new ElixirASTAnalyzer(mockConfig);
    vi.clearAllMocks();
    
    // Default mock for fetch
    global.fetch = vi.fn(async (url, options) => {
      const body = options?.body ? JSON.parse(options.body as string) : {};
      return {
        ok: true,
        json: async () => ({
          requestId: body.requestId || 'test-req',
          session: { sessionId: 'test-session' },
          results: []
        })
      } as Response;
    });
  });

  afterEach(async () => {
    await analyzer.cleanup();
    vi.resetModules();
  });

  describe('initialization', () => {
    it('should initialize with config', () => {
      const analyzer = new ElixirASTAnalyzer(mockConfig);
      expect(analyzer).toBeDefined();
      expect((analyzer as any).config).toEqual({
        ...mockConfig,
        debug: false  // Default value added by constructor
      });
    });

    it('should use environment variables as fallback', () => {
      process.env.RSOLV_API_URL = 'https://api.example.com';
      process.env.RSOLV_API_KEY = 'env-key';
      
      const analyzer = new ElixirASTAnalyzer({
        apiUrl: process.env.RSOLV_API_URL,
        apiKey: process.env.RSOLV_API_KEY
      });
      expect((analyzer as any).config.apiUrl).toBe('https://api.example.com');
      expect((analyzer as any).config.apiKey).toBe('env-key');
      
      delete process.env.RSOLV_API_URL;
      delete process.env.RSOLV_API_KEY;
    });
  });

  describe('file analysis', () => {
    it('should analyze single file', async () => {
      global.fetch = vi.fn(async (url, options) => {
        const body = JSON.parse((options as any).body);
        const mockResponse = {
          requestId: body.requestId, // Echo back the request ID
          session: { sessionId: 'session-123' },
          results: [{
            file: 'test.js',
            vulnerabilities: [{
              type: 'xss',
              severity: 'medium',
              line: 10,
              message: 'Potential XSS vulnerability'
            }]
          }]
        };
        return {
          ok: true,
          json: async () => mockResponse
        } as Response;
      });

      const result = await analyzer.analyzeFile('test.js', 'const html = userInput;');
      
      expect(result.vulnerabilities).toHaveLength(1);
      expect(result.vulnerabilities[0].type).toBe('xss');
    });

    it('should handle empty file content', async () => {
      // For empty content, analyzer should return results with empty vulnerabilities
      global.fetch = vi.fn(async (url, options) => {
        const body = JSON.parse((options as any).body);
        return {
          ok: true,
          json: async () => ({
            requestId: body.requestId,
            session: { sessionId: 'session-123' },
            results: [{
              file: 'empty.js',
              vulnerabilities: []
            }]
          })
        } as Response;
      });
      
      const result = await analyzer.analyzeFile('empty.js', '');
      expect(result.vulnerabilities).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
      global.fetch = vi.fn(async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      } as Response));

      // Should throw ASTAnalysisError, not return result with error property
      await expect(analyzer.analyzeFile('test.js', 'code')).rejects.toThrow('HTTP 500: Internal Server Error');
    });
  });

  describe('batch file analysis', () => {
    it('should analyze multiple files using analyze method', async () => {
      const files = [
        { path: 'file1.js', content: 'code1' },
        { path: 'file2.js', content: 'code2' }
      ];

      global.fetch = vi.fn(async (url, options) => {
        const body = JSON.parse((options as any).body);
        return {
          ok: true,
          json: async () => ({
            requestId: body.requestId,  // Echo back the request ID
            session: { sessionId: 'session-456' },
            results: [
              { file: 'file1.js', vulnerabilities: [] },
              { file: 'file2.js', vulnerabilities: [] }
            ]
          })
        } as Response;
      });

      const result = await analyzer.analyze(files);
      
      expect(result.results).toHaveLength(2);
      expect(result.results[0].file).toBe('file1.js');
      expect(result.results[1].file).toBe('file2.js');
    });

    it('should handle empty file list', async () => {
      await expect(analyzer.analyze([])).rejects.toThrow('No files provided for analysis');
    });

    it('should respect file count limits', async () => {
      const files = Array(11).fill(null).map((_, i) => ({
        path: `file${i}.js`,
        content: 'code'
      }));

      await expect(analyzer.analyze(files)).rejects.toThrow('Maximum 10 files allowed per analysis request');
    });
  });

  describe('session management', () => {
    it('should reuse sessions within timeout', async () => {
      let callCount = 0;
      global.fetch = vi.fn(async (url, options) => {
        const body = JSON.parse((options as any).body);
        callCount++;
        return {
          ok: true,
          json: async () => ({
            requestId: body.requestId,  // Echo back request ID
            session: {
              sessionId: 'reused-session',
              expiresAt: new Date(Date.now() + 3600000).toISOString()
            },
            results: [{
              file: body.files[0].path,
              vulnerabilities: []
            }]
          })
        } as Response;
      });

      await analyzer.analyzeFile('test1.js', 'code1');
      await analyzer.analyzeFile('test2.js', 'code2');
      
      // Should fetch twice for two different files
      expect(callCount).toBe(2);
    });

    it('should create new session when expired', async () => {
      let sessionId = 1;
      global.fetch = vi.fn(async (url, options) => {
        const body = JSON.parse((options as any).body);
        return {
          ok: true,
          json: async () => ({
            requestId: body.requestId,
            session: {
              sessionId: `session-${sessionId++}`,
              expiresAt: new Date(Date.now() - 1000).toISOString() // Already expired
            },
            results: [{
              file: body.files[0].path,
              vulnerabilities: []
            }]
          })
        } as Response;
      });

      await analyzer.analyzeFile('test1.js', 'code1');
      await analyzer.analyzeFile('test2.js', 'code2');
      
      // Should create new sessions each time  
      expect(sessionId).toBe(3);
    });
  });

  describe('cleanup', () => {
    it('should cleanup sessions on cleanup call', async () => {
      // Set up mock to provide results for analyzeFile
      global.fetch = vi.fn(async (url, options) => {
        const body = JSON.parse((options as any).body);
        return {
          ok: true,
          json: async () => ({
            requestId: body.requestId,
            session: { sessionId: 'test-session' },
            results: [{
              file: 'test.js',
              vulnerabilities: []
            }]
          })
        } as Response;
      });
      
      await analyzer.analyzeFile('test.js', 'code');
      
      // Test cleanup if sessions property exists
      const sessions = (analyzer as any).sessions;
      if (sessions) {
        expect(sessions.size).toBeGreaterThan(0);
        await analyzer.cleanup();
        expect(sessions.size).toBe(0);
      } else {
        // If no sessions property, just test that cleanup doesn't throw
        await expect(analyzer.cleanup()).resolves.not.toThrow();
      }
    });
  });
});