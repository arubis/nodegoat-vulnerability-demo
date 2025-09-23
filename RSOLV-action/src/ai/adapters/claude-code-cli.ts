/**
 * Claude Code CLI adapter that calls the CLI directly
 * Bypasses SDK issues with MCP and file editing in Docker
 */
import { IssueContext } from '../../types/index.js';
import { AIConfig } from '../types.js';
import { IssueAnalysis } from '../types.js';
import { logger } from '../../utils/logger.js';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface CLISolutionResult {
  success: boolean;
  message: string;
  changes?: Record<string, string>;
  error?: string;
  messages?: any[];
}

// Export type for use in other modules
export type { CLISolutionResult as CLISolutionResultType };

/**
 * Claude Code adapter that uses CLI directly
 */
export class ClaudeCodeCLIAdapter {
  protected claudeConfig?: AIConfig;
  protected repoPath: string;
  protected credentialManager?: any;

  constructor(config: AIConfig, repoPath: string = process.cwd(), credentialManager?: any) {
    this.claudeConfig = config;
    this.repoPath = repoPath;
    this.credentialManager = credentialManager;
  }

  /**
   * Generate solution using Claude Code CLI
   */
  async generateSolution(
    issueContext: IssueContext,
    analysis: IssueAnalysis,
    enhancedPrompt?: string
  ): Promise<CLISolutionResult> {
    try {
      logger.info('Using Claude Code CLI for file editing...');

      // Get API key from environment or vended credentials
      let apiKey = process.env.ANTHROPIC_API_KEY;
      
      // If no direct API key, try to get from vended credentials
      if (!apiKey && this.credentialManager) {
        try {
          apiKey = this.credentialManager.getCredential('anthropic');
          if (apiKey) {
            logger.info('Using vended credentials for Claude Code CLI');
          }
        } catch (error) {
          logger.warn('Failed to get vended credentials:', error);
        }
      }
      
      if (!apiKey) {
        return {
          success: false,
          message: 'CLI execution failed',
          error: 'ANTHROPIC_API_KEY environment variable or vended credentials required for CLI approach'
        };
      }

      // Create prompt
      const prompt = enhancedPrompt || this.constructPrompt(issueContext, analysis);
      
      logger.info(`Working directory: ${this.repoPath}`);
      logger.info(`Prompt length: ${prompt.length} characters`);

      // Execute Claude Code CLI with prompt via stdin
      const result = await this.executeCLI(prompt, {
        cwd: this.repoPath,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: apiKey
        }
      })

      if (!result.success) {
        return {
          success: false,
          message: result.error || 'Claude Code CLI execution failed',
          error: result.error
        };
      }

      // Check for file modifications using git
      const modifiedFiles = this.getModifiedFiles();
      
      if (modifiedFiles.length === 0) {
        return {
          success: false,
          message: 'No files were modified by Claude Code CLI',
          error: 'Claude Code CLI did not make any file changes'
        };
      }

      logger.info(`Files modified by Claude Code CLI: ${modifiedFiles.join(', ')}`);

      // Extract any JSON from the output
      let changes: Record<string, string> = {};
      const jsonMatch = result.output?.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        try {
          const jsonData = JSON.parse(jsonMatch[1]);
          if (jsonData.files && Array.isArray(jsonData.files)) {
            jsonData.files.forEach((file: any) => {
              if (file.path && file.changes) {
                changes[file.path] = file.changes;
              }
            });
          }
        } catch (e) {
          logger.debug('Could not parse JSON from CLI output');
        }
      }

