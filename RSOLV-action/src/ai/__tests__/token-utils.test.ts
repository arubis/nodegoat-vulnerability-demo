import { describe, test, expect } from 'vitest';
import {
  resolveMaxTokens,
  validateTokenLimit,
  getTestGenerationTokenLimit,
  DEFAULT_TOKEN_LIMITS
} from '../token-utils.js';
import { CompletionOptions } from '../types.js';
import { AiProviderConfig } from '../../types/index.js';

describe('Token Utils - TDD Tests', () => {
  const mockConfig: AiProviderConfig = {
    provider: 'anthropic',
    apiKey: 'test-key',
    model: 'claude-3-sonnet',
    maxTokens: 8000
  };

  const mockOptions: CompletionOptions = {};

  describe('RED - resolveMaxTokens priority order', () => {
    test('should prioritize options.maxTokens over config and defaults', () => {
      const options: CompletionOptions = { maxTokens: 12000 };
      const result = resolveMaxTokens(options, mockConfig, 'STANDARD');
      expect(result).toBe(12000);
    });

    test('should use config.maxTokens when options.maxTokens is undefined', () => {
      const options: CompletionOptions = {};
      const result = resolveMaxTokens(options, mockConfig, 'STANDARD');
      expect(result).toBe(8000); // from mockConfig
    });

    test('should use use case default when both options and config are undefined', () => {
      const options: CompletionOptions = {};
      const config: AiProviderConfig = { provider: 'anthropic', apiKey: 'test' };
      const result = resolveMaxTokens(options, config, 'TEST_GENERATION');
      expect(result).toBe(DEFAULT_TOKEN_LIMITS.TEST_GENERATION);
    });

    test('should fallback to STANDARD default for unknown use case', () => {
      const options: CompletionOptions = {};
      const config: AiProviderConfig = { provider: 'anthropic', apiKey: 'test' };
      // @ts-ignore - testing invalid use case
      const result = resolveMaxTokens(options, config, 'UNKNOWN_CASE');
      expect(result).toBe(DEFAULT_TOKEN_LIMITS.STANDARD);
    });
  });

  describe('GREEN - validateTokenLimit edge cases', () => {
    test('should accept valid token limits', () => {
      expect(() => validateTokenLimit(1000)).not.toThrow();
      expect(() => validateTokenLimit(50000)).not.toThrow();
      expect(() => validateTokenLimit(200000)).not.toThrow();
    });

    test('should reject zero or negative token limits', () => {
      expect(() => validateTokenLimit(0)).toThrow('Invalid token limit: 0');
      expect(() => validateTokenLimit(-100)).toThrow('Invalid token limit: -100');
    });

    test('should reject excessively high token limits', () => {
      expect(() => validateTokenLimit(300000)).toThrow('Token limit too high: 300000');
    });
  });

  describe('REFACTOR - getTestGenerationTokenLimit (our bug fix)', () => {
    test('should use TEST_GENERATION default (10000) when no config provided', () => {
      const options: CompletionOptions = {};
      const config: AiProviderConfig = { provider: 'anthropic', apiKey: 'test' };
      const result = getTestGenerationTokenLimit(options, config);
      expect(result).toBe(10000);
    });

    test('should respect explicit options.maxTokens for test generation', () => {
      const options: CompletionOptions = { maxTokens: 15000 };
      const result = getTestGenerationTokenLimit(options, mockConfig);
      expect(result).toBe(15000);
    });

    test('should validate the resolved token limit', () => {
      const options: CompletionOptions = { maxTokens: -1 };
      expect(() => getTestGenerationTokenLimit(options, mockConfig)).toThrow();
    });

    test('should prevent the original 2000 token bug from recurring', () => {
      // This test ensures we never accidentally default back to 2000 tokens
      const options: CompletionOptions = {};
      const config: AiProviderConfig = { provider: 'anthropic', apiKey: 'test' };
      const result = getTestGenerationTokenLimit(options, config);

      // Must be significantly higher than the old 2000 limit
      expect(result).toBeGreaterThan(8000);
      expect(result).toBe(DEFAULT_TOKEN_LIMITS.TEST_GENERATION);
    });
  });

  describe('Use case specific defaults', () => {
    test('should have appropriate defaults for each use case', () => {
      expect(DEFAULT_TOKEN_LIMITS.STANDARD).toBe(4000);
      expect(DEFAULT_TOKEN_LIMITS.TEST_GENERATION).toBe(10000);
      expect(DEFAULT_TOKEN_LIMITS.CODE_ANALYSIS).toBe(8000);
      expect(DEFAULT_TOKEN_LIMITS.FIX_GENERATION).toBe(16000);
    });

    test('should never default to the problematic 2000 token limit', () => {
      Object.values(DEFAULT_TOKEN_LIMITS).forEach(limit => {
        expect(limit).toBeGreaterThan(2000);
      });
    });
  });
});