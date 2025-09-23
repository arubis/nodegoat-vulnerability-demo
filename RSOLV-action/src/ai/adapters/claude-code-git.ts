/**
 * Git-based Claude Code adapter that makes direct file edits
 * and commits them to create clean, reviewable PRs
 */
// SDK adapter removed - using CLI only
import { RetryableClaudeCodeCLI } from './claude-code-cli-retry.js';
import { IssueContext } from '../../types/index.js';
import { AIConfig } from '../types.js';
import { IssueAnalysis } from '../types.js';
import { logger } from '../../utils/logger.js';
import { execSync } from 'child_process';
import path from 'path';
import type { AnalysisWithTestsResult } from '../test-generating-security-analyzer.js';
import type { ValidationResult } from '../git-based-test-validator.js';
import { TestAwareEnhancement, TestAwareOptions } from '../test-discovery/test-aware-enhancement.js';

/**
 * Result from git-based solution generation
 */
export interface GitSolutionResult {
  success: boolean;
  message: string;
  filesModified?: string[];
  commitHash?: string;
  diffStats?: {
    insertions: number;
    deletions: number;
    filesChanged: number;
  };
  summary?: {
    title: string;
    description: string;
    securityImpact: string;
    tests: string[];
  };
  error?: string;
  isTestMode?: boolean;
  validationFailed?: boolean;
  testModeNote?: string;
}

/**
 * Claude Code adapter that uses git for change tracking
 */
/**
 * Phase status tracking for structured prompting
 */
interface PhaseStatus {
  phase1Complete: boolean;
  filesEdited: boolean;
  jsonProvided: boolean;
  success: boolean;
}

export class GitBasedClaudeCodeAdapter {
  private cliAdapter: RetryableClaudeCodeCLI;
  private testAwareEnhancement: TestAwareEnhancement;
  protected config: AIConfig;
  protected repoPath: string;
  protected claudeConfig: any;

  constructor(config: AIConfig, repoPath: string = process.cwd(), credentialManager?: any) {
    this.config = config;
    this.repoPath = repoPath;
    this.claudeConfig = config.claudeCodeConfig || config.useStructuredPhases ? { useStructuredPhases: config.useStructuredPhases } : undefined;
    this.cliAdapter = new RetryableClaudeCodeCLI(config, repoPath, credentialManager);
    this.testAwareEnhancement = new TestAwareEnhancement();
  }

