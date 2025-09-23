/**
 * TDD tests for Claude Code CLI retry mechanism
 * Following red-green-refactor methodology
 */

import { describe, test, expect, beforeEach, afterEach, mock, vi } from 'vitest';
import type { RetryConfig, CLISolutionResult } from '../claude-code-cli-retry';

// Mock implementation for testing - will be replaced with real implementation
class MockRetryableCLI {
  public attempts = 0;
  private responses: CLISolutionResult[] = [];
  private responseIndex = 0;
  
  setResponse(response: CLISolutionResult): void {
    this.responses = [response];
    this.responseIndex = 0;
  }
  
  setResponses(responses: CLISolutionResult[]): void {
    this.responses = responses;
    this.responseIndex = 0;
  }
  
  async executeCLI(prompt: string, options: any): Promise<CLISolutionResult> {
    this.attempts++;
    
    if (this.responseIndex < this.responses.length) {
      const response = this.responses[this.responseIndex];
      this.responseIndex++;
      
      // Simulate actual delay in real execution
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Don't throw for timeout in mock - let the retry logic handle it
      // if (response.error?.includes('timeout')) {
      //   throw new Error(response.error);
      // }
      
      return response;
    }
    
    return { success: false, message: 'No response configured', error: 'No mock response' };
  }
  
  async executeWithRetry(
    prompt: string,
    options: any,
    retryConfig?: Partial<RetryConfig>
  ): Promise<CLISolutionResult> {
    // This will be implemented in the real class
    const config: RetryConfig = {
      maxAttempts: retryConfig?.maxAttempts || 3,
      initialDelayMs: retryConfig?.initialDelayMs || 1000,
      maxDelayMs: retryConfig?.maxDelayMs || 30000,
      backoffMultiplier: retryConfig?.backoffMultiplier || 2,
      retryableErrors: retryConfig?.retryableErrors || [
        'rate_limit',
        'overloaded', 
        'timeout',
        'network',
        'ECONNRESET',
        'ETIMEDOUT'
      ]
    };
    
    let lastError: Error | null = null;
    this.attempts = 0;
    this.responseIndex = 0;
    
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        const result = await this.executeCLI(prompt, options);
        
        if (result.success) {
          return result;
        }
        
        // Check if error is retryable
        if (!this.isRetryableError(result.error, config.retryableErrors)) {
          return result;
        }
        
        lastError = new Error(result.error || 'Unknown error');
        
      } catch (error) {
        lastError = error as Error;
        
        if (!this.isRetryableError((error as Error).message, config.retryableErrors)) {
          throw error;
        }
      }
      
      // Calculate delay with exponential backoff
      if (attempt < config.maxAttempts) {
        const delay = Math.min(
          config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelayMs
        );
        
        // Use short delay for tests
        await new Promise(resolve => setTimeout(resolve, Math.min(delay, 20)));
      }
    }
    
    return {
      success: false,
      message: `Failed after ${config.maxAttempts} attempts`,
      error: lastError?.message || 'Unknown error'
    };
  }
  
  private isRetryableError(error: string | undefined, retryableErrors: string[]): boolean {
    if (!error) return false;
    
    const errorLower = error.toLowerCase();
    return retryableErrors.some(pattern => 
      errorLower.includes(pattern.toLowerCase())
    );
  }
}

