/**
 * Test Discovery Service
 *
 * Scans repositories for existing test files and extracts behavioral contracts
 * to provide test-aware context for AI fix generation.
 *
 * This service addresses the core issue identified in Phase 1 RED:
 * AI lacks visibility into existing tests and behavioral requirements.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { Glob } from 'glob';

export interface TestFile {
  path: string;
  content: string;
  testFramework: TestFramework;
  testCases: TestCase[];
  relatedFiles: string[];
}

export interface TestCase {
  name: string;
  description: string;
  functionUnderTest?: string;
  behavioralExpectations: BehavioralExpectation[];
  assertions: TestAssertion[];
}

export interface BehavioralExpectation {
  type: 'function-signature' | 'return-value' | 'side-effect' | 'callback-pattern' | 'error-handling' | 'platform-compatibility';
  description: string;
  requirement: string;
  critical: boolean;
}

export interface TestAssertion {
  type: 'equals' | 'contains' | 'throws' | 'calls' | 'property-access';
  target: string;
  expected: string;
  description: string;
}

export type TestFramework = 'jest' | 'vitest' | 'mocha' | 'jasmine' | 'tap' | 'unknown';

export interface TestDiscoveryOptions {
  /**
   * Root directory to search for tests
   */
  rootDir: string;

  /**
   * Patterns to include when searching for test files
   */
  includePatterns?: string[];

  /**
   * Patterns to exclude when searching for test files
   */
  excludePatterns?: string[];

  /**
   * Maximum depth to search for test files
   */
  maxDepth?: number;

  /**
   * Whether to analyze test content for behavioral contracts
   */
  analyzeContent?: boolean;
}

export class TestDiscoveryService {
  private readonly defaultIncludePatterns = [
    '**/*.test.js',
    '**/*.test.ts',
    '**/*.spec.js',
    '**/*.spec.ts',
    '**/test/**/*.js',
    '**/test/**/*.ts',
    '**/tests/**/*.js',
    '**/tests/**/*.ts',
    '**/__tests__/**/*.js',
    '**/__tests__/**/*.ts'
  ];

  private readonly defaultExcludePatterns = [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/coverage/**',
    '**/*.broken.*',
    '**/*.skip.*'
  ];

  /**
   * Discover all test files in the given directory
   */
  async discoverTests(options: TestDiscoveryOptions): Promise<TestFile[]> {
    const includePatterns = options.includePatterns || this.defaultIncludePatterns;
    const excludePatterns = options.excludePatterns || this.defaultExcludePatterns;

    const testFiles: TestFile[] = [];

    // Find all test files using glob patterns
    for (const pattern of includePatterns) {
      const glob = new Glob(pattern, {
        cwd: options.rootDir,
        ignore: excludePatterns,
        absolute: true,
        maxDepth: options.maxDepth || 10
      });

      for await (const filePath of glob) {
        try {
          const testFile = await this.analyzeTestFile(filePath, options.analyzeContent !== false);
          if (testFile) {
            testFiles.push(testFile);
          }
        } catch (error) {
          console.warn(`Failed to analyze test file ${filePath}:`, error);
        }
      }
    }

    return testFiles;
  }

  /**
   * Analyze a single test file and extract behavioral information
   */
  private async analyzeTestFile(filePath: string, analyzeContent: boolean): Promise<TestFile | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const framework = this.detectTestFramework(content);

      let testCases: TestCase[] = [];
      let relatedFiles: string[] = [];

      if (analyzeContent) {
        testCases = this.extractTestCases(content, framework);
        relatedFiles = this.extractRelatedFiles(content, filePath);
      }

