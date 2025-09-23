/**
 * Enhanced Git-based issue processor with fix validation
 * Implements RFC-020: Fix Validation Integration
 */
import { IssueContext, ActionConfig } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { analyzeIssue } from './analyzer.js';
import { GitBasedClaudeCodeAdapter } from './adapters/claude-code-git.js';
import { ClaudeCodeMaxAdapter } from './adapters/claude-code-cli-dev.js';
import { isClaudeMaxAvailable } from './adapters/claude-code-cli-dev.js';
import { createPullRequestFromGit } from '../github/pr-git.js';
import { createEducationalPullRequest } from '../github/pr-git-educational.js';
import { AIConfig, IssueAnalysis } from './types.js';
import { execSync } from 'child_process';
import { TestGeneratingSecurityAnalyzer, AnalysisWithTestsResult } from './test-generating-security-analyzer.js';
import { GitBasedTestValidator, ValidationResult } from './git-based-test-validator.js';
import { VulnerabilityType } from '../security/types.js';
import type { GitSolutionResult } from './adapters/claude-code-git.js';
import type { CLISolutionResult } from './adapters/claude-code-cli.js';

/**
 * Type guard to check if solution is GitSolutionResult
 */
function isGitSolutionResult(solution: CLISolutionResult | GitSolutionResult): solution is GitSolutionResult {
  return 'commitHash' in solution;
}

/**
 * Get maximum iterations based on configuration hierarchy
 */
export function getMaxIterations(
  issue: IssueContext,
  config: ActionConfig
): number {
  // Priority order (first non-null wins):
  // 1. Issue-specific override (from labels)
  const labelMatch = issue.labels.find(label => label.startsWith('fix-validation-max-'));
  if (labelMatch) {
    const maxFromLabel = parseInt(labelMatch.replace('fix-validation-max-', ''));
    if (!isNaN(maxFromLabel)) return maxFromLabel;
  }
  
  // 2. Vulnerability type specific (future enhancement)
  if (config.fixValidation?.maxIterationsByType) {
    const vulnType = detectVulnerabilityType(issue);
    const vulnTypeConfig = config.fixValidation.maxIterationsByType[vulnType];
    if (vulnTypeConfig !== undefined) return vulnTypeConfig;
  }
  
  // 3. Customer tier specific (future enhancement)
  if (config.customerTier && config.fixValidation?.maxIterationsByTier) {
    const tierConfig = config.fixValidation.maxIterationsByTier[config.customerTier];
    if (tierConfig !== undefined) return tierConfig;
  }
  
  // 4. Global configuration
  if (config.fixValidation?.maxIterations !== undefined) {
    return config.fixValidation.maxIterations;
  }
  
  // 5. Default fallback
  return 3;
}

/**
 * Detect vulnerability type from issue content
 */
function detectVulnerabilityType(issue: IssueContext): string {
  const content = `${issue.title} ${issue.body}`.toLowerCase();
  
  if (content.includes('sql injection')) return 'sql-injection';
  if (content.includes('xss') || content.includes('cross-site scripting')) return 'xss';
  if (content.includes('command injection')) return 'command-injection';
  if (content.includes('path traversal')) return 'path-traversal';
  if (content.includes('xxe') || content.includes('xml external entity')) return 'xxe';
  
  return 'unknown';
}

/**
 * Create enhanced issue context with test failure information
 */