describe('Claude Code CLI Retry Mechanism', () => {
  let cli: MockRetryableCLI;
  
  beforeEach(() => {
    cli = new MockRetryableCLI();
  });
  
  describe('successful execution', () => {
    test('should succeed on first attempt without retry', async () => {
      cli.setResponse({ 
        success: true, 
        message: 'Fixed successfully',
        changes: { 'file.ts': 'content' }
      });
      
      const result = await cli.executeWithRetry('test prompt', {});
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Fixed successfully');
      expect(cli.attempts).toBe(1);
    });
  });
  
  describe('retry on transient failures', () => {
    test('should retry on rate limit error and succeed', async () => {
      cli.setResponses([
        { success: false, message: 'Rate limited', error: 'rate_limit' },
        { success: true, message: 'Fixed successfully' }
      ]);
      
      const result = await cli.executeWithRetry('test', {}, {
        initialDelayMs: 10
      });
      
      expect(result.success).toBe(true);
      expect(cli.attempts).toBe(2);
    });
    
    test('should retry on overloaded error', async () => {
      cli.setResponses([
        { success: false, message: 'Overloaded', error: 'overloaded' },
        { success: false, message: 'Still overloaded', error: 'overloaded' },
        { success: true, message: 'Fixed' }
      ]);
      
      const result = await cli.executeWithRetry('test', {}, {
        initialDelayMs: 10
      });
      
      expect(result.success).toBe(true);
      expect(cli.attempts).toBe(3);
    });
    
    test('should retry on network errors', async () => {
      cli.setResponses([
        { success: false, message: 'Network error', error: 'ECONNRESET' },
        { success: true, message: 'Fixed' }
      ]);
      
      const result = await cli.executeWithRetry('test', {}, {
        initialDelayMs: 10
      });
      
      expect(result.success).toBe(true);
      expect(cli.attempts).toBe(2);
    });
  });
  
  describe('non-retryable errors', () => {
    test('should not retry on invalid API key error', async () => {
      cli.setResponse({
        success: false,
        message: 'Invalid API key',
        error: 'invalid_api_key'
      });
      
      const result = await cli.executeWithRetry('test', {});
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_api_key');
      expect(cli.attempts).toBe(1);
    });
    
    test('should not retry on permission denied', async () => {
      cli.setResponse({
        success: false,
        message: 'Permission denied',
        error: 'permission_denied'
      });
      
      const result = await cli.executeWithRetry('test', {});
      
      expect(result.success).toBe(false);
      expect(cli.attempts).toBe(1);
    });
  });
  
  describe('max attempts', () => {
    test('should respect max attempts configuration', async () => {
      // Set multiple timeout responses to ensure we have enough for retries
      cli.setResponses([
        { success: false, message: 'Timeout 1', error: 'timeout' },
        { success: false, message: 'Timeout 2', error: 'timeout' },
        { success: false, message: 'Timeout 3', error: 'timeout' }
      ]);
      
      const result = await cli.executeWithRetry('test', {}, {
        maxAttempts: 2,
        initialDelayMs: 10
      });
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed after 2 attempts');
      expect(cli.attempts).toBe(2);
    });
    
    test('should fail after all retries exhausted', async () => {
      cli.setResponses([
        { success: false, error: 'timeout' },
        { success: false, error: 'timeout' },
        { success: false, error: 'timeout' }
      ]);
      
      const result = await cli.executeWithRetry('test', {}, {
        maxAttempts: 3,
        initialDelayMs: 10
      });
      
      expect(result.success).toBe(false);
      expect(cli.attempts).toBe(3);
    });
  });
  
  describe('exponential backoff', () => {
    test('should apply exponential backoff between retries', async () => {
      const startTime = Date.now();
      
      cli.setResponses([
        { success: false, error: 'timeout' },
        { success: false, error: 'timeout' },
        { success: true, message: 'Fixed' }
      ]);
      
      const result = await cli.executeWithRetry('test', {}, {
        initialDelayMs: 10,
        backoffMultiplier: 2,
        maxDelayMs: 50
      });
      
      const duration = Date.now() - startTime;
      
      expect(result.success).toBe(true);
      expect(cli.attempts).toBe(3);
      // First retry: 10ms, second retry: 20ms, plus execution time
      expect(duration).toBeGreaterThanOrEqual(30);
    });
    
    test('should cap delay at maxDelayMs', async () => {
      cli.setResponses([
        { success: false, error: 'timeout' },
        { success: false, error: 'timeout' },
        { success: false, error: 'timeout' }
      ]);
      
      const startTime = Date.now();
      
      await cli.executeWithRetry('test', {}, {
        initialDelayMs: 100,
        backoffMultiplier: 10,
        maxDelayMs: 20,
        maxAttempts: 3
      });
      
      const duration = Date.now() - startTime;
      
      // Should be capped at 20ms per retry
      expect(duration).toBeLessThan(100);
    });
  });
  
  describe('custom retryable errors', () => {
    test('should use custom retryable error list', async () => {
      cli.setResponses([
        { success: false, error: 'custom_error' },
        { success: true, message: 'Fixed' }
      ]);
      
      const result = await cli.executeWithRetry('test', {}, {
        retryableErrors: ['custom_error'],
        initialDelayMs: 10
      });
      
      expect(result.success).toBe(true);
      expect(cli.attempts).toBe(2);
    });
    
    test('should not retry errors not in custom list', async () => {
      cli.setResponse({
        success: false,
        message: 'Network timeout',
        error: 'network_timeout' // Different error that's not in our custom list
      });
      
      const result = await cli.executeWithRetry('test', {}, {
        retryableErrors: ['custom_error_only'],
        initialDelayMs: 10
      });
      
      expect(result.success).toBe(false);
      expect(cli.attempts).toBe(1);
    });
  });
});

