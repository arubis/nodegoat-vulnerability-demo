import { describe, it, expect, vi } from 'vitest';
import { getMinimalPatterns, getMinimalPatternsByLanguage } from '../minimal-patterns.js';
import { SecurityPattern, VulnerabilityType } from '../types.js';

describe('Pattern Factory', () => {
  describe('getMinimalPatterns', () => {
    it('should return patterns with valid RegExp objects', () => {
      const patterns = getMinimalPatterns();
      
      expect(patterns.length).toBeGreaterThan(0);
      
      // Check first pattern has regex
      const firstPattern = patterns[0];
      expect(firstPattern.patterns.regex).toBeDefined();
      expect(Array.isArray(firstPattern.patterns.regex)).toBe(true);
      
      // Verify regex objects are actual RegExp instances
      if (firstPattern.patterns.regex) {
        for (const regex of firstPattern.patterns.regex) {
          expect(regex).toBeInstanceOf(RegExp);
          expect(regex.test).toBeDefined();
          expect(typeof regex.test).toBe('function');
        }
      }
    });

    it('should return SQL injection patterns for JavaScript', () => {
      const patterns = getMinimalPatterns();
      const sqlPatterns = patterns.filter(p => 
        p.type === VulnerabilityType.SQL_INJECTION && 
        p.languages.includes('javascript')
      );
      
      expect(sqlPatterns.length).toBeGreaterThan(0);
      
      // Test pattern matching
      const sqlPattern = sqlPatterns[0];
      const vulnerableCode = `db.query("SELECT * FROM users WHERE id = " + req.params.id)`;
      
      let matched = false;
      if (sqlPattern.patterns.regex) {
        for (const regex of sqlPattern.patterns.regex) {
          if (regex.test(vulnerableCode)) {
            matched = true;
            break;
          }
        }
      }
      
      expect(matched).toBe(true);
    });

    it('should return Ruby SQL injection patterns', () => {
      const patterns = getMinimalPatterns();
      const rubyPatterns = patterns.filter(p => 
        p.id === 'ruby-sql-injection'
      );
      
      expect(rubyPatterns.length).toBe(1);
      
      const pattern = rubyPatterns[0];
      expect(pattern.patterns.regex).toBeDefined();
      expect(pattern.patterns.regex?.length).toBeGreaterThan(0);
      
      // Test Ruby SQL injection pattern
      const vulnerableRuby = `user = User.where("id = '#{params[:user][:id]}'")[0]`;
      
      let matched = false;
      if (pattern.patterns.regex) {
        for (const regex of pattern.patterns.regex) {
          regex.lastIndex = 0; // Reset regex
          if (regex.test(vulnerableRuby)) {
            matched = true;
            break;
          }
        }
      }
      
      expect(matched).toBe(true);
    });

    it('should return Python patterns', () => {
      const patterns = getMinimalPatterns();
      const pythonPatterns = patterns.filter(p => 
        p.languages.includes('python')
      );
      
      expect(pythonPatterns.length).toBeGreaterThan(0);
      
      // Check pickle pattern
      const picklePattern = pythonPatterns.find(p => p.id === 'python-pickle');
      expect(picklePattern).toBeDefined();
      
      if (picklePattern?.patterns.regex) {
        const vulnerableCode = 'admin = pickle.loads(token)';
        let matched = false;
        
        for (const regex of picklePattern.patterns.regex) {
          regex.lastIndex = 0;
          if (regex.test(vulnerableCode)) {
            matched = true;
            break;
          }
        }
        
        expect(matched).toBe(true);
      }
    });
  });

  describe('getMinimalPatternsByLanguage', () => {
    it('should filter patterns by language', () => {
      const rubyPatterns = getMinimalPatternsByLanguage('ruby');
      
      expect(rubyPatterns.length).toBeGreaterThan(0);
      
      // All patterns should include 'ruby' in languages
      for (const pattern of rubyPatterns) {
        expect(pattern.languages).toContain('ruby');
      }
    });

    it('should return patterns with working regex', () => {
      const pythonPatterns = getMinimalPatternsByLanguage('python');
      
      expect(pythonPatterns.length).toBeGreaterThan(0);
      
      // Find SQL injection pattern
      const sqlPattern = pythonPatterns.find(p => 
        p.type === VulnerabilityType.SQL_INJECTION
      );
      
      expect(sqlPattern).toBeDefined();
      
      if (sqlPattern?.patterns.regex) {
        const vulnerableCode = 'val=login.objects.raw(sql_query)';
        let matched = false;
        
        for (const regex of sqlPattern.patterns.regex) {
          regex.lastIndex = 0;
          if (regex.test(vulnerableCode)) {
            matched = true;
            break;
          }
        }
        
        expect(matched).toBe(true);
      }
    });

    it('should handle TypeScript as JavaScript', () => {
      const tsPatterns = getMinimalPatternsByLanguage('typescript');
      const jsPatterns = getMinimalPatternsByLanguage('javascript');
      
      // TypeScript should get JavaScript patterns
      expect(tsPatterns.length).toBeGreaterThan(0);
      expect(tsPatterns.length).toBe(jsPatterns.length);
    });
  });

  describe('Pattern compatibility with RSOLV-api', () => {
    it('should maintain SecurityPattern interface shape', () => {
      const patterns = getMinimalPatterns();
      const pattern = patterns[0];
      
      // Required fields per RSOLV-api
      expect(pattern.id).toBeDefined();
      expect(pattern.name).toBeDefined();
      expect(pattern.type).toBeDefined();
      expect(pattern.severity).toBeDefined();
      expect(pattern.description).toBeDefined();
      expect(pattern.patterns).toBeDefined();
      expect(pattern.languages).toBeDefined();
      expect(pattern.cweId).toBeDefined();
      expect(pattern.owaspCategory).toBeDefined();
      expect(pattern.remediation).toBeDefined();
      expect(pattern.examples).toBeDefined();
      
      // Type checks
      expect(typeof pattern.id).toBe('string');
      expect(Array.isArray(pattern.languages)).toBe(true);
      expect(['critical', 'high', 'medium', 'low']).toContain(pattern.severity);
    });

    it('should not include astRules for minimal patterns', () => {
      const patterns = getMinimalPatterns();
      
      // Minimal patterns should not have AST rules
      for (const pattern of patterns) {
        expect(pattern.astRules).toBeUndefined();
      }
    });
  });
});