function createEnhancedIssueWithTestFailure(
  issue: IssueContext,
  validation: ValidationResult,
  testResults: AnalysisWithTestsResult,
  iteration: number,
  maxIterations: number
): IssueContext {
  const testCode = testResults.generatedTests?.tests?.[0]?.testCode || '';
  const framework = testResults.generatedTests?.tests?.[0]?.framework || 'unknown';
  
  return {
    ...issue,
    specificVulnerabilities: issue.specificVulnerabilities, // Preserve specific vulnerabilities
    body: `${issue.body}

## Previous Fix Attempt Failed

The previous fix did not pass the generated security tests:

### Test Results:
- Red Test (vulnerability should be fixed): ${validation.fixedCommit.redTestPassed ? '✅ PASSED' : '❌ FAILED'}
- Green Test (fix should work): ${validation.fixedCommit.greenTestPassed ? '✅ PASSED' : '❌ FAILED'}  
- Refactor Test (functionality maintained): ${validation.fixedCommit.refactorTestPassed ? '✅ PASSED' : '❌ FAILED'}

### Generated Test Code:
\`\`\`${framework}
${testCode}
\`\`\`

Please fix the vulnerability again, ensuring the fix passes all three tests.

### Why the Previous Fix Failed:
${explainTestFailure(validation)}

### Specific Requirements:
1. The vulnerability must be completely fixed (RED test must pass)
2. The fix must be correctly implemented (GREEN test must pass)  
3. Original functionality must be preserved (REFACTOR test must pass)

This is attempt ${iteration + 1} of ${maxIterations}.`
  };
}

/**
 * Explain why tests failed
 */
function explainTestFailure(validation: ValidationResult): string {
  const failures = [];
  
  if (!validation.fixedCommit.redTestPassed) {
    failures.push('- The vulnerability still exists (RED test failed)');
  }
  if (!validation.fixedCommit.greenTestPassed) {
    failures.push('- The fix was not properly applied (GREEN test failed)');
  }
  if (!validation.fixedCommit.refactorTestPassed) {
    failures.push('- The fix broke existing functionality (REFACTOR test failed)');
  }
  
  return failures.join('\n');
}

/**
 * Get the last commit before fix attempts
 */
function getLastCommitBeforeFix(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch (error) {
    logger.error('Failed to get current commit', error);
    throw new Error('Cannot determine current commit');
  }
}

/**
 * Process result for git-based approach
 */
export interface GitProcessingResult {
  issueId: string;
  success: boolean;
  message: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  filesModified?: string[];
  diffStats?: {
    insertions: number;
    deletions: number;
    filesChanged: number;
  };
  error?: string;
}

/**
 * Process an issue using git-based approach with fix validation
 */
