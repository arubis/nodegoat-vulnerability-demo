/**
 * Utilities for handling AI token limits consistently across all clients
 */

import { CompletionOptions } from './client.js';
import { AiProviderConfig } from '../types/index.js';

/**
 * Token limit use cases
 */
export type TokenUseCase = 'STANDARD' | 'TEST_GENERATION' | 'CODE_ANALYSIS' | 'FIX_GENERATION';

/**
 * Default token limits by use case
 */
export const DEFAULT_TOKEN_LIMITS: Record<TokenUseCase, number> = {
  // For simple completions - sufficient for most API responses
  STANDARD: 4000,

  // For AI test generation - needs enough tokens for complex JSON with 3 test cases
  TEST_GENERATION: 10000,

  // For code analysis and security scanning - larger context needed
  CODE_ANALYSIS: 8000,

  // For fix generation with Claude Code - very large context
  FIX_GENERATION: 16000
} as const;

/**
 * Resolves the appropriate maxTokens value using a clear priority order:
 * 1. Explicit options.maxTokens (highest priority - caller knows best)
 * 2. Config maxTokens (from user configuration)
 * 3. Use case default (context-appropriate fallback)
 * 4. Standard default (safe fallback)
 */
export function resolveMaxTokens(
  options: CompletionOptions,
  config: AiProviderConfig,
  useCase: TokenUseCase = 'STANDARD'
): number {
  // Priority 1: Explicit override from caller
  if (options.maxTokens !== undefined) {
    return options.maxTokens;
  }

  // Priority 2: Configuration value
  if (config.maxTokens !== undefined) {
    return config.maxTokens;
  }

  // Priority 3: Model-specific limits
  const model = config?.model?.toLowerCase();
  if (model?.includes('sonnet-4')) {
    // Claude Sonnet 4 has 64K output tokens - no need to cap!
    return DEFAULT_TOKEN_LIMITS[useCase];
  } else if (model?.includes('sonnet')) {
    // Claude 3.5 Sonnet and earlier have 8192 max output tokens
    // Use appropriate limit based on use case but cap at 8192
    const defaultLimit = DEFAULT_TOKEN_LIMITS[useCase];
    return Math.min(defaultLimit, 8000); // Use 8000 to be safe
  }

  // Priority 4: Use case appropriate default (guaranteed to exist due to types)
  return DEFAULT_TOKEN_LIMITS[useCase];
}

/**
 * Validates that a token limit is reasonable
 * @throws {Error} if token limit is invalid
 */
export function validateTokenLimit(tokens: number): void {
  if (tokens <= 0) {
    throw new Error(`Invalid token limit: ${tokens}. Must be positive.`);
  }

  if (tokens > 200000) {
    throw new Error(`Token limit too high: ${tokens}. Maximum is 200,000.`);
  }
}

/**
 * Gets the recommended token limit for AI test generation
 * This is the use case that was causing our JSON truncation issues
 */
export function getTestGenerationTokenLimit(
  options: CompletionOptions,
  config: AiProviderConfig
): number {
  // Check model-specific limits first
  const model = config?.model?.toLowerCase();
  if (model?.includes('sonnet-4')) {
    // Claude Sonnet 4 has 64K output tokens - use full test generation limit!
    const tokens = resolveMaxTokens(options, config, 'TEST_GENERATION');
    validateTokenLimit(tokens);
    return tokens;
  } else if (model?.includes('sonnet')) {
    // Claude 3.5 Sonnet and earlier have 8192 max output tokens
    // Use slightly less to be safe
    return 8000;
  }

  const tokens = resolveMaxTokens(options, config, 'TEST_GENERATION');
  validateTokenLimit(tokens);
  return tokens;
}