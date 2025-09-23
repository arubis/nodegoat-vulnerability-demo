/**
 * Test-Aware Enhancement for Claude CLI Context
 *
 * This module integrates test discovery and behavioral contract extraction
 * into the existing Claude CLI adapter to provide test-aware fix generation.
 *
 * Addresses the core Phase 1 RED issue: AI lacks visibility into existing tests
 * and behavioral contracts when generating security fixes.
 */

import { TestDiscoveryService, TestFile, BehavioralExpectation } from './test-discovery.js';
import { BehavioralContractExtractor, BehavioralContract, FixGenerationConstraints } from './behavioral-contract-extractor.js';
import { IssueContext } from '../../types/index.js';
import { IssueAnalysis } from '../types.js';
import { logger } from '../../utils/logger.js';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface TestAwareContext {
  relatedTests: TestFile[];
  behavioralContracts: BehavioralContract[];
  constraints: FixGenerationConstraints;
  testFramework: string;
  testCommand: string;
  preserveRequirements: string[];
  securityRequirements: string[];
}

export interface TestAwareOptions {
  /**
   * Enable test discovery and contract extraction
   */
  enabled: boolean;

  /**
   * Path to vulnerable file for contract extraction
   */
  vulnerableFilePath?: string;

  /**
   * Root directory for test discovery
   */
  testDiscoveryRoot?: string;

  /**
   * Maximum time to spend on test discovery (ms)
   */
  discoveryTimeout?: number;

  /**
   * Include test content in AI context
   */
  includeTestContent?: boolean;

  /**
   * Verbose logging for debugging
   */
  verbose?: boolean;
}

export class TestAwareEnhancement {
  private testDiscovery: TestDiscoveryService;
  private contractExtractor: BehavioralContractExtractor;

  constructor() {
    this.testDiscovery = new TestDiscoveryService();
    this.contractExtractor = new BehavioralContractExtractor();
  }

  /**
   * Enhance issue context with test-aware information
   */
  async enhanceContext(
    issueContext: IssueContext,
    analysis: IssueAnalysis,
    repoPath: string,
    options: TestAwareOptions = { enabled: true }
  ): Promise<TestAwareContext | null> {
    if (!options.enabled) {
      return null;
    }

    const startTime = Date.now();
    const timeout = options.discoveryTimeout || 30000; // 30 second default

    try {
      logger.info('[TestAware] Starting test discovery and contract extraction...');

      // Step 1: Discover related tests
      const relatedTests = await Promise.race([
        this.discoverRelatedTests(issueContext, analysis, repoPath, options),
        new Promise<TestFile[]>((_, reject) =>
          setTimeout(() => reject(new Error('Test discovery timeout')), timeout)
        )
      ]);

      // Step 2: Extract behavioral contracts from vulnerable code
      const behavioralContracts = await this.extractBehavioralContracts(
        issueContext,
        analysis,
        repoPath,
        relatedTests,
        options
      );

      // Step 3: Generate fix constraints
      const constraints = this.contractExtractor.generateFixConstraints(behavioralContracts);

      // Step 4: Determine testing setup
      const testFramework = this.determineTestFramework(relatedTests, repoPath);
      const testCommand = await this.determineTestCommand(repoPath, testFramework);

      const context: TestAwareContext = {
        relatedTests,
        behavioralContracts,
        constraints,
        testFramework,
        testCommand,
        preserveRequirements: constraints.preserveRequired,
        securityRequirements: constraints.securityRequirements
      };

      const elapsed = Date.now() - startTime;
      logger.info(`[TestAware] Enhancement completed in ${elapsed}ms: found ${relatedTests.length} tests, ${behavioralContracts.length} contracts`);

      if (options.verbose) {
        this.logTestAwareDetails(context);
      }

      return context;

    } catch (error) {
      const elapsed = Date.now() - startTime;
      logger.warn(`[TestAware] Enhancement failed after ${elapsed}ms:`, error);
      return null;
    }
  }

