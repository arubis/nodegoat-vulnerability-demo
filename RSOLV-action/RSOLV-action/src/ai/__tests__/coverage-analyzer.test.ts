/**
 * Coverage Analyzer Tests
 * 
 * Phase 5B: Intelligent coverage analysis
 * These tests follow TDD - RED phase (all should fail initially)
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { CoverageAnalyzer } from '../coverage-analyzer.js';
import type { CoverageReport, CoverageGap, FileCoverage } from '../coverage-analyzer.js';

describe('CoverageAnalyzer (TDD - Red Phase)', () => {
  let analyzer: CoverageAnalyzer;
  
  beforeEach(() => {
    analyzer = new CoverageAnalyzer();
  });

  describe('LCOV Format Parsing (JavaScript/TypeScript)', () => {
    test('should parse basic lcov coverage report', async () => {
      const lcovData = `TN:
SF:src/utils/validator.js
FN:5,validateEmail
FN:12,validatePassword
FNF:2
FNH:1
DA:1,1
DA:5,1
DA:6,0
DA:7,0
DA:12,0
DA:13,0
LF:6
LH:4
end_of_record`;
      
      const result = await analyzer.parseLcov(lcovData);
      
      expect(result.format).toBe('lcov');
      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toMatchObject({
        path: 'src/utils/validator.js',
        functions: {
          total: 2,
          covered: 1,
          details: [
            { name: 'validateEmail', line: 5, hits: 1 },
            { name: 'validatePassword', line: 12, hits: 0 }
          ]
        },
        lines: {
          total: 6,
          covered: 4,
          percentage: 66.67,
          details: expect.any(Array)
        }
      });
    });

    test('should handle multiple files in lcov report', async () => {
      const lcovData = `TN:
SF:src/auth/login.ts
FN:10,authenticate
FNF:1
FNH:1
DA:10,5
DA:11,5
DA:12,3
LF:3
LH:3
end_of_record
TN:
SF:src/auth/logout.ts
FN:5,logout
FNF:1
FNH:0
DA:5,0
DA:6,0
LF:2
LH:0
end_of_record`;
      
      const result = await analyzer.parseLcov(lcovData);
      
      expect(result.files).toHaveLength(2);
      expect(result.summary).toMatchObject({
        totalFiles: 2,
        totalLines: 5,
        coveredLines: 3,
        linePercentage: 60,
        totalFunctions: 2,
        coveredFunctions: 1,
        functionPercentage: 50
      });
    });
  });

  describe('Coverage.py Format Parsing (Python)', () => {
    test('should parse coverage.py JSON report', async () => {
      const coverageJson = {
        files: {
          'src/validators.py': {
            executed_lines: [1, 5, 6, 12, 13],
            missing_lines: [7, 8, 9],
            summary: {
              covered_lines: 5,
              num_statements: 8,
              percent_covered: 62.5
            }
          },
          'src/auth.py': {
            executed_lines: [1, 2, 3, 10, 11, 12],
            missing_lines: [15, 16],
            summary: {
              covered_lines: 6,
              num_statements: 8,
              percent_covered: 75
            }
          }
        },
        totals: {
          covered_lines: 11,
          num_statements: 16,
          percent_covered: 68.75
        }
      };
      
      const result = await analyzer.parseCoveragePy(JSON.stringify(coverageJson));
      
      expect(result.format).toBe('coverage.py');
      expect(result.files).toHaveLength(2);
      expect(result.files[0]).toMatchObject({
        path: 'src/validators.py',
        lines: {
          total: 8,
          covered: 5,
          percentage: 62.5,
          uncoveredLines: [7, 8, 9]
        }
      });
    });

    test('should parse coverage.py XML report', async () => {
      const coverageXml = `<?xml version="1.0" ?>
<coverage version="7.3.2">
  <packages>
    <package name="src">
      <classes>
        <class filename="src/utils.py" name="utils.py">
          <lines>
            <line number="1" hits="1"/>
            <line number="5" hits="1"/>
            <line number="6" hits="0"/>
            <line number="7" hits="0"/>
          </lines>
        </class>
      </classes>
    </package>
  </packages>
</coverage>`;
      
      const result = await analyzer.parseCoveragePyXml(coverageXml);
      
      expect(result.format).toBe('coverage.py-xml');
      expect(result.files[0]).toMatchObject({
        path: 'src/utils.py',
        lines: {
          total: 4,
          covered: 2,
          percentage: 50
        }
      });
    });
  });

  describe('SimpleCov Format Parsing (Ruby)', () => {
    test('should parse SimpleCov JSON report', async () => {
      const simpleCovJson = {
        'RSpec': {
          coverage: {
            'app/models/user.rb': {
              lines: [1, 1, null, 1, 0, 0, null, 1, 1]
            },
            'app/controllers/users_controller.rb': {
              lines: [1, null, 1, 1, 0, null, 1]
            }
          },
          timestamp: 1642531200
        }
      };
      
      const result = await analyzer.parseSimpleCov(JSON.stringify(simpleCovJson));
      
      expect(result.format).toBe('simplecov');
      expect(result.files).toHaveLength(2);
      expect(result.files[0]).toMatchObject({
        path: 'app/models/user.rb',
        lines: {
          total: 7, // non-null lines
          covered: 5,
          percentage: 71.43,
          uncoveredLines: [5, 6]
        }
      });
    });
  });

  describe('Coverage Gap Analysis', () => {
    test('should identify functions with no tests', async () => {
      const coverageReport: CoverageReport = {
        format: 'lcov',
        files: [{
          path: 'src/auth/validator.js',
          functions: {
            total: 3,
            covered: 1,
            details: [
              { name: 'validateEmail', line: 5, hits: 10 },
              { name: 'validatePassword', line: 12, hits: 0 },
              { name: 'validateUsername', line: 20, hits: 0 }
            ]
          },
          lines: {
            total: 30,
            covered: 10,
            percentage: 33.33,
            details: []
          }
        }],
        summary: {
          totalFiles: 1,
          totalLines: 30,
          coveredLines: 10,
          linePercentage: 33.33,
          totalFunctions: 3,
          coveredFunctions: 1,
          functionPercentage: 33.33
        }
      };
      
      const gaps = await analyzer.findCoverageGaps(coverageReport);
      
      // Should find 2 uncovered functions + 1 low coverage file = 3 gaps
      expect(gaps).toHaveLength(3);
      // Find the uncovered function gaps
      const functionGaps = gaps.filter(g => g.type === 'uncovered-function');
      expect(functionGaps).toHaveLength(2);
      
      const validatePasswordGap = functionGaps.find(g => g.name === 'validatePassword');
      expect(validatePasswordGap).toMatchObject({
        file: 'src/auth/validator.js',
        type: 'uncovered-function',
        name: 'validatePassword',
        line: 12,
        priority: 'critical'  // auth file = critical priority
      });
    });

    test('should identify critical uncovered code paths', async () => {
      const coverageReport: CoverageReport = {
        format: 'lcov',
        files: [{
          path: 'src/security/auth.js',
          lines: {
            total: 50,
            covered: 25,
            percentage: 50,
            uncoveredLines: [10, 11, 12, 13, 14] // auth validation block
          },
          functions: {
            total: 5,
            covered: 3,
            details: []
          }
        }],
        summary: {
          totalFiles: 1,
          totalLines: 50,
          coveredLines: 25,
          linePercentage: 50
        }
      };
      
      const gaps = await analyzer.findCoverageGaps(coverageReport);
      
      expect(gaps.some(gap => 
        gap.type === 'uncovered-block' && 
        gap.priority === 'critical'
      )).toBe(true);
    });

    test('should prioritize security-related coverage gaps', async () => {
      const coverageReport: CoverageReport = {
        format: 'lcov',
        files: [
          {
            path: 'src/utils/helpers.js',
            lines: { total: 20, covered: 10, percentage: 50, uncoveredLines: [5, 6, 7] },
            functions: { total: 2, covered: 1, details: [] }
          },
          {
            path: 'src/auth/crypto.js',
            lines: { total: 30, covered: 15, percentage: 50, uncoveredLines: [20, 21, 22] },
            functions: { total: 3, covered: 1, details: [] }
          }
        ],
        summary: {
          totalFiles: 2,
          totalLines: 50,
          coveredLines: 25,
          linePercentage: 50
        }
      };
      
      const gaps = await analyzer.findCoverageGaps(coverageReport);
      
      // Security files should have higher priority
      const securityGap = gaps.find(g => g.file.includes('auth/crypto'));
      const utilGap = gaps.find(g => g.file.includes('utils/helpers'));
      
      expect(securityGap?.priority).toBe('critical');
      expect(utilGap?.priority).toBe('medium');
    });
  });

  describe('Test File Mapping', () => {
    test('should find test files for source files', async () => {
      const sourceFile = 'src/components/Button.tsx';
      const testFiles = [
        'src/components/__tests__/Button.test.tsx',
        'src/components/Button.spec.tsx',
        'tests/components/Button.test.tsx'
      ];
      
      const result = await analyzer.findTestsForFile(sourceFile, testFiles);
      
      expect(result.sourceFile).toBe(sourceFile);
      expect(result.testFiles).toHaveLength(3);
      expect(result.hasTests).toBe(true);
    });

    test('should identify files without tests', async () => {
      const sourceFile = 'src/utils/validator.js';
      const testFiles = [
        'src/utils/__tests__/helper.test.js',
        'src/components/__tests__/Button.test.js'
      ];
      
      const result = await analyzer.findTestsForFile(sourceFile, testFiles);
      
      expect(result.sourceFile).toBe(sourceFile);
      expect(result.testFiles).toHaveLength(0);
      expect(result.hasTests).toBe(false);
    });

    test('should handle different test naming conventions', async () => {
      const mappings = await analyzer.mapTestsToSource(
        ['src/auth.py', 'src/validators.py', 'src/helpers.py'],
        ['test_auth.py', 'validators_test.py', 'spec/helpers_spec.py']
      );
      
      expect(mappings['src/auth.py'].testFiles).toContain('test_auth.py');
      expect(mappings['src/validators.py'].testFiles).toContain('validators_test.py');
      expect(mappings['src/helpers.py'].testFiles).toContain('spec/helpers_spec.py');
    });
  });

  describe('Coverage Report Generation', () => {
    test('should generate coverage summary report', async () => {
      const coverageReport: CoverageReport = {
        format: 'lcov',
        files: [
          {
            path: 'src/auth.js',
            lines: { total: 100, covered: 85, percentage: 85 },
            functions: { total: 10, covered: 8, percentage: 80 }
          },
          {
            path: 'src/utils.js',
            lines: { total: 50, covered: 25, percentage: 50 },
            functions: { total: 5, covered: 2, percentage: 40 }
          }
        ],
        summary: {
          totalFiles: 2,
          totalLines: 150,
          coveredLines: 110,
          linePercentage: 73.33,
          totalFunctions: 15,
          coveredFunctions: 10,
          functionPercentage: 66.67
        }
      };
      
      const summary = await analyzer.generateSummary(coverageReport);
      
      expect(summary).toMatchObject({
        overallCoverage: 73.33,
        filesCovered: 2,
        linesOfCode: 150,
        linesCovered: 110,
        functionsCovered: 10,
        totalFunctions: 15,
        needsImprovement: ['src/utils.js'],
        wellCovered: ['src/auth.js']
      });
    });

    test('should recommend test priorities based on gaps', async () => {
      const gaps: CoverageGap[] = [
        {
          file: 'src/auth/crypto.js',
          type: 'uncovered-function',
          name: 'encryptPassword',
          line: 25,
          priority: 'critical'
        },
        {
          file: 'src/utils/helpers.js',
          type: 'uncovered-block',
          lines: [10, 11, 12],
          priority: 'low'
        }
      ];
      
      const recommendations = await analyzer.recommendTestPriorities(gaps);
      
      expect(recommendations[0]).toMatchObject({
        priority: 1,
        file: 'src/auth/crypto.js',
        reason: 'Critical security function lacks coverage',
        suggestedTests: expect.any(Array)
      });
    });
  });

  describe('Integration with Test Generation', () => {
    test('should provide context for test generation', async () => {
      const coverageReport: CoverageReport = {
        format: 'lcov',
        files: [{
          path: 'src/validators.js',
          functions: {
            total: 2,
            covered: 0,
            details: [
              { name: 'validateEmail', line: 5, hits: 0 },
              { name: 'validatePassword', line: 15, hits: 0 }
            ]
          },
          lines: {
            total: 20,
            covered: 0,
            percentage: 0
          }
        }],
        summary: {
          totalFiles: 1,
          totalLines: 20,
          coveredLines: 0,
          linePercentage: 0
        }
      };
      
      const context = await analyzer.getTestGenerationContext(coverageReport, 'src/validators.js');
      
      expect(context).toMatchObject({
        file: 'src/validators.js',
        uncoveredFunctions: ['validateEmail', 'validatePassword'],
        coveragePercentage: 0,
        priority: 'critical',
        suggestedTestTypes: ['basic-functionality', 'unit', 'validation', 'edge-cases', 'security', 'error-handling']
      });
    });
  });
});

describe('CoverageAnalyzer Error Handling', () => {
  test('should handle malformed lcov data gracefully', async () => {
    const analyzer = new CoverageAnalyzer();
    const malformedLcov = 'This is not valid lcov data';
    
    const result = await analyzer.parseLcov(malformedLcov);
    
    expect(result.format).toBe('lcov');
    expect(result.files).toHaveLength(0);
    // No error thrown - just returns empty results for invalid data
    expect(result.summary).toBeDefined();
    expect(result.summary?.totalFiles).toBe(0);
  });

  test('should handle empty coverage reports', async () => {
    const analyzer = new CoverageAnalyzer();
    const emptyReport: CoverageReport = {
      format: 'lcov',
      files: [],
      summary: {
        totalFiles: 0,
        totalLines: 0,
        coveredLines: 0,
        linePercentage: 0
      }
    };
    
    const gaps = await analyzer.findCoverageGaps(emptyReport);
    
    expect(gaps).toHaveLength(0);
  });
});