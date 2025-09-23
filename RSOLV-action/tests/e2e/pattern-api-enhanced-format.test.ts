import { describe, it, expect, beforeAll } from '@jest/globals';
import { PatternAPIClient } from '../../src/security/pattern-api-client.js';
import { config } from 'dotenv';
import { join } from 'path';

/**
 * RFC-032 Phase 2.3: E2E Test for pattern fetching with enhanced format
 * 
 * This test verifies that the pattern API client can:
 * 1. Request enhanced format patterns
 * 2. Receive JSON with serialized regex objects
 * 3. Successfully reconstruct regex patterns
 * 4. Handle AST and context rules with regex
 */

// Load environment variables
config({ path: join(process.cwd(), '.env.test') });

describe('Pattern API Enhanced Format E2E', () => {
  let client: PatternAPIClient;
  const testApiUrl = process.env.RSOLV_API_URL || 'http://localhost:4000';
  const testApiKey = process.env.RSOLV_API_KEY || 'test-key';

  beforeAll(() => {
    client = new PatternAPIClient({
      apiUrl: testApiUrl,
      apiKey: testApiKey,
      cacheEnabled: false // Disable cache for testing
    });
  });

  describe('Enhanced Format Pattern Fetching', () => {
    it('should fetch JavaScript patterns in enhanced format', async () => {
      // Skip if no API is available
      const health = await client.checkHealth();
      if (health.status !== 'healthy') {
        console.log('Skipping E2E test - API not available');
        return;
      }

      const patterns = await client.fetchPatterns('javascript');
      
      // Should have patterns
      expect(patterns.length).toBeGreaterThan(0);
      
      // Find a pattern that should have enhanced features
      const evalPattern = patterns.find(p => p.id === 'js-eval-usage' || p.name.includes('eval'));
      
      if (evalPattern) {
        // Verify regex patterns were reconstructed
        expect(evalPattern.patterns.regex).toBeDefined();
        expect(evalPattern.patterns.regex.length).toBeGreaterThan(0);
        
        // Each regex should be a RegExp instance
        evalPattern.patterns.regex.forEach(regex => {
          expect(regex).toBeInstanceOf(RegExp);
          expect(typeof regex.source).toBe('string');
          expect(typeof regex.flags).toBe('string');
        });
        
        // Check for AST rules (if present)
        if (evalPattern.astRules) {
          expect(typeof evalPattern.astRules).toBe('object');
          
          // If AST rules contain regex, they should be reconstructed
          const checkForRegex = (obj: any): void => {
            if (obj instanceof RegExp) {
              expect(obj.source).toBeDefined();
              expect(obj.flags).toBeDefined();
            } else if (obj && typeof obj === 'object') {
              Object.values(obj).forEach(checkForRegex);
            }
          };
          
          checkForRegex(evalPattern.astRules);
        }
        
        // Check for context rules (if present)
        if (evalPattern.contextRules) {
          expect(typeof evalPattern.contextRules).toBe('object');
          
          // If context rules contain regex (e.g., exclude_paths), they should be reconstructed
          if (evalPattern.contextRules.exclude_paths) {
            evalPattern.contextRules.exclude_paths.forEach((path: any) => {
              if (path instanceof RegExp) {
                expect(path.source).toBeDefined();
                expect(path.flags).toBeDefined();
              }
            });
          }
        }
      }
    });

    it('should handle patterns with complex regex flags', async () => {
      const health = await client.checkHealth();
      if (health.status !== 'healthy') {
        console.log('Skipping E2E test - API not available');
        return;
      }

      const patterns = await client.fetchPatterns('javascript');
      
      // Look for patterns with various flag combinations
      const patternsWithFlags = patterns.filter(p => 
        p.patterns.regex.some(r => r.flags.length > 0)
      );
      
      expect(patternsWithFlags.length).toBeGreaterThan(0);
      
      // Verify flag combinations work correctly
      const flagCombinations = new Set<string>();
      patternsWithFlags.forEach(pattern => {
        pattern.patterns.regex.forEach(regex => {
          if (regex.flags) {
            flagCombinations.add(regex.flags);
          }
        });
      });
      
      // Common flag combinations should work
      Array.from(flagCombinations).forEach(flags => {
        // Verify flags are valid JavaScript regex flags
        expect(flags).toMatch(/^[gimsuy]*$/);
      });
    });

    it('should maintain backward compatibility with standard format', async () => {
      const health = await client.checkHealth();
      if (health.status !== 'healthy') {
        console.log('Skipping E2E test - API not available');
        return;
      }

      // Create a client that doesn't request enhanced format
      const standardClient = new PatternAPIClient({
        apiUrl: testApiUrl.replace('&format=enhanced', ''),
        apiKey: testApiKey,
        cacheEnabled: false
      });

      const patterns = await standardClient.fetchPatterns('javascript');
      
      // Should still work with standard format
      expect(patterns.length).toBeGreaterThan(0);
      
      // Patterns should have regex
      const samplePattern = patterns[0];
      expect(samplePattern.patterns.regex).toBeDefined();
      expect(samplePattern.patterns.regex.length).toBeGreaterThan(0);
      
      // Each regex should still be a RegExp instance
      samplePattern.patterns.regex.forEach(regex => {
        expect(regex).toBeInstanceOf(RegExp);
      });
    });

    it('should handle demo patterns without API key', async () => {
      const health = await client.checkHealth();
      if (health.status !== 'healthy') {
        console.log('Skipping E2E test - API not available');
        return;
      }

      // Create client without API key
      const demoClient = new PatternAPIClient({
        apiUrl: testApiUrl,
        apiKey: undefined,
        cacheEnabled: false
      });

      const patterns = await demoClient.fetchPatterns('javascript');
      
      // Should get demo patterns
      expect(patterns.length).toBeGreaterThan(0);
      
      // Demo patterns should also work with reconstruction
      patterns.forEach(pattern => {
        expect(pattern.patterns.regex).toBeDefined();
        pattern.patterns.regex.forEach(regex => {
          expect(regex).toBeInstanceOf(RegExp);
        });
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const errorClient = new PatternAPIClient({
        apiUrl: 'http://localhost:9999', // Non-existent server
        fallbackToLocal: false,
        cacheEnabled: false
      });

      await expect(errorClient.fetchPatterns('javascript')).rejects.toThrow();
    });

    it('should fall back to local patterns when API fails', async () => {
      const fallbackClient = new PatternAPIClient({
        apiUrl: 'http://localhost:9999', // Non-existent server
        fallbackToLocal: true,
        cacheEnabled: false
      });

      const patterns = await fallbackClient.fetchPatterns('javascript');
      
      // Should return empty array (or local patterns if implemented)
      expect(Array.isArray(patterns)).toBe(true);
    });
  });
});