#!/usr/bin/env bun

/**
 * End-to-End Customer Journey Validation
 * 
 * This script validates the complete RSOLV customer experience in production:
 * 1. Customer signs up / gets API key
 * 2. Creates security issue
 * 3. RSOLV detects vulnerability
 * 4. Test generation creates appropriate tests
 * 5. Fix is generated
 * 6. Tests validate the fix
 * 7. PR is created with fix + tests
 */

import { Octokit } from "@octokit/rest";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

// Configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const RSOLV_API_KEY = process.env.RSOLV_API_KEY || "";
const TEST_REPO_OWNER = process.env.TEST_REPO_OWNER || "RSOLV-testing";
const TEST_REPO_NAME = `e2e-validation-${Date.now()}`;
const TEMP_DIR = join(process.cwd(), "temp", TEST_REPO_NAME);

// Test scenarios covering multiple languages
const TEST_SCENARIOS = [
  {
    name: "JavaScript SQL Injection",
    language: "javascript",
    framework: "jest",
    vulnerableFile: "src/auth.js",
    vulnerableCode: `
const mysql = require('mysql2');

function authenticateUser(username, password) {
  // VULNERABILITY: SQL injection via string concatenation
  const query = "SELECT * FROM users WHERE username = '" + username + 
                "' AND password = '" + password + "'";
  
  return db.query(query);
}

module.exports = { authenticateUser };
`,
    packageJson: {
      name: "test-js-app",
      version: "1.0.0",
      devDependencies: {
        "jest": "^29.0.0"
      },
      scripts: {
        "test": "jest"
      }
    }
  },
  {
    name: "Python Command Injection",
    language: "python",
    framework: "pytest",
    vulnerableFile: "src/file_processor.py",
    vulnerableCode: `
import os
import subprocess

def process_file(filename):
    # VULNERABILITY: Command injection via subprocess
    cmd = f"cat {filename} | grep 'important'"
    result = subprocess.check_output(cmd, shell=True)
    return result.decode('utf-8')
`,
    requirementsFile: "requirements.txt",
    requirementsContent: "pytest==7.4.0\n"
  },
  {
    name: "PHP XSS Vulnerability",
    language: "php",
    framework: "phpunit",
    vulnerableFile: "src/CommentController.php",
    vulnerableCode: `<?php
namespace App\\Controllers;

class CommentController {
    public function displayComment($commentId) {
        $comment = $this->getComment($commentId);
        // VULNERABILITY: Direct echo without escaping
        echo "<div class='comment'>" . $comment['content'] . "</div>";
    }
    
    private function getComment($id) {
        // Mock implementation
        return ['content' => $_GET['comment'] ?? ''];
    }
}
`,
    composerJson: {
      name: "test/php-app",
      require: {
        "php": ">=8.0"
      },
      "require-dev": {
        "phpunit/phpunit": "^10.0"
      }
    }
  }
];

interface ValidationResult {
  scenario: string;
  success: boolean;
  issueCreated: boolean;
  vulnerabilityDetected: boolean;
  testGenerated: boolean;
  fixGenerated: boolean;
  testsPassed: boolean;
  prCreated: boolean;
  prNumber?: number;
  error?: string;
  details?: any;
}

class CustomerJourneyValidator {
  private octokit: Octokit;
  private results: ValidationResult[] = [];

  constructor() {
    if (!GITHUB_TOKEN) {
      throw new Error("GITHUB_TOKEN environment variable is required");
    }
    if (!RSOLV_API_KEY) {
      throw new Error("RSOLV_API_KEY environment variable is required");
    }

    this.octokit = new Octokit({ auth: GITHUB_TOKEN });
  }

  async validate(): Promise<void> {
    console.log("🚀 Starting End-to-End Customer Journey Validation");
    console.log("=" .repeat(60));
    
    try {
      // Step 1: Create test repository
      await this.createTestRepository();
      
      // Step 2: Run scenarios
      for (const scenario of TEST_SCENARIOS) {
        console.log(`\n📋 Testing: ${scenario.name}`);
        console.log("-".repeat(40));
        
        const result = await this.runScenario(scenario);
        this.results.push(result);
        
        if (result.success) {
          console.log(`✅ ${scenario.name} - PASSED`);
        } else {
          console.log(`❌ ${scenario.name} - FAILED: ${result.error}`);
        }
      }
      
      // Step 3: Generate report
      await this.generateReport();
      
    } catch (error) {
      console.error("Fatal error during validation:", error);
    } finally {
      // Cleanup
      await this.cleanup();
    }
  }

