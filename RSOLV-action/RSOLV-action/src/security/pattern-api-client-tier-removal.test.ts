import { describe, test, expect, beforeEach, mock, vi } from 'vitest';
import { PatternAPIClient } from './pattern-api-client.js';
import type { Pattern } from './types.js';

describe('PatternAPIClient - Tier Removal (TDD)', () => {
  let client: PatternAPIClient;
  let fetchMock: any;
  
  const mockPatternsWithoutTiers: Pattern[] = [
    {
      id: 'js-sql-injection',
      name: 'SQL Injection',
      description: 'SQL injection vulnerability',
      type: 'sql_injection',
      severity: 'critical',
      languages: ['javascript'],
      patterns: ['db.query.*\\+'],
      recommendation: 'Use parameterized queries',
      examples: {
        vulnerable: ['db.query("SELECT * FROM users WHERE id = " + id)'],
        safe: ['db.query("SELECT * FROM users WHERE id = ?", [id])']
      }
    },
    {
      id: 'js-xss',
      name: 'Cross-Site Scripting',
      description: 'XSS vulnerability',
      type: 'xss',
      severity: 'high',
      languages: ['javascript'],
      patterns: ['innerHTML\\s*='],
      recommendation: 'Use textContent instead',
      examples: {
        vulnerable: ['element.innerHTML = userInput'],
        safe: ['element.textContent = userInput']
      }
    }
  ];
  
  beforeEach(() => {
    fetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({
        patterns: mockPatternsWithoutTiers,
        metadata: {
          language: 'javascript',
          count: mockPatternsWithoutTiers.length,
          access_level: 'full'
        }
      })
    }));
    global.fetch = fetchMock;
    
    client = new PatternAPIClient({ 
      apiUrl: 'https://api.test.com',
      apiKey: 'test-api-key' 
    });
  });

  describe('Tier-less Pattern Access', () => {
    test('fetchPatterns should not include tier parameter in request', async () => {
      await client.fetchPatterns('javascript');
      
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0];
      
      // Should not have tier parameter
      expect(url).not.toContain('tier=');
      // Should still have language parameter
      expect(url).toContain('language=javascript');
    });
    
    test('fetchPatterns response should not contain tier fields', async () => {
      const patterns = await client.fetchPatterns('javascript');
      
      // Patterns should not have tier field
      patterns.forEach(pattern => {
        expect(pattern).not.toHaveProperty('tier');
        expect(pattern).not.toHaveProperty('default_tier');
      });
    });
    
    test('fetchPatterns should return all patterns with valid API key', async () => {
      const patterns = await client.fetchPatterns('javascript');
      
      expect(patterns).toHaveLength(2);
      expect(patterns[0].id).toBe('js-sql-injection');
      expect(patterns[1].id).toBe('js-xss');
    });
    
    test('fetchPatterns without API key should return demo patterns only', async () => {
      // Temporarily clear API key env var
      const originalApiKey = process.env.RSOLV_API_KEY;
      delete process.env.RSOLV_API_KEY;
      
      // Create client without API key
      const unauthClient = new PatternAPIClient({ 
        apiUrl: 'https://api.test.com'
      });
      
      // Mock demo patterns response
      fetchMock = vi.fn(() => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          patterns: [mockPatternsWithoutTiers[0]], // Only one demo pattern
          metadata: {
            language: 'javascript',
            count: 1,
            access_level: 'demo'
          }
        })
      }));
      global.fetch = fetchMock;
      
      const patterns = await unauthClient.fetchPatterns('javascript');
      
      expect(patterns).toHaveLength(1);
      // Should not have Authorization header
      const headers = fetchMock.mock.calls[0][1]?.headers || {};
      expect(headers['Authorization']).toBeUndefined();
      
      // Restore API key
      if (originalApiKey) {
        process.env.RSOLV_API_KEY = originalApiKey;
      }
    });
    
    test('deprecated fetchPatternsByTier should still work for backward compatibility', async () => {
      const patterns = await client.fetchPatternsByTier('javascript', 'public');
      
      // Should call fetchPatterns internally
      expect(patterns).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      
      // Should not pass tier to API
      const [url] = fetchMock.mock.calls[0];
      expect(url).not.toContain('tier=public');
    });
    
    test('PatternResponse type should not require tier fields', async () => {
      // This test verifies that the response parsing works without tier fields
      const response = {
        patterns: mockPatternsWithoutTiers,
        metadata: {
          language: 'javascript',
          count: 2,
          format: 'standard',
          enhanced: false,
          access_level: 'full'
        }
        // Note: No accessible_tiers or tier fields
      };
      
      fetchMock = vi.fn(() => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => response
      }));
      global.fetch = fetchMock;
      
      const patterns = await client.fetchPatterns('javascript');
      expect(patterns).toBeDefined();
      expect(patterns).toHaveLength(2);
    });
    
    test('error messages should not mention tiers', async () => {
      // Create client without fallback to ensure error is thrown
      const clientNoFallback = new PatternAPIClient({ 
        apiUrl: 'https://api.test.com',
        apiKey: 'test-api-key',
        fallbackToLocal: false
      });
      
      fetchMock = vi.fn(() => Promise.resolve({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ error: 'Invalid API key' })
      }));
      global.fetch = fetchMock;
      
      await expect(clientNoFallback.fetchPatterns('javascript')).rejects.toThrow(
        /Failed to fetch patterns.*403.*Forbidden/
      );
      
      // Should not throw tier-related errors
      try {
        await clientNoFallback.fetchPatterns('javascript');
      } catch (error: any) {
        expect(error.message).not.toMatch(/tier|upgrade|access level/i);
      }
    });
  });
  
  describe('Pattern counting without tiers', () => {
    test('should return total pattern count across all languages', async () => {
      // Mock responses for different languages
      const languageCounts = {
        javascript: 30,
        python: 12,
        ruby: 20,
        java: 17,
        elixir: 28,
        php: 25
      };
      
      fetchMock = vi.fn((url: string) => {
        const language = new URL(url).searchParams.get('language');
        const count = languageCounts[language as keyof typeof languageCounts] || 0;
        
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            patterns: Array(count).fill(mockPatternsWithoutTiers[0]),
            metadata: {
              language,
              count,
              access_level: 'full'
            }
          })
        });
      });
      global.fetch = fetchMock;
      
      // Fetch patterns for all languages
      let totalCount = 0;
      for (const lang of Object.keys(languageCounts)) {
        const patterns = await client.fetchPatterns(lang);
        totalCount += patterns.length;
      }
      
      // Should be around 132 language patterns (not including framework patterns)
      expect(totalCount).toBe(132);
    });
  });
});