  /**
   * Generate test-aware prompt enhancement
   */
  generatePromptEnhancement(context: TestAwareContext): string {
    if (!context || context.relatedTests.length === 0) {
      return '';
    }

    let enhancement = '\n\n## 🧪 TEST-AWARE FIX GENERATION\n';
    enhancement += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

    enhancement += '**CRITICAL**: The following tests and behavioral contracts MUST be preserved during your fix.\n\n';

    // Add behavioral contracts
    if (context.behavioralContracts.length > 0) {
      enhancement += '### 📋 BEHAVIORAL CONTRACTS TO PRESERVE\n\n';

      for (const contract of context.behavioralContracts) {
        enhancement += `#### Function: ${contract.functionSignature.name}\n\n`;
        enhancement += '**Function Signature:**\n';
        enhancement += `- Parameters: ${contract.functionSignature.parameters.map(p => `${p.name}: ${p.type}`).join(', ')}\n`;
        enhancement += `- Return type: ${contract.functionSignature.returnType}\n`;

        if (contract.functionSignature.callbackPattern) {
          enhancement += `- Callback: ${contract.functionSignature.callbackPattern.name}(${contract.functionSignature.callbackPattern.expectedArgs.join(', ')})\n`;
          enhancement += `- Callback behavior: ${contract.functionSignature.callbackPattern.behavior}\n`;
        }

        enhancement += '\n**Environment Handling:**\n';
        enhancement += `- Default: ${contract.environmentHandling.defaultEnvironment}\n`;
        enhancement += `- Precedence: ${contract.environmentHandling.precedenceOrder.join(' || ')}\n`;

        if (contract.platformCompatibility.windowsSupport) {
          enhancement += '\n**Platform Compatibility:**\n';
          enhancement += `- Windows support: Required\n`;
          enhancement += `- Command pattern: ${contract.platformCompatibility.commandPrefixPattern}\n`;
        }

        enhancement += '\n**Error Handling:**\n';
        enhancement += `- Pattern: ${contract.errorHandling.errorHandlingPattern}\n`;
        enhancement += `- Callback behavior: ${contract.errorHandling.callbackBehavior}\n`;

        enhancement += '\n---\n\n';
      }
    }

    // Add fix constraints
    enhancement += '### ✅ REQUIRED PRESERVATION CONSTRAINTS\n\n';
    for (const requirement of context.preserveRequirements) {
      enhancement += `- ✅ ${requirement}\n`;
    }

    enhancement += '\n### 🔒 SECURITY REQUIREMENTS\n\n';
    for (const requirement of context.securityRequirements) {
      enhancement += `- 🔒 ${requirement}\n`;
    }

    enhancement += '\n### ✅ ALLOWED CHANGES\n\n';
    for (const change of context.constraints.allowedChanges) {
      enhancement += `- ✅ ${change}\n`;
    }

    enhancement += '\n### ❌ FORBIDDEN CHANGES\n\n';
    for (const forbidden of context.constraints.forbiddenChanges) {
      enhancement += `- ❌ ${forbidden}\n`;
    }

    // Add related tests information
    if (context.relatedTests.length > 0) {
      enhancement += '\n### 🧪 RELATED TESTS TO CONSIDER\n\n';
      enhancement += `Found ${context.relatedTests.length} test files that may be affected by your changes:\n\n`;

      for (const testFile of context.relatedTests.slice(0, 5)) { // Show max 5 files
        enhancement += `**${path.basename(testFile.path)}** (${testFile.testFramework})\n`;
        if (testFile.testCases.length > 0) {
          enhancement += `- ${testFile.testCases.length} test cases covering behavioral expectations\n`;
          for (const testCase of testFile.testCases.slice(0, 3)) { // Show max 3 test cases
            enhancement += `  - "${testCase.name}"\n`;
          }
        }
        enhancement += '\n';
      }

      enhancement += `**Test Command**: \`${context.testCommand}\`\n\n`;
    }

    // Add test-aware instructions
    enhancement += '### 🎯 TEST-AWARE FIX INSTRUCTIONS\n\n';
    enhancement += '1. **BEFORE FIXING**: Read existing tests to understand expected behavior\n';
    enhancement += '2. **DURING FIXING**: Ensure your changes preserve all behavioral contracts\n';
    enhancement += '3. **AFTER FIXING**: Run tests to verify behavioral preservation\n';
    enhancement += '4. **VALIDATION**: Confirm both security fix AND behavioral preservation\n\n';

    enhancement += '**REMEMBER**: Your fix must be INCREMENTAL, not a comprehensive rewrite.\n';
    enhancement += 'Focus on fixing the security issue while preserving existing functionality.\n\n';

    return enhancement;
  }

  /**
   * Discover tests related to the vulnerable code
   */
  private async discoverRelatedTests(
    issueContext: IssueContext,
    analysis: IssueAnalysis,
    repoPath: string,
    options: TestAwareOptions
  ): Promise<TestFile[]> {
    const discoveryRoot = options.testDiscoveryRoot || repoPath;

    // Discover all tests
    const allTests = await this.testDiscovery.discoverTests({
      rootDir: discoveryRoot,
      analyzeContent: true
    });

    // If we have specific files mentioned, find tests for those
    const relatedTests: TestFile[] = [];

    if (analysis.relatedFiles && analysis.relatedFiles.length > 0) {
      for (const filePath of analysis.relatedFiles) {
        const testsForFile = await this.testDiscovery.findTestsForFile(filePath, {
          rootDir: discoveryRoot,
          analyzeContent: true
        });
        relatedTests.push(...testsForFile);
      }
    }

    // Also search by issue title/description keywords
    const keywords = this.extractKeywords(issueContext);
    for (const test of allTests) {
      if (this.testContainsKeywords(test, keywords)) {
        relatedTests.push(test);
      }
    }

    // Deduplicate
    const uniqueTests = relatedTests.filter((test, index, self) =>
      index === self.findIndex(t => t.path === test.path)
    );

    return uniqueTests;
  }

