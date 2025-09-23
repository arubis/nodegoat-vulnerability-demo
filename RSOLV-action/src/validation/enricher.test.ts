import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ValidationEnricher as IssueEnricher } from './enricher';

/**
 * Regression test for the /ast/validate endpoint issue
 * Issue: GitHub Action v3.5.2 is calling /ast/validate instead of /api/v1/ast/validate
 * This causes 404 errors in production
 */
describe('IssueEnricher - Validation Endpoint Regression', () => {
  let enricher: IssueEnricher;
  
  beforeEach(() => {
    // Set up environment
    process.env.RSOLV_API_URL = 'https://api.rsolv.dev';
    process.env.RSOLV_API_KEY = 'test-api-key';
    
    enricher = new IssueEnricher({
      rsolvApiKey: 'test-api-key',
      apiUrl: 'https://api.rsolv.dev'
    });
  });

  describe('AST validation endpoint', () => {
    it('should call /api/v1/ast/validate NOT /ast/validate', async () => {
      let capturedUrl = '';
      
      // Mock fetch to capture the URL being called
      const mockFetch = vi.fn((url: string, options: any) => {
        capturedUrl = url;
        
        // This is what happens in production - /ast/validate returns 404
        if (url === 'https://api.rsolv.dev/ast/validate') {
          return Promise.resolve({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            json: () => Promise.resolve({ error: 'Not Found' })
          });
        }
        
        // The correct endpoint would work
        if (url === 'https://api.rsolv.dev/api/v1/ast/validate') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
              validated: [],
              stats: { total: 0, validated: 0, rejected: 0 }
            })
          });
        }
        
        return Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found'
        });
      });
      
      // Replace global fetch
      global.fetch = mockFetch as any;
      
      // Try to validate
      const result = await enricher.validateWithAST(
        'test.js',
        'const x = userInput;',
        'xss'
      );
      
      // Check what URL was called
      expect(capturedUrl).not.toBe('https://api.rsolv.dev/ast/validate');
      expect(capturedUrl).toBe('https://api.rsolv.dev/api/v1/ast/validate');
      
      // Should get a result, not null (which indicates 404)
      expect(result).not.toBeNull();
    });
    
    it('fixed implementation correctly calls /api/v1/ast/validate', async () => {
      // This test verifies the FIXED behavior
      // The implementation now correctly calls the right endpoint
      
      let capturedUrl = '';
      const mockFetch = vi.fn((url: string) => {
        capturedUrl = url;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            validated: [],
            stats: { total: 0, validated: 0, rejected: 0 }
          })
        });
      });
      
      global.fetch = mockFetch as any;
      
      const result = await enricher.validateWithAST(
        'test.js',
        'const x = userInput;',
        'xss'
      );
      
      // Fixed implementation now calls the correct endpoint
      expect(capturedUrl).toBe('https://api.rsolv.dev/api/v1/ast/validate');
      
      // And returns a valid result
      expect(result).not.toBeNull();
    });
  });
  
  describe('API request format', () => {
    it('should send correct payload format for validation', async () => {
      let capturedBody: any = null;
      let capturedHeaders: any = null;
      
      const mockFetch = vi.fn((url: string, options: any) => {
        capturedBody = JSON.parse(options.body);
        capturedHeaders = options.headers;
        
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            validated: [{
              id: 'test-1',
              isValid: true,
              confidence: 0.8
            }]
          })
        });
      });
      
      global.fetch = mockFetch as any;
      
      await enricher.validateWithAST(
        'app/data/dao.js',
        '$where: `this.userId == ${userId}`',
        'nosql_injection'
      );
      
      // Check request body format
      expect(capturedBody).toHaveProperty('file');
      expect(capturedBody).toHaveProperty('content');
      expect(capturedBody).toHaveProperty('vulnerabilityType');
      
      expect(capturedBody.file).toBe('app/data/dao.js');
      expect(capturedBody.vulnerabilityType).toBe('nosql_injection');
      
      // Check headers
      expect(capturedHeaders['Content-Type']).toBe('application/json');
      expect(capturedHeaders['Authorization']).toBe('Bearer test-api-key');
    });
  });
  
  describe('Error handling', () => {
    it('should handle 404 gracefully and return null', async () => {
      const mockFetch = vi.fn(() => {
        return Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found'
        });
      });
      
      global.fetch = mockFetch as any;
      
      const result = await enricher.validateWithAST('test.js', 'code', 'xss');
      
      // Should return null, not throw
      expect(result).toBeNull();
    });
    
    it('should handle network errors gracefully', async () => {
      const mockFetch = vi.fn(() => {
        throw new Error('Network error');
      });
      
      global.fetch = mockFetch as any;
      
      const result = await enricher.validateWithAST('test.js', 'code', 'xss');
      
      // Should return null, not throw
      expect(result).toBeNull();
    });
  });
});

/**
 * Test to verify the fix works correctly
 */
describe('IssueEnricher - Fixed Implementation', () => {
  it('should successfully validate when using correct endpoint', async () => {
    const enricher = new IssueEnricher({
      rsolvApiKey: 'test-key',
      apiUrl: 'https://api.rsolv.dev'
    });
    
    const mockFetch = vi.fn((url: string) => {
      // Only the correct endpoint should work
      if (url === 'https://api.rsolv.dev/api/v1/ast/validate') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            validated: [{
              id: 'vuln-1',
              isValid: true,
              confidence: 0.85,
              reason: null
            }],
            stats: {
              total: 1,
              validated: 1,
              rejected: 0
            }
          })
        });
      }
      
      return Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });
    });
    
    global.fetch = mockFetch as any;
    
    // After fix, this should work
    const result = await enricher.validateWithAST(
      'app/data/allocations-dao.js',
      '$where: `this.userId == ${parsedUserId}`',
      'nosql_injection'
    );
    
    expect(result).not.toBeNull();
    expect(result.validated).toHaveLength(1);
    expect(result.validated[0].isValid).toBe(true);
  });
});