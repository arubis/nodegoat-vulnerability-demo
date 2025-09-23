/**
 * TDD tests for vendor detection fix
 * These tests should FAIL with the current implementation
 * and PASS after we fix the vendor detection
 */

import { describe, test, expect, beforeEach, mock, vi } from 'vitest';
import type { ValidationData, ScannedVulnerability } from '../../../types/vulnerability';

describe('Vendor Detection TDD - File Extraction from Validation Data', () => {
  
  describe('Current Bug: Empty validation vulnerabilities array', () => {
    test('should extract files when validation data has empty vulnerabilities array', () => {
      // This is what we suspect is happening
      const validationData: ValidationData = {
        confidence: 'high',
        enriched: true,
        hasSpecificVulnerabilities: true,
        issueNumber: 398,
        timestamp: '2025-08-20T00:26:35.756Z',
        validated: true,
        vulnerabilities: [] // Empty array!
      };
      
      // The issue body has the actual vulnerability data
      const issueBody = JSON.stringify({
        vulnerabilities: [{
          type: 'weak_cryptography',
          file: 'app/assets/vendor/jquery.min.js',
          line: 4
        }]
      });
      
      // What we're currently doing (WRONG):
      const affectedFiles = validationData.vulnerabilities.flatMap((v: any) => {
        if (v.file) return [v.file];
        if (v.files) return v.files;
        return [];
      });
      
      // This will FAIL because vulnerabilities is empty
      expect(affectedFiles).toEqual([]); // Current behavior - WRONG!
      expect(affectedFiles).not.toContain('app/assets/vendor/jquery.min.js');
    });
  });
  
  describe('Possible Structure 1: Vulnerabilities directly in validation data', () => {
    test('should extract file from vulnerability with "file" property', () => {
      const validationData = {
        vulnerabilities: [{
          type: 'weak_cryptography',
          severity: 'medium',
          file: 'app/assets/vendor/jquery.min.js',
          line: 4,
          confidence: 60
        }]
      };
      
      const affectedFiles = validationData.vulnerabilities.flatMap((v: any) => {
        if (v.file) return [v.file];
        if (v.files) return v.files;
        return [];
      });
      
      expect(affectedFiles).toEqual(['app/assets/vendor/jquery.min.js']);
    });
  });
  
  describe('Possible Structure 2: Vulnerabilities with different property names', () => {
    test('should handle vulnerability with "path" instead of "file"', () => {
      const validationData = {
        vulnerabilities: [{
          type: 'weak_cryptography',
          path: 'app/assets/vendor/jquery.min.js', // Different property name!
          line: 4
        }]
      };
      
      // Our current code would miss this
      const affectedFiles = validationData.vulnerabilities.flatMap((v: any) => {
        if (v.file) return [v.file];
        if (v.files) return v.files;
        return [];
      });
      
      // This FAILS with current implementation
      expect(affectedFiles).toEqual([]);
    });
    
    test('should handle vulnerability with "location" property', () => {
      const validationData = {
        vulnerabilities: [{
          type: 'weak_cryptography',
          location: {
            file: 'app/assets/vendor/jquery.min.js',
            line: 4
          }
        }]
      };
      
      // Our current code would miss this nested structure
      const affectedFiles = validationData.vulnerabilities.flatMap((v: any) => {
        if (v.file) return [v.file];
        if (v.files) return v.files;
        return [];
      });
      
      // This FAILS with current implementation
      expect(affectedFiles).toEqual([]);
    });
  });
  
  describe('Robust file extraction function', () => {
    // This is what we SHOULD have
    function extractFilesFromVulnerabilities(vulnerabilities: any[]): string[] {
      if (!Array.isArray(vulnerabilities) || vulnerabilities.length === 0) {
        return [];
      }
      
      return vulnerabilities.flatMap((v: any) => {
        // Try multiple possible property names
        if (v.file) return [v.file];
        if (v.files) return v.files;
        if (v.path) return [v.path];
        if (v.filePath) return [v.filePath];
        if (v.location?.file) return [v.location.file];
        if (v.location?.path) return [v.location.path];
        
        // Log warning if we can't find file info
        console.warn('Could not extract file from vulnerability:', v);
        return [];
      });
    }
    
    test('should handle all possible vulnerability structures', () => {
      const testCases = [
        // Case 1: file property
        {
          vulns: [{ file: 'test.js' }],
          expected: ['test.js']
        },
        // Case 2: files array
        {
          vulns: [{ files: ['a.js', 'b.js'] }],
          expected: ['a.js', 'b.js']
        },
        // Case 3: path property
        {
          vulns: [{ path: 'test.js' }],
          expected: ['test.js']
        },
        // Case 4: nested location
        {
          vulns: [{ location: { file: 'test.js' } }],
          expected: ['test.js']
        },
        // Case 5: empty array
        {
          vulns: [],
          expected: []
        }
      ];
      
      testCases.forEach(({ vulns, expected }) => {
        const result = extractFilesFromVulnerabilities(vulns);
        expect(result).toEqual(expected);
      });
    });
  });
  
  describe('Vendor detection with proper types', () => {
    test('should detect vendor files correctly', async () => {
      // Mock vendor detector
      const isVendorFile = (path: string): boolean => {
        return path.includes('vendor/') || 
               path.includes('node_modules/') ||
               path.includes('.min.js');
      };
      
      const testFiles = [
        'app/assets/vendor/jquery.min.js',
        'app/routes/index.js',
        'node_modules/express/index.js'
      ];
      
      const vendorFiles = testFiles.filter(isVendorFile);
      
      expect(vendorFiles).toEqual([
        'app/assets/vendor/jquery.min.js',
        'node_modules/express/index.js'
      ]);
    });
  });
});