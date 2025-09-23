/**
 * Enhanced Test Generation Framework Tests
 * 
 * Tests for Phase 4 enhancements including:
 * - Additional vulnerability types (Command Injection, Path Traversal)
 * - Multi-language support (Ruby, PHP)
 * - Enhanced functional validation
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { VulnerabilityTestGenerator } from '../test-generator.js';
import type { Vulnerability } from '../types.js';

describe('Enhanced VulnerabilityTestGenerator (Phase 4)', () => {
  let generator: VulnerabilityTestGenerator;
  
  beforeEach(() => {
    generator = new VulnerabilityTestGenerator();
  });

  test('should generate command injection tests', async () => {
    const commandInjectionVuln: Vulnerability = {
      id: 'cmd-injection-test',
      type: 'COMMAND_INJECTION',
      severity: 'critical',
      description: 'Command injection vulnerability in file processing',
      location: {
        file: 'src/utils/fileProcessor.js',
        line: 25,
        column: 10
      },
      pattern: {
        id: 'js-command-injection',
        name: 'Command Injection via exec',
        language: 'javascript'
      },
      confidence: 0.95,
      cweId: 'CWE-78',
      owaspCategory: 'A03:2021 - Injection'
    };
    
    const result = await generator.generateTestSuite(commandInjectionVuln, {
      vulnerabilityType: 'COMMAND_INJECTION',
      language: 'javascript',
      testFramework: 'bun',
      includeE2E: false
    });
    
    expect(result.success).toBe(true);
    expect(result.testSuite!.red.attackVector).toContain('; cat /etc/passwd');
    expect(result.testSuite!.red.testCode).toContain('root:');
    expect(result.testSuite!.green.testCode).toContain('maliciousResult');
    expect(result.testSuite!.refactor.functionalValidation).toContain('File operations should work');
  });

  test('should generate path traversal tests', async () => {
    const pathTraversalVuln: Vulnerability = {
      id: 'path-traversal-test',
      type: 'PATH_TRAVERSAL',
      severity: 'high',
      description: 'Path traversal vulnerability in file download',
      location: {
        file: 'src/routes/download.js',
        line: 45,
        column: 15
      },
      pattern: {
        id: 'js-path-traversal',
        name: 'Path Traversal in file operations',
        language: 'javascript'
      },
      confidence: 0.88,
      cweId: 'CWE-22',
      owaspCategory: 'A01:2021 - Broken Access Control'
    };
    
    const result = await generator.generateTestSuite(pathTraversalVuln, {
      vulnerabilityType: 'PATH_TRAVERSAL',
      language: 'javascript',
      testFramework: 'bun',
      includeE2E: false
    });
    
    expect(result.success).toBe(true);
    expect(result.testSuite!.red.attackVector).toBe('../../../etc/passwd');
    expect(result.testSuite!.red.testCode).toContain('traversalPath');
    expect(result.testSuite!.green.testCode).toContain('maliciousResult.error');
    expect(result.testSuite!.refactor.functionalValidation).toContain('File downloads should work');
  });

  test('should generate Ruby tests', async () => {
    const sqlInjectionVuln: Vulnerability = {
      id: 'ruby-sql-injection',
      type: 'SQL_INJECTION',
      severity: 'high',
      description: 'SQL injection in user model',
      location: {
        file: 'app/models/user.rb',
        line: 30,
        column: 5
      },
      pattern: {
        id: 'ruby-sql-injection',
        name: 'SQL Injection in ActiveRecord',
        language: 'ruby'
      },
      confidence: 0.92,
      cweId: 'CWE-89',
      owaspCategory: 'A03:2021 - Injection'
    };
    
    const result = await generator.generateTestSuite(sqlInjectionVuln, {
      vulnerabilityType: 'SQL_INJECTION',
      language: 'ruby',
      testFramework: 'bun',
      includeE2E: false
    });
    
    expect(result.success).toBe(true);
    const testFile = result.generatedFiles[0];
    expect(testFile.content).toContain('require \'rspec\'');
    expect(testFile.content).toContain('describe \'Vulnerability Test Suite');
    expect(testFile.content).toContain('it "should be vulnerable to sql injection (RED)" do');
    expect(testFile.content).toContain('expect(');
    expect(testFile.content).toContain('.to eq(');
    expect(testFile.content).toContain('end');
  });

  test('should generate PHP tests', async () => {
    const xssVuln: Vulnerability = {
      id: 'php-xss',
      type: 'XSS',
      severity: 'medium',
      description: 'XSS vulnerability in template',
      location: {
        file: 'src/views/profile.php',
        line: 50,
        column: 20
      },
      pattern: {
        id: 'php-xss-echo',
        name: 'XSS via echo without escaping',
        language: 'php'
      },
      confidence: 0.85,
      cweId: 'CWE-79',
      owaspCategory: 'A03:2021 - Injection'
    };
    
    const result = await generator.generateTestSuite(xssVuln, {
      vulnerabilityType: 'XSS',
      language: 'php',
      testFramework: 'bun',
      includeE2E: false
    });
    
    expect(result.success).toBe(true);
    const testFile = result.generatedFiles[0];
    expect(testFile.content).toContain('<?php');
    expect(testFile.content).toContain('use PHPUnit\\Framework\\TestCase;');
    expect(testFile.content).toContain('class VulnerabilityTestSuiteXSS extends TestCase');
    expect(testFile.content).toContain('public function test');
    expect(testFile.content).toContain('$this->assert');
  });

  test('should generate comprehensive functional validation tests', async () => {
    const vulnerabilities = [
      { type: 'SQL_INJECTION', expectedValidation: 'Unicode characters should work' },
      { type: 'XSS', expectedValidation: 'Markdown should render safely' },
      { type: 'COMMAND_INJECTION', expectedValidation: 'Process timeouts should be enforced' },
      { type: 'PATH_TRAVERSAL', expectedValidation: 'Access controls should be enforced' }
    ];
    
    for (const { type, expectedValidation } of vulnerabilities) {
      const vuln: Vulnerability = {
        id: `${type.toLowerCase()}-enhanced`,
        type,
        severity: 'high',
        description: `Enhanced ${type} test`,
        location: { file: 'test.js', line: 1, column: 1 },
        pattern: { id: 'test', name: 'test', language: 'javascript' },
        confidence: 0.9,
        cweId: 'CWE-1',
        owaspCategory: 'A01:2021'
      };
      
      const result = await generator.generateTestSuite(vuln, {
        vulnerabilityType: type,
        language: 'javascript',
        testFramework: 'bun',
        includeE2E: false
      });
      
      expect(result.success).toBe(true);
      expect(result.testSuite!.refactor.functionalValidation).toContain(expectedValidation);
    }
  });

  test('should handle E2E test generation for new vulnerability types', async () => {
    const cmdInjectionVuln: Vulnerability = {
      id: 'cmd-e2e',
      type: 'COMMAND_INJECTION',
      severity: 'critical',
      description: 'Command injection for E2E testing',
      location: { file: 'api/execute.js', line: 10, column: 5 },
      pattern: { id: 'cmd-inject', name: 'Command Injection', language: 'javascript' },
      confidence: 0.95,
      cweId: 'CWE-78',
      owaspCategory: 'A03:2021 - Injection'
    };
    
    const result = await generator.generateTestSuite(cmdInjectionVuln, {
      vulnerabilityType: 'COMMAND_INJECTION',
      language: 'javascript',
      testFramework: 'cypress',
      includeE2E: true
    });
    
    expect(result.success).toBe(true);
    expect(result.generatedFiles).toHaveLength(2);
    
    const e2eFile = result.generatedFiles.find(f => f.type === 'e2e');
    expect(e2eFile).toBeDefined();
    expect(e2eFile!.content).toContain('cy.');
    expect(e2eFile!.content).toContain('beforeEach');
  });
});