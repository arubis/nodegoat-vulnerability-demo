/**
 * TDD tests for Java test framework support in AdaptiveTestGenerator
 * Phase 6C: Add JUnit 5 and TestNG templates
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdaptiveTestGenerator } from '../adaptive-test-generator.js';
import { TestFrameworkDetector } from '../test-framework-detector.js';
import { CoverageAnalyzer } from '../coverage-analyzer.js';
import { IssueInterpreter } from '../issue-interpreter.js';
import { VulnerabilityType } from '../../security/types.js';

describe('AdaptiveTestGenerator - Java Framework Support', () => {
  let generator: AdaptiveTestGenerator;
  let mockDetector: any;
  let mockAnalyzer: any;
  let mockInterpreter: any;

  beforeEach(() => {
    mockDetector = {
      detectFrameworks: () => Promise.resolve({
        frameworks: []
      }),
      detectFromStructure: () => ({
        frameworks: []
      })
    };
    mockAnalyzer = {
      analyzeCoverage: () => Promise.resolve(null),
      parseLcov: () => null,
      parseCoverageJson: () => null,
      parseSimpleCov: () => null,
      findCoverageGaps: () => Promise.resolve([]),
      recommendTestPriorities: () => Promise.resolve([])
    };
    mockInterpreter = {
      interpretIssue: () => Promise.resolve({
        vulnerabilities: [],
        affectedFiles: []
      })
    };

    generator = new AdaptiveTestGenerator(
      mockDetector as TestFrameworkDetector,
      mockAnalyzer as CoverageAnalyzer,
      mockInterpreter as IssueInterpreter
    );
  });

  describe('JUnit 5 Support', () => {
    it('should generate JUnit 5 tests for SQL injection vulnerability', async () => {
      const repoStructure = {
        'pom.xml': `<dependency>
          <groupId>org.junit.jupiter</groupId>
          <artifactId>junit-jupiter</artifactId>
          <version>5.9.0</version>
        </dependency>`,
        'src/main/java/com/example/UserController.java': 'class UserController {}',
        'src/test/java/com/example/UserControllerTest.java': 'import org.junit.jupiter.api.Test;'
      };

      // Mock framework detection for JUnit 5
      mockDetector.detectFromStructure = () => ({
        frameworks: [{
          name: 'junit5',
          version: '5.9.0',
          confidence: 0.95,
          type: 'unit'
        }]
      });

      const result = await generator.generateAdaptiveTests(
        {
          id: 'java-sqli-1',
          title: 'SQL Injection in UserController',
          body: 'SQL injection vulnerability in UserController.java line 25',
          repository: { language: 'java' },
          type: VulnerabilityType.SQL_INJECTION,
          file: 'src/main/java/com/example/UserController.java'
        } as any,
        repoStructure
      );

      expect(result.success).toBe(true);
      expect(result.framework).toBe('junit5');
      expect(result.testCode).toContain('import org.junit.jupiter.api.Test');
      expect(result.testCode).toContain('import org.junit.jupiter.api.BeforeEach');
      expect(result.testCode).toContain('import static org.junit.jupiter.api.Assertions.*');
      expect(result.testCode).toContain('@Test');
      expect(result.testCode).toContain('@DisplayName');
      expect(result.testCode).toContain('void testSqlInjectionVulnerability()');
      expect(result.testCode).toContain('assertThrows');
    });

    it('should generate JUnit 5 parameterized tests for multiple attack vectors', async () => {
      const repoStructure = {
        'pom.xml': '<dependency><groupId>org.junit.jupiter</groupId></dependency>',
        'src/main/java/com/example/SearchController.java': 'class SearchController {}'
      };

      mockDetector.detectFromStructure = () => ({
        frameworks: [{
          name: 'junit5',
          version: '5.9.0',
          confidence: 0.95,
          type: 'unit'
        }]
      });

      const result = await generator.generateAdaptiveTests(
        {
          id: 'java-sqli-2',
          title: 'Multiple SQL injection points',
          body: 'SQL injection in search and filter methods',
          repository: { language: 'java' },
          type: VulnerabilityType.SQL_INJECTION,
          file: 'src/main/java/com/example/SearchController.java'
        } as any,
        repoStructure
      );

      expect(result.success).toBe(true);
      expect(result.testCode).toContain('@ParameterizedTest');
      expect(result.testCode).toContain('@ValueSource');
      expect(result.testCode).toContain('void testSqlInjectionWithMultiplePayloads(String payload)');
    });
  });

  describe('TestNG Support', () => {
    it('should generate TestNG tests for XXE vulnerability', async () => {
      const repoStructure = {
        'pom.xml': `<dependency>
          <groupId>org.testng</groupId>
          <artifactId>testng</artifactId>
          <version>7.8.0</version>
        </dependency>`,
        'src/main/java/com/example/XmlParser.java': 'class XmlParser {}',
        'src/test/java/com/example/XmlParserTest.java': 'import org.testng.annotations.Test;'
      };

      mockDetector.detectFromStructure = () => ({
        frameworks: [{
          name: 'testng',
          version: '7.8.0',
          confidence: 0.95,
          type: 'unit'
        }]
      });

      const result = await generator.generateAdaptiveTests(
        {
          id: 'java-xxe-1',
          title: 'XXE vulnerability in XML parser',
          body: 'XML External Entity vulnerability in XmlParser.java',
          repository: { language: 'java' },
          type: VulnerabilityType.XML_EXTERNAL_ENTITIES,
          file: 'src/main/java/com/example/XmlParser.java'
        } as any,
        repoStructure
      );

      expect(result.success).toBe(true);
      expect(result.framework).toBe('testng');
      expect(result.testCode).toContain('import org.testng.annotations.Test');
      expect(result.testCode).toContain('import org.testng.annotations.BeforeMethod');
      expect(result.testCode).toContain('import static org.testng.Assert.*');
      expect(result.testCode).toContain('@Test(groups = {"security"})');
      expect(result.testCode).toContain('public void testxmlexternalentitiesVulnerability()');
      expect(result.testCode).toContain('assertEquals');
    });

    it('should generate TestNG data provider tests', async () => {
      const repoStructure = {
        'pom.xml': '<dependency><groupId>org.testng</groupId></dependency>',
        'src/main/java/com/example/FileUploader.java': 'class FileUploader {}'
      };

      mockDetector.detectFromStructure = () => ({
        frameworks: [{
          name: 'testng',
          version: '7.8.0',
          confidence: 0.95,
          type: 'unit'
        }]
      });

      const result = await generator.generateAdaptiveTests(
        {
          id: 'java-path-1',
          title: 'Path traversal in file upload',
          body: 'Path traversal vulnerability allows accessing files outside upload directory',
          repository: { language: 'java' },
          type: VulnerabilityType.PATH_TRAVERSAL,
          file: 'src/main/java/com/example/FileUploader.java'
        } as any,
        repoStructure
      );

      expect(result.success).toBe(true);
      expect(result.testCode).toContain('@DataProvider(name = "maliciousFilePaths")');
      expect(result.testCode).toContain('public Object[][] maliciousFilePaths()');
      expect(result.testCode).toContain('@Test(dataProvider = "maliciousFilePaths"');
      expect(result.testCode).toContain('public void testPathTraversal(String maliciousPath)');
    });
  });

  describe('Spring Boot Integration', () => {
    it('should generate Spring Boot test annotations for JUnit 5', async () => {
      const repoStructure = {
        'pom.xml': `<dependency>
          <groupId>org.junit.jupiter</groupId>
          <artifactId>junit-jupiter</artifactId>
          <version>5.9.0</version>
        </dependency>
        <dependency>
          <groupId>org.springframework.boot</groupId>
          <artifactId>spring-boot-starter-test</artifactId>
        </dependency>`,
        'src/main/java/com/example/UserController.java': '@RestController class UserController {}'
      };

      mockDetector.detectFromStructure = () => ({
        frameworks: [{
          name: 'junit5',
          version: '5.9.0',
          confidence: 0.95,
          type: 'unit',
          companions: ['spring-boot']
        }]
      });

      const result = await generator.generateAdaptiveTests(
        {
          id: 'spring-sqli-1',
          title: 'SQL Injection in Spring Boot REST endpoint',
          body: 'SQL injection in UserController REST endpoint',
          repository: { language: 'java' },
          type: VulnerabilityType.SQL_INJECTION,
          file: 'src/main/java/com/example/UserController.java'
        } as any,
        repoStructure
      );

      expect(result.success).toBe(true);
      expect(result.testCode).toContain('@SpringBootTest');
      expect(result.testCode).toContain('@AutoConfigureMockMvc');
      expect(result.testCode).toContain('@Test');
      expect(result.testCode).toContain('MockMvc mockMvc');
      expect(result.testCode).toContain('mockMvc.perform(');
      expect(result.testCode).toContain('.andExpect(status()');
    });
  });
});