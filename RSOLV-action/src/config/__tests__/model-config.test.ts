/**
 * TDD test for Claude 4 Sonnet model configuration
 * Ensures we're using the latest model as requested
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../index.js';
import * as fs from 'fs';

// Mock fs and yaml to control config file loading
vi.mock('fs');
vi.mock('js-yaml', () => ({
  load: vi.fn().mockReturnValue({})
}));

// Mock logger to avoid noise in tests
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('Model Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();

    // Mock fs.existsSync to return false (no config file)
    vi.mocked(fs.existsSync).mockReturnValue(false);

    // Set required env vars
    process.env.RSOLV_API_KEY = 'test-key';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('RED - Test should fail initially', () => {
    it('should default to Claude 4 Sonnet model', async () => {
      // GIVEN: No specific model configuration
      delete process.env.RSOLV_AI_MODEL;

      // WHEN: Loading configuration
      const config = await loadConfig();

      // THEN: Should use Claude 4 Sonnet
      expect(config.aiProvider.model).toBe('claude-sonnet-4-20250514');
    });

    it('should use Claude 4 Sonnet even when provider is set via env', async () => {
      // GIVEN: Provider set via environment
      process.env.RSOLV_AI_PROVIDER = 'claude-code';
      delete process.env.RSOLV_AI_MODEL;

      // WHEN: Loading configuration
      const config = await loadConfig();

      // THEN: Should still default to Claude 4 Sonnet
      expect(config.aiProvider.model).toBe('claude-sonnet-4-20250514');
    });

    it('should preserve useVendedCredentials when env vars are set', async () => {
      // GIVEN: AI provider set via environment
      process.env.RSOLV_AI_PROVIDER = 'claude-code';
      delete process.env.RSOLV_USE_VENDED_CREDENTIALS; // Not explicitly set

      // WHEN: Loading configuration
      const config = await loadConfig();

      // THEN: Should default to true for vended credentials
      expect(config.aiProvider.useVendedCredentials).toBe(true);
    });

    it('should respect explicit model override', async () => {
      // GIVEN: Explicit model override
      process.env.RSOLV_AI_MODEL = 'claude-3-opus-20240229';

      // WHEN: Loading configuration
      const config = await loadConfig();

      // THEN: Should use the overridden model
      expect(config.aiProvider.model).toBe('claude-3-opus-20240229');
    });
  });

  describe('Model metadata validation', () => {
    it('should have correct Claude 4 Sonnet capabilities', async () => {
      // GIVEN: Default configuration
      const config = await loadConfig();

      // THEN: Should have Claude 4 Sonnet with proper settings
      expect(config.aiProvider).toMatchObject({
        model: 'claude-sonnet-4-20250514',
        provider: 'claude-code',
        contextLimit: 100000,
        timeout: 3600000, // 60 minutes for complex operations
        temperature: 0.2
      });

      // AND: maxTokens should be undefined (resolved by token-utils)
      expect(config.aiProvider.maxTokens).toBeUndefined();
    });
  });

  describe('GREEN - Config merging', () => {
    it('should properly merge configs with env vars taking precedence', async () => {
      // GIVEN: Both default and env configs
      process.env.RSOLV_AI_PROVIDER = 'claude-code';
      process.env.RSOLV_AI_TEMPERATURE = '0.7';

      // WHEN: Loading configuration
      const config = await loadConfig();

      // THEN: Should merge properly
      expect(config.aiProvider.provider).toBe('claude-code');
      expect(config.aiProvider.temperature).toBe(0.7);
      expect(config.aiProvider.model).toBe('claude-sonnet-4-20250514'); // Default preserved
      expect(config.aiProvider.useVendedCredentials).toBe(true); // Default preserved
    });
  });
});