      return {
        success: true,
        message: `Successfully fixed vulnerabilities in ${modifiedFiles.length} file(s)`,
        changes,
        messages: [{ type: 'cli_output', content: result.output }]
      };

    } catch (error) {
      logger.error('Claude Code CLI execution failed:', error);
      return {
        success: false,
        message: 'CLI execution failed',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Execute Claude Code CLI
   */
  protected executeCLI(prompt: string, options: any): Promise<{ success: boolean; output?: string; error?: string }> {
    return new Promise((resolve) => {
      // Set a 20-minute timeout for Claude CLI
      const timeout = setTimeout(() => {
        logger.warn('Claude CLI execution timed out after 20 minutes');
        if (child && !child.killed) {
          child.kill('SIGTERM');
        }
        resolve({
          success: false,
          error: 'Claude CLI execution timed out after 20 minutes'
        });
      }, 20 * 60 * 1000); // 20 minutes
      
      let child: any;
      // Try different approaches to find Claude CLI
      // Use --print for non-interactive mode with acceptEdits permission
      // Add model parameter if specified in environment
      const modelArgs = process.env.CLAUDE_MODEL ? ['--model', process.env.CLAUDE_MODEL] : [];
      const cliCommands: [string, string[]][] = [
        ['claude', ['--print', '--permission-mode', 'acceptEdits', ...modelArgs, '-']],  // Global install
        ['bunx', ['@anthropic-ai/claude-code', '--print', '--permission-mode', 'acceptEdits', ...modelArgs, '-']],  // Bunx
        ['bun', ['node_modules/@anthropic-ai/claude-code/cli.js', '--print', '--permission-mode', 'acceptEdits', ...modelArgs, '-']]  // Direct run
      ];
      
      let attemptIndex = 0;
      
      const tryNextCommand = () => {
        if (attemptIndex >= cliCommands.length) {
          resolve({
            success: false,
            error: 'Could not find Claude Code CLI via bunx, bun, or global install'
          });
          return;
        }
        
        const [command, commandArgs] = cliCommands[attemptIndex];
        logger.info(`Attempting: ${command} ${commandArgs.join(' ')}`);
        attemptIndex++;
        
        child = spawn(command, commandArgs, {
          ...options,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        // Write prompt to stdin and close it (as per working implementation)
        child.stdin.write(prompt);
        child.stdin.end();

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data: Buffer) => {
          const chunk = data.toString();
          stdout += chunk;
          // Log output in real-time for debugging
          logger.debug(`Claude CLI stdout: ${chunk.slice(0, 200)}`);
          process.stdout.write(chunk);
        });

        child.stderr?.on('data', (data: Buffer) => {
          const chunk = data.toString();
          stderr += chunk;
          // Log errors in real-time
          process.stderr.write(chunk);
        });

        child.on('close', (code: number | null) => {
          clearTimeout(timeout); // Clear timeout on completion
          if (code === 0) {
            resolve({ success: true, output: stdout });
          } else {
            resolve({ 
              success: false, 
              error: `Claude CLI exited with code ${code}. stderr: ${stderr}` 
            });
          }
        });

        child.on('error', (error: Error) => {
          // If this command failed, try the next one
          if (attemptIndex < cliCommands.length) {
            logger.debug(`Command ${command} failed with: ${error.message}, trying next approach...`);
            tryNextCommand();
          } else {
            clearTimeout(timeout); // Clear timeout on error
            resolve({ 
              success: false, 
              error: `Failed to start Claude CLI: ${error.message}` 
            });
          }
        });
      };
      
      // Start with the first command
      tryNextCommand();
    });
  }

  /**
   * Get list of modified files using git
   */
  protected getModifiedFiles(): string[] {
    try {
      const { execSync } = require('child_process');
      const output = execSync('git diff --name-only', {
        cwd: this.repoPath,
        encoding: 'utf-8'
      }).trim();
      
      return output ? output.split('\n') : [];
    } catch (error) {
      logger.error('Failed to get modified files:', error);
      return [];
    }
  }

  /**
   * Construct the prompt for CLI usage
   */
  protected constructPrompt(issueContext: IssueContext, analysis: IssueAnalysis): string {
    // Use structured phased prompting if enabled
    if (this.claudeConfig?.useStructuredPhases) {
      return this.constructStructuredPhasedPrompt(issueContext, analysis);
    }
    
    return `You are an expert security engineer fixing vulnerabilities using Test-Driven Development (TDD) methodology.

## Issue Details:
- **Title**: ${issueContext.title}
- **Description**: ${issueContext.body}
- **Complexity**: ${analysis.complexity}
- **Files with vulnerabilities**: ${analysis.relatedFiles?.join(', ') || 'To be discovered'}

## CRITICAL: Use TDD Red-Green-Refactor Methodology

### Phase 1: RED - Prove the Vulnerability Exists
- Use Read to understand the vulnerable code
- Identify how the vulnerability can be exploited
- Document a test that WOULD exploit the vulnerability (e.g., for XSS: injecting '<script>alert("XSS")</script>')

### Phase 2: GREEN - Fix the Vulnerability
- Use Edit or MultiEdit tools to fix the security issue
- For XSS: Add proper HTML escaping/sanitization
- For SQL Injection: Use parameterized queries
- Make minimal changes that prevent the exploit

### Phase 3: REFACTOR - Ensure Quality
- Verify legitimate functionality still works
- Clean up the fix if needed
- Ensure no regressions were introduced

### Phase 4: Provide Fix Summary (ONLY AFTER EDITING FILES)
After completing the TDD cycle and editing files, provide this JSON:

\`\`\`json
{
  "title": "Fix [vulnerability type] in [component]",
  "description": "Clear explanation of what was vulnerable and how you fixed it",
  "files": [
    {
      "path": "path/to/file.js",
      "changes": "Complete fixed code content (use Read to get it if needed)"
    }
  ],
  "tests": [
    "RED test validates that malicious input like '<script>alert(\\"XSS\\")</script>' in [field] is properly escaped and cannot execute",
    "GREEN test ensures the fix prevents XSS by escaping dangerous characters in [field] input",
    "REFACTOR test confirms that valid [functionality] still works correctly and [feature] loads properly"
  ]
}
\`\`\`

Remember: Follow TDD - understand vulnerability (RED), fix it (GREEN), ensure quality (REFACTOR), THEN provide JSON.`;
  }

  /**
   * Construct a structured phased prompt for CLI
   */
  private constructStructuredPhasedPrompt(issueContext: IssueContext, analysis: IssueAnalysis): string {
    return `You are an expert security engineer using Test-Driven Development (TDD) to fix vulnerabilities.

## 🚨 CRITICAL: FOLLOW TDD RED-GREEN-REFACTOR METHODOLOGY 🚨

## PHASE 1: RED - UNDERSTAND THE VULNERABILITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Locate the vulnerability: ${issueContext.title}
   - Description: ${issueContext.body}
   - Related files: ${analysis.relatedFiles?.join(', ') || 'To be discovered'}

2. Use Read to examine the vulnerable code

3. Identify the attack vector (e.g., for XSS: '<script>alert("XSS")</script>')

## PHASE 2: GREEN - FIX THE VULNERABILITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Use Edit or MultiEdit tools to fix the vulnerable code
   - For XSS: Escape HTML entities (&, <, >, ", ')
   - For SQL Injection: Use parameterized queries
   - Make minimal changes that block the exploit

2. After editing, use Read tool to verify your fix

3. Say "GREEN PHASE COMPLETE: Vulnerability fixed" when done

## PHASE 3: REFACTOR - ENSURE QUALITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Verify legitimate functionality still works
2. Clean up code if needed
3. Say "REFACTOR COMPLETE: Code quality verified"

## PHASE 4: JSON SUMMARY (ONLY AFTER ALL PHASES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Provide this JSON with TDD test descriptions:

\`\`\`json
{
  "title": "Fix [vulnerability type] in [component]",
  "description": "Clear explanation using TDD: RED (vulnerability existed), GREEN (fix applied), REFACTOR (quality ensured)",
  "files": [
    {
      "path": "path/to/edited/file.js",
      "changes": "Complete file content after your edits (read it back with Read tool)"
    }
  ],
  "tests": [
    "RED test: Validates that malicious input like '<script>alert(\\"XSS\\")</script>' would have been exploitable before fix",
    "GREEN test: Ensures the fix prevents the vulnerability by properly escaping/sanitizing input",
    "REFACTOR test: Confirms legitimate functionality (e.g., livereload) still works correctly"
  ]
}
\`\`\`

## TDD Checklist:
□ RED: Understood vulnerability and attack vector
□ GREEN: Applied fix using Edit/MultiEdit tools
□ REFACTOR: Verified no regressions
□ Provided JSON with TDD test descriptions

Remember: Follow TDD methodology - RED (understand), GREEN (fix), REFACTOR (verify), then JSON.`;
  }
}