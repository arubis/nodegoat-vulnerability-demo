/**
 * Validation Mode Implementation
 * RFC-041: Prove vulnerabilities exist with RED tests
 */

import { IssueContext, ActionConfig } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { ValidationResult } from './types.js';
import { TestGeneratingSecurityAnalyzer } from '../ai/test-generating-security-analyzer.js';
import { GitBasedTestValidator } from '../ai/git-based-test-validator.js';
import { analyzeIssue } from '../ai/analyzer.js';
import { AIConfig } from '../ai/types.js';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export class ValidationMode {
  private config: ActionConfig;
  private falsePositiveCache: Set<string>;
  private repoPath: string;

  constructor(config: ActionConfig, repoPath?: string) {
    this.config = config;
    this.repoPath = repoPath || process.cwd();
    this.falsePositiveCache = new Set();
    this.loadFalsePositiveCache();
  }
  
  /**
   * Validate a single vulnerability
   */
  async validateVulnerability(issue: IssueContext): Promise<ValidationResult> {
    const isTestingMode = process.env.RSOLV_TESTING_MODE === 'true';

    logger.info(`[VALIDATION MODE] Starting validation for issue #${issue.number}`);
    if (isTestingMode) {
      logger.info(`[VALIDATION MODE] 🧪 TESTING MODE ENABLED - Will not filter based on test results`);
    }

    try {
      // Step 1: Ensure clean git state
      this.ensureCleanGitState();
      
      // Step 2: Check false positive cache
      const cacheKey = this.getCacheKey(issue);
      if (this.falsePositiveCache.has(cacheKey) && !process.env.RSOLV_SKIP_CACHE) {
        logger.info(`Issue #${issue.number} is in false positive cache, skipping`);
        return {
          issueId: issue.number,
          validated: false,
          falsePositiveReason: 'Previously identified as false positive',
          timestamp: new Date().toISOString(),
          commitHash: this.getCurrentCommitHash()
        };
      }
      
      // Step 3: Analyze the issue
      logger.info(`Analyzing issue #${issue.number} for validation`);
      const analysisData = await analyzeIssue(issue, this.config);
      
      if (!analysisData.canBeFixed) {
        logger.warn(`Issue #${issue.number} cannot be validated: ${analysisData.cannotFixReason}`);
        return {
          issueId: issue.number,
          validated: false,
          falsePositiveReason: analysisData.cannotFixReason || 'Analysis determined issue cannot be fixed',
          timestamp: new Date().toISOString(),
          commitHash: this.getCurrentCommitHash()
        };
      }
      
      // Step 4: Generate RED tests
      logger.info(`Generating RED tests for issue #${issue.number}`);
      const testResults = await this.generateRedTests(issue, analysisData);
      
      if (!testResults || !testResults.generatedTests) {
        logger.warn(`Failed to generate tests for issue #${issue.number}`);
        return {
          issueId: issue.number,
          validated: false,
          falsePositiveReason: 'Unable to generate validation tests',
          timestamp: new Date().toISOString(),
          commitHash: this.getCurrentCommitHash()
        };
      }
      
      // Step 5: RFC-058 - Create validation branch and commit tests
      logger.info(`Creating validation branch for test persistence`);
      let branchName: string | null = null;

      try {
        branchName = await this.createValidationBranch(issue);
        await this.commitTestsToBranch(testResults.generatedTests.testSuite, branchName);
        logger.info(`✅ Tests committed to validation branch: ${branchName}`);
      } catch (error) {
        logger.warn(`Could not create validation branch: ${error}`);
        // Continue with standard validation if branch creation fails
      }

      // Step 6: Run tests to verify they fail (proving vulnerability exists)
      logger.info(`Running RED tests to prove vulnerability exists`);
      const validator = new GitBasedTestValidator();
      const validationResult = await validator.validateFixWithTests(
        'HEAD',
        'HEAD',
        testResults.generatedTests.testSuite
      );

      // Step 7: Determine validation status
      // RED tests should FAIL on vulnerable code to prove vulnerability exists
      const isTestingMode = process.env.RSOLV_TESTING_MODE === 'true';

      if (validationResult.success) {
        // Tests passed = no vulnerability = false positive (unless in testing mode)
        if (isTestingMode) {
          logger.info(`[TESTING MODE] Tests passed but proceeding anyway for known vulnerable repo`);
          // In testing mode, still mark as validated to allow full workflow testing
          return {
            issueId: issue.number,
            validated: true,
            branchName: branchName || undefined,
            redTests: testResults.generatedTests.testSuite,
            testResults: validationResult,
            testingMode: true,
            testingModeNote: 'Tests passed but proceeding due to RSOLV_TESTING_MODE',
            timestamp: new Date().toISOString(),
            commitHash: this.getCurrentCommitHash()
          };
        } else {
          logger.info(`Tests passed on vulnerable code - marking as false positive`);
          this.addToFalsePositiveCache(issue);

          return {
            issueId: issue.number,
            validated: false,
            falsePositiveReason: 'Tests passed on allegedly vulnerable code',
            testResults: validationResult,
            timestamp: new Date().toISOString(),
            commitHash: this.getCurrentCommitHash()
          };
        }
      } else {
        // Tests failed = vulnerability exists = validated
        logger.info(`✅ Vulnerability validated! RED tests failed as expected`);

        // RFC-058: Store validation result with branch reference
        if (branchName) {
          await this.storeValidationResultWithBranch(issue, testResults, validationResult, branchName);
          logger.info(`Validation result stored with branch reference: ${branchName}`);
        } else {
          // Fallback to standard storage
          await this.storeValidationResult(issue, testResults, validationResult);
        }

        return {
          issueId: issue.number,
          validated: true,
          branchName: branchName || undefined,
          redTests: testResults.generatedTests.testSuite,
          testResults: validationResult,
          timestamp: new Date().toISOString(),
          commitHash: this.getCurrentCommitHash()
        };
      }
      
    } catch (error) {
      logger.error(`Validation failed for issue #${issue.number}:`, error);
      return {
        issueId: issue.number,
        validated: false,
        falsePositiveReason: `Validation error: ${error}`,
        timestamp: new Date().toISOString(),
        commitHash: this.getCurrentCommitHash()
      };
    }
  }
  
  /**
   * Validate multiple vulnerabilities in batch
   */
  async validateBatch(issues: IssueContext[]): Promise<ValidationResult[]> {
    logger.info(`[VALIDATION MODE] Validating batch of ${issues.length} issues`);
    const results: ValidationResult[] = [];
    
    for (const issue of issues) {
      const result = await this.validateVulnerability(issue);
      results.push(result);
      
      // Add delay between validations to avoid rate limits
      if (issues.indexOf(issue) < issues.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Summary
    const validated = results.filter(r => r.validated).length;
    const falsePositives = results.filter(r => !r.validated).length;
    
    logger.info(`[VALIDATION MODE] Batch complete:`);
    logger.info(`  - Validated: ${validated}`);
    logger.info(`  - False positives: ${falsePositives}`);
    
    return results;
  }
  
  /**
   * Generate RED tests for vulnerability validation
   */
  private async generateRedTests(issue: IssueContext, analysisData: any): Promise<any> {
    const aiConfig: AIConfig = {
      provider: 'anthropic',
      apiKey: this.config.aiProvider.apiKey,
      model: this.config.aiProvider.model,
      temperature: 0.2,
      maxTokens: this.config.aiProvider.maxTokens,
      useVendedCredentials: this.config.aiProvider.useVendedCredentials
    };
    
    const testAnalyzer = new TestGeneratingSecurityAnalyzer(aiConfig);
    
    // Get codebase files for test generation
    const codebaseFiles = new Map<string, string>();
    
    if (analysisData.filesToModify && analysisData.filesToModify.length > 0) {
      for (const filePath of analysisData.filesToModify) {
        try {
          const fullPath = path.resolve(this.repoPath, filePath);
          if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            codebaseFiles.set(filePath, content);
            logger.debug(`Added file for test generation: ${filePath}`);
          }
        } catch (error) {
          logger.warn(`Could not read file ${filePath}:`, error);
        }
      }
    }
    
    // Generate tests focused on proving vulnerability exists
    return await testAnalyzer.analyzeWithTestGeneration(
      issue,
      this.config,
      codebaseFiles
    );
  }
  
  /**
   * RFC-058: Create validation branch for test persistence
   */
  async createValidationBranch(issue: IssueContext): Promise<string> {
    const branchName = `rsolv/validate/issue-${issue.number}`;

    try {
      // Create and checkout branch
      execSync(`git checkout -b ${branchName}`, { cwd: this.repoPath });
      logger.info(`Created validation branch: ${branchName}`);

      return branchName;
    } catch (error) {
      logger.error(`Failed to create validation branch ${branchName}:`, error);
      throw error;
    }
  }

  /**
   * RFC-058: Commit generated tests to validation branch
   */
  async commitTestsToBranch(testContent: any, branchName: string): Promise<void> {
    try {
      // Create test directory structure
      const testDir = path.join(this.repoPath, '.rsolv', 'tests');
      fs.mkdirSync(testDir, { recursive: true });

      // Ensure testContent is a string
      let testString: string;
      if (typeof testContent === 'string') {
        testString = testContent;
      } else if (testContent && typeof testContent === 'object') {
        // Handle object case - serialize to string
        testString = JSON.stringify(testContent, null, 2);
      } else {
        // Fallback for undefined/null/other types
        testString = `// Validation test placeholder
describe('Vulnerability Test', () => {
  it('should validate vulnerability exists', () => {
    // Red test generated by ValidationMode
    console.log('Test content:', ${JSON.stringify(testContent)});
  });
});`;
      }

      // Write test file
      const testPath = path.join(testDir, 'validation.test.js');
      fs.writeFileSync(testPath, testString, 'utf8');

      // Configure git identity for commits
      execSync('git config user.email "rsolv-validation@rsolv.dev"', { cwd: this.repoPath });
      execSync('git config user.name "RSOLV Validation Bot"', { cwd: this.repoPath });

      // Commit to branch
      execSync('git add .rsolv/tests/', { cwd: this.repoPath });
      execSync(`git commit -m "Add validation tests for issue"`, { cwd: this.repoPath });

      logger.info(`Committed tests to branch ${branchName}`);

      // RFC-058: Push validation branch to remote for mitigation phase
      try {
        execSync(`git push origin ${branchName}`, { cwd: this.repoPath });
        logger.info(`Pushed validation branch ${branchName} to remote`);
      } catch (pushError) {
        logger.warn(`Could not push validation branch to remote: ${pushError}`);
        // Continue anyway - branch exists locally for immediate use
      }
    } catch (error) {
      logger.error(`Failed to commit tests to branch ${branchName}:`, error);
      throw error;
    }
  }

  /**
   * RFC-058: Store validation result with branch reference
   */
  async storeValidationResultWithBranch(
    issue: IssueContext,
    testResults: any,
    validationResult: any,
    branchName: string
  ): Promise<void> {
    const storageDir = path.join(this.repoPath, '.rsolv', 'validation');
    fs.mkdirSync(storageDir, { recursive: true });

    const filePath = path.join(storageDir, `issue-${issue.number}.json`);
    const data = {
      issueId: issue.number,
      issueTitle: issue.title,
      branchName: branchName,  // NEW: Store branch reference
      validated: true,
      testResults: testResults,
      validationResult: validationResult,
      timestamp: new Date().toISOString(),
      commitHash: this.getCurrentCommitHash()
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    logger.info(`Validation result with branch stored at ${filePath}`);
  }

  /**
   * Store validation result for mitigation phase
   */
  private async storeValidationResult(
    issue: IssueContext,
    testResults: any,
    validationResult: any
  ): Promise<void> {
    const storageDir = path.join(this.repoPath, '.rsolv', 'validation');
    fs.mkdirSync(storageDir, { recursive: true });

    const filePath = path.join(storageDir, `issue-${issue.number}.json`);
    const data = {
      issueId: issue.number,
      issueTitle: issue.title,
      validated: true,
      testResults: testResults,
      validationResult: validationResult,
      timestamp: new Date().toISOString(),
      commitHash: this.getCurrentCommitHash()
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    logger.info(`Validation result stored at ${filePath}`);
  }
  
  /**
   * Load false positive cache
   */
  private loadFalsePositiveCache(): void {
    try {
      const cachePath = path.join(this.repoPath, '.rsolv', 'false-positives.json');
      if (fs.existsSync(cachePath)) {
        const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        data.entries?.forEach((entry: any) => {
          // Skip expired entries
          if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
            return;
          }
          this.falsePositiveCache.add(entry.pattern);
        });
        logger.info(`Loaded ${this.falsePositiveCache.size} false positive patterns`);
      }
    } catch (error) {
      logger.warn('Could not load false positive cache:', error);
    }
  }
  
  /**
   * Add issue to false positive cache
   */
  private addToFalsePositiveCache(issue: IssueContext): void {
    const cacheKey = this.getCacheKey(issue);
    this.falsePositiveCache.add(cacheKey);
    
    // Persist to disk
    const cachePath = path.join(this.repoPath, '.rsolv', 'false-positives.json');
    const cacheDir = path.dirname(cachePath);
    fs.mkdirSync(cacheDir, { recursive: true });
    
    const entries = Array.from(this.falsePositiveCache).map(pattern => ({
      pattern,
      timestamp: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
    }));
    
    fs.writeFileSync(cachePath, JSON.stringify({ entries, version: '1.0' }, null, 2));
    logger.info(`Added issue #${issue.number} to false positive cache`);
  }
  
  /**
   * Get cache key for issue
   */
  private getCacheKey(issue: IssueContext): string {
    // Create a unique key based on issue characteristics
    return `${issue.repository}#${issue.number}#${issue.title}`;
  }
  
  /**
   * Ensure git repository is in clean state
   */
  private ensureCleanGitState(): void {
    try {
      const status = execSync('git status --porcelain', { encoding: 'utf8' });
      if (status.trim()) {
        throw new Error('Repository has uncommitted changes');
      }
    } catch (error) {
      logger.warn('Git state check failed:', error);
    }
  }
  
  /**
   * Get current git commit hash
   */
  private getCurrentCommitHash(): string {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }
}