  /**
   * Construct the prompt for git-based editing
   */
  protected constructPrompt(
    issueContext: IssueContext,
    analysis: IssueAnalysis,
    enhancedPrompt?: string
  ): string {
    if (enhancedPrompt) {
      return enhancedPrompt;
    }
    
    // Use structured phased prompting if enabled
    if (this.claudeConfig?.useStructuredPhases) {
      return this.constructStructuredPhasedPrompt(issueContext, analysis);
    }
    
    return `You are an expert security engineer fixing vulnerabilities by directly editing files in a git repository. You have access to file editing tools and will make changes that will be committed to git.

## Issue Details:
- **Title**: ${issueContext.title}
- **Description**: ${issueContext.body}
- **Complexity**: ${analysis.complexity}
- **Files with vulnerabilities**: ${analysis.relatedFiles?.join(', ') || 'To be discovered'}

## Your Task:

### Phase 1: Locate Vulnerabilities & Check Tests
- Use Grep to find vulnerable code patterns
- Use Read to understand the full context
- Search for existing tests that exercise the vulnerable code
- Identify how the vulnerable code is used (callbacks, promises, etc.)
- Consider using sequential thinking for complex vulnerability analysis

### Phase 2: Red-Green-Refactor Validation
**CRITICAL**: Before fixing, validate the vulnerability exists:
- If tests exist: Run them to establish baseline
- Create or identify a test that demonstrates the vulnerability
- Ensure this test would FAIL on vulnerable code (RED phase)
- Document what malicious input would exploit the vulnerability

### Phase 3: Fix Vulnerabilities In-Place with Compatibility

**🚨 CRITICAL REQUIREMENT - YOU MUST FOLLOW THIS EXACT ORDER:**

#### Step 3.1: EDIT FILES FIRST (MANDATORY)
**YOU MUST use the Edit or MultiEdit tools to modify files BEFORE providing JSON.**
- ❌ DO NOT skip to JSON without editing files first
- ❌ DO NOT provide file contents in JSON instead of editing
- ✅ DO use Edit/MultiEdit tools to make actual file changes
- ✅ DO wait for "File updated successfully" confirmation
- ✅ DO make minimal, surgical changes to fix security issues

#### Step 3.2: Preserve Compatibility (WHILE EDITING)
- **PRESERVE API COMPATIBILITY**: 
  - If code uses callbacks, maintain callback interface
  - If changing from callbacks to async/await, add compatibility wrapper
  - Never break existing function signatures
- Maintain existing code style and formatting
- Fix all instances of the vulnerability

#### Step 3.3: Verify Edits Were Applied
**After using Edit/MultiEdit, confirm the files were modified:**
- You should see "File [path] has been updated" messages
- If you don't see these confirmations, the edits didn't work
- Try again with the Edit tool until you see confirmations

Example compatibility wrapper for callback to async conversion:
\`\`\`javascript
// Original method for compatibility
methodName(param1, param2, callback) {
  if (typeof callback === 'function') {
    // Callback style
    this.methodNameAsync(param1, param2)
      .then(result => callback(null, result))
      .catch(error => callback(error));
  } else {
    // Promise style
    return this.methodNameAsync(param1, param2);
  }
}

// New async implementation
async methodNameAsync(param1, param2) {
  // Secure implementation here
}
\`\`\`

### Phase 4: Verify Your Changes (GREEN phase)
- Use Read to verify your edits were applied correctly
- Ensure the code still makes sense and will function properly
- Verify the test that demonstrated the vulnerability now PASSES
- Check that legitimate use cases still work
- Ensure no breaking changes to public APIs

### Phase 5: Provide Fix Summary (ONLY AFTER EDITING FILES)

**⚠️ PREREQUISITE: You MUST have already edited files with Edit/MultiEdit tools BEFORE this phase**

After you have:
1. ✅ Used Edit/MultiEdit tools to modify files
2. ✅ Seen "File updated successfully" confirmations
3. ✅ Verified your changes were applied

THEN AND ONLY THEN provide a summary in this EXACT JSON format:

\`\`\`json
{
  "title": "Fix [vulnerability type] in [component]",
  "description": "Clear explanation of what was vulnerable and how you fixed it. Include the vulnerability type, severity, and impact.",
  "files": [
    {
      "path": "path/to/file.js",
      "changes": "Complete content of the fixed file after all edits have been applied (read it back with Read tool if needed)"
    }
  ],
  "tests": [
    "Description of test 1 that validates the fix",
    "Description of test 2 that ensures no regressions",
    "Description of test 3 that verifies security improvement"
  ]
}
\`\`\`

**VALIDATION CHECKLIST:**
- [ ] Did you use Edit/MultiEdit tools FIRST? (Required)
- [ ] Did you see "File updated successfully" messages? (Required)
- [ ] Are you providing the JSON AFTER editing? (Required)
- [ ] Does "changes" contain the COMPLETE file content? (Required)

**If any checkbox is unchecked, GO BACK and complete the editing phase first!**

## 🔴 CRITICAL - EXECUTION ORDER IS MANDATORY 🔴

**YOU MUST FOLLOW THIS EXACT SEQUENCE:**

1. **FIRST**: Use Edit/MultiEdit tools to modify the vulnerable files
   - You MUST see "File updated successfully" messages
   - If you don't see these, the edit didn't work - try again

2. **SECOND**: Read the files back to verify your changes were applied
   - Use the Read tool to confirm the vulnerability is fixed

3. **THIRD**: Only after steps 1 and 2, provide the JSON summary
   - Include the complete fixed file content in the "changes" field

**❌ COMMON MISTAKES TO AVOID:**
- Skipping straight to JSON without editing files
- Putting file edits in JSON instead of using Edit tools
- Not waiting for edit confirmation before proceeding

**✅ CORRECT BEHAVIOR:**
- Edit files → See confirmation → Read to verify → Then provide JSON

Remember: The git-based approach requires ACTUAL file modifications via Edit tools, not just JSON descriptions!
3. **Make minimal changes** - Only fix the security issue
4. **Preserve functionality** - The code must still work correctly
5. **Maintain compatibility** - NEVER break existing APIs or interfaces
6. **Validate the fix** - Demonstrate vulnerability exists and is fixed
7. **Fix all instances** - Don't leave any vulnerabilities unfixed
8. **Use relative paths** - Use paths like 'app/data/file.js' not '/app/data/file.js'

Your changes will be committed to git, so make them production-ready!`;
  }
  
