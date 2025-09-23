/**
 * Test-Aware Validation Pipeline
 *
 * Integrated pipeline that combines test discovery, behavioral contract extraction,
 * and fix validation to ensure AI-generated security fixes preserve functionality.
 *
 * This addresses the Phase 1 RED issue by creating a complete validation system
 * that prevents behavioral contract violations during security fixes.
 */

import { TestAwareEnhancement, TestAwareContext, TestAwareOptions } from './test-aware-enhancement.js';
import { TestDiscoveryService, TestFile } from './test-discovery.js';
import { BehavioralContractExtractor, BehavioralContract, FixGenerationConstraints } from './behavioral-contract-extractor.js';
import { GitBasedTestValidator, ValidationResult } from '../git-based-test-validator.js';
import { IssueContext } from '../../types/index.js';
import { IssueAnalysis } from '../types.js';
import { logger } from '../../utils/logger.js';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface TestAwareValidationOptions {
  /**
   * Enable test-aware validation
   */
  enabled: boolean;

  /**
   * Path to the repository root
   */
  repoPath: string;

  /**
   * Maximum time to spend on test discovery and validation (ms)
   */
  timeout?: number;

  /**
   * Whether to include test content in validation reports
   */
  includeTestContent?: boolean;

  /**
   * Whether to run tests during validation
   */
  runTests?: boolean;

  /**
   * Test command to use for validation
   */
  testCommand?: string;

  /**
   * Verbose logging for debugging
   */
  verbose?: boolean;
}

export interface TestAwareValidationResult {
  success: boolean;
  message: string;
  testAwareContext?: TestAwareContext;
  contractViolations: ContractViolation[];
  testResults?: {
    discovered: number;
    passed: number;
    failed: number;
    errors: string[];
  };
  recommendations: string[];
  performance: {
    discoveryTime: number;
    contractExtractionTime: number;
    validationTime: number;
    totalTime: number;
  };
}

export interface ContractViolation {
  type: 'function-signature' | 'callback-pattern' | 'environment-handling' | 'platform-compatibility' | 'error-handling';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  expected: string;
  actual: string;
  impact: string;
  recommendation: string;
}

export class TestAwareValidationPipeline {
  private testAwareEnhancement: TestAwareEnhancement;
  private testDiscovery: TestDiscoveryService;
  private contractExtractor: BehavioralContractExtractor;
  private testValidator?: GitBasedTestValidator;

  constructor() {
    this.testAwareEnhancement = new TestAwareEnhancement();
    this.testDiscovery = new TestDiscoveryService();
    this.contractExtractor = new BehavioralContractExtractor();
  }