  /**
   * Extract behavioral contracts from vulnerable code and tests
   */
  private async extractBehavioralContracts(
    issueContext: IssueContext,
    analysis: IssueAnalysis,
    repoPath: string,
    relatedTests: TestFile[],
    options: TestAwareOptions
  ): Promise<BehavioralContract[]> {
    const contracts: BehavioralContract[] = [];

    // Extract from vulnerable file if specified
    if (options.vulnerableFilePath) {
      try {
        const vulnerableContent = await fs.readFile(
          path.resolve(repoPath, options.vulnerableFilePath),
          'utf-8'
        );
        const contract = await this.contractExtractor.extractFromVulnerableCode(
          options.vulnerableFilePath,
          vulnerableContent
        );
        contracts.push(contract);
      } catch (error) {
        logger.warn(`[TestAware] Could not read vulnerable file ${options.vulnerableFilePath}:`, error);
      }
    }

    // Extract from related files mentioned in analysis
    if (analysis.relatedFiles) {
      for (const filePath of analysis.relatedFiles) {
        try {
          const fullPath = path.resolve(repoPath, filePath);
          const content = await fs.readFile(fullPath, 'utf-8');
          const contract = await this.contractExtractor.extractFromVulnerableCode(filePath, content);
          contracts.push(contract);
        } catch (error) {
          logger.warn(`[TestAware] Could not read related file ${filePath}:`, error);
        }
      }
    }

    // Extract from related tests
    const testContracts = this.contractExtractor.extractFromTests(relatedTests);
    contracts.push(...testContracts);

    return contracts;
  }

  /**
   * Determine the testing framework being used
   */
  private determineTestFramework(relatedTests: TestFile[], repoPath: string): string {
    // Check what frameworks are used in tests
    const frameworks = relatedTests.map(test => test.testFramework);
    const frameworkCounts = frameworks.reduce((acc, framework) => {
      acc[framework] = (acc[framework] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Return most common framework
    const mostCommon = Object.entries(frameworkCounts)
      .sort(([, a], [, b]) => b - a)[0];

    return mostCommon ? mostCommon[0] : 'unknown';
  }

  /**
   * Determine the test command to run
   */
  private async determineTestCommand(repoPath: string, testFramework: string): Promise<string> {
    try {
      // Check package.json for test scripts
      const packageJsonPath = path.join(repoPath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

      if (packageJson.scripts?.test) {
        return `npm test`;
      }

      // Framework-specific defaults
      switch (testFramework) {
        case 'jest':
          return 'npx jest';
        case 'vitest':
          return 'npx vitest run';
        case 'mocha':
          return 'npx mocha';
        case 'tap':
          return 'npx tap';
        default:
          return 'npm test';
      }
    } catch (error) {
      return 'npm test'; // Safe default
    }
  }

  /**
   * Extract keywords from issue context for test matching
   */
  private extractKeywords(issueContext: IssueContext): string[] {
    const keywords: string[] = [];

    // Extract from title
    const titleWords = issueContext.title.toLowerCase().split(/\s+/);
    keywords.push(...titleWords.filter(word => word.length > 3));

    // Extract from body
    const bodyWords = issueContext.body.toLowerCase().split(/\s+/);
    keywords.push(...bodyWords.filter(word => word.length > 4));

    // Add security-related keywords
    keywords.push('security', 'vulnerability', 'injection', 'xss', 'sql', 'csrf');

    return [...new Set(keywords)];
  }

  /**
   * Check if test contains relevant keywords
   */
  private testContainsKeywords(test: TestFile, keywords: string[]): boolean {
    const testContent = test.content.toLowerCase();
    return keywords.some(keyword => testContent.includes(keyword));
  }

  /**
   * Log detailed test-aware information for debugging
   */
  private logTestAwareDetails(context: TestAwareContext): void {
    logger.info('[TestAware] Detailed context:');
    logger.info(`- Related tests: ${context.relatedTests.length}`);
    logger.info(`- Behavioral contracts: ${context.behavioralContracts.length}`);
    logger.info(`- Test framework: ${context.testFramework}`);
    logger.info(`- Test command: ${context.testCommand}`);
    logger.info(`- Preserve requirements: ${context.preserveRequirements.length}`);
    logger.info(`- Security requirements: ${context.securityRequirements.length}`);

    for (const contract of context.behavioralContracts) {
      logger.info(`- Contract for: ${contract.functionSignature.name}`);
      if (contract.functionSignature.callbackPattern) {
        logger.info(`  - Callback: ${contract.functionSignature.callbackPattern.behavior}`);
      }
    }
  }
}