  /**
   * Construct a structured phased prompt that guides Claude through distinct phases
   */
  private constructStructuredPhasedPrompt(
    issueContext: IssueContext,
    analysis: IssueAnalysis
  ): string {
    return `You are an expert security engineer fixing vulnerabilities. You MUST complete this task in TWO distinct phases:

## 🚨 CRITICAL: FOLLOW THESE PHASES IN ORDER 🚨

## PHASE 1: FILE EDITING (MANDATORY - DO THIS FIRST)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Your Task:
1. Locate the vulnerability: ${issueContext.title}
   - Description: ${issueContext.body}
   - Related files: ${analysis.relatedFiles?.join(', ') || 'To be discovered'}

2. Use Edit or MultiEdit tools to fix the vulnerable code
   - Make minimal, surgical changes
   - Preserve API compatibility
   - Fix all instances of the vulnerability

3. After editing, use Read tool to verify your changes were applied

4. Say "PHASE 1 COMPLETE: Files have been edited" when done

⚠️ IMPORTANT: You MUST complete Phase 1 before proceeding to Phase 2.
Do NOT skip directly to providing JSON.

## PHASE 2: JSON SUMMARY (ONLY AFTER PHASE 1)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Only after you've confirmed "PHASE 1 COMPLETE", provide the JSON summary:

\`\`\`json
{
  "title": "Fix [vulnerability type] in [component]",
  "description": "Clear explanation of what was vulnerable and how you fixed it",
  "files": [
    {
      "path": "path/to/edited/file.js",
      "changes": "Complete file content after your edits (read it back with Read tool if needed)"
    }
  ],
  "tests": [
    "Description of test that validates the fix",
    "Description of test that ensures no regressions"
  ]
}
\`\`\`

## Execution Checklist:
□ Used Edit/MultiEdit tools
□ Verified changes with Read tool  
□ Stated "PHASE 1 COMPLETE"
□ Provided JSON summary

Remember: Edit files FIRST, then provide JSON. Do not provide JSON without editing.`;
  }
  
  /**
   * Extract specific vulnerability details from issue context
   */
  private getSpecificVulnerabilityDetails(issueContext: any): string {
    // Enhanced debug logging
    logger.info('[DEBUG] getSpecificVulnerabilityDetails called');
    logger.info('[DEBUG] issueContext keys:', Object.keys(issueContext || {}));
    logger.info('[DEBUG] specificVulnerabilities present:', !!issueContext.specificVulnerabilities);
    logger.info('[DEBUG] specificVulnerabilities length:', issueContext.specificVulnerabilities?.length || 0);
    
    if (issueContext.specificVulnerabilities && issueContext.specificVulnerabilities.length > 0) {
      logger.info('[DEBUG] First vulnerability:', JSON.stringify(issueContext.specificVulnerabilities[0], null, 2));
    }
    
    if (!issueContext.specificVulnerabilities || issueContext.specificVulnerabilities.length === 0) {
      logger.warn('[DEBUG] No specific vulnerabilities found in issue context');
      return '';
    }
    
    let details = '\n## SPECIFIC VULNERABILITIES TO FIX\n';
    details += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    details += '⚠️ You MUST fix ONLY these specific issues:\n\n';
    
    const groupedByFile: Record<string, any[]> = {};
    issueContext.specificVulnerabilities.forEach((vuln: any) => {
      const file = vuln.file || vuln.path || 'unknown';
      if (!groupedByFile[file]) {
        groupedByFile[file] = [];
      }
      groupedByFile[file].push(vuln);
    });
    
    logger.info('[DEBUG] Vulnerabilities grouped by file:', Object.keys(groupedByFile));
    
    Object.entries(groupedByFile).forEach(([file, vulns]) => {
      details += `### File: ${file}\n`;
      vulns.forEach((vuln: any) => {
        details += `- **Line ${vuln.line}**: ${vuln.message || vuln.description}\n`;
        if (vuln.snippet || vuln.code) {
          details += `  Code: \`${vuln.snippet || vuln.code}\`\n`;
        }
        if (vuln.remediation) {
          details += `  Fix: ${vuln.remediation}\n`;
        }
      });
      details += '\n';
    });
    
    details += '❌ DO NOT fix issues in other files\n';
    details += '❌ DO NOT modify vendor/third-party libraries\n';
    details += '❌ Focus ONLY on the vulnerabilities listed above\n\n';
    
    logger.info('[DEBUG] Generated vulnerability details section length:', details.length);
    return details;
  }
  