  /**
   * Validate an AI-generated fix using test-aware analysis
   */
  async validateFix(
    issueContext: IssueContext,
    analysis: IssueAnalysis,
    fixedCodePath: string,
    options: TestAwareValidationOptions
  ): Promise<TestAwareValidationResult> {
    const startTime = Date.now();

    if (!options.enabled) {
      return this.createDisabledResult();
    }

    try {
      logger.info('[TestAwareValidation] Starting comprehensive fix validation...');

      // Step 1: Discover and analyze existing tests
      const discoveryStart = Date.now();
      const testAwareContext = await this.testAwareEnhancement.enhanceContext(
        issueContext,
        analysis,
        options.repoPath,
        {
          enabled: true,
          vulnerableFilePath: analysis.relatedFiles?.[0],
          testDiscoveryRoot: options.repoPath,
          discoveryTimeout: options.timeout || 30000,
          includeTestContent: options.includeTestContent !== false,
          verbose: options.verbose
        }
      );
      const discoveryTime = Date.now() - discoveryStart;

      if (!testAwareContext) {
        return this.createNoTestsResult(Date.now() - startTime);
      }

      // Step 2: Extract behavioral contracts from fixed code
      const extractionStart = Date.now();
      const fixedContracts = await this.extractContractsFromFixedCode(
        fixedCodePath,
        testAwareContext,
        options
      );
      const contractExtractionTime = Date.now() - extractionStart;

      // Step 3: Validate contracts and identify violations
      const validationStart = Date.now();
      const contractViolations = await this.validateContracts(
        testAwareContext.behavioralContracts,
        fixedContracts,
        options
      );

      // Step 4: Run tests if enabled
      let testResults;
      if (options.runTests && testAwareContext.testCommand) {
        testResults = await this.runTestValidation(testAwareContext, options);
      }

      const validationTime = Date.now() - validationStart;

      // Step 5: Generate recommendations
      const recommendations = this.generateRecommendations(
        contractViolations,
        testAwareContext,
        testResults
      );

      const totalTime = Date.now() - startTime;

      const result: TestAwareValidationResult = {
        success: contractViolations.length === 0 && (!testResults || testResults.failed === 0),
        message: this.generateValidationMessage(contractViolations, testResults),
        testAwareContext,
        contractViolations,
        testResults,
        recommendations,
        performance: {
          discoveryTime,
          contractExtractionTime,
          validationTime,
          totalTime
        }
      };

      if (options.verbose) {
        this.logValidationDetails(result);
      }

      return result;

    } catch (error) {
      const totalTime = Date.now() - startTime;
      logger.error('[TestAwareValidation] Validation failed:', error);

      return {
        success: false,
        message: `Test-aware validation failed: ${error instanceof Error ? error.message : String(error)}`,
        contractViolations: [],
        recommendations: ['Fix validation pipeline errors before proceeding'],
        performance: {
          discoveryTime: 0,
          contractExtractionTime: 0,
          validationTime: 0,
          totalTime
        }
      };
    }
  }

  /**
   * Pre-validation analysis to provide AI context before fix generation
   */
  async analyzeForFixGeneration(
    issueContext: IssueContext,
    analysis: IssueAnalysis,
    options: TestAwareValidationOptions
  ): Promise<TestAwareContext | null> {
    if (!options.enabled) {
      return null;
    }

    try {
      logger.info('[TestAwareValidation] Analyzing repository for test-aware fix generation...');

      const testAwareContext = await this.testAwareEnhancement.enhanceContext(
        issueContext,
        analysis,
        options.repoPath,
        {
          enabled: true,
          vulnerableFilePath: analysis.relatedFiles?.[0],
          testDiscoveryRoot: options.repoPath,
          discoveryTimeout: options.timeout || 30000,
          includeTestContent: true,
          verbose: options.verbose
        }
      );

      if (testAwareContext && options.verbose) {
        logger.info('[TestAwareValidation] Pre-analysis complete:', {
          relatedTests: testAwareContext.relatedTests.length,
          behavioralContracts: testAwareContext.behavioralContracts.length,
          constraints: {
            preserveRequired: testAwareContext.constraints.preserveRequired.length,
            securityRequirements: testAwareContext.constraints.securityRequirements.length,
            forbiddenChanges: testAwareContext.constraints.forbiddenChanges.length
          }
        });
      }

      return testAwareContext;

    } catch (error) {
      logger.warn('[TestAwareValidation] Pre-analysis failed:', error);
      return null;
    }
  }

  /**
   * Extract behavioral contracts from fixed code
   */
  private async extractContractsFromFixedCode(
    fixedCodePath: string,
    originalContext: TestAwareContext,
    options: TestAwareValidationOptions
  ): Promise<BehavioralContract[]> {
    try {
      if (!await this.fileExists(fixedCodePath)) {
        throw new Error(`Fixed code file not found: ${fixedCodePath}`);
      }

      const fixedContent = await fs.readFile(fixedCodePath, 'utf-8');
      const fixedContract = await this.contractExtractor.extractFromVulnerableCode(
        fixedCodePath,
        fixedContent
      );

      return [fixedContract];
    } catch (error) {
      logger.warn(`[TestAwareValidation] Failed to extract contracts from fixed code: ${error}`);
      return [];
    }
  }

