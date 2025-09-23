# RFC-048: Claude Code Max Development Mode and Retry Mechanism

**Status**: Draft  
**Created**: 2025-08-20  
**Author**: RSOLV Engineering Team

## Summary

Implement a development mode that uses Claude Code Max accounts (via CLI with existing API key) to reduce API costs during development, and add a robust retry mechanism with exponential backoff for handling transient API failures.

## Motivation

Current issues:
1. **High development costs**: Using API credits during development and testing is expensive
2. **API failures**: 11% failure rate due to transient API errors (1/9 in latest E2E test)
3. **No fallback**: When API calls fail, entire workflow fails without retry

Goals:
- Reduce development costs by using Claude Code Max during development
- Improve reliability from 89% to 95%+ success rate
- Handle transient failures gracefully

## Detailed Design

### 1. Development Mode Detection

```typescript
interface DevelopmentConfig {
  useClaudeCodeMax: boolean;
  claudeCodeMaxApiKey?: string;
  retryConfig: RetryConfig;
}

function isDevelopmentMode(): boolean {
  return process.env.RSOLV_DEV_MODE === 'true' || 
         process.env.USE_CLAUDE_CODE_MAX === 'true';
}
```

### 2. Retry Mechanism with Exponential Backoff

```typescript
interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

class RetryableClaudeCodeCLI {
  private defaultRetryConfig: RetryConfig = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    retryableErrors: [
      'rate_limit',
      'overloaded',
      'timeout',
      'network',
      'ECONNRESET',
      'ETIMEDOUT'
    ]
  };

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
            logger.info(`Succeeded on attempt ${attempt}`);
          }
          return result;
        }
        
        // Check if error is retryable
        if (!this.isRetryableError(result.error, config.retryableErrors)) {
          logger.warn(`Non-retryable error: ${result.error}`);
          return result;
        }
        
        lastError = new Error(result.error);
        
      } catch (error) {
        lastError = error as Error;
        
        if (!this.isRetryableError(error.message, config.retryableErrors)) {
          throw error;
        }
      }
      
      // Calculate delay with exponential backoff
      if (attempt < config.maxAttempts) {
        const delay = Math.min(
          config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelayMs
        );
        
        logger.info(`Retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }
    
    // All attempts failed
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

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 3. Claude Code Max Integration (No API Key Required)

```typescript
/**
 * Check if Claude CLI is available and authenticated
 */
export function isClaudeMaxAvailable(): boolean {
  try {
    // Test if Claude command works (requires signed-in Claude desktop app)
    const result = execSync('echo "test" | claude --print 2>&1', { 
      encoding: 'utf-8',
      timeout: 10000
    }).toString().trim();
    
    return result.length > 0 && !result.includes('error');
  } catch (error) {
    return false;
  }
}

class ClaudeCodeMaxAdapter extends RetryableClaudeCodeCLI {
  async generateSolution(
    issueContext: IssueContext,
    analysis: IssueAnalysis,
    enhancedPrompt?: string
  ): Promise<CLISolutionResult> {
    const isDev = isDevelopmentMode();
    
    if (isDev && isClaudeMaxAvailable()) {
      logger.info('🚀 Using Claude Code Max (signed-in account)');
      
      // Execute with Claude Max - NO API KEY NEEDED
      const result = await this.executeWithRetry(prompt, {
        cwd: this.repoPath,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: undefined // Ensure we use signed-in account
        }
      });
    
    logger.info(`Using ${isDev ? 'Claude Code Max (dev)' : 'production'} API`);
    
    // Use retry mechanism
    return await this.executeWithRetry(
      enhancedPrompt || this.constructPrompt(issueContext, analysis),
      {
        cwd: this.repoPath,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: apiKey
        }
      }
    );
  }
  
  private getApiKey(isDev: boolean): string | undefined {
    if (isDev) {
      // In dev mode, prefer Claude Code Max API key
      return process.env.CLAUDE_CODE_MAX_API_KEY || 
             process.env.ANTHROPIC_API_KEY;
    }
    
    // Production mode: use standard flow
    let apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey && this.credentialManager) {
      try {
        apiKey = this.credentialManager.getCredential('anthropic');
      } catch (error) {
        logger.warn('Failed to get vended credentials:', error);
      }
    }
    
    return apiKey;
  }
}
```

## Testing Strategy

### TDD Test Suite

