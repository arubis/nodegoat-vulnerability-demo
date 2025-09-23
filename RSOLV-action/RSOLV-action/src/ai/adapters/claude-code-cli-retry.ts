/**
 * Claude Code CLI adapter with retry mechanism and development mode support
 * Implements RFC-048: Claude Code Max Development Mode and Retry Mechanism
 */

import { ClaudeCodeCLIAdapter } from './claude-code-cli.js';
import type { CLISolutionResult } from './claude-code-cli.js';
import { IssueContext } from '../../types/index.js';
import { AIConfig } from '../types.js';
import { IssueAnalysis } from '../types.js';
import { logger } from '../../utils/logger.js';

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

/**
 * Check if running in development mode
 */
export function isDevelopmentMode(): boolean {
  return process.env.RSOLV_DEV_MODE === 'true' || 
         process.env.USE_CLAUDE_CODE_MAX === 'true';
}

/**
 * Enhanced Claude Code CLI adapter with retry mechanism
 */
export class RetryableClaudeCodeCLI extends ClaudeCodeCLIAdapter {
  private defaultRetryConfig: RetryConfig = {
    maxAttempts: parseInt(process.env.RSOLV_RETRY_MAX_ATTEMPTS || '3'),
    initialDelayMs: parseInt(process.env.RSOLV_RETRY_INITIAL_DELAY_MS || '1000'),
    maxDelayMs: parseInt(process.env.RSOLV_RETRY_MAX_DELAY_MS || '30000'),
    backoffMultiplier: parseFloat(process.env.RSOLV_RETRY_BACKOFF_MULTIPLIER || '2'),
    retryableErrors: [
      'rate_limit',
      'overloaded',
      'timeout',
      'network',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'EHOSTUNREACH',
      'Claude CLI exited with code'
    ]
  };

