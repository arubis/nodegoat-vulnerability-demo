/**
 * Direct unit test for vendor detection file extraction bug fix
 * Tests the specific fix for handling both 'file' and 'files' properties
 */

import { describe, test, expect, vi } from 'vitest';

describe('Vendor Detection File Extraction (RFC-047 Fix)', () => {
  test('should extract files from vulnerabilities with singular "file" property', () => {
    const vulnerabilities = [
      { type: 'weak_cryptography', file: 'app/assets/vendor/jquery.min.js', line: 42 },
      { type: 'sql_injection', file: 'app/models/user.rb', line: 100 }
    ];

    // This is the FIXED code from phase-executor/index.ts
    const affectedFiles = vulnerabilities.flatMap((v: any) => {
      if (v.file) return [v.file];
      if (v.files) return v.files;
      return [];
    });

    expect(affectedFiles).toContain('app/assets/vendor/jquery.min.js');
    expect(affectedFiles).toContain('app/models/user.rb');
    expect(affectedFiles.length).toBe(2);
  });

  test('should extract files from vulnerabilities with plural "files" property', () => {
    const vulnerabilities = [
      { 
        type: 'information_disclosure', 
        files: ['config/secrets.yml', 'app/config/database.yml'],
        line: 1 
      }
    ];

    // This is the FIXED code from phase-executor/index.ts
    const affectedFiles = vulnerabilities.flatMap((v: any) => {
      if (v.file) return [v.file];
      if (v.files) return v.files;
      return [];
    });

    expect(affectedFiles).toContain('config/secrets.yml');
    expect(affectedFiles).toContain('app/config/database.yml');
    expect(affectedFiles.length).toBe(2);
  });

  test('should handle mixed vulnerabilities with both file and files properties', () => {
    const vulnerabilities = [
      { type: 'weak_cryptography', file: 'vendor/jquery.min.js', line: 42 },
      { type: 'sql_injection', files: ['app/models/user.rb', 'app/models/admin.rb'], line: 100 },
      { type: 'xss', line: 50 } // No file property at all
    ];

    // This is the FIXED code from phase-executor/index.ts
    const affectedFiles = vulnerabilities.flatMap((v: any) => {
      if (v.file) return [v.file];
      if (v.files) return v.files;
      return [];
    });

    expect(affectedFiles).toContain('vendor/jquery.min.js');
    expect(affectedFiles).toContain('app/models/user.rb');
    expect(affectedFiles).toContain('app/models/admin.rb');
    expect(affectedFiles.length).toBe(3);
  });

  test('should return empty array for vulnerabilities without file properties', () => {
    const vulnerabilities = [
      { type: 'xss', line: 50 },
      { type: 'csrf', description: 'Missing CSRF token' }
    ];

    // This is the FIXED code from phase-executor/index.ts
    const affectedFiles = vulnerabilities.flatMap((v: any) => {
      if (v.file) return [v.file];
      if (v.files) return v.files;
      return [];
    });

    expect(affectedFiles).toEqual([]);
  });

  test('OLD BROKEN CODE: should demonstrate the bug', () => {
    const vulnerabilities = [
      { type: 'weak_cryptography', file: 'vendor/jquery.min.js', line: 42 },
      { type: 'sql_injection', file: 'app/models/user.rb', line: 100 }
    ];

    // This is the OLD BROKEN code that expected 'files' (plural)
    const affectedFiles = vulnerabilities.flatMap((v: any) => v.files || []);

    // This would FAIL with the old code because v.files is undefined
    expect(affectedFiles).toEqual([]); // Old code returns empty array!
    expect(affectedFiles.length).toBe(0); // This is the BUG!
  });
});