      return {
        path: filePath,
        content,
        testFramework: framework,
        testCases,
        relatedFiles
      };
    } catch (error) {
      console.warn(`Cannot read test file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Detect which testing framework is used in the file
   */
  private detectTestFramework(content: string): TestFramework {
    if (content.includes('from \'vitest\'') || content.includes('from "vitest"')) {
      return 'vitest';
    }
    if (content.includes('from \'@jest/globals\'') || content.includes('jest.')) {
      return 'jest';
    }
    if (content.includes('describe(') && content.includes('it(')) {
      return 'jest'; // Default assumption for describe/it pattern
    }
    if (content.includes('from \'mocha\'') || content.includes('require(\'mocha\')')) {
      return 'mocha';
    }
    if (content.includes('from \'jasmine\'') || content.includes('require(\'jasmine\')')) {
      return 'jasmine';
    }
    if (content.includes('from \'tap\'') || content.includes('require(\'tap\')')) {
      return 'tap';
    }

    return 'unknown';
  }

  /**
   * Extract test cases and their behavioral expectations from test content
   */
  private extractTestCases(content: string, framework: TestFramework): TestCase[] {
    const testCases: TestCase[] = [];

    // Extract describe/it blocks and test patterns
    const testBlocks = this.extractTestBlocks(content);

    for (const block of testBlocks) {
      const testCase: TestCase = {
        name: block.name,
        description: block.description,
        functionUnderTest: this.extractFunctionUnderTest(block.content),
        behavioralExpectations: this.extractBehavioralExpectations(block.content),
        assertions: this.extractAssertions(block.content, framework)
      };

      testCases.push(testCase);
    }

    return testCases;
  }

  /**
   * Extract test blocks (describe/it, test, etc.) from content
   */
  private extractTestBlocks(content: string): Array<{name: string, description: string, content: string}> {
    const blocks: Array<{name: string, description: string, content: string}> = [];

    // Match it(), test(), describe() blocks
    const patterns = [
      /(?:it|test)\s*\(\s*['"`]([^'"`]+)['"`]\s*,?\s*(?:async\s+)?\s*\(\s*\)\s*=>\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g,
      /(?:it|test)\s*\(\s*['"`]([^'"`]+)['"`]\s*,?\s*(?:async\s+)?function\s*\(\s*\)\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g,
      /describe\s*\(\s*['"`]([^'"`]+)['"`]\s*,?\s*\(\s*\)\s*=>\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        blocks.push({
          name: match[1],
          description: match[1],
          content: match[2]
        });
      }
    }

    return blocks;
  }

  /**
   * Extract the function being tested from test content
   */
  private extractFunctionUnderTest(testContent: string): string | undefined {
    // Look for common patterns of function calls
    const patterns = [
      /(?:const|let|var)\s+\w+\s*=\s*(?:await\s+)?(\w+)\s*\(/g,
      /expect\s*\(\s*(\w+)\s*\(/g,
      /(\w+)\s*\.\s*\w+\s*\(/g
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(testContent);
      if (match && match[1] && !['expect', 'jest', 'vi', 'sinon'].includes(match[1])) {
        return match[1];
      }
    }

    return undefined;
  }

  /**
   * Extract behavioral expectations from test content
   */
  private extractBehavioralExpectations(testContent: string): BehavioralExpectation[] {
    const expectations: BehavioralExpectation[] = [];

    // Function signature expectations
    if (testContent.includes('function(') || testContent.includes('=>')) {
      expectations.push({
        type: 'function-signature',
        description: 'Function signature must be preserved',
        requirement: 'Parameter names and count should remain consistent',
        critical: true
      });
    }

    // Callback patterns
    if (testContent.includes('done()') || testContent.includes('callback(')) {
      expectations.push({
        type: 'callback-pattern',
        description: 'Callback behavior must be maintained',
        requirement: 'Callback signature and timing should be preserved',
        critical: true
      });
    }

    // Platform compatibility
    if (testContent.includes('process.platform') || testContent.includes('win32')) {
      expectations.push({
        type: 'platform-compatibility',
        description: 'Platform-specific behavior must work correctly',
        requirement: 'Cross-platform compatibility should be maintained',
        critical: false
      });
    }

    // Error handling patterns
    if (testContent.includes('try {') || testContent.includes('catch') || testContent.includes('throw')) {
      expectations.push({
        type: 'error-handling',
        description: 'Error handling behavior must be preserved',
        requirement: 'Error types and handling patterns should remain consistent',
        critical: false
      });
    }

    return expectations;
  }

  /**
   * Extract test assertions from content
   */
  private extractAssertions(testContent: string, framework: TestFramework): TestAssertion[] {
    const assertions: TestAssertion[] = [];

    // Extract expect() assertions
    const expectPattern = /expect\s*\(\s*([^)]+)\s*\)\s*\.([^(]+)\s*\(\s*([^)]*)\s*\)/g;
    let match;

    while ((match = expectPattern.exec(testContent)) !== null) {
      const target = match[1].trim();
      const assertion = match[2].trim();
      const expected = match[3].trim();

      let type: TestAssertion['type'] = 'equals';
      if (assertion.includes('toBe') || assertion.includes('toEqual')) {
        type = 'equals';
      } else if (assertion.includes('toContain')) {
        type = 'contains';
      } else if (assertion.includes('toThrow')) {
        type = 'throws';
      } else if (assertion.includes('toHaveBeenCalled')) {
        type = 'calls';
      }

      assertions.push({
        type,
        target,
        expected,
        description: `${target} should ${assertion} ${expected}`
      });
    }

    return assertions;
  }

  /**
   * Extract related files (imports, requires) from test content
   */
  private extractRelatedFiles(content: string, testFilePath: string): string[] {
    const relatedFiles: string[] = [];
    const testDir = path.dirname(testFilePath);

    // Extract import statements
    const importPatterns = [
      /import\s+.*\s+from\s+['"`]([^'"`]+)['"`]/g,
      /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g
    ];

    for (const pattern of importPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const importPath = match[1];

        // Resolve relative imports to absolute paths
        if (importPath.startsWith('.')) {
          const resolvedPath = path.resolve(testDir, importPath);
          relatedFiles.push(resolvedPath);
        } else if (!importPath.includes('node_modules') && !importPath.includes('@')) {
          // Local project files
          relatedFiles.push(importPath);
        }
      }
    }

    return relatedFiles;
  }

  /**
   * Find tests related to a specific file path
   */
  async findTestsForFile(filePath: string, options: TestDiscoveryOptions): Promise<TestFile[]> {
    const allTests = await this.discoverTests(options);

    return allTests.filter(testFile => {
      // Check if test file name suggests it tests the target file
      const targetFileName = path.basename(filePath, path.extname(filePath));
      const testFileName = path.basename(testFile.path);

      if (testFileName.includes(targetFileName)) {
        return true;
      }

      // Check if test imports or requires the target file
      return testFile.relatedFiles.some(relatedFile =>
        relatedFile.includes(targetFileName) || relatedFile === filePath
      );
    });
  }

  /**
   * Extract behavioral contracts that must be preserved during fixes
   */
  extractBehavioralContracts(testFiles: TestFile[]): BehavioralExpectation[] {
    const contracts: BehavioralExpectation[] = [];

    for (const testFile of testFiles) {
      for (const testCase of testFile.testCases) {
        contracts.push(...testCase.behavioralExpectations);
      }
    }

    // Deduplicate contracts
    const uniqueContracts = contracts.filter((contract, index, self) =>
      index === self.findIndex(c =>
        c.type === contract.type && c.requirement === contract.requirement
      )
    );

    return uniqueContracts;
  }
}