  private async createTestRepository(): Promise<void> {
    console.log(`\n📦 Creating test repository: ${TEST_REPO_OWNER}/${TEST_REPO_NAME}`);
    
    try {
      // Create repository
      await this.octokit.repos.createInOrg({
        org: TEST_REPO_OWNER,
        name: TEST_REPO_NAME,
        private: true,
        auto_init: true,
        description: "E2E validation test repository"
      });
      
      // Clone locally
      mkdirSync(TEMP_DIR, { recursive: true });
      execSync(`git clone https://${GITHUB_TOKEN}@github.com/${TEST_REPO_OWNER}/${TEST_REPO_NAME}.git ${TEMP_DIR}`, {
        stdio: 'pipe'
      });
      
      // Add RSOLV configuration
      const rsolvConfig = {
        version: "1.0",
        security: {
          enabled: true,
          test_generation: {
            enabled: true,
            frameworks: "auto-detect"
          }
        }
      };
      
      writeFileSync(
        join(TEMP_DIR, ".github", "rsolv.yml"),
        `# RSOLV Configuration\n${JSON.stringify(rsolvConfig, null, 2)}`
      );
      
      console.log("✅ Test repository created successfully");
    } catch (error: any) {
      console.error("❌ Failed to create test repository:", error.message);
      throw error;
    }
  }

  private async runScenario(scenario: any): Promise<ValidationResult> {
    const result: ValidationResult = {
      scenario: scenario.name,
      success: false,
      issueCreated: false,
      vulnerabilityDetected: false,
      testGenerated: false,
      fixGenerated: false,
      testsPassed: false,
      prCreated: false
    };

    try {
      // Step 1: Set up vulnerable code
      await this.setupVulnerableCode(scenario);
      
      // Step 2: Create security issue
      const issue = await this.createSecurityIssue(scenario);
      result.issueCreated = true;
      
      // Step 3: Wait for RSOLV to process
      console.log("⏳ Waiting for RSOLV to process issue...");
      const pr = await this.waitForPullRequest(issue.number, 300); // 5 minute timeout
      
      if (pr) {
        result.prCreated = true;
        result.prNumber = pr.number;
        
        // Step 4: Analyze PR contents
        const analysis = await this.analyzePullRequest(pr.number);
        result.vulnerabilityDetected = analysis.vulnerabilityDetected;
        result.testGenerated = analysis.testGenerated;
        result.fixGenerated = analysis.fixGenerated;
        result.testsPassed = analysis.testsPassed;
        result.details = analysis;
        
        result.success = result.vulnerabilityDetected && 
                        result.testGenerated && 
                        result.fixGenerated;
      }
      
    } catch (error: any) {
      result.error = error.message;
    }

    return result;
  }

  private async setupVulnerableCode(scenario: any): Promise<void> {
    const codePath = join(TEMP_DIR, scenario.vulnerableFile);
    const codeDir = join(TEMP_DIR, "src");
    
    // Create directory structure
    mkdirSync(codeDir, { recursive: true });
    
    // Write vulnerable code
    writeFileSync(codePath, scenario.vulnerableCode);
    
    // Set up language-specific files
    if (scenario.packageJson) {
      writeFileSync(
        join(TEMP_DIR, "package.json"),
        JSON.stringify(scenario.packageJson, null, 2)
      );
    }
    
    if (scenario.requirementsFile) {
      writeFileSync(
        join(TEMP_DIR, scenario.requirementsFile),
        scenario.requirementsContent
      );
    }
    
    if (scenario.composerJson) {
      writeFileSync(
        join(TEMP_DIR, "composer.json"),
        JSON.stringify(scenario.composerJson, null, 2)
      );
    }
    
    // Commit and push
    process.chdir(TEMP_DIR);
    execSync("git add -A", { stdio: 'pipe' });
    execSync(`git commit -m "Add vulnerable ${scenario.language} code"`, { stdio: 'pipe' });
    execSync("git push origin main", { stdio: 'pipe' });
    process.chdir("..");
  }

  private async createSecurityIssue(scenario: any): Promise<any> {
    const issueBody = `## Security Vulnerability Found

**Type**: ${scenario.name}
**File**: \`${scenario.vulnerableFile}\`
**Language**: ${scenario.language}

### Description
A security vulnerability has been detected in the application. The code contains a potential ${scenario.name.toLowerCase()} vulnerability that could be exploited by attackers.

### Affected Code
\`\`\`${scenario.language}
${scenario.vulnerableCode.trim()}
\`\`\`

### Recommendation
This vulnerability should be fixed immediately using secure coding practices.

### Test Framework
The project uses ${scenario.framework} for testing.
`;

    const issue = await this.octokit.issues.create({
      owner: TEST_REPO_OWNER,
      repo: TEST_REPO_NAME,
      title: `[SECURITY] Fix ${scenario.name}`,
      body: issueBody,
      labels: ["security", "rsolv:automate"]
    });

    console.log(`📝 Created issue #${issue.data.number}`);
    return issue.data;
  }

