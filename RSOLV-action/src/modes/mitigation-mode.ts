/**
 * Mitigation Mode Implementation
 * RFC-041: Generate fixes for validated vulnerabilities
 * RFC-058: Support validation branch checkout for test-aware fix generation
 */

import { IssueContext, ActionConfig } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { vendorFilterUtils } from './vendor-utils.js';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export class MitigationMode {
  private config: ActionConfig;
  private repoPath: string;

  constructor(config: ActionConfig, repoPath?: string) {
    this.config = config;
    this.repoPath = repoPath || process.cwd();

    // Apply environment variables from config
    if (config.environmentVariables && typeof config.environmentVariables === 'object') {
      Object.entries(config.environmentVariables).forEach(([key, value]) => {
        if (typeof value === 'string') {
          process.env[key] = value;
          logger.debug(`Applied environment variable: ${key}`);
        }
      });
    }
  }

  /**
   * RFC-058: Checkout validation branch for mitigation phase
   */
  async checkoutValidationBranch(issue: IssueContext): Promise<boolean> {
    try {
      // Read validation results
      const validationPath = path.join(this.repoPath, '.rsolv', 'validation', `issue-${issue.number}.json`);

      if (!fs.existsSync(validationPath)) {
        logger.info('No validation results found, staying on current branch');
        return false;
      }

      const validationData = JSON.parse(fs.readFileSync(validationPath, 'utf-8'));

      if (!validationData.branchName) {
        logger.info('No validation branch found, staying on current branch');
        return false;
      }

      try {
        // First try to fetch the branch from remote
        try {
          execSync(`git fetch origin ${validationData.branchName}`, { cwd: this.repoPath });
          logger.info(`Fetched validation branch from remote: ${validationData.branchName}`);
        } catch (fetchError) {
          logger.warn(`Could not fetch validation branch from remote: ${fetchError}`);
        }

        // Try to checkout the branch (local or remote)
        try {
          // First try local branch
          execSync(`git checkout ${validationData.branchName}`, { cwd: this.repoPath });
          logger.info(`Checked out local validation branch: ${validationData.branchName}`);
          return true;
        } catch {
          // If local doesn't exist, try remote
          try {
            execSync(`git checkout -b ${validationData.branchName} origin/${validationData.branchName}`, { cwd: this.repoPath });
            logger.info(`Checked out remote validation branch: origin/${validationData.branchName}`);
            return true;
          } catch (remoteError) {
            logger.warn(`Failed to checkout validation branch from remote: ${remoteError}`);
            return false;
          }
        }
      } catch (error) {
        logger.warn(`Failed to checkout validation branch: ${error}`);
        return false;
      }
    } catch (error) {
      logger.error(`Error checking out validation branch for issue #${issue.number}:`, error);
      return false;
    }
  }

  /**
   * RFC-058: Get validation tests from current branch
   */
  async getValidationTests(issue: IssueContext): Promise<string[]> {
    const testDir = path.join(this.repoPath, '.rsolv', 'tests');

    if (!fs.existsSync(testDir)) {
      return [];
    }

    // Return all test files in the validation branch
    try {
      return fs.readdirSync(testDir)
        .filter(file => file.endsWith('.test.js'))
        .map(file => path.join(testDir, file));
    } catch (error) {
      logger.warn(`Could not read test directory: ${error}`);
      return [];
    }
  }

  /**
   * RFC-058: Generate test-aware mitigation with enhanced Claude Code prompt
   */
  async generateTestAwareFix(issue: IssueContext): Promise<any> {
    try {
      // Step 0: Check if this is a vendor file vulnerability
      const vendorCheckResult = vendorFilterUtils.checkVendorStatusFromValidation(this.repoPath, issue.number);
      if (vendorCheckResult.isVendor) {
        return {
          skipReason: 'vendor_file',
          message: 'Cannot patch vendor library - update required',
          vendorFiles: vendorCheckResult.files,
          branchCheckedOut: false,
          testFilesFound: 0,
          enhancedPrompt: undefined
        };
      }

      // Step 1: Checkout validation branch
      const branchCheckedOut = await this.checkoutValidationBranch(issue);

      // Step 2: Get validation tests
      const testFiles = await this.getValidationTests(issue);

      // Step 3: Read test content
      const testContents = testFiles.map(file => {
        try {
          return {
            path: file,
            content: fs.readFileSync(file, 'utf-8')
          };
        } catch (error) {
          logger.warn(`Could not read test file ${file}:`, error);
          return null;
        }
      }).filter(Boolean);

      // Step 4: Generate enhanced prompt with test context
      const enhancedPrompt = this.buildTestAwarePrompt(issue, testContents as Array<{path: string, content: string}>);

      logger.info(`Generated test-aware mitigation prompt for issue #${issue.number}`);
      logger.info(`- Validation branch: ${branchCheckedOut ? 'checked out' : 'not available'}`);
      logger.info(`- Test files found: ${testContents.length}`);

      return {
        branchCheckedOut,
        testFilesFound: testContents.length,
        enhancedPrompt,
        testContents
      };

    } catch (error) {
      logger.error(`Test-aware fix generation failed for issue #${issue.number}:`, error);
      throw error;
    }
  }


  /**
   * RFC-058: Build enhanced Claude Code prompt with test specifications
   */
  private buildTestAwarePrompt(issue: IssueContext, testContents: Array<{path: string, content: string}>): string {
    const basePrompt = `
Fix the security vulnerability described in issue #${issue.number}: "${issue.title}"

Issue Description:
${issue.body}
`;

    if (testContents.length === 0) {
      logger.info('No validation tests found, using standard prompt');
      return basePrompt;
    }

    const testSection = `
VALIDATION TESTS AVAILABLE:
The following tests define the expected behavior and vulnerability patterns.
These tests currently FAIL on the vulnerable code and should PASS after your fix:

${testContents.map(test => `
File: ${test.path}
\`\`\`javascript
${test.content}
\`\`\`
`).join('\n')}