  /**
   * Provide vulnerability-specific fix guidance
   */
  private getVulnerabilitySpecificGuidance(issueContext: any): string {
    const title = issueContext.title.toLowerCase();
    const body = issueContext.body.toLowerCase();
    let guidance = '';
    
    if (title.includes('insecure_deserialization') || title.includes('eval') || 
        body.includes('eval(') || body.includes('deserializing')) {
      guidance += '\n## EVAL/DESERIALIZATION FIX GUIDANCE\n';
      guidance += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
      guidance += 'This vulnerability uses eval() which executes arbitrary code.\n\n';
      guidance += '✅ CORRECT FIX:\n';
      guidance += '- For numbers: Use parseInt(value, 10) or parseFloat(value)\n';
      guidance += '- For JSON: Use JSON.parse(value)\n';
      guidance += '- For math: Use a safe expression evaluator\n';
      guidance += '- Check if there\'s a commented fix in the code!\n\n';
      guidance += '❌ INCORRECT:\n';
      guidance += '- Trying to sanitize input for eval (still unsafe)\n';
      guidance += '- Using new Function() (also unsafe)\n\n';
      guidance += 'Example:\n';
      guidance += '```javascript\n';
      guidance += '// VULNERABLE: const value = eval(userInput);\n';
      guidance += '// FIXED: const value = parseInt(userInput, 10);\n';
      guidance += '```\n\n';
    }
    
    return guidance;
  }

