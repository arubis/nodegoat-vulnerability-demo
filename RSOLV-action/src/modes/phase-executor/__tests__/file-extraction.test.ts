/**
 * Tests for the file extraction utility
 */

import { describe, test, expect, vi } from 'vitest';
import { extractFilesFromVulnerabilities } from '../utils/file-extraction';

describe('File Extraction from Vulnerabilities', () => {
  test('should extract from file property', () => {
    const vulns = [
      { type: 'xss', file: 'app/routes/index.js', line: 10 }
    ];
    
    const files = extractFilesFromVulnerabilities(vulns, 'TEST');
    expect(files).toEqual(['app/routes/index.js']);
  });
  
  test('should extract from files array', () => {
    const vulns = [
      { type: 'dos', files: ['file1.js', 'file2.js'], line: 10 }
    ];
    
    const files = extractFilesFromVulnerabilities(vulns, 'TEST');
    expect(files).toEqual(['file1.js', 'file2.js']);
  });
  
  test('should extract from path property', () => {
    const vulns = [
      { type: 'sql', path: 'db/query.js', line: 20 }
    ];
    
    const files = extractFilesFromVulnerabilities(vulns, 'TEST');
    expect(files).toEqual(['db/query.js']);
  });
  
  test('should extract from nested location', () => {
    const vulns = [
      { type: 'csrf', location: { file: 'auth/csrf.js', line: 5 } }
    ];
    
    const files = extractFilesFromVulnerabilities(vulns, 'TEST');
    expect(files).toEqual(['auth/csrf.js']);
  });
  
  test('should handle empty vulnerabilities', () => {
    const files = extractFilesFromVulnerabilities([], 'TEST');
    expect(files).toEqual([]);
  });
  
  test('should handle vulnerabilities with no file info', () => {
    const vulns = [
      { type: 'generic', severity: 'high' }
    ];
    
    const files = extractFilesFromVulnerabilities(vulns, 'TEST');
    expect(files).toEqual([]);
  });
  
  test('should deduplicate files', () => {
    const vulns = [
      { file: 'same.js' },
      { file: 'same.js' },
      { file: 'different.js' }
    ];
    
    const files = extractFilesFromVulnerabilities(vulns, 'TEST');
    expect(files).toEqual(['same.js', 'different.js']);
  });
  
  test('should handle mixed structures', () => {
    const vulns = [
      { file: 'single.js' },
      { files: ['multi1.js', 'multi2.js'] },
      { path: 'path.js' },
      { location: { file: 'nested.js' } },
      { nothing: 'here' }
    ];
    
    const files = extractFilesFromVulnerabilities(vulns, 'TEST');
    expect(files).toEqual(['single.js', 'multi1.js', 'multi2.js', 'path.js', 'nested.js']);
  });
});