REQUIREMENTS:
1. Your fix must make these tests pass
2. Preserve all existing behavioral contracts tested
3. Make minimal, incremental changes
4. You can run these tests locally to validate your fix using: npm test

`;

    return basePrompt + testSection;
  }

  /**
   * RFC-058: Get current git branch for PR creation
   */
  getCurrentBranch(): string {
    try {
      return execSync('git branch --show-current', {
        cwd: this.repoPath,
        encoding: 'utf8'
      }).trim();
    } catch (error) {
      logger.warn(`Could not get current branch: ${error}`);
      return 'main';
    }
  }

  /**
   * RFC-058: Create PR from validation branch with tests + fixes
   */
  async createPRFromValidationBranch(issue: IssueContext): Promise<any> {
    try {
      const currentBranch = this.getCurrentBranch();

      // Ensure we're on a validation branch
      if (!currentBranch.startsWith('rsolv/validate/')) {
        logger.warn(`Not on validation branch (${currentBranch}), cannot create PR with tests`);
        return { success: false, reason: 'Not on validation branch' };
      }

      // Check if there are any changes to commit (after fix generation)
      const status = execSync('git status --porcelain', {
        cwd: this.repoPath,
        encoding: 'utf8'
      });

      if (status.trim()) {
        // Commit the fix
        execSync('git add .', { cwd: this.repoPath });
        execSync(`git commit -m "Fix vulnerability for issue #${issue.number}\n\n✅ Generated with RSOLV three-phase workflow\n🧪 Includes validation tests from ${currentBranch}"`, {
          cwd: this.repoPath
        });
        logger.info(`Committed fix to validation branch: ${currentBranch}`);
      }

      // Create PR (using GitHub CLI if available)
      const prTitle = `🔒 Fix security vulnerability: ${issue.title}`;
      const prBody = `
## Security Fix for Issue #${issue.number}

**Vulnerability**: ${issue.title}

### 📋 Changes Made
- Fixed security vulnerability identified in issue #${issue.number}
- Generated using RSOLV three-phase workflow (Scan → Validate → Mitigate)

### 🧪 Validation Tests Included
This PR includes validation tests that:
- ✅ Prove the vulnerability existed (red tests)
- ✅ Verify the fix resolves the issue (green tests)
- ✅ Prevent regression

### 🔧 Test-Aware Fix Generation
The fix was generated using AI with access to validation tests, ensuring:
- Behavioral contracts are preserved
- Minimal, focused changes
- Test-driven approach

**Branch**: \`${currentBranch}\`
**Issue**: #${issue.number}

---
🤖 Generated with [RSOLV](https://rsolv.app) - AI-powered vulnerability remediation
      `.trim();

      logger.info(`Creating PR from validation branch: ${currentBranch}`);
      logger.info(`PR Title: ${prTitle}`);

      return {
        success: true,
        branch: currentBranch,
        title: prTitle,
        body: prBody,
        hasTests: true,
        message: `PR ready to be created from validation branch ${currentBranch}`
      };

    } catch (error) {
      logger.error(`Failed to create PR from validation branch:`, error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}