  /**
   * Generate solution with retry mechanism and dev mode support
   */
  async generateSolution(
    issueContext: IssueContext,
    analysis: IssueAnalysis,
    enhancedPrompt?: string
  ): Promise<CLISolutionResult> {
    try {
      logger.info('Using RetryableClaudeCodeCLI for file editing...');
      
      // Check for development mode
      const isDev = isDevelopmentMode();
      
      // Get appropriate API key
      const apiKey = await this.getApiKey(isDev);
      
      if (!apiKey) {
        return {
          success: false,
          message: 'No API key available',
          error: isDev 
            ? 'Claude Code Max API key not configured for development mode. Set CLAUDE_CODE_MAX_API_KEY or ANTHROPIC_API_KEY'
            : 'No API key or vended credentials available'
        };
      }
      
      // CRITICAL: Set the API key in process.env for Claude CLI to use
      // This ensures the CLI can authenticate properly
      process.env.ANTHROPIC_API_KEY = apiKey;
      
      logger.info(`Using ${isDev ? 'Claude Code Max (dev)' : 'production'} API`);
      
      // Create prompt
      const prompt = enhancedPrompt || this.constructPrompt(issueContext, analysis);
      
      logger.info(`Working directory: ${this.repoPath}`);
      logger.info(`Prompt length: ${prompt.length} characters`);
      
      // Use retry mechanism
      const result = await this.executeWithRetry(prompt, {
        cwd: this.repoPath,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: apiKey
        }
      });
      
      if (!result.success) {
        return result;
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
      
      // Build changes map
      const changes: Record<string, string> = {};
      for (const file of modifiedFiles) {
        changes[file] = `Modified by Claude Code CLI`;
      }
      
      return {
        success: true,
        message: `Successfully modified ${modifiedFiles.length} file(s)`,
        changes
      };
      
    } catch (error) {
      logger.error('Failed to generate solution with retry:', error);
      return {
        success: false,
        message: 'Failed to generate solution',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Execute CLI with retry mechanism
   */
  async executeWithRetry(
    prompt: string,
    options: any,
    retryConfig?: Partial<RetryConfig>
  ): Promise<CLISolutionResult> {
    const config = { ...this.defaultRetryConfig, ...retryConfig };
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        logger.info(`Attempt ${attempt}/${config.maxAttempts}: Executing Claude Code CLI`);
        
        const result = await this.executeCLI(prompt, options);
        
        if (result.success) {
          if (attempt > 1) {
            logger.info(`Succeeded on attempt ${attempt} after ${attempt - 1} retry(ies)`);
          }
          return {
            success: true,
            message: result.output || 'Operation completed successfully'
          };
        }
        
        // Check if error is retryable
        if (!this.isRetryableError(result.error, config.retryableErrors)) {
          logger.warn(`Non-retryable error: ${result.error}`);

          // Log additional debugging info for authentication failures
          if (this.isAuthenticationError(result.error)) {
            this.logAuthenticationFailureDebugInfo();
          }

          return {
            success: false,
            message: result.error || 'Operation failed',
            error: result.error
          };
        }
        
        lastError = new Error(result.error || 'Unknown error');
        logger.warn(`Retryable error on attempt ${attempt}: ${result.error}`);
        
      } catch (error) {
        lastError = error as Error;
        
        if (!this.isRetryableError(lastError.message, config.retryableErrors)) {
          logger.error(`Non-retryable exception: ${lastError.message}`);
          throw error;
        }
        
        logger.warn(`Retryable exception on attempt ${attempt}: ${lastError.message}`);
      }
      
      // Calculate delay with exponential backoff
      if (attempt < config.maxAttempts) {
        const delay = Math.min(
          config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelayMs
        );
        
        logger.info(`Retrying in ${delay}ms (exponential backoff)...`);
        await this.sleep(delay);
      }
    }
    
    // All attempts failed
    logger.error(`Failed after ${config.maxAttempts} attempts. Last error: ${lastError?.message}`);
    return {
      success: false,
      message: `Failed after ${config.maxAttempts} attempts`,
      error: lastError?.message || 'Unknown error'
    };
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: string | undefined, retryableErrors: string[]): boolean {
    if (!error) return false;
    
    const errorLower = error.toLowerCase();
    return retryableErrors.some(pattern => 
      errorLower.includes(pattern.toLowerCase())
    );
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get appropriate API key based on mode
   */
  private async getApiKey(isDev: boolean): Promise<string | undefined> {
    if (isDev) {
      // In dev mode, prefer Claude Code Max API key
      const maxKey = process.env.CLAUDE_CODE_MAX_API_KEY;
      if (maxKey) {
        logger.debug('Using Claude Code Max API key from CLAUDE_CODE_MAX_API_KEY');
        this.validateAndLogCredentialFormat(maxKey, 'CLAUDE_CODE_MAX_API_KEY');
        return maxKey;
      }

      // Fall back to regular API key
      const regularKey = process.env.ANTHROPIC_API_KEY;
      if (regularKey) {
        logger.debug('Using regular API key in dev mode (CLAUDE_CODE_MAX_API_KEY not set)');
        this.validateAndLogCredentialFormat(regularKey, 'ANTHROPIC_API_KEY');
        return regularKey;
      }

      return undefined;
    }

    // Production mode: prioritize vended credentials over environment
    let apiKey: string | undefined;
    let credentialSource = 'unknown';

    // Try vended credentials first if available
    if (this.credentialManager) {
      logger.info('Credential manager available, attempting to get Anthropic credentials');
      try {
        apiKey = await this.credentialManager.getCredential('anthropic');
        logger.info(`Got credential from manager: ${apiKey ? 'API key received (length: ' + apiKey.length + ')' : 'No API key returned'}`);
        if (apiKey) {
          logger.info('Using vended credentials for production mode');
          credentialSource = 'vended';
        }
      } catch (error) {
        logger.warn('Failed to get vended credentials:', error);
      }
    } else {
      logger.info('No credential manager available');
    }

    // Fall back to environment variable if no vended credentials
    if (!apiKey) {
      apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        logger.debug('Using environment ANTHROPIC_API_KEY');
        credentialSource = 'environment';
      }
    }

    // Validate and log credential format details
    if (apiKey) {
      this.validateAndLogCredentialFormat(apiKey, credentialSource);
    }

    return apiKey;
  }

  /**
   * Validate credential format and log debugging information
   * Addresses the "invalid x-api-key" authentication error discovered in workflow 17873531908
   */
  private validateAndLogCredentialFormat(apiKey: string, source: string): void {
    logger.debug('Credential format validation starting...');

    // Log credential metadata (but not the actual key)
    logger.debug(`API key length: ${apiKey.length}`);
    logger.debug(`API key prefix: ${apiKey.substring(0, Math.min(8, apiKey.length))}...`);
    logger.debug(`Credential source: ${source}`);

    // Validate Anthropic API key format
    const isValidAnthropicFormat = this.isValidAnthropicApiKeyFormat(apiKey);

    if (isValidAnthropicFormat) {
      logger.debug('Credential format validation: PASSED - Valid Anthropic API key format detected');
    } else {
      logger.warn('Credential format validation: FAILED - credential format may be incompatible with Claude CLI');
      logger.warn(`Expected format: sk-ant-api03-... but got prefix: ${apiKey.substring(0, Math.min(12, apiKey.length))}...`);

      // Log additional debugging info for troubleshooting
      if (apiKey.startsWith('rsolv_')) {
        logger.warn('Credential validation: RSOLV vended format detected - may need conversion for Claude CLI compatibility');
      } else if (apiKey.length < 20) {
        logger.warn('Credential validation: API key appears too short for Anthropic format');
      } else {
        logger.warn('Credential validation: Unknown API key format - proceeding but authentication may fail');
      }
    }

    // Log environment variable confirmation for debugging
    logger.debug(`ANTHROPIC_API_KEY environment variable set: ${!!process.env.ANTHROPIC_API_KEY}`);
    if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== apiKey) {
      logger.debug('Note: Using different credential than ANTHROPIC_API_KEY environment variable');
    }
  }

