import { describe, it, expect, vi } from 'vitest';
import { FileSelector } from '../file-selector.js';
import { FileSelectionOptions } from '../types.js';

describe('FileSelector', () => {
  const createTestFiles = (): Map<string, string> => {
    const files = new Map<string, string>();
    
    // Security-relevant files
    files.set('src/auth/login.ts', 'const password = req.body.password;');
    files.set('src/api/users.js', 'const token = generateToken();');
    files.set('src/controllers/admin.rb', 'def authenticate_admin');
    files.set('src/middleware/auth.py', 'def check_token(request):');
    
    // Regular files
    files.set('src/components/button.tsx', 'export const Button = () => {};');
    files.set('src/utils/format.js', 'export const formatDate = () => {};');
    
    // Test files (should be lower priority)
    files.set('src/__tests__/auth.test.ts', 'describe("auth", () => {});');
    files.set('src/auth/login.spec.js', 'test("login", () => {});');
    
    // Files to exclude
    files.set('node_modules/lodash/index.js', 'module.exports = {};');
    files.set('dist/bundle.js', 'minified code');
    files.set('coverage/report.html', '<html>');
    
    // Large file
    files.set('src/data/large.json', 'x'.repeat(100000));
    
    // Elixir files
    files.set('lib/auth/guardian.ex', 'defmodule Auth.Guardian do');
    files.set('lib/api/user_controller.ex', 'def create(conn, params) do');
    
    return files;
  };

  describe('selectFiles', () => {
    it('should respect maxFiles limit', () => {
      const files = createTestFiles();
      const options: FileSelectionOptions = {
        maxFiles: 5
      };
      
      const selected = FileSelector.selectFiles(files, options);
      expect(selected.length).toBeLessThanOrEqual(5);
    });

    it('should exclude default patterns', () => {
      const files = createTestFiles();
      const options: FileSelectionOptions = {
        maxFiles: 20
      };
      
      const selected = FileSelector.selectFiles(files, options);
      const paths = selected.map(f => f.path);
      
      expect(paths).not.toContain('node_modules/lodash/index.js');
      expect(paths).not.toContain('dist/bundle.js');
      expect(paths).not.toContain('coverage/report.html');
    });

    it('should filter by language when specified', () => {
      const files = createTestFiles();
      const options: FileSelectionOptions = {
        maxFiles: 10,
        languages: ['typescript', 'javascript']
      };
      
      const selected = FileSelector.selectFiles(files, options);
      
      for (const file of selected) {
        expect(['javascript', 'typescript']).toContain(file.language);
      }
    });

    it('should respect maxFileSize', () => {
      const files = createTestFiles();
      const options: FileSelectionOptions = {
        maxFiles: 20,
        maxFileSize: 1000 // 1KB
      };
      
      const selected = FileSelector.selectFiles(files, options);
      const paths = selected.map(f => f.path);
      
      expect(paths).not.toContain('src/data/large.json');
    });

    it('should prioritize changed files', () => {
      const files = createTestFiles();
      const changedFiles = ['src/utils/format.js', 'src/components/button.tsx'];
      const options: FileSelectionOptions = {
        maxFiles: 3,
        prioritizeChanges: true
      };
      
      const selected = FileSelector.selectFiles(files, options, changedFiles);
      const paths = selected.map(f => f.path);
      
      // Changed files should be in the selection
      expect(paths).toContain('src/utils/format.js');
      expect(paths).toContain('src/components/button.tsx');
    });

    it('should prioritize security-relevant files', () => {
      const files = createTestFiles();
      const options: FileSelectionOptions = {
        maxFiles: 5
      };
      
      const selected = FileSelector.selectFiles(files, options);
      const paths = selected.map(f => f.path);
      
      // Security files should be prioritized
      const securityFiles = paths.filter(p => 
        p.includes('auth') || 
        p.includes('api') || 
        p.includes('admin') ||
        p.includes('middleware')
      );
      
      expect(securityFiles.length).toBeGreaterThan(0);
    });

    it('should deprioritize test files', () => {
      const files = new Map<string, string>();
      files.set('src/auth/login.ts', 'const password = "";');
      files.set('src/auth/login.test.ts', 'test("login", () => {});');
      files.set('src/auth/login.spec.ts', 'describe("login", () => {});');
      files.set('src/api/handler.ts', 'export const handler = () => {};');
      
      const options: FileSelectionOptions = {
        maxFiles: 2
      };
      
      const selected = FileSelector.selectFiles(files, options);
      const paths = selected.map(f => f.path);
      
      expect(paths).toContain('src/auth/login.ts');
      expect(paths).toContain('src/api/handler.ts');
      expect(paths).not.toContain('src/auth/login.test.ts');
      expect(paths).not.toContain('src/auth/login.spec.ts');
    });

    it('should include all file metadata', () => {
      const files = new Map<string, string>();
      files.set('src/test.js', 'const x = 1;');
      
      const options: FileSelectionOptions = {
        maxFiles: 1
      };
      
      const selected = FileSelector.selectFiles(files, options);
      expect(selected.length).toBe(1);
      
      const file = selected[0];
      expect(file.path).toBe('src/test.js');
      expect(file.content).toBe('const x = 1;');
      expect(file.language).toBe('javascript');
      expect(file.size).toBe(12);
      expect(file.hash).toBeTruthy();
      expect(file.hash.length).toBe(64); // SHA256 hex
    });

    it('should handle custom exclude patterns', () => {
      const files = createTestFiles();
      const options: FileSelectionOptions = {
        maxFiles: 20,
        excludePatterns: [/button/, /format/]
      };
      
      const selected = FileSelector.selectFiles(files, options);
      const paths = selected.map(f => f.path);
      
      expect(paths).not.toContain('src/components/button.tsx');
      expect(paths).not.toContain('src/utils/format.js');
    });

    it('should detect Elixir files', () => {
      const files = createTestFiles();
      const options: FileSelectionOptions = {
        maxFiles: 20,
        languages: ['elixir']
      };
      
      const selected = FileSelector.selectFiles(files, options);
      
      expect(selected.length).toBe(2);
      expect(selected[0].language).toBe('elixir');
      expect(selected[1].language).toBe('elixir');
    });
  });

  describe('selectDiverseFiles', () => {
    it('should select files from multiple languages', () => {
      const files = createTestFiles();
      const options: FileSelectionOptions = {
        maxFiles: 6
      };
      
      const selected = FileSelector.selectDiverseFiles(files, options);
      const languages = new Set(selected.map(f => f.language));
      
      // Should have multiple languages represented
      expect(languages.size).toBeGreaterThan(3);
    });

    it('should distribute slots evenly across languages', () => {
      const files = new Map<string, string>();
      
      // Add 3 files per language
      for (let i = 0; i < 3; i++) {
        files.set(`src/file${i}.js`, 'js code');
        files.set(`src/file${i}.py`, 'py code');
        files.set(`src/file${i}.rb`, 'rb code');
      }
      
      const options: FileSelectionOptions = {
        maxFiles: 6
      };
      
      const selected = FileSelector.selectDiverseFiles(files, options);
      
      // Count files per language
      const langCounts = new Map<string, number>();
      for (const file of selected) {
        langCounts.set(file.language, (langCounts.get(file.language) || 0) + 1);
      }
      
      // Each language should have 2 files
      expect(langCounts.get('javascript')).toBe(2);
      expect(langCounts.get('python')).toBe(2);
      expect(langCounts.get('ruby')).toBe(2);
    });
  });
});