  /**
   * Construct prompt with test validation context
   */
  protected async constructPromptWithTestContext(
    issueContext: IssueContext,
    analysis: IssueAnalysis,
    testResults?: AnalysisWithTestsResult,
    validationResult?: ValidationResult,
    iteration?: { current: number; max: number }
  ): Promise<string> {
    // Debug logging for prompt construction
    logger.info('[DEBUG] constructPromptWithTestContext called');
    logger.info('[DEBUG] Issue context:', {
      hasTitle: !!issueContext.title,
      hasBody: !!issueContext.body,
      hasSpecificVulnerabilities: !!issueContext.specificVulnerabilities,
      vulnerabilityCount: issueContext.specificVulnerabilities?.length || 0
    });

    // Start with enhanced prompt including constraints
    let prompt = `You are an expert security engineer fixing vulnerabilities.

## 🚨 CRITICAL CONSTRAINTS - READ FIRST 🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **NEVER MODIFY TEST FILES** - You must NEVER edit files in test/, spec/, or __tests__ directories
2. **NEVER BYPASS TESTS** - Do not change test code to make tests pass
3. **ONLY FIX IMPLEMENTATION** - Only modify the actual vulnerable code files
4. **If a test fails, fix the IMPLEMENTATION, not the test**
5. **Test files are READ-ONLY** - You may read them to understand requirements
6. **DO NOT modify vendor/third-party libraries** unless the vulnerability is specifically there

${this.getSpecificVulnerabilityDetails(issueContext)}

## TEST EXECUTION CAPABILITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You can run tests to verify your fix works:

\`\`\`bash
# Run all tests
npm test

# Run specific test file
npm test -- path/to/test.js

# Check if your changes fixed the vulnerability
npm test -- --grep "security"
\`\`\`

**IMPORTANT**:
- Use the Bash tool to run tests
- If tests fail, read the error output
- Adjust your fix based on test feedback
- You have 3 attempts to get tests passing
- DO NOT modify the tests to make them pass

${this.getVulnerabilitySpecificGuidance(issueContext)}

`;

    // Add test-aware enhancement if enabled
    try {
      const testAwareContext = await this.testAwareEnhancement.enhanceContext(
        issueContext,
        analysis,
        this.repoPath,
        {
          enabled: true,
          vulnerableFilePath: analysis.relatedFiles?.[0],
          testDiscoveryRoot: this.repoPath,
          discoveryTimeout: 30000,
          includeTestContent: true,
          verbose: process.env.RSOLV_DEBUG_CONVERSATION === 'true'
        }
      );

      if (testAwareContext) {
        const testAwarePromptEnhancement = this.testAwareEnhancement.generatePromptEnhancement(testAwareContext);
        prompt += testAwarePromptEnhancement;
        logger.info('[TestAware] Successfully added test-aware context to prompt');
      } else {
        logger.info('[TestAware] No test-aware context available, continuing without enhancement');
      }
    } catch (error) {
      logger.warn('[TestAware] Failed to enhance prompt with test awareness:', error);
      // Continue without test enhancement
    }

    // Add the rest of the original prompt
    prompt += this.constructPrompt(issueContext, analysis);
    
    // Add test validation context
    if (testResults?.generatedTests?.success) {
      prompt += '\n\n## Generated Tests\n';
      prompt += 'The following tests have been generated to validate your fix:\n\n';
      testResults.generatedTests.tests.forEach(test => {
        prompt += `### ${test.framework} Test\n`;
        prompt += '```' + (test.framework === 'rspec' ? 'ruby' : 'javascript') + '\n';
        prompt += test.testCode;
        prompt += '\n```\n\n';
      });
      prompt += '**IMPORTANT**: Your fix must make these tests pass!\n';
      prompt += '- RED test should fail before your fix\n';
      prompt += '- GREEN test should pass after your fix\n';
      prompt += '- REFACTOR test should ensure functionality is maintained\n';
    }
    
    // Add validation failure context
    if (validationResult && !validationResult.success) {
      prompt += '\n\n## Previous Fix Attempt Failed\n';
      prompt += `This is attempt ${iteration?.current || 2} of ${iteration?.max || 3}.\n\n`;
      prompt += '### Test Results:\n';
      prompt += '```\n';
      prompt += `Vulnerable commit - Red test: ${validationResult.vulnerableCommit.redTestPassed ? 'PASSED' : 'FAILED'}\n`;
      prompt += `Fixed commit - Red test: ${validationResult.fixedCommit.redTestPassed ? 'PASSED' : 'FAILED'}\n`;
      prompt += `Fixed commit - Green test: ${validationResult.fixedCommit.greenTestPassed ? 'PASSED' : 'FAILED'}\n`;
      prompt += `Fixed commit - Refactor test: ${validationResult.fixedCommit.refactorTestPassed ? 'PASSED' : 'FAILED'}\n`;
      prompt += '\n```\n\n';
      
      if (!validationResult.fixedCommit.redTestPassed) {
        prompt += '- The vulnerability still exists (RED test failed)\n';
      }
      if (!validationResult.fixedCommit.greenTestPassed) {
        prompt += '- The fix was not properly applied (GREEN test failed)\n';
      }
      if (!validationResult.fixedCommit.refactorTestPassed) {
        prompt += '- The fix broke existing functionality (REFACTOR test failed)\n';
      }
      
      prompt += '**Please analyze the test failures and try a different approach.**\n';
      prompt += 'Consider:\n';
      prompt += '- Are you handling all edge cases?\n';
      prompt += '- Is the fix too restrictive or breaking functionality?\n';
      prompt += '- Do you need to adjust the implementation strategy?\n';
    }
    
    // Add iteration context
    if (iteration) {
      prompt += `\n\n## Iteration Context\n`;
      prompt += `You have ${iteration.max - iteration.current} attempts remaining.\n`;
      if (iteration.current === iteration.max) {
        prompt += '**This is your final attempt.** Ensure the fix is comprehensive.\n';
      }
    }
    
    // Add test running instructions
    prompt += '\n\n## Test Validation Instructions\n';
    prompt += '1. After implementing your fix, explain how to run the tests\n';
    prompt += '2. Specify which test framework is being used\n';
    prompt += '3. Include the test command (e.g., `bundle exec rspec` or `npm test`)\n';
    prompt += '4. Ensure all security tests pass before considering the fix complete\n';
    
    return prompt;
  }