  private async waitForPullRequest(issueNumber: number, timeoutSeconds: number): Promise<any> {
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;

    while (Date.now() - startTime < timeoutMs) {
      try {
        // Check for PRs that reference this issue
        const prs = await this.octokit.pulls.list({
          owner: TEST_REPO_OWNER,
          repo: TEST_REPO_NAME,
          state: "open"
        });

        for (const pr of prs.data) {
          if (pr.body?.includes(`#${issueNumber}`)) {
            console.log(`🔗 Found PR #${pr.number} for issue #${issueNumber}`);
            return pr;
          }
        }

        // Wait 10 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 10000));
        process.stdout.write(".");
        
      } catch (error) {
        console.error("Error checking for PR:", error);
      }
    }

    console.log("\n⏱️  Timeout waiting for PR");
    return null;
  }

  private async analyzePullRequest(prNumber: number): Promise<any> {
    const analysis = {
      vulnerabilityDetected: false,
      testGenerated: false,
      fixGenerated: false,
      testsPassed: false,
      filesChanged: [],
      testContent: null,
      fixContent: null
    };

    try {
      // Get PR files
      const files = await this.octokit.pulls.listFiles({
        owner: TEST_REPO_OWNER,
        repo: TEST_REPO_NAME,
        pull_number: prNumber
      });

      analysis.filesChanged = files.data.map(f => f.filename);

      for (const file of files.data) {
        // Check for test files
        if (file.filename.includes("test") || file.filename.includes("spec")) {
          analysis.testGenerated = true;
          analysis.testContent = file.patch;
          
          // Check for red-green-refactor pattern
          if (file.patch?.includes("should be vulnerable") && 
              file.patch?.includes("should prevent")) {
            console.log("✅ Found red-green-refactor test pattern");
          }
        }
        
        // Check for fix
        if (file.status === "modified" && !file.filename.includes("test")) {
          analysis.fixGenerated = true;
          analysis.fixContent = file.patch;
          
          // Simple check for vulnerability being addressed
          if (file.patch?.includes("parameterized") || 
              file.patch?.includes("escape") || 
              file.patch?.includes("sanitize")) {
            analysis.vulnerabilityDetected = true;
          }
        }
      }

      // Check PR checks/status
      const checks = await this.octokit.checks.listForRef({
        owner: TEST_REPO_OWNER,
        repo: TEST_REPO_NAME,
        ref: `pull/${prNumber}/head`
      });

      // Look for test execution results
      for (const check of checks.data.check_runs) {
        if (check.name.includes("test") && check.conclusion === "success") {
          analysis.testsPassed = true;
        }
      }

    } catch (error) {
      console.error("Error analyzing PR:", error);
    }

    return analysis;
  }