  /**
   * Check if API key matches expected Anthropic format
   */
  private isValidAnthropicApiKeyFormat(apiKey: string): boolean {
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }

    // Anthropic API keys typically start with "sk-ant-api03-"
    // and are followed by base64-encoded data (but in practice may include hyphens and other chars)
    const anthropicPattern = /^sk-ant-api03-[A-Za-z0-9+/\-_]+=*$/;
    return anthropicPattern.test(apiKey);
  }

  /**
   * Check if error indicates authentication failure
   */
  private isAuthenticationError(error: string | undefined): boolean {
    if (!error) return false;

    const errorLower = error.toLowerCase();
    return errorLower.includes('invalid x-api-key') ||
           errorLower.includes('authentication_error') ||
           errorLower.includes('401') ||
           errorLower.includes('unauthorized') ||
           errorLower.includes('invalid api key');
  }

  /**
   * Log comprehensive debugging information when authentication fails
   * Addresses the "invalid x-api-key" authentication error discovered in workflow 17873531908
   */
  private logAuthenticationFailureDebugInfo(): void {
    logger.debug('Authentication failed - credential debugging info:');

    // Log credential source
    const isDev = isDevelopmentMode();
    if (isDev) {
      logger.debug('Credential source: development mode');
      logger.debug(`CLAUDE_CODE_MAX_API_KEY set: ${!!process.env.CLAUDE_CODE_MAX_API_KEY}`);
      logger.debug(`ANTHROPIC_API_KEY set: ${!!process.env.ANTHROPIC_API_KEY}`);
    } else {
      logger.debug('Credential source: vended');
      logger.debug(`Credential manager available: ${!!this.credentialManager}`);
    }

    // Log environment variable confirmation
    logger.debug(`ANTHROPIC_API_KEY environment variable set: ${!!process.env.ANTHROPIC_API_KEY}`);

    // Log general debugging context
    logger.debug(`Working directory: ${this.repoPath}`);
    logger.debug(`Development mode: ${isDev}`);

    // Note about Claude CLI vs SDK differences
    logger.debug('Note: Claude CLI authentication differs from SDK - format validation may reveal incompatibilities');
  }

}

// Export for testing
export { CLISolutionResult };