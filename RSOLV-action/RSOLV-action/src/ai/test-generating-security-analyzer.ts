/**
 * TestGeneratingSecurityAnalyzer - Phase 5E Implementation
 * 
 * Integrates all intelligent test generation components with the existing
 * SecurityAwareAnalyzer to provide comprehensive security analysis with
 * automated test generation.
 */

import { IssueContext, ActionConfig, AnalysisData } from '../types/index.js';
import { SecurityAwareAnalyzer, SecurityAnalysisResult } from './security-analyzer.js';
import { TestFrameworkDetector } from './test-framework-detector.js';
import { CoverageAnalyzer } from './coverage-analyzer.js';
import { IssueInterpreter } from './issue-interpreter.js';
import { AdaptiveTestGenerator, RepoStructure } from './adaptive-test-generator.js';
import { VulnerabilityTestSuite } from './test-generator.js';
import { Vulnerability } from '../security/types.js';
import { logger } from '../utils/logger.js';

export interface TestGenerationResult {
  framework: string;
  testCode: string;
  testSuite: VulnerabilityTestSuite;
  suggestedFileName?: string;
  notes?: string;
}

export interface AnalysisWithTestsResult extends AnalysisData {
  securityAnalysis?: SecurityAnalysisResult;
  generatedTests?: {
    success: boolean;
    testSuite?: VulnerabilityTestSuite;
    tests: TestGenerationResult[];
    error?: string;
  };
}

export class TestGeneratingSecurityAnalyzer extends SecurityAwareAnalyzer {
  private frameworkDetector: TestFrameworkDetector;
  private coverageAnalyzer: CoverageAnalyzer;
  private issueInterpreter: IssueInterpreter;
  private adaptiveGenerator: AdaptiveTestGenerator;

  constructor(aiConfig?: any) {
    super();
    this.frameworkDetector = new TestFrameworkDetector();
    this.coverageAnalyzer = new CoverageAnalyzer();
    this.issueInterpreter = new IssueInterpreter();
    this.adaptiveGenerator = new AdaptiveTestGenerator(
      this.frameworkDetector,
      this.coverageAnalyzer,
      this.issueInterpreter,
      aiConfig
    );
  }

  /**
   * Analyze issue with security scanning and test generation
   */
  async analyzeWithTestGeneration(
    issue: IssueContext,
    config: ActionConfig,
    codebaseFiles?: Map<string, string>,
    injectedClient?: any
  ): Promise<AnalysisWithTestsResult> {
    logger.info(`Analyzing issue #${issue.number} with test generation`);

    // Perform security analysis first
    const analysisResult = await this.analyzeWithSecurity(issue, config, codebaseFiles, injectedClient);

    // Extract vulnerabilities from security analysis
    const vulnerabilities = analysisResult.securityAnalysis?.vulnerabilities || [];

    // If no vulnerabilities found, try to interpret from issue
    if (vulnerabilities.length === 0) {
      logger.info('No vulnerabilities from security scan, interpreting issue description');
      const interpretedIssue = await this.issueInterpreter.interpretIssue(issue);
      
      if (interpretedIssue.vulnerabilityType) {
        // Convert to vulnerability format
        const vulnerability = this.convertInterpretedIssueToVulnerability(interpretedIssue);
        vulnerabilities.push(vulnerability);
      }
    }

    // Generate tests for each vulnerability
    const testResults: TestGenerationResult[] = [];
    let overallTestSuite: VulnerabilityTestSuite | undefined;

    if (vulnerabilities.length > 0 && codebaseFiles) {
      // Convert Map to RepoStructure
      const repoStructure: RepoStructure = {};
      for (const [path, content] of codebaseFiles.entries()) {
        repoStructure[path] = content;
      }

      // Generate tests for each vulnerability
      for (const vulnerability of vulnerabilities) {
        try {
          const result = await this.adaptiveGenerator.generateAdaptiveTests(
            vulnerability,
            repoStructure
          );

          if (result.success && result.testSuite) {
            testResults.push({
              framework: result.framework,
              testCode: result.testCode,
              testSuite: result.testSuite,
              suggestedFileName: result.suggestedFileName,
              notes: result.notes
            });

            // Use the first test suite as the overall suite
            if (!overallTestSuite) {
              overallTestSuite = result.testSuite;
            }
          }
        } catch (error) {
          logger.error(`Failed to generate tests for vulnerability: ${vulnerability.type}`, error as Error);
        }
      }
    }

    // Combine results
    const result: AnalysisWithTestsResult = {
      ...analysisResult,
      generatedTests: {
        success: testResults.length > 0,
        testSuite: overallTestSuite,
        tests: testResults,
        error: testResults.length === 0 && vulnerabilities.length > 0 
          ? 'Failed to generate tests for detected vulnerabilities' 
          : undefined
      }
    };

    logger.info(`Generated ${testResults.length} test(s) for issue #${issue.number}`);
    return result;
  }

  /**
   * Convert InterpretedIssue to Vulnerability format
   */
  private convertInterpretedIssueToVulnerability(interpretedIssue: any): Vulnerability {
    // Map issue interpreter types to vulnerability types
    const typeMap: Record<string, string> = {
      'sql-injection': 'SQL_INJECTION',
      'xss': 'XSS',
      'command-injection': 'COMMAND_INJECTION',
      'path-traversal': 'PATH_TRAVERSAL',
      'xxe': 'XXE',
      'ssrf': 'SSRF',
      'insecure-deserialization': 'INSECURE_DESERIALIZATION'
    };

    return {
      type: typeMap[interpretedIssue.vulnerabilityType] || interpretedIssue.vulnerabilityType.toUpperCase(),
      severity: interpretedIssue.severity || 'medium',
      filePath: interpretedIssue.affectedFiles?.[0] || 'unknown',
      line: interpretedIssue.affectedLines?.[0] || 0,
      description: interpretedIssue.description || 'Security vulnerability detected',
      confidence: 80,
      message: interpretedIssue.description || 'Security vulnerability detected'
    };
  }
}