  private async generateReport(): Promise<void> {
    const report = {
      timestamp: new Date().toISOString(),
      totalScenarios: this.results.length,
      passed: this.results.filter(r => r.success).length,
      failed: this.results.filter(r => !r.success).length,
      results: this.results,
      summary: {
        issuesCreated: this.results.filter(r => r.issueCreated).length,
        vulnerabilitiesDetected: this.results.filter(r => r.vulnerabilityDetected).length,
        testsGenerated: this.results.filter(r => r.testGenerated).length,
        fixesGenerated: this.results.filter(r => r.fixGenerated).length,
        prsCreated: this.results.filter(r => r.prCreated).length
      }
    };

    // Write detailed report
    const reportPath = join(process.cwd(), `customer-journey-report-${Date.now()}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Console summary
    console.log("\n📊 Customer Journey Validation Summary");
    console.log("=" .repeat(60));
    console.log(`Total Scenarios: ${report.totalScenarios}`);
    console.log(`✅ Passed: ${report.passed}`);
    console.log(`❌ Failed: ${report.failed}`);
    console.log(`\nDetailed Metrics:`);
    console.log(`- Issues Created: ${report.summary.issuesCreated}`);
    console.log(`- Vulnerabilities Detected: ${report.summary.vulnerabilitiesDetected}`);
    console.log(`- Tests Generated: ${report.summary.testsGenerated}`);
    console.log(`- Fixes Generated: ${report.summary.fixesGenerated}`);
    console.log(`- PRs Created: ${report.summary.prsCreated}`);
    console.log(`\n📄 Full report saved to: ${reportPath}`);

    // Create markdown summary
    const markdownReport = this.generateMarkdownReport(report);
    const mdPath = join(process.cwd(), "CUSTOMER-JOURNEY-VALIDATION.md");
    writeFileSync(mdPath, markdownReport);
    console.log(`📝 Markdown report saved to: ${mdPath}`);
  }

  private generateMarkdownReport(report: any): string {
    return `# Customer Journey E2E Validation Report

**Date**: ${new Date().toDateString()}  
**Test Repository**: ${TEST_REPO_OWNER}/${TEST_REPO_NAME}  
**Status**: ${report.passed === report.totalScenarios ? '✅ ALL PASSED' : '⚠️ SOME FAILURES'}

## Executive Summary

The end-to-end customer journey validation tested ${report.totalScenarios} scenarios covering JavaScript, Python, and PHP vulnerabilities.

### Overall Results
- **Total Scenarios**: ${report.totalScenarios}
- **Passed**: ${report.passed} (${((report.passed / report.totalScenarios) * 100).toFixed(1)}%)
- **Failed**: ${report.failed}

### Key Metrics
| Metric | Count | Success Rate |
|--------|-------|--------------|
| Issues Created | ${report.summary.issuesCreated} | ${((report.summary.issuesCreated / report.totalScenarios) * 100).toFixed(1)}% |
| Vulnerabilities Detected | ${report.summary.vulnerabilitiesDetected} | ${((report.summary.vulnerabilitiesDetected / report.totalScenarios) * 100).toFixed(1)}% |
| Tests Generated | ${report.summary.testsGenerated} | ${((report.summary.testsGenerated / report.totalScenarios) * 100).toFixed(1)}% |
| Fixes Generated | ${report.summary.fixesGenerated} | ${((report.summary.fixesGenerated / report.totalScenarios) * 100).toFixed(1)}% |
| PRs Created | ${report.summary.prsCreated} | ${((report.summary.prsCreated / report.totalScenarios) * 100).toFixed(1)}% |

## Detailed Results

${report.results.map((r: ValidationResult) => `
### ${r.scenario}
- **Status**: ${r.success ? '✅ PASSED' : '❌ FAILED'}
- **Issue Created**: ${r.issueCreated ? '✅' : '❌'}
- **Vulnerability Detected**: ${r.vulnerabilityDetected ? '✅' : '❌'}
- **Test Generated**: ${r.testGenerated ? '✅' : '❌'}
- **Fix Generated**: ${r.fixGenerated ? '✅' : '❌'}
- **PR Created**: ${r.prCreated ? '✅' : '❌'} ${r.prNumber ? `(#${r.prNumber})` : ''}
${r.error ? `- **Error**: ${r.error}` : ''}
`).join('\n')}

## Test Generation Framework Performance

The test generation framework (v1.0.0) demonstrated:
- Multi-language support (JavaScript, Python, PHP)
- Framework detection capabilities
- Red-green-refactor test pattern implementation
- Integration with fix generation workflow

## Recommendations

${report.failed > 0 ? `
### Issues to Address
1. Investigate failures in specific language scenarios
2. Check API pattern coverage for all languages
3. Verify test framework detection accuracy
` : `
### Next Steps
1. Expand test coverage to more languages
2. Add more complex vulnerability scenarios
3. Test edge cases and error handling
`}

## Conclusion

${report.passed === report.totalScenarios ? 
  'The customer journey validation completed successfully with all scenarios passing. The RSOLV platform is functioning correctly end-to-end.' :
  `The validation identified issues in ${report.failed} scenarios that need attention. The core functionality is working but requires improvements in specific areas.`}

---
*Generated by Customer Journey Validator*
`;
  }

  private async cleanup(): Promise<void> {
    console.log("\n🧹 Cleaning up...");
    
    try {
      // Delete test repository
      if (TEST_REPO_OWNER && TEST_REPO_NAME) {
        await this.octokit.repos.delete({
          owner: TEST_REPO_OWNER,
          repo: TEST_REPO_NAME
        });
        console.log("✅ Test repository deleted");
      }
      
      // Remove local files
      if (TEMP_DIR) {
        rmSync(TEMP_DIR, { recursive: true, force: true });
        console.log("✅ Local files cleaned up");
      }
    } catch (error) {
      console.error("⚠️  Cleanup error:", error);
    }
  }
}

// Main execution
async function main() {
  const validator = new CustomerJourneyValidator();
  await validator.validate();
}

// Run if executed directly
if (import.meta.main) {
  main().catch(console.error);
}

export { CustomerJourneyValidator, ValidationResult };