  /**
   * Parse phase completion status from Claude's messages
   */
  private parsePhaseCompletion(messages: any[] = []): PhaseStatus {
    let phase1Complete = false;
    let filesEdited = false;
    let jsonProvided = false;
    
    for (const message of messages) {
      // Check for phase 1 completion marker
      if (message.type === 'text' && message.text) {
        if (message.text.includes('PHASE 1 COMPLETE')) {
          phase1Complete = true;
        }
        if (message.text.includes('```json')) {
          jsonProvided = true;
        }
      }
      
      // Check for assistant messages with text content
      if (message.type === 'assistant' && message.message?.content) {
        for (const content of message.message.content) {
          if (content.type === 'text' && content.text) {
            if (content.text.includes('PHASE 1 COMPLETE')) {
              phase1Complete = true;
            }
            if (content.text.includes('```json')) {
              jsonProvided = true;
            }
          }
        }
      }
      
      // Check for file editing tools
      if (message.type === 'tool_use') {
        if (message.name === 'Edit' || message.name === 'MultiEdit') {
          filesEdited = true;
        }
      }
      
      // Check for assistant messages with tool use
      if (message.type === 'assistant' && message.message?.content) {
        for (const content of message.message.content) {
          if (content.type === 'tool_use') {
            if (content.name === 'Edit' || content.name === 'MultiEdit') {
              filesEdited = true;
            }
          }
        }
      }
    }
    
    return {
      phase1Complete,
      filesEdited,
      jsonProvided,
      success: phase1Complete && filesEdited && jsonProvided
    };
  }
  
