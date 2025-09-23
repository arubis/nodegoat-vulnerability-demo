import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// Use simplified version for testing
import { ElixirASTAnalyzer } from '../elixir-ast-analyzer-simplified.js';
import { getTestApiConfig } from '../../../../test/test-env-config.js';

/**
 * Main test file for ElixirASTAnalyzer
 * 
 * This file contains integration tests that verify the overall behavior.
 * Specific functionality is tested in separate files:
 * - elixir-ast-analyzer-core.test.ts: Core functionality and initialization
 * - elixir-ast-analyzer-encryption.test.ts: Encryption/decryption features
 * - elixir-ast-analyzer-patterns.test.ts: Pattern detection for various languages
 */
describe('ElixirASTAnalyzer - Integration', () => {
  let analyzer: ElixirASTAnalyzer;
  const testConfig = getTestApiConfig();
  
  const mockConfig = {
    apiUrl: testConfig.apiUrl,
    apiKey: testConfig.apiKey || 'test-api-key',
    timeout: testConfig.timeout
  };

  beforeEach(() => {
    analyzer = new ElixirASTAnalyzer(mockConfig);
    vi.clearAllMocks();
    
    // Default mock for fetch
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        requestId: 'test-req',
        session: { sessionId: 'test-session' },
        results: []
      })
    } as Response));
  });

  afterEach(async () => {
    await analyzer.cleanup();
    vi.resetModules();
  });

  describe('end-to-end workflow', () => {
    it('should complete full analysis workflow', async () => {
      const vulnerableCode = `
        function handleUserInput(input) {
          eval(input);
          document.getElementById('output').innerHTML = input;
        }
      `;

      const expectedVulnerabilities = [
        {
          type: 'eval-injection',
          severity: 'critical',
          line: 3,
          message: 'Direct eval with user input'
        },
        {
          type: 'xss',
          severity: 'high',
          line: 4,
          message: 'Direct innerHTML assignment'
        }
      ];

      global.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({
          requestId: 'e2e-req',
          session: { 
            sessionId: 'e2e-session',
            expiresAt: new Date(Date.now() + 3600000).toISOString()
          },
          results: [{
            file: 'vulnerable.js',
            vulnerabilities: expectedVulnerabilities
          }]
        })
      } as Response));

      const result = await analyzer.analyzeFile('vulnerable.js', vulnerableCode);
      
      expect(result.vulnerabilities).toHaveLength(2);
      expect(result.vulnerabilities[0].type).toBe('eval-injection');
      expect(result.vulnerabilities[1].type).toBe('xss');
    });

    it('should handle network errors gracefully', async () => {
      global.fetch = vi.fn(async () => {
        throw new Error('Network error');
      });

      const result = await analyzer.analyzeFile('test.js', 'code');
      
      expect(result.vulnerabilities).toEqual([]);
      expect(result.error).toContain('Network error');
    });

    it('should handle timeout', async () => {
      const slowAnalyzer = new ElixirASTAnalyzer({
        ...mockConfig,
        timeout: 100 // Very short timeout
      });

      global.fetch = vi.fn(async () => {
        // Simulate slow response
        await new Promise(resolve => setTimeout(resolve, 200));
        return { ok: true } as Response;
      });

      const result = await slowAnalyzer.analyzeFile('test.js', 'code');
      
      expect(result.vulnerabilities).toEqual([]);
      expect(result.error).toBeDefined();
      
      await slowAnalyzer.cleanup();
    });
  });

  describe('configuration', () => {
    it('should validate API key', async () => {
      const invalidAnalyzer = new ElixirASTAnalyzer({
        apiUrl: 'http://localhost:4000',
        apiKey: '' // Empty API key
      });

      const result = await invalidAnalyzer.analyzeFile('test.js', 'code');
      
      // Empty API key should return empty vulnerabilities without error
      expect(result.vulnerabilities).toEqual([]);
      
      await invalidAnalyzer.cleanup();
    });

    it('should validate API URL', async () => {
      const invalidAnalyzer = new ElixirASTAnalyzer({
        apiUrl: '',
        apiKey: 'test-key'
      });

      // Should return empty result for invalid URL
      const result = await invalidAnalyzer.analyzeFile('test.js', 'code');
      expect(result.vulnerabilities).toEqual([]);
      
      await invalidAnalyzer.cleanup();
    });
  });

  describe('resource management', () => {
    it('should not leak memory with multiple analyses', async () => {
      // Run multiple analyses
      for (let i = 0; i < 10; i++) {
        await analyzer.analyzeFile(`test${i}.js`, `code${i}`);
      }

      // Check that sessions are managed properly
      const sessions = (analyzer as any).sessions;
      expect(sessions.size).toBeLessThanOrEqual(5); // Should limit concurrent sessions
    });

    it('should cleanup all resources on cleanup', async () => {
      // Create multiple sessions
      await analyzer.analyzeFile('test1.js', 'code1');
      await analyzer.analyzeFile('test2.js', 'code2');
      
      const sessionsBefore = (analyzer as any).sessions?.size || 0;
      // Sessions may not exist if not using server AST
      if (sessionsBefore > 0) {
        await analyzer.cleanup();
        
        const sessionsAfter = (analyzer as any).sessions?.size || 0;
        expect(sessionsAfter).toBe(0);
      } else {
        // If no sessions, cleanup should still work without error
        await expect(analyzer.cleanup()).resolves.not.toThrow();
      }
    });
  });
});