```typescript
describe('RetryableClaudeCodeCLI', () => {
  describe('retry mechanism', () => {
    test('should succeed on first attempt', async () => {
      const cli = new MockCLI();
      cli.setResponse({ success: true });
      
      const result = await cli.executeWithRetry('test', {});
      expect(result.success).toBe(true);
      expect(cli.attempts).toBe(1);
    });
    
    test('should retry on transient failure', async () => {
      const cli = new MockCLI();
      cli.setResponses([
        { success: false, error: 'rate_limit' },
        { success: false, error: 'overloaded' },
        { success: true }
      ]);
      
      const result = await cli.executeWithRetry('test', {}, {
        initialDelayMs: 10 // Fast for testing
      });
      
      expect(result.success).toBe(true);
      expect(cli.attempts).toBe(3);
    });
    
    test('should not retry non-retryable errors', async () => {
      const cli = new MockCLI();
      cli.setResponse({ success: false, error: 'invalid_api_key' });
      
      const result = await cli.executeWithRetry('test', {});
      expect(result.success).toBe(false);
      expect(cli.attempts).toBe(1);
    });
    
    test('should respect max attempts', async () => {
      const cli = new MockCLI();
      cli.setResponse({ success: false, error: 'timeout' });
      
      const result = await cli.executeWithRetry('test', {}, {
        maxAttempts: 2,
        initialDelayMs: 10
      });
      
      expect(result.success).toBe(false);
      expect(cli.attempts).toBe(2);
    });
  });
  
  describe('development mode', () => {
    test('should use Claude Code Max key in dev mode', async () => {
      process.env.RSOLV_DEV_MODE = 'true';
      process.env.CLAUDE_CODE_MAX_API_KEY = 'ccm_key';
      
      const cli = new ClaudeCodeCLIAdapter({}, '/test');
      const apiKey = cli.getApiKey(true);
      
      expect(apiKey).toBe('ccm_key');
    });
    
    test('should fall back to regular key if Max key not set', async () => {
      process.env.RSOLV_DEV_MODE = 'true';
      delete process.env.CLAUDE_CODE_MAX_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'regular_key';
      
      const cli = new ClaudeCodeCLIAdapter({}, '/test');
      const apiKey = cli.getApiKey(true);
      
      expect(apiKey).toBe('regular_key');
    });
  });
});
```

## Implementation Plan

1. **Phase 1**: Implement retry mechanism (1 day)
   - Write TDD tests
   - Implement RetryableClaudeCodeCLI base class
   - Add exponential backoff logic

2. **Phase 2**: Add development mode (0.5 days)
   - Add environment variable detection
   - Implement API key selection logic
   - Add logging for mode detection

3. **Phase 3**: Integration and testing (0.5 days)
   - Update existing ClaudeCodeCLIAdapter
   - Run E2E tests
   - Verify improvement in success rate

## Configuration

### Environment Variables

```bash
# Development mode - enables Claude Code Max if available
RSOLV_DEV_MODE=true
# or
USE_CLAUDE_CODE_MAX=true

# No API key needed for Claude Code Max!
# Just ensure Claude desktop app is:
# 1. Installed
# 2. Signed in
# 3. Available in PATH as 'claude' command

# Retry configuration (optional)
RSOLV_RETRY_MAX_ATTEMPTS=3
RSOLV_RETRY_INITIAL_DELAY_MS=1000
RSOLV_RETRY_MAX_DELAY_MS=30000
RSOLV_RETRY_BACKOFF_MULTIPLIER=2
```

## Expected Outcomes

1. **Cost Reduction**: 80-90% reduction in API costs during development
2. **Reliability**: Increase success rate from 89% to 95%+
3. **Developer Experience**: Faster iteration with Claude Code Max
4. **Production Safety**: No impact on production deployments

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Claude Code Max rate limits | Implement intelligent backoff |
| API key exposure | Use environment variables, never commit |
| Different behavior between Max and API | Test both modes in CI |
| Retry storms | Max delay cap, circuit breaker pattern |

## Alternatives Considered

1. **SDK Integration**: Rejected due to known issues with MCP and Docker
2. **Mock Mode**: Too limited for real development
3. **Caching Layer**: Complex, doesn't solve rate limit issues

## Success Metrics

- E2E success rate increases to 95%+
- Development API costs reduced by 80%+
- Zero production incidents from retry logic
- Developer satisfaction with faster iteration

## References

- RFC-047: Vendor Detection
- RFC-046: Extended Conversations
- E2E Test Results: 89% success rate (8/9)