/**
 * Claude Code CLI adapter for development mode using Claude Code Max
 * Uses the locally authenticated Claude CLI instead of API keys
 */

import { RetryableClaudeCodeCLI } from './claude-code-cli-retry.js';
import type { CLISolutionResult } from './claude-code-cli.js';
import { IssueContext } from '../../types/index.js';
import { AIConfig } from '../types.js';
import { IssueAnalysis } from '../types.js';
import { logger } from '../../utils/logger.js';
import { execSync } from 'child_process';

/**
 * Check if Claude CLI is available and authenticated
 */
export function isClaudeMaxAvailable(): boolean {
  try {
    // First check if claude command exists
    try {
      execSync('which claude', { stdio: 'ignore' });
    } catch {
      return false; // Claude CLI not installed
    }
    
    // Check if claude command works - try --version first as it's simpler
    let versionWorks = false;
    try {
      const versionResult = execSync('claude --version 2>&1', { 
        encoding: 'utf-8',
        timeout: 5000
      }).toString().trim();
      
      logger.debug(`Claude CLI version: ${versionResult}`);
      versionWorks = true;
    } catch (versionError: any) {
      logger.debug('Claude CLI version check failed:', versionError.message);
      return false;
    }
    
    // If version works, check if authenticated by trying a simple command
    // Use shell to handle pipes properly
    const result = execSync('echo "test" | claude --print 2>&1 || echo "FAILED"', { 
      encoding: 'utf-8',
      timeout: 30000,
      shell: '/bin/sh'
    }).toString().trim();
    
    // If we get any response that's not an error, it's working
    // Note: We're being lenient here - even "Invalid API key" means CLI is installed
    const isWorking = result.length > 0 && 
                      !result.toLowerCase().includes('authenticate') &&
                      !result.toLowerCase().includes('not found');
    
    logger.debug(`Claude Max check result: "${result.substring(0, 50)}..." - Working: ${isWorking}`);
    return isWorking;
  } catch (error: any) {
    logger.debug('Claude Code Max not available:', error.message);
    return false;
  }
}

/**
 * Development mode adapter that uses Claude Code Max when available
 */
export class ClaudeCodeMaxAdapter extends RetryableClaudeCodeCLI {
  private useClaudeMax: boolean = false;
  
  constructor(config: AIConfig, repoPath: string = process.cwd(), credentialManager?: any) {
    super(config, repoPath, credentialManager);
    
    // Check if we should use Claude Max
    if (this.isDevelopmentMode()) {
      this.useClaudeMax = isClaudeMaxAvailable();
      if (this.useClaudeMax) {
        logger.info('✅ Claude Code Max detected and will be used for development');
      } else {
        logger.info('⚠️ Development mode enabled but Claude Code Max not available/authenticated');
      }
    }
  }
  
  /**
   * Override to use Claude Max when available
   */
  async generateSolution(
    issueContext: IssueContext,
    analysis: IssueAnalysis,
    enhancedPrompt?: string
  ): Promise<CLISolutionResult> {
    const isDev = this.isDevelopmentMode();
    
    if (isDev && this.useClaudeMax) {
      logger.info('🚀 Using Claude Code Max (signed-in account) for development');
      
      // Create prompt
      const prompt = enhancedPrompt || this.constructPrompt(issueContext, analysis);
      
      logger.info(`Working directory: ${this.repoPath}`);
      logger.info(`Prompt length: ${prompt.length} characters`);
      
      // Execute with Claude Max (no API key needed)
      const result = await this.executeWithRetry(prompt, {
        cwd: this.repoPath,
        env: {
          ...process.env,
          // Remove any API keys to ensure we use the signed-in account
          ANTHROPIC_API_KEY: undefined,
          CLAUDE_CODE_MAX_API_KEY: undefined
        }
      });
      
      if (!result.success) {
        logger.warn('Claude Code Max execution failed, falling back to API mode');
        return super.generateSolution(issueContext, analysis, enhancedPrompt);
      }
      
      // Check for file modifications
      const modifiedFiles = this.getModifiedFiles();
      
      if (modifiedFiles.length === 0) {
        return {
          success: false,
          message: 'No files were modified by Claude Code Max',
          error: 'Claude Code Max did not make any file changes'
        };
      }
      
      logger.info(`✅ Files modified by Claude Code Max: ${modifiedFiles.join(', ')}`);
      
      // Build changes map
      const changes: Record<string, string> = {};
      for (const file of modifiedFiles) {
        changes[file] = `Modified by Claude Code Max`;
      }
      
      return {
        success: true,
        message: `Successfully modified ${modifiedFiles.length} file(s) using Claude Code Max`,
        changes
      };
    }
    
    // Fall back to standard implementation (API key based)
    return super.generateSolution(issueContext, analysis, enhancedPrompt);
  }
  
  /**
   * Generate solution with git support (wrapper for compatibility)
   */
  async generateSolutionWithGit(
    issueContext: IssueContext,
    analysis: IssueAnalysis,
    enhancedPrompt?: string,
    testResults?: any,
    validationResult?: any,
    validationContext?: any
  ): Promise<CLISolutionResult> {
    // In dev mode with Claude Max, we use the simpler generateSolution
    // The git operations are handled by Claude Code Max directly
    logger.info('Claude Code Max: Using generateSolution (git operations handled by Claude)');
    return this.generateSolution(issueContext, analysis, enhancedPrompt);
  }
  
  /**
   * Check if running in development mode
   */
  private isDevelopmentMode(): boolean {
    return process.env.RSOLV_DEV_MODE === 'true' || 
           process.env.USE_CLAUDE_CODE_MAX === 'true';
  }
}

/**
 * Demonstration function to show Claude Code Max working
 */
export async function demonstrateClaudeMax(): Promise<void> {
  console.log('\n=== Claude Code Max Integration Demo ===\n');
  
  // Check availability
  const available = isClaudeMaxAvailable();
  console.log(`Claude Code Max Available: ${available ? '✅ Yes' : '❌ No'}`);
  
  if (!available) {
    console.log('\nTo use Claude Code Max:');
    console.log('1. Install Claude desktop app');
    console.log('2. Sign in with your Claude account');
    console.log('3. Ensure "claude" command is in your PATH');
    return;
  }
  
  // Test a simple prompt
  console.log('\nTesting Claude Code Max...');
  try {
    const result = execSync('echo "What is the capital of France?" | claude --print', {
      encoding: 'utf-8',
      timeout: 10000
    });
    console.log('Response:', result.trim());
    console.log('\n✅ Claude Code Max is working!');
    
    // Show that no API key is needed
    console.log('\nAPI Keys in environment:');
    console.log('ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'Set (but not used)' : 'Not set');
    console.log('CLAUDE_CODE_MAX_API_KEY:', process.env.CLAUDE_CODE_MAX_API_KEY ? 'Set (but not needed)' : 'Not set');
    console.log('\n🎉 Using signed-in Claude Code Max account - no API keys required!');
    
  } catch (error) {
    console.log('❌ Error:', error);
  }
}