export async function processIssueWithGit(
  issue: IssueContext,
  config: ActionConfig
): Promise<GitProcessingResult> {
  const startTime = Date.now();
  const beforeFixCommit = getLastCommitBeforeFix();

  try {
    logger.info(`Processing issue #${issue.number} with git-based approach`);
    logger.info('[DEBUG] Issue has specificVulnerabilities:', !!issue.specificVulnerabilities);
    if (issue.specificVulnerabilities) {
      logger.info('[DEBUG] Vulnerability count:', issue.specificVulnerabilities.length);
      logger.info('[DEBUG] First vulnerability:', JSON.stringify(issue.specificVulnerabilities[0], null, 2));
    }

    // RFC-058: Check for test context from validation branch
    if ((issue as any).testContext) {
      const testContext = (issue as any).testContext;
      logger.info('[RFC-058] Test context available from validation branch:', {
        branchCheckedOut: testContext.branchCheckedOut,
        testFilesFound: testContext.testFilesFound,
        hasEnhancedPrompt: !!testContext.enhancedPrompt
      });

      // Add test context to issue body for AI to use
      if (testContext.enhancedPrompt) {
        issue = {
          ...issue,
          body: testContext.enhancedPrompt
        };
        logger.info('[RFC-058] Enhanced issue with test-aware prompt from validation branch');
      }
    }

    // Step 1: Ensure clean git state
    const gitStatus = checkGitStatus();
    if (!gitStatus.clean) {
      return {
        issueId: issue.id,
        success: false,
        message: 'Repository has uncommitted changes',
        error: `Uncommitted changes in: ${gitStatus.modifiedFiles.join(', ')}`
      };
    }
    
    // Step 2: Analyze the issue
    logger.info(`Analyzing issue #${issue.number}`);
    const analysisData = await analyzeIssue(issue, config);
    
    if (!analysisData || !analysisData.canBeFixed) {
      return {
        issueId: issue.id,
        success: false,
        message: 'Issue cannot be automatically fixed based on analysis'
      };
    }

    // Step 2.5: Generate tests if test generation or fix validation is enabled
    let testResults: AnalysisWithTestsResult | undefined;
    if ((config.testGeneration?.enabled || config.fixValidation?.enabled !== false) && config.enableSecurityAnalysis) {
      logger.info(`Generating tests for issue #${issue.number}`);
      
      // Pass AI config for test generation
      const aiConfig: AIConfig = {
        provider: 'anthropic',
        apiKey: config.aiProvider.apiKey,
        model: config.aiProvider.model,
        temperature: 0.2,
        maxTokens: config.aiProvider.maxTokens,
        useVendedCredentials: config.aiProvider.useVendedCredentials
      };
      
      const testAnalyzer = new TestGeneratingSecurityAnalyzer(aiConfig);
      
      // Get codebase files for test generation
      const codebaseFiles = new Map<string, string>();
      
      // Populate with files related to the vulnerability
      if (analysisData.filesToModify && analysisData.filesToModify.length > 0) {
        const fs = (await import('fs')).default;
        const path = (await import('path')).default;
        
        for (const filePath of analysisData.filesToModify) {
          try {
            const fullPath = path.resolve(process.cwd(), filePath);
            if (fs.existsSync(fullPath)) {
              const content = fs.readFileSync(fullPath, 'utf8');
              codebaseFiles.set(filePath, content);
              logger.debug(`Added file for test generation: ${filePath}`);
            }
          } catch (error) {
            logger.warn(`Could not read file ${filePath} for test generation:`, error);
          }
        }
      }
      
      // If no specific files, add some common vulnerable files for the language
      if (codebaseFiles.size === 0) {
        logger.info('No specific files found, scanning for common vulnerable file patterns...');
        const { getVulnerableFiles } = await import('./vulnerable-file-scanner.js');
        const vulnerableFiles = await getVulnerableFiles(process.cwd());
        vulnerableFiles.forEach((content, path) => codebaseFiles.set(path, content));
      }
      
      testResults = await testAnalyzer.analyzeWithTestGeneration(
        issue,
        config,
        codebaseFiles
      );
    }
    
    // Step 3: Set up Claude Code adapter
    const aiConfig: AIConfig = {
      provider: 'anthropic',
      apiKey: config.aiProvider.apiKey,
      model: config.aiProvider.model,
      temperature: 0.1, // Low temperature for consistent fixes
      maxTokens: config.aiProvider.maxTokens,
      useVendedCredentials: config.aiProvider.useVendedCredentials,
      claudeCodeConfig: {
        verboseLogging: true,
        timeout: 600000, // 10 minutes for exploration and editing
        executablePath: process.env.CLAUDE_CODE_PATH,
        useStructuredPhases: config.useStructuredPhases
      }
    };
    
    // Check if we should use Claude Max in development mode
    const isDevMode = process.env.RSOLV_DEV_MODE === 'true' && 
                      process.env.RSOLV_USE_CLAUDE_MAX === 'true';
    const useClaudeMax = isDevMode && isClaudeMaxAvailable();
    
    // Get credential manager if using vended credentials (but not in dev mode with Claude Max)
    let credentialManager;
    if (!useClaudeMax && config.aiProvider.useVendedCredentials && config.rsolvApiKey) {
      // Set RSOLV_API_KEY environment variable for AI client
      process.env.RSOLV_API_KEY = config.rsolvApiKey;
      logger.info('Set RSOLV_API_KEY environment variable for vended credentials');
      
      const { CredentialManagerSingleton } = await import('../credentials/singleton.js');
      credentialManager = await CredentialManagerSingleton.getInstance(config.rsolvApiKey);
      logger.info('Using vended credentials singleton for Claude Code');
    }
    
    // Step 4: Execute Claude Code with validation loop
    let solution;
    let iteration = 0;
    const maxIterations = getMaxIterations(issue, config);
    let currentIssue = issue;
    
    while (iteration < maxIterations) {
      logger.info(`Executing Claude Code to fix vulnerabilities (attempt ${iteration + 1}/${maxIterations})...`);
      
      // Use Claude Max adapter in dev mode, otherwise use the standard adapter
      const adapter = useClaudeMax 
        ? new ClaudeCodeMaxAdapter(aiConfig, process.cwd(), credentialManager)
        : new GitBasedClaudeCodeAdapter(aiConfig, process.cwd(), credentialManager);
      
      if (useClaudeMax) {
        logger.info('🚀 Using Claude Code Max (local authentication) for development');
      }
      
      // Pass test results and validation context to adapter
      const validationContext = iteration > 0 ? {
        current: iteration + 1,
        max: maxIterations
      } : undefined;
      
      // Convert AnalysisData to IssueAnalysis
      const issueAnalysis: IssueAnalysis = {
        summary: `${analysisData.issueType} issue analysis`,
        complexity: analysisData.estimatedComplexity === 'simple' ? 'low' : 
                   analysisData.estimatedComplexity === 'complex' ? 'high' : 'medium',
        estimatedTime: 60, // default estimate
        potentialFixes: [analysisData.suggestedApproach],
        recommendedApproach: analysisData.suggestedApproach,
        relatedFiles: analysisData.filesToModify
      };
      
      solution = await adapter.generateSolutionWithGit(
        currentIssue, 
        issueAnalysis,
        undefined, // no enhanced prompt
        testResults,
        undefined, // validation result is embedded in enhanced issue
        validationContext
      );
      
      if (!solution.success) {
        return {
          issueId: issue.id,
          success: false,
          message: solution.message,
          error: solution.error
        };
      }
      
      // Step 4.5: Validate fix if enabled
      // DEBUG: Log config values to understand why validation isn't being skipped
      logger.info(`[DEBUG] DISABLE_FIX_VALIDATION env var: ${process.env.DISABLE_FIX_VALIDATION}`);
      logger.info(`[DEBUG] config.fixValidation?.enabled: ${config.fixValidation?.enabled}`);
      logger.info(`[DEBUG] config.testGeneration?.validateFixes: ${config.testGeneration?.validateFixes}`);
      
      const skipValidation = config.fixValidation?.enabled === false;
      logger.info(`[DEBUG] skipValidation calculated as: ${skipValidation}`);
      
      if (skipValidation) {
        // Skip validation when explicitly disabled (e.g., DISABLE_FIX_VALIDATION=true)
        logger.info('📋 Skipping fix validation (DISABLE_FIX_VALIDATION=true)');
        logger.info('Fix will be applied without validation - proceeding to PR creation');
        break; // Exit the iteration loop and proceed to PR creation
      } else if (config.testGeneration?.validateFixes === true || config.fixValidation?.enabled === true) {
        
        // Check if we should use static validation for this vulnerability type
        const { shouldUseStaticValidation } = await import('./static-xss-validator.js');
        const vulnerabilityType = analysisData.vulnerabilityType || 'unknown';
        const filePath = analysisData.filesToModify?.[0] || '';
        
        let validationPassed = false;
        let validationResult: any = null;
        
        if (shouldUseStaticValidation(vulnerabilityType, filePath)) {
          // Use static analysis for browser-based XSS in config files
          logger.info(`Validating fix with static analysis for ${vulnerabilityType} in ${filePath}...`);
          const { StaticXSSValidator } = await import('./static-xss-validator.js');
          const staticValidator = new StaticXSSValidator();
          
          const staticValidation = staticValidator.validateXSSFix(
            filePath,
            beforeFixCommit,
            isGitSolutionResult(solution) ? solution.commitHash! : 'HEAD'
          );
          
          if (staticValidation.isValidFix) {
            logger.info('✅ Fix validated successfully using static analysis');
            logger.info(`Safe patterns found: ${staticValidation.safePatterns.join(', ')}`);
            validationPassed = true;
          } else {
            logger.warn('❌ Static validation failed');
            logger.warn(`Vulnerable patterns still present: ${staticValidation.vulnerablePatterns.join(', ')}`);
            // Create a validation result for retry
            validationResult = {
              isValidFix: false,
              error: staticValidation.error,
              vulnerablePatterns: staticValidation.vulnerablePatterns,
              fixedCommit: {
                redTestPassed: false,
                greenTestPassed: false,
                refactorTestPassed: true
              }
            };
          }
        } else if (testResults?.generatedTests?.success && testResults.generatedTests.testSuite) {
          // Use runtime test validation for other vulnerability types
          logger.info(`Validating fix with pre-generated executable tests...`);
          const validator = new GitBasedTestValidator();
          
          validationResult = await validator.validateFixWithTests(
            beforeFixCommit,
            isGitSolutionResult(solution) ? solution.commitHash! : 'HEAD',
            testResults.generatedTests.testSuite
          );
          
          if (validationResult.isValidFix) {
            logger.info('✅ Fix validated successfully with tests');
            validationPassed = true;
          }
        } else {
          // No validation available, assume fix is good
          logger.warn('⚠️ No validation available, proceeding without validation');
          validationPassed = true;
        }
        
        if (validationPassed) {
          break; // Exit loop, fix is good
        }
        
        // Step 5b: Fix failed validation, prepare for retry
        iteration++;
        if (iteration >= maxIterations) {
          // Rollback all attempts
          logger.warn(`Fix validation failed after ${maxIterations} attempts, rolling back`);
          execSync(`git reset --hard ${beforeFixCommit}`, { encoding: 'utf-8' });
          
          const errorMessage = validationPassed === false && vulnerabilityType === 'XSS' && filePath.includes('config/') 
            ? 'Static analysis shows vulnerable patterns still present (document.write with location.host)'
            : 'Fix validation failed - tests did not pass';
          
          return {
            issueId: issue.id,
            success: false,
            message: `Fix validation failed after ${maxIterations} attempts`,
            error: errorMessage
          };
        }
        
        logger.info(`Fix iteration ${iteration}: Previous fix failed validation`);
        
        // Reset to before the failed fix
        execSync(`git reset --hard ${beforeFixCommit}`, { encoding: 'utf-8' });
        
        // Enhance issue context with validation failure information
        if (validationResult) {
          // Check if this was a static validation failure
          if (validationResult.vulnerablePatterns) {
            // Static validation - create custom enhanced issue
            currentIssue = {
              ...issue,
              specificVulnerabilities: issue.specificVulnerabilities, // Preserve specific vulnerabilities
              body: `${issue.body}

## Previous Fix Attempt Failed (Static Analysis)

Your fix did not remove the vulnerable patterns:
- Still present: ${validationResult.vulnerablePatterns.join(', ')}

### Required Fix:
For config/env/development.js XSS, you MUST:
1. Remove document.write with location.host concatenation
2. Use createElement('script') and appendChild instead
3. Or hardcode localhost:35729 without using location.host

### Example Safe Fix:
\`\`\`javascript
environmentalScripts: [
  \`<script>
    (function() {
      var script = document.createElement('script');
      script.src = 'http://localhost:35729/livereload.js';
      document.body.appendChild(script);
    })();
  </script>\`
]
\`\`\`

This is attempt ${iteration + 1} of ${maxIterations}.`
            };
          } else {
            // Runtime test validation - use existing function
            currentIssue = createEnhancedIssueWithTestFailure(
              issue,
              validationResult,
              testResults!,
              iteration,
              maxIterations
            );
          }
        } else {
          // No validation result, use original issue
          currentIssue = issue;
        }
        
        // Loop back to Step 3
        continue;
      }
      
      // No validation needed or validation passed
      break;
    }
    
    // Step 5: Create PR from the git commit
    const commitHash = isGitSolutionResult(solution!) ? solution!.commitHash : undefined;
    logger.info(`Creating PR from commit ${commitHash?.substring(0, 8) || 'HEAD'}`);
    
    // Use educational PR creation for better user engagement
    const useEducationalPR = process.env.RSOLV_EDUCATIONAL_PR !== 'false';
    
    const prResult = useEducationalPR && isGitSolutionResult(solution!)
      ? await createEducationalPullRequest(
          issue,
          solution!.commitHash!,
          {
            ...solution!.summary!,
            vulnerabilityType: analysisData.vulnerabilityType || 'security',
            severity: analysisData.severity || 'medium',
            cwe: analysisData.cwe,
            isAiGenerated: analysisData.isAiGenerated
          },
          config,
          solution!.diffStats
        )
      : isGitSolutionResult(solution!) ? await createPullRequestFromGit(
          issue,
          solution!.commitHash!,
          solution!.summary!,
          config,
          solution!.diffStats
        ) : null;
    
    if (!prResult || !prResult.success) {
      // Try to undo the commit if PR creation failed
      try {
        execSync('git reset --hard HEAD~1', { encoding: 'utf-8' });
        logger.info('Rolled back commit after PR creation failure');
      } catch (resetError) {
        logger.warn('Failed to rollback commit', resetError);
      }
      
      return {
        issueId: issue.id,
        success: false,
        message: prResult?.message || 'Failed to create PR',
        error: prResult?.error || 'Unknown error'
      };
    }
    
    const processingTime = Date.now() - startTime;
    logger.info(`Successfully processed issue #${issue.number} in ${processingTime}ms`);
    
    return {
      issueId: issue.id,
      success: true,
      message: `Created PR #${prResult!.pullRequestNumber}`,
      pullRequestUrl: prResult!.pullRequestUrl,
      pullRequestNumber: prResult!.pullRequestNumber,
      filesModified: isGitSolutionResult(solution!) ? solution!.filesModified : undefined,
      diffStats: isGitSolutionResult(solution!) ? solution!.diffStats : undefined
    };
    
  } catch (error) {
    logger.error(`Error processing issue #${issue.number}`, error);
    
    // Try to rollback to clean state
    try {
      execSync(`git reset --hard ${beforeFixCommit}`, { encoding: 'utf-8' });
    } catch (resetError) {
      logger.warn('Failed to rollback after error', resetError);
    }
    
    return {
      issueId: issue.id,
      success: false,
      message: 'Error processing issue',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Check git repository status
 */
function checkGitStatus(): { clean: boolean; modifiedFiles: string[] } {
  try {
    const status = execSync('git status --porcelain', {
      encoding: 'utf-8'
    }).trim();
    
    if (!status) {
      return { clean: true, modifiedFiles: [] };
    }
    
    const modifiedFiles = status
      .split('\n')
      .map(line => line.substring(2).trim()) // Git status has 2-char prefix
      .filter(file => file.length > 0)
      .filter(file => !file.startsWith('.rsolv/')); // Ignore .rsolv directory
    
    // If only .rsolv files were modified, consider it clean
    if (modifiedFiles.length === 0) {
      return { clean: true, modifiedFiles: [] };
    }
    
    return { clean: false, modifiedFiles };
    
  } catch (error) {
    logger.error('Failed to check git status', error);
    return { clean: false, modifiedFiles: ['unknown'] };
  }
}

/**
 * Process multiple issues using git-based approach
 */
export async function processIssuesWithGit(
  issues: IssueContext[],
  config: ActionConfig
): Promise<GitProcessingResult[]> {
  logger.info(`Processing ${issues.length} issues with git-based approach`);
  
  const results: GitProcessingResult[] = [];
  
  // Process issues sequentially to avoid git conflicts
  for (const issue of issues) {
    try {
      const result = await processIssueWithGit(issue, config);
      results.push(result);
      
      if (result.success) {
        logger.info(`✅ Issue #${issue.number}: PR ${result.pullRequestUrl}`);
      } else {
        logger.warn(`❌ Issue #${issue.number}: ${result.message}`);
      }
      
    } catch (error) {
      logger.error(`Failed to process issue #${issue.number}`, error);
      results.push({
        issueId: issue.id,
        success: false,
        message: 'Processing failed',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  // Summary
  const successful = results.filter(r => r.success).length;
  logger.info(`Processed ${successful}/${issues.length} issues successfully`);
  
  return results;
}