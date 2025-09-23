import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecurityPattern, VulnerabilityType } from '../types.js';

// Mock AST pattern with SQL injection detection
const mockSQLInjectionPattern: SecurityPattern = {
  id: 'js-sql-injection-concat',
  name: 'SQL Injection via String Concatenation',
  type: VulnerabilityType.SQL_INJECTION,
  severity: 'critical',
  description: 'SQL injection through string concatenation',
  patterns: {
    regex: [/SELECT.*FROM.*\+/i, /INSERT.*VALUES.*\+/i]
  },
  languages: ['javascript'],
  frameworks: [],
  cweId: 'CWE-89',
  owaspCategory: 'A03:2021',
  remediation: 'Use parameterized queries',
  examples: {
    vulnerable: 'db.query("SELECT * FROM users WHERE id = " + userId)',
    secure: 'db.query("SELECT * FROM users WHERE id = ?", [userId])'
  },
  // AST Enhancement fields
  astRules: {
    node_type: 'BinaryExpression',
    operator: '+',
    context_analysis: {
      contains_sql_keywords: true,
      has_user_input_in_concatenation: true,
      within_db_call: true
    },
    ancestor_requirements: {
      has_db_method_call: '\\.(?:query|execute|exec|run|all|get)',
      max_depth: 3
    }
  },
  contextRules: {
    exclude_paths: ['test/', 'spec/', '__tests__/', 'fixtures/', 'mocks/'],
    exclude_if_parameterized: true,
    exclude_if_uses_orm_builder: true,
    exclude_if_logging_only: true,
    safe_if_input_validated: true
  },
  confidenceRules: {
    base: 0.3,
    adjustments: {
      'direct_req_param_concat': 0.5,
      'within_db_query_call': 0.3,
      'has_sql_keywords': 0.2,
      'uses_parameterized_query': -0.9,
      'uses_orm_query_builder': -0.8,
      'is_console_log': -1.0,
      'has_input_validation': -0.7,
      'in_test_file': -0.9
    }
  },
  minConfidence: 0.8
};

describe('AST Pattern Interpreter', () => {
  it('should use AST rules to reduce false positives in SQL injection detection', async () => {
    // This test should fail initially because AST interpreter is not integrated
    const { ASTPatternInterpreter } = await import('../ast-pattern-interpreter.js');
    const interpreter = new ASTPatternInterpreter();
    
    // Test case 1: Actual SQL injection vulnerability
    const vulnerableCode = `
      const userId = req.params.id;
      const query = "SELECT * FROM users WHERE id = " + userId;
      db.query(query, (err, results) => {
        res.json(results);
      });
    `;
    
    const vulnerableFindings = await interpreter.scanFile(
      'api/users.js',
      vulnerableCode,
      [mockSQLInjectionPattern]
    );
    
    expect(vulnerableFindings.length).toBe(1);
    expect(vulnerableFindings[0].confidence).toBeGreaterThanOrEqual(0.8);
    
    // Test case 2: False positive - console.log with SQL
    const consoleLogCode = `
      const query = "SELECT * FROM users WHERE id = " + userId;
      console.log("Query: " + query);
    `;
    
    const consoleFindings = await interpreter.scanFile(
      'debug.js',
      consoleLogCode,
      [mockSQLInjectionPattern]
    );
    
    // Should not flag console.log as SQL injection
    expect(consoleFindings.length).toBe(0);
    
    // Test case 3: False positive - parameterized query
    const parameterizedCode = `
      const userId = req.params.id;
      const query = "SELECT * FROM users WHERE id = ?";
      db.query(query, [userId], (err, results) => {
        res.json(results);
      });
    `;
    
    const parameterizedFindings = await interpreter.scanFile(
      'api/secure-users.js',
      parameterizedCode,
      [mockSQLInjectionPattern]
    );
    
    // Should not flag parameterized queries
    expect(parameterizedFindings.length).toBe(0);
    
    // Test case 4: False positive - test file
    const testCode = `
      it('should handle SQL queries', () => {
        const query = "SELECT * FROM users WHERE id = " + testId;
        expect(query).toBe(expectedQuery);
      });
    `;
    
    const testFindings = await interpreter.scanFile(
      '__tests__/user.test.js',
      testCode,
      [mockSQLInjectionPattern]
    );
    
    // Should not flag test files
    expect(testFindings.length).toBe(0);
  });
  
  it('should integrate with SecurityDetectorV2 to use AST rules when available', async () => {
    // This test should fail initially because SecurityDetectorV2 doesn't use AST interpreter
    const { SecurityDetectorV2 } = await import('../detector-v2.js');
    const detector = new SecurityDetectorV2();
    
    // Mock pattern source that returns patterns with AST rules
    const mockPatternSource = {
      async getPatternsByLanguage(language: string) {
        if (language === 'javascript') {
          return [mockSQLInjectionPattern];
        }
        return [];
      }
    };
    
    // @ts-ignore - accessing private property for testing
    detector.patternSource = mockPatternSource;
    
    // Vulnerable code that should be detected
    const vulnerableCode = `
      export function getUserById(req, res) {
        const userId = req.params.id;
        const query = "SELECT * FROM users WHERE id = " + userId;
        db.query(query, (err, results) => {
          if (err) return res.status(500).json({ error: err });
          res.json(results);
        });
      }
    `;
    
    const result = await detector.detect(vulnerableCode, 'javascript');
    
    // Should detect the SQL injection
    expect(result.length).toBe(1);
    expect(result[0].type).toBe(VulnerabilityType.SQL_INJECTION);
    expect(result[0].confidence).toBe('high');
    
    // False positive that should NOT be detected
    const falsePositiveCode = `
      export function logQuery(userId) {
        const query = "SELECT * FROM users WHERE id = " + userId;
        console.log("Debug query: " + query);
        // Not executing, just logging
      }
    `;
    
    const fpResult = await detector.detect(falsePositiveCode, 'javascript');
    
    // Should NOT detect SQL injection in console.log
    expect(fpResult.length).toBe(0);
  });
});