  /**
   * Generate solution using git-based approach
   */
  async generateSolutionWithGit(
    issueContext: IssueContext,
    analysis: IssueAnalysis,
    enhancedPrompt?: string,
    testResults?: AnalysisWithTestsResult,
    validationResult?: ValidationResult,
    iteration?: { current: number; max: number }
  ): Promise<GitSolutionResult> {
    const startTime = Date.now();
    
    try {
      // Record initial git state
      const initialFiles = this.getModifiedFiles();
      if (initialFiles.length > 0) {
        logger.warn(`Repository has uncommitted changes: ${initialFiles.join(', ')}`);
      }
      
      // Execute Claude Code to make edits
      logger.info('Executing Claude Code to fix vulnerabilities in-place...');
      
      // Debug logging before prompt construction
      logger.info('[DEBUG] About to construct prompt:', {
        hasTestResults: !!testResults,
        hasValidationResult: !!validationResult,
        hasIteration: !!iteration,
        issueContextKeys: Object.keys(issueContext),
        hasSpecificVulnerabilities: !!issueContext.specificVulnerabilities
      });
      
      // Use enhanced prompt with test context if available
      const promptToUse = (testResults || validationResult || iteration)
        ? await this.constructPromptWithTestContext(issueContext, analysis, testResults, validationResult, iteration)
        : enhancedPrompt;
      
      // Log the prompt being used (first 500 chars)
      if (promptToUse) {
        logger.info('[DEBUG] Prompt includes SPECIFIC VULNERABILITIES:', promptToUse.includes('SPECIFIC VULNERABILITIES TO FIX'));
        if (promptToUse.includes('SPECIFIC VULNERABILITIES TO FIX')) {
          const startIdx = promptToUse.indexOf('SPECIFIC VULNERABILITIES TO FIX');
          const endIdx = Math.min(startIdx + 1000, promptToUse.length);
          logger.info('[DEBUG] Vulnerability section:', promptToUse.substring(startIdx, endIdx));
        }
      }
      
      // Always use CLI adapter - simplified per SDK removal
      // Per ADR-023 and RFC-012: CLI is the primary mechanism for vended credentials
      logger.info('Using Claude Code CLI adapter for file editing...');
      const result = await this.cliAdapter.generateSolution(issueContext, analysis, promptToUse);
      
      // Debug logging for conversation (only when explicitly enabled for security)
      if (process.env.RSOLV_DEBUG_CONVERSATION === 'true') {
        logger.warn('⚠️  DEBUG MODE: Conversation logging enabled - DO NOT USE IN PRODUCTION');
        if (result.messages) {
          logger.info('=== CLAUDE CODE CONVERSATION START ===');
          result.messages.forEach((msg: any, index: number) => {
            logger.info(`Message ${index + 1} (${msg.type}):`);
            if (msg.type === 'text' && msg.text) {
              // Truncate very long messages for readability
              const text = msg.text.length > 500 ? msg.text.substring(0, 500) + '...[truncated]' : msg.text;
              logger.info(`  Text: ${text}`);
            } else if (msg.type === 'tool_use') {
              logger.info(`  Tool: ${msg.name}`);
              if (msg.input?.path || msg.input?.file_path) {
                logger.info(`  File: ${msg.input.path || msg.input.file_path}`);
              }
              if (msg.input?.old_string) {
                logger.info(`  Editing: ${msg.input.old_string.substring(0, 100)}...`);
              }
            } else if (msg.type === 'assistant' && msg.message?.content) {
              logger.info(`  Assistant message with ${msg.message.content.length} content items`);
            }
          });
          logger.info('=== CLAUDE CODE CONVERSATION END ===');
        }
      }
      
      if (!result.success) {
        return {
          success: false,
          message: result.message,
          error: result.error
        };
      }
      
      // Structured phases validation no longer needed - CLI always used
      if (false) { // Keeping for reference, will be removed
        const phaseStatus = this.parsePhaseCompletion(result.messages);
        
        if (!phaseStatus.filesEdited) {
          return {
            success: false,
            message: 'Phase 1 failed: No files were edited',
            error: 'Phase 1 failed: The files were not edited before providing JSON. Claude must use Edit/MultiEdit tools first.'
          };
        }
        
        if (phaseStatus.jsonProvided && !phaseStatus.phase1Complete) {
          return {
            success: false,
            message: 'JSON was provided before completing Phase 1',
            error: 'The files were not edited before providing JSON. Phase 1 must be completed first.'
          };
        }
        
        logger.info(`Phase status - Phase 1: ${phaseStatus.phase1Complete ? 'Complete' : 'Incomplete'}, Files edited: ${phaseStatus.filesEdited}, JSON provided: ${phaseStatus.jsonProvided}`);
      }
      
      // Check what files were modified
      const modifiedFiles = this.getModifiedFiles();
      
      // Debug: Check git status in detail
      if (process.env.RSOLV_DEBUG_CONVERSATION === 'true') {
        try {
          const gitStatus = execSync('git status --porcelain', { 
            cwd: this.repoPath, 
            encoding: 'utf8' 
          });
          logger.info(`Git status output: ${gitStatus || '(no changes)'}`);
          
          // Also check if we're in the right directory
          const pwd = execSync('pwd', { cwd: this.repoPath, encoding: 'utf8' }).trim();
          logger.info(`Working directory: ${pwd}`);
          
          // List files in current directory
          const files = execSync('ls -la', { cwd: this.repoPath, encoding: 'utf8' });
          logger.info(`Files in directory:\n${files}`);
        } catch (e) {
          logger.error('Failed to get git debug info:', e);
        }
      }
      
      if (modifiedFiles.length === 0) {
        return {
          success: false,
          message: 'No files were modified',
          error: 'Claude Code did not make any file changes. The vulnerability may not exist or could not be located.'
        };
      }
      
      logger.info(`Files modified by Claude Code: ${modifiedFiles.join(', ')}`);
      
      // Get diff statistics
      const diffStats = this.getDiffStats();
      
      // Extract summary from Claude's response
      let summary;
      if (result.changes) {
        // Check if we have a 'summary' key in changes
        if (result.changes['summary']) {
          try {
            summary = JSON.parse(result.changes['summary']);
          } catch (e) {
            logger.warn('Failed to parse summary JSON', e);
          }
        }
        
        // Fallback: try to extract from any change value
        if (!summary && Object.keys(result.changes).length > 0) {
          const firstChange = Object.values(result.changes)[0];
          if (typeof firstChange === 'string' && firstChange.includes('{')) {
            try {
              summary = JSON.parse(firstChange);
            } catch (e) {
              // Not JSON, use as description
              summary = {
                title: `Fix security vulnerability in ${modifiedFiles[0]}`,
                description: firstChange
              };
            }
          }
        }
      }
      
      // Create a meaningful commit
      const commitMessage = this.createCommitMessage(
        summary?.title || `Fix security vulnerability in ${issueContext.title}`,
        summary?.description || result.message || 'Applied security fixes',
        issueContext.number
      );
      
      const commitHash = this.createCommit(modifiedFiles, commitMessage);
      
      return {
        success: true,
        message: `Successfully fixed vulnerabilities in ${modifiedFiles.length} file(s)`,
        filesModified: modifiedFiles,
        commitHash,
        diffStats,
        summary: summary ? {
          title: summary.title,
          description: summary.description,
          securityImpact: summary.securityImpact || 'Vulnerabilities have been patched',
          tests: summary.testingGuidance || summary.tests || []
        } : {
          title: `Fix security vulnerability: ${issueContext.title}`,
          description: result.message || 'Security vulnerabilities fixed',
          securityImpact: 'Vulnerabilities have been patched',
          tests: []
        }
      };
      
    } catch (error) {
      logger.error('Git-based solution generation failed', error as Error);
      return {
        success: false,
        message: 'Failed to generate solution',
        error: `Git-based solution generation failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  
  /**
   * Get list of modified files using git
   */
  private getModifiedFiles(): string[] {
    try {
      const output = execSync('git diff --name-only', {
        cwd: this.repoPath,
        encoding: 'utf-8'
      }).trim();
      
      return output ? output.split('\n') : [];
    } catch (error) {
      logger.error('Failed to get modified files', error as Error);
      return [];
    }
  }
  
  /**
   * Get diff statistics
   */
  private getDiffStats(): GitSolutionResult['diffStats'] {
    try {
      const output = execSync('git diff --stat', {
        cwd: this.repoPath,
        encoding: 'utf-8'
      });
      
      // Parse the summary line (e.g., "3 files changed, 45 insertions(+), 23 deletions(-)")
      const match = output.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
      
      if (match) {
        return {
          filesChanged: parseInt(match[1], 10),
          insertions: parseInt(match[2] || '0', 10),
          deletions: parseInt(match[3] || '0', 10)
        };
      }
      
      return { filesChanged: 0, insertions: 0, deletions: 0 };
    } catch (error) {
      logger.error('Failed to get diff stats', error as Error);
      return { filesChanged: 0, insertions: 0, deletions: 0 };
    }
  }
  
  /**
   * Create a commit with the changes
   */
  private createCommit(files: string[], message: string): string {
    try {
      // Configure git user if not set (for GitHub Actions)
      try {
        execSync('git config user.email', { cwd: this.repoPath });
      } catch {
        execSync('git config user.email "rsolv@users.noreply.github.com"', {
          cwd: this.repoPath
        });
        execSync('git config user.name "RSOLV Bot"', {
          cwd: this.repoPath
        });
      }
      
      // Stage the modified files
      execSync(`git add ${files.join(' ')}`, {
        cwd: this.repoPath
      });
      
      // Create the commit using a file to avoid shell escaping issues
      const fs = require('fs');
      const os = require('os');
      const path = require('path');
      const messageFile = path.join(os.tmpdir(), `commit-msg-${Date.now()}.txt`);
      fs.writeFileSync(messageFile, message);
      
      try {
        execSync(`git commit -F "${messageFile}"`, {
          cwd: this.repoPath
        });
      } finally {
        // Clean up the temporary file
        try {
          fs.unlinkSync(messageFile);
        } catch {
          // Ignore cleanup errors
        }
      }
      
      // Get the commit hash
      const hash = execSync('git rev-parse HEAD', {
        cwd: this.repoPath,
        encoding: 'utf-8'
      }).trim();
      
      logger.info(`Created commit ${hash.substring(0, 8)}: ${message.split('\n')[0]}`);
      return hash;
      
    } catch (error) {
      logger.error('Failed to create commit', error as Error);
      throw error;
    }
  }
  
  /**
   * Create a meaningful commit message
   */
  private createCommitMessage(title: string, description: string, issueNumber: number): string {
    return `${title}

${description}

Fixes #${issueNumber}

This commit was automatically generated by RSOLV to fix security vulnerabilities.`;
  }
}