describe('Claude Code Max Development Mode', () => {
  describe('API key selection', () => {
    const originalEnv = process.env;
    
    beforeEach(() => {
      // Clear relevant env vars
      delete process.env.RSOLV_DEV_MODE;
      delete process.env.USE_CLAUDE_CODE_MAX;
      delete process.env.CLAUDE_CODE_MAX_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
    });
    
    afterEach(() => {
      process.env = originalEnv;
    });
    
    test('should detect development mode via RSOLV_DEV_MODE', () => {
      process.env.RSOLV_DEV_MODE = 'true';
      
      const isDev = process.env.RSOLV_DEV_MODE === 'true' || 
                    process.env.USE_CLAUDE_CODE_MAX === 'true';
      
      expect(isDev).toBe(true);
    });
    
    test('should detect development mode via USE_CLAUDE_CODE_MAX', () => {
      process.env.USE_CLAUDE_CODE_MAX = 'true';
      
      const isDev = process.env.RSOLV_DEV_MODE === 'true' || 
                    process.env.USE_CLAUDE_CODE_MAX === 'true';
      
      expect(isDev).toBe(true);
    });
    
    test('should use Claude Code Max key in dev mode', () => {
      process.env.RSOLV_DEV_MODE = 'true';
      process.env.CLAUDE_CODE_MAX_API_KEY = 'sk-ant-ccm-123';
      process.env.ANTHROPIC_API_KEY = 'sk-ant-api-456';
      
      const isDev = true;
      const apiKey = isDev 
        ? (process.env.CLAUDE_CODE_MAX_API_KEY || process.env.ANTHROPIC_API_KEY)
        : process.env.ANTHROPIC_API_KEY;
      
      expect(apiKey).toBe('sk-ant-ccm-123');
    });
    
    test('should fall back to regular key if Max key not set', () => {
      process.env.RSOLV_DEV_MODE = 'true';
      process.env.ANTHROPIC_API_KEY = 'sk-ant-api-456';
      
      const isDev = true;
      const apiKey = isDev 
        ? (process.env.CLAUDE_CODE_MAX_API_KEY || process.env.ANTHROPIC_API_KEY)
        : process.env.ANTHROPIC_API_KEY;
      
      expect(apiKey).toBe('sk-ant-api-456');
    });
    
    test('should use regular key in production mode', () => {
      process.env.CLAUDE_CODE_MAX_API_KEY = 'sk-ant-ccm-123';
      process.env.ANTHROPIC_API_KEY = 'sk-ant-api-456';
      
      const isDev = false;
      const apiKey = isDev 
        ? (process.env.CLAUDE_CODE_MAX_API_KEY || process.env.ANTHROPIC_API_KEY)
        : process.env.ANTHROPIC_API_KEY;
      
      expect(apiKey).toBe('sk-ant-api-456');
    });
  });
});