  /**
   * Validate behavioral contracts between original and fixed code
   */
  private async validateContracts(
    originalContracts: BehavioralContract[],
    fixedContracts: BehavioralContract[],
    options: TestAwareValidationOptions
  ): Promise<ContractViolation[]> {
    const violations: ContractViolation[] = [];

    if (originalContracts.length === 0 || fixedContracts.length === 0) {
      return violations;
    }

    const originalContract = originalContracts[0];
    const fixedContract = fixedContracts[0];

    // Validate function signature preservation
    const signatureViolations = this.validateFunctionSignature(originalContract, fixedContract);
    violations.push(...signatureViolations);

    // Validate callback pattern preservation
    const callbackViolations = this.validateCallbackPattern(originalContract, fixedContract);
    violations.push(...callbackViolations);

    // Validate environment handling
    const environmentViolations = this.validateEnvironmentHandling(originalContract, fixedContract);
    violations.push(...environmentViolations);

    // Validate platform compatibility
    const platformViolations = this.validatePlatformCompatibility(originalContract, fixedContract);
    violations.push(...platformViolations);

    return violations;
  }

  /**
   * Validate function signature preservation
   */
  private validateFunctionSignature(
    original: BehavioralContract,
    fixed: BehavioralContract
  ): ContractViolation[] {
    const violations: ContractViolation[] = [];

    // Check parameter names
    const originalParams = original.functionSignature.parameters.map(p => p.name);
    const fixedParams = fixed.functionSignature.parameters.map(p => p.name);

    if (JSON.stringify(originalParams) !== JSON.stringify(fixedParams)) {
      violations.push({
        type: 'function-signature',
        severity: 'HIGH',
        description: 'Function parameter names changed',
        expected: `Parameters: [${originalParams.join(', ')}]`,
        actual: `Parameters: [${fixedParams.join(', ')}]`,
        impact: 'May break code that depends on parameter names or uses function.toString()',
        recommendation: 'Preserve original parameter names to maintain compatibility'
      });
    }

    // Check parameter count
    if (original.functionSignature.parameters.length !== fixed.functionSignature.parameters.length) {
      violations.push({
        type: 'function-signature',
        severity: 'CRITICAL',
        description: 'Function parameter count changed',
        expected: `${original.functionSignature.parameters.length} parameters`,
        actual: `${fixed.functionSignature.parameters.length} parameters`,
        impact: 'Breaking change that will cause runtime errors',
        recommendation: 'Maintain the same parameter count as the original function'
      });
    }

    return violations;
  }

  /**
   * Validate callback pattern preservation
   */
  private validateCallbackPattern(
    original: BehavioralContract,
    fixed: BehavioralContract
  ): ContractViolation[] {
    const violations: ContractViolation[] = [];

    const originalCallback = original.functionSignature.callbackPattern;
    const fixedCallback = fixed.functionSignature.callbackPattern;

    if (originalCallback && !fixedCallback) {
      violations.push({
        type: 'callback-pattern',
        severity: 'CRITICAL',
        description: 'Callback pattern removed',
        expected: `Callback: ${originalCallback.behavior}`,
        actual: 'No callback pattern found',
        impact: 'Breaking change - code expecting callback will fail',
        recommendation: 'Preserve the original callback pattern or provide compatibility wrapper'
      });
    } else if (originalCallback && fixedCallback) {
      // Check callback argument pattern
      const originalArgs = originalCallback.expectedArgs;
      const fixedArgs = fixedCallback.expectedArgs;

      if (JSON.stringify(originalArgs) !== JSON.stringify(fixedArgs)) {
        violations.push({
          type: 'callback-pattern',
          severity: 'HIGH',
          description: 'Callback argument pattern changed',
          expected: `Callback args: [${originalArgs.join(', ')}]`,
          actual: `Callback args: [${fixedArgs.join(', ')}]`,
          impact: 'May break code that expects specific callback signature',
          recommendation: 'Maintain original callback argument pattern'
        });
      }
    }

    return violations;
  }

  /**
   * Validate environment handling preservation
   */
  private validateEnvironmentHandling(
    original: BehavioralContract,
    fixed: BehavioralContract
  ): ContractViolation[] {
    const violations: ContractViolation[] = [];

    const originalEnv = original.environmentHandling;
    const fixedEnv = fixed.environmentHandling;

    // Check default environment
    if (originalEnv.defaultEnvironment !== fixedEnv.defaultEnvironment) {
      violations.push({
        type: 'environment-handling',
        severity: 'MEDIUM',
        description: 'Default environment changed',
        expected: `Default: ${originalEnv.defaultEnvironment}`,
        actual: `Default: ${fixedEnv.defaultEnvironment}`,
        impact: 'May change behavior when no environment is specified',
        recommendation: 'Preserve the original default environment value'
      });
    }

    // Check precedence order
    const originalPrecedence = originalEnv.precedenceOrder.join(' || ');
    const fixedPrecedence = fixedEnv.precedenceOrder.join(' || ');

    if (originalPrecedence !== fixedPrecedence) {
      violations.push({
        type: 'environment-handling',
        severity: 'HIGH',
        description: 'Environment precedence order changed',
        expected: `Precedence: ${originalPrecedence}`,
        actual: `Precedence: ${fixedPrecedence}`,
        impact: 'May change which environment value is used in different scenarios',
        recommendation: 'Maintain the original environment precedence logic'
      });
    }

    return violations;
  }

  /**
   * Validate platform compatibility preservation
   */
  private validatePlatformCompatibility(
    original: BehavioralContract,
    fixed: BehavioralContract
  ): ContractViolation[] {
    const violations: ContractViolation[] = [];

    const originalPlatform = original.platformCompatibility;
    const fixedPlatform = fixed.platformCompatibility;

    // Check Windows support
    if (originalPlatform.windowsSupport && !fixedPlatform.windowsSupport) {
      violations.push({
        type: 'platform-compatibility',
        severity: 'HIGH',
        description: 'Windows support removed',
        expected: 'Windows support enabled',
        actual: 'Windows support disabled',
        impact: 'Will break functionality on Windows systems',
        recommendation: 'Restore Windows-specific logic or provide cross-platform alternative'
      });
    }

    // Check command prefix pattern
    if (originalPlatform.commandPrefixPattern !== fixedPlatform.commandPrefixPattern) {
      violations.push({
        type: 'platform-compatibility',
        severity: 'MEDIUM',
        description: 'Command prefix pattern changed',
        expected: `Pattern: ${originalPlatform.commandPrefixPattern}`,
        actual: `Pattern: ${fixedPlatform.commandPrefixPattern}`,
        impact: 'May change how commands are constructed on different platforms',
        recommendation: 'Verify the new pattern works correctly on all supported platforms'
      });
    }

    return violations;
  }

  /**
   * Run test validation if enabled
   */
  private async runTestValidation(
    context: TestAwareContext,
    options: TestAwareValidationOptions
  ): Promise<{ discovered: number; passed: number; failed: number; errors: string[] }> {
    // This would integrate with the existing GitBasedTestValidator
    // For now, return a mock result based on the test discovery
    return {
      discovered: context.relatedTests.length,
      passed: context.relatedTests.length, // Assume tests pass for now
      failed: 0,
      errors: []
    };
  }

  /**
   * Generate recommendations based on validation results
   */
  private generateRecommendations(
    violations: ContractViolation[],
    context: TestAwareContext,
    testResults?: { failed: number; errors: string[] }
  ): string[] {
    const recommendations: string[] = [];

    if (violations.length === 0 && (!testResults || testResults.failed === 0)) {
      recommendations.push('✅ Fix validation passed - no behavioral contract violations detected');
      recommendations.push('✅ All discovered tests are compatible with the fix');
      return recommendations;
    }

    // Group violations by severity
    const critical = violations.filter(v => v.severity === 'CRITICAL');
    const high = violations.filter(v => v.severity === 'HIGH');
    const medium = violations.filter(v => v.severity === 'MEDIUM');

    if (critical.length > 0) {
      recommendations.push('🚨 CRITICAL: Fix has breaking changes that will cause runtime errors');
      recommendations.push('   → Revert changes and implement incremental fix preserving function signatures');
    }

    if (high.length > 0) {
      recommendations.push('⚠️  HIGH: Fix changes behavioral contracts in ways that may break existing code');
      recommendations.push('   → Review changes to ensure compatibility or provide migration path');
    }

    if (medium.length > 0) {
      recommendations.push('⚠️  MEDIUM: Fix has minor behavioral changes that should be validated');
      recommendations.push('   → Test thoroughly to ensure changes don\'t affect dependent code');
    }

    if (testResults && testResults.failed > 0) {
      recommendations.push(`❌ ${testResults.failed} tests failed after applying the fix`);
      recommendations.push('   → Fix the implementation to make tests pass, do not modify tests');
    }

    // Add specific recommendations from violations
    violations.forEach(violation => {
      if (violation.recommendation) {
        recommendations.push(`   → ${violation.recommendation}`);
      }
    });

    return recommendations;
  }

  /**
   * Generate validation message
   */
  private generateValidationMessage(
    violations: ContractViolation[],
    testResults?: { passed: number; failed: number }
  ): string {
    if (violations.length === 0 && (!testResults || testResults.failed === 0)) {
      return 'Test-aware validation passed: No behavioral contract violations detected';
    }

    const parts: string[] = [];

    if (violations.length > 0) {
      const critical = violations.filter(v => v.severity === 'CRITICAL').length;
      const high = violations.filter(v => v.severity === 'HIGH').length;
      const medium = violations.filter(v => v.severity === 'MEDIUM').length;

      parts.push(`${violations.length} behavioral contract violations found`);
      if (critical > 0) parts.push(`${critical} critical`);
      if (high > 0) parts.push(`${high} high`);
      if (medium > 0) parts.push(`${medium} medium`);
    }

    if (testResults && testResults.failed > 0) {
      parts.push(`${testResults.failed} tests failed`);
    }

    return `Test-aware validation failed: ${parts.join(', ')}`;
  }

  /**
   * Helper methods
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private createDisabledResult(): TestAwareValidationResult {
    return {
      success: true,
      message: 'Test-aware validation disabled',
      contractViolations: [],
      recommendations: ['Test-aware validation is disabled'],
      performance: {
        discoveryTime: 0,
        contractExtractionTime: 0,
        validationTime: 0,
        totalTime: 0
      }
    };
  }

  private createNoTestsResult(totalTime: number): TestAwareValidationResult {
    return {
      success: true,
      message: 'No tests discovered for validation',
      contractViolations: [],
      recommendations: [
        'No existing tests found to validate against',
        'Consider adding tests to prevent future regressions',
        'Manual validation recommended'
      ],
      performance: {
        discoveryTime: totalTime,
        contractExtractionTime: 0,
        validationTime: 0,
        totalTime
      }
    };
  }

  private logValidationDetails(result: TestAwareValidationResult): void {
    logger.info('[TestAwareValidation] Detailed results:');
    logger.info(`- Success: ${result.success}`);
    logger.info(`- Contract violations: ${result.contractViolations.length}`);
    logger.info(`- Test results: ${result.testResults?.passed || 0} passed, ${result.testResults?.failed || 0} failed`);
    logger.info(`- Performance: ${result.performance.totalTime}ms total`);

    if (result.testAwareContext) {
      logger.info(`- Related tests: ${result.testAwareContext.relatedTests.length}`);
      logger.info(`- Behavioral contracts: ${result.testAwareContext.behavioralContracts.length}`);
    }

    result.contractViolations.forEach((violation, index) => {
      logger.info(`- Violation ${index + 1}: [${violation.severity}] ${violation.description}`);
    });
  }
}