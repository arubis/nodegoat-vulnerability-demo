import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  LocalPatternSource, 
  ApiPatternSource, 
  HybridPatternSource,
  createPatternSource 
} from './pattern-source.js';
import { VulnerabilityType } from './types.js';

// Mock the logger module
vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(() => {}),
    info: vi.fn(() => {}),
    warn: vi.fn(() => {}),
    error: vi.fn(() => {})
  }
}));

// Save original fetch
const originalFetch = global.fetch;

describe('LocalPatternSource', () => {
  let source: LocalPatternSource;

  beforeEach(() => {
    source = new LocalPatternSource();
  });

  describe('getPatternsByLanguage', () => {
    it('should return JavaScript patterns', async () => {
      const patterns = await source.getPatternsByLanguage('javascript');
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].languages).toContain('javascript');
    });

    it('should return TypeScript patterns (same as JavaScript)', async () => {
      const jsPatterns = await source.getPatternsByLanguage('javascript');
      const tsPatterns = await source.getPatternsByLanguage('typescript');
      expect(tsPatterns).toEqual(jsPatterns);
    });

    it('should return empty array for unsupported language', async () => {
      const patterns = await source.getPatternsByLanguage('cobol');
      expect(patterns).toEqual([]);
    });

    it('should handle case-insensitive language names', async () => {
      const patterns1 = await source.getPatternsByLanguage('PYTHON');
      const patterns2 = await source.getPatternsByLanguage('python');
      expect(patterns1).toEqual(patterns2);
    });
  });

  describe('getPatternsByType', () => {
    it('should return patterns of specific type', async () => {
      const patterns = await source.getPatternsByType(VulnerabilityType.SQL_INJECTION);
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.every(p => p.type === VulnerabilityType.SQL_INJECTION)).toBe(true);
    });

    it('should return patterns from all languages', async () => {
      const xssPatterns = await source.getPatternsByType(VulnerabilityType.XSS);
      const languages = new Set(xssPatterns.flatMap(p => p.languages));
      expect(languages.size).toBeGreaterThan(1);
    });
  });

  describe('getAllPatterns', () => {
    it('should return minimal fallback patterns', async () => {
      const patterns = await source.getAllPatterns();
      expect(patterns.length).toBeLessThan(25); // Updated for expanded minimal patterns
      
      // Check that we have basic patterns for common languages
      const languages = new Set(patterns.flatMap(p => p.languages));
      expect(languages.has('javascript')).toBe(true);
    });
  });
});

describe('ApiPatternSource', () => {
  let source: ApiPatternSource;
  let mockFetchPatterns: any;

  beforeEach(() => {
    // Mock global fetch
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ patterns: [] })
    }));
  });

  afterEach(() => {
    // Restore fetch
    global.fetch = originalFetch;
  });

  describe('getPatternsByLanguage', () => {
    it('should fetch patterns from API', async () => {
      const mockPatterns = [
        { id: 'test-1', type: VulnerabilityType.XSS, languages: ['javascript'] },
        { id: 'test-2', type: VulnerabilityType.SQL_INJECTION, languages: ['javascript'] }
      ];
      
      // Mock with specific response
      global.fetch = vi.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ 
          count: 2,
          patterns: mockPatterns.map(p => ({
            ...p,
            type: p.type === VulnerabilityType.XSS ? 'xss' : 'sql_injection',
            severity: 'high',
            patterns: ['test.*pattern'],
            description: 'Test pattern',
            recommendation: 'Fix it',
            cwe_id: 'CWE-79',
            owasp_category: 'A03:2021',
            test_cases: { vulnerable: [], safe: [] }
          }))
        })
      }));
      
      source = new ApiPatternSource('test-api-key');
      const patterns = await source.getPatternsByLanguage('javascript');
      
      expect(patterns.length).toBe(2);
      expect(patterns[0].type).toBe(VulnerabilityType.XSS);
    });

    it('should handle API errors', async () => {
      // Mock with error response
      global.fetch = vi.fn(() => Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      }));
      
      source = new ApiPatternSource('test-api-key');
      await expect(source.getPatternsByLanguage('python')).rejects.toThrow('Failed to fetch patterns: 500 Internal Server Error');
    });
  });

  describe('getAllPatterns', () => {
    it('should fetch patterns for all supported languages', async () => {
      const calls: string[] = [];
      
      // Mock to track calls - capture the query params
      global.fetch = vi.fn((url: string) => {
        const urlObj = new URL(url, 'http://example.com'); // Parse as URL
        const language = urlObj.searchParams.get('language');
        if (language) {
          calls.push(language);
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ patterns: [] })
        });
      });
      
      source = new ApiPatternSource('test-api-key');
      await source.getAllPatterns();
      
      // Should be called for each supported language  
      expect(calls).toContain('javascript');
      expect(calls).toContain('python');
      expect(calls).toContain('ruby');
      expect(calls).toContain('java');
      expect(calls).toContain('php');
      expect(calls).toContain('elixir');
    });

    it('should continue fetching even if some languages fail', async () => {
      // Mock with mixed success/failure
      global.fetch = vi.fn((url: string) => {
        if (url.includes('javascript')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ 
              patterns: [{
                id: 'js-1',
                type: 'xss',
                severity: 'high',
                patterns: ['test'],
                languages: ['javascript'],
                description: 'Test',
                recommendation: 'Fix',
                cwe_id: 'CWE-79',
                owasp_category: 'A03:2021',
                test_cases: { vulnerable: [], safe: [] }
              }]
            })
          });
        }
        if (url.includes('python')) {
          return Promise.reject(new Error('Python failed'));
        }
        if (url.includes('ruby')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ 
              patterns: [{
                id: 'ruby-1',
                type: 'sql_injection',
                severity: 'high',
                patterns: ['test'],
                languages: ['ruby'],
                description: 'Test',
                recommendation: 'Fix',
                cwe_id: 'CWE-89',
                owasp_category: 'A03:2021',
                test_cases: { vulnerable: [], safe: [] }
              }]
            })
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ patterns: [] })
        });
      });
      
      source = new ApiPatternSource('test-api-key');
      const patterns = await source.getAllPatterns();
      
      expect(patterns).toHaveLength(2); // js-1 and ruby-1
    });
  });
});

describe('HybridPatternSource', () => {
  beforeEach(() => {
    // Mock fetch for API calls
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ patterns: [] })
    }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should use API source when available', async () => {
    const apiPatterns = [{
      id: 'api-1',
      type: 'xss',
      severity: 'high',
      patterns: ['test'],
      languages: ['javascript'],
      description: 'Test',
      recommendation: 'Fix',
      cwe_id: 'CWE-79',
      owasp_category: 'A03:2021',
      test_cases: { vulnerable: [], safe: [] }
    }];
    
    // Mock successful API
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ patterns: apiPatterns })
    }));
    
    const source = new HybridPatternSource('test-api-key');
    const patterns = await source.getPatternsByLanguage('javascript');
    
    expect(patterns.length).toBe(1);
    expect(patterns[0].id).toBe('api-1');
  });

  it('should fall back to local source on API error', async () => {
    // Mock API failure
    global.fetch = vi.fn(() => Promise.reject(new Error('API Error')));
    
    const source = new HybridPatternSource('test-api-key');
    const patterns = await source.getPatternsByLanguage('javascript');
    
    // Should get local patterns
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].languages).toContain('javascript');
  });
});

describe('createPatternSource', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should create LocalPatternSource when USE_LOCAL_PATTERNS is true', () => {
    process.env.USE_LOCAL_PATTERNS = 'true';
    process.env.RSOLV_API_KEY = 'test-key'; // Should be ignored
    
    const source = createPatternSource();
    
    expect(source).toBeInstanceOf(LocalPatternSource);
  });

  it('should create HybridPatternSource when API key is provided', () => {
    process.env.RSOLV_API_KEY = 'test-api-key';
    delete process.env.USE_LOCAL_PATTERNS;
    
    const source = createPatternSource();
    
    expect(source).toBeInstanceOf(HybridPatternSource);
  });

  it('should create LocalPatternSource when no API key is provided', () => {
    delete process.env.RSOLV_API_KEY;
    delete process.env.USE_LOCAL_PATTERNS;
    
    const source = createPatternSource();
    
    expect(source).toBeInstanceOf(LocalPatternSource);
  });

  it('should pass API URL to HybridPatternSource', () => {
    process.env.RSOLV_API_KEY = 'test-key';
    process.env.RSOLV_API_URL = 'https://custom.api/patterns';
    
    const source = createPatternSource();
    
    expect(source).toBeInstanceOf(HybridPatternSource);
    // The API URL will be used internally by the PatternAPIClient
  });
});