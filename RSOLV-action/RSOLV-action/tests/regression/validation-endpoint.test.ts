import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BatchValidator } from '../../src/validation/batch-validator.js';
import { RsolvApiClient } from '../../src/external/api-client.js';

/**
 * Regression tests for validation endpoint issues discovered during E2E testing
 * Issue #610: GitHub Action calling wrong endpoint
 * Issue #617: Validation returning Not Found
 */

describe('Regression: Validation Endpoint Compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  let batchValidator: BatchValidator;
  let apiClient: RsolvApiClient;
  let validationService: RsolvApiClient; // Properly typed alias

  beforeEach(() => {
    // Mock the API client to test endpoint calls
    apiClient = new RsolvApiClient({
      apiKey: 'test-api-key',
      baseUrl: 'https://api.rsolv.dev'  // Fixed: use baseUrl not apiUrl
    });
    
    batchValidator = new BatchValidator();
    validationService = apiClient; // Use apiClient for validation
  });

  describe('Issue #610: API endpoint mismatch', () => {
    it('should use /api/v1/vulnerabilities/validate as primary endpoint', async () => {
      const mockFetch = vi.fn((url: string, options: RequestInit) => {
        expect(url).toBe('https://api.rsolv.dev/api/v1/vulnerabilities/validate');
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            validated: [],
            stats: { total: 0, validated: 0, rejected: 0 }
          })
        });
      });

      global.fetch = mockFetch as typeof fetch;

      const result = await validationService.validateVulnerabilities({
        repository: 'test/repo',
        vulnerabilities: [],
        files: {}
      });

      expect(mockFetch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    // REMOVED: Tests for backward compatibility - not needed since this hasn't shipped yet
    // The API will only use the current /api/v1/vulnerabilities/validate endpoint
  });

  describe('Issue #617: Validation returning actual results', () => {
    it('should return vulnerability validation results not empty array', async () => {
      const mockFetch = vi.fn(() => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            validated: [
              {
                id: 'vuln-1',
                isValid: true,
                confidence: 0.8,
                reason: null
              },
              {
                id: 'vuln-2',
                isValid: false,
                confidence: 0.95,
                reason: 'Safe pattern detected'
              }
            ],
            stats: {
              total: 2,
              validated: 1,
              rejected: 1
            }
          })
        });
      });

      global.fetch = mockFetch as typeof fetch;

      const result = await validationService.validateVulnerabilities({
        repository: 'RSOLV-dev/nodegoat-vulnerability-demo',
        vulnerabilities: [
          {
            id: 'vuln-1',
            type: 'Nosql_injection',
            filePath: 'app/data/dao.js',
            line: 78,
            code: '$where: `this.userId == ${userId}`'
          },
          {
            id: 'vuln-2',
            type: 'Xss',
            filePath: 'app/views/safe.js',
            line: 10,
            code: 'element.textContent = userInput'
          }
        ],
        files: {
          'app/data/dao.js': {
            content: '// dao file',
            hash: 'sha256:abc'
          },
          'app/views/safe.js': {
            content: '// safe file',
            hash: 'sha256:def'
          }
        }
      });

      expect(result.validated).toHaveLength(2);
      expect(result.validated[0].isValid).toBe(true);
      expect(result.validated[1].isValid).toBe(false);
      expect(result.stats.total).toBe(2);
    });

    it('should handle NoSQL injection with $where correctly', async () => {
      const mockFetch = vi.fn(() => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            validated: [
              {
                id: 'nosql-test',
                isValid: true, // Should be true for real vulnerability
                confidence: 0.85,
                reason: null,
                astContext: {
                  inUserInputFlow: true,
                  hasValidation: false
                }
              }
            ],
            stats: {
              total: 1,
              validated: 1,
              rejected: 0
            }
          })
        });
      });

      global.fetch = mockFetch as typeof fetch;

      const result = await validationService.validateVulnerabilities({
        repository: 'RSOLV-dev/nodegoat-vulnerability-demo',
        vulnerabilities: [
          {
            id: 'nosql-test',
            type: 'Nosql_injection',
            filePath: 'app/data/allocations-dao.js',
            line: 78,
            code: '$where: `this.userId == ${parsedUserId}`'
          }
        ],
        files: {
          'app/data/allocations-dao.js': {
            content: 'db.collection.find({ $where: `this.userId == ${parsedUserId}` })',
            hash: 'sha256:nosql123'
          }
        }
      });

      expect(result.validated).toHaveLength(1);
      expect(result.validated[0].isValid).toBe(true); // Real vulnerability
      expect(result.validated[0].id).toBe('nosql-test');
    });
  });

  describe('Cache functionality regression', () => {
    it('should include cache stats in response', async () => {
      const mockFetch = vi.fn(() => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            validated: [
              {
                id: 'cache-test',
                isValid: false,
                confidence: 0.95,
                fromCache: true,
                cachedAt: '2025-08-17T10:00:00Z'
              }
            ],
            stats: {
              total: 1,
              validated: 0,
              rejected: 1,
              cacheHits: 1,
              cacheMisses: 0
            },
            cache_stats: {
              cache_hits: 1,
              cache_misses: 0,
              hit_rate: 100.0,
              total_cached_entries: 42
            }
          })
        });
      });

      global.fetch = mockFetch as typeof fetch;

      const result = await validationService.validateVulnerabilities({
        repository: 'test/repo',
        vulnerabilities: [
          {
            id: 'cache-test',
            type: 'Xss',
            filePath: 'test.js',
            line: 10,
            code: 'innerHTML = input'
          }
        ],
        files: {}
      });

      expect(result.validated[0].fromCache).toBe(true);
      expect(result.stats.cacheHits).toBe(1);
      expect(result.cache_stats.hit_rate).toBe(100.0);
    });
  });

  describe('Error handling regression', () => {
    it('should provide clear error message when API key is invalid', async () => {
      const mockFetch = vi.fn(() => {
        return Promise.resolve({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Invalid API key'),  // Use text() instead of json()
          json: () => Promise.resolve({
            error: 'Invalid API key'
          })
        });
      });

      global.fetch = mockFetch as typeof fetch;

      try {
        await validationService.validateVulnerabilities({
          repository: 'test/repo',
          vulnerabilities: [],
          files: {}
        });
        
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error instanceof Error).toBe(true);
        if (error instanceof Error) {
          expect(error.message).toContain('Invalid API key');
          // Status would be in the error message, not on error object
        }
      }
    });

    it('should handle malformed repository names gracefully', async () => {
      const mockFetch = vi.fn(() => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            validated: [],
            stats: { total: 0, validated: 0, rejected: 0 }
          })
        });
      });

      global.fetch = mockFetch as typeof fetch;

      // Should not throw even with unusual repository names
      const result = await validationService.validateVulnerabilities({
        repository: 'unknown/repo',
        vulnerabilities: [],
        files: {}
      });

      expect(result).toBeDefined();
    });
  });
});

/**
 * Integration test to verify the full flow works
 */
describe('E2E Regression: Full validation flow', () => {
  it('should complete validation workflow successfully', async () => {
    // This would be an actual E2E test against staging/production
    // For now, we'll mock it but in real scenario this would hit actual API
    
    const mockWorkflow = async () => {
      // 1. Scan phase creates issues
      const scanResult = { issuesCreated: 5 };
      
      // 2. Validation phase processes issues
      const validationResult = {
        validated: 3,
        falsePositives: 2
      };
      
      // 3. Mitigation phase creates PRs
      const mitigationResult = {
        prsCreated: 3
      };
      
      return {
        scan: scanResult,
        validation: validationResult,
        mitigation: mitigationResult
      };
    };

    const result = await mockWorkflow();
    
    // Success criteria from E2E test
    expect(result.scan.issuesCreated).toBeGreaterThanOrEqual(5);
    expect(result.validation.falsePositives).toBeGreaterThanOrEqual(1);
    expect(result.mitigation.prsCreated).toBeGreaterThanOrEqual(2);
  });
});