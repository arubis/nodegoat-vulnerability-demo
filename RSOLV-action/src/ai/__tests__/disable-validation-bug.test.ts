/**
 * TDD Test for DISABLE_FIX_VALIDATION bug
 * 
 * This test captures the bug where validation still runs even when
 * DISABLE_FIX_VALIDATION is set, due to the OR condition checking
 * both testGeneration.validateFixes and fixValidation.enabled
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ActionConfig } from '../../types/index.js';
import { loadConfig } from '../../config/index.js';

describe('DISABLE_FIX_VALIDATION bug reproduction', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    // Set required API key for config loading
    process.env.RSOLV_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('when DISABLE_FIX_VALIDATION is set', () => {
    it('should skip validation regardless of other settings', async () => {
      // Arrange - Set DISABLE_FIX_VALIDATION
      process.env.DISABLE_FIX_VALIDATION = 'true';
      // Don't set ENABLE_FIX_VALIDATION (defaults to undefined/false)
      delete process.env.ENABLE_FIX_VALIDATION;

      // Act - Load config
      const loadedConfig = await loadConfig();

      // Assert - Validation should be disabled
      expect(loadedConfig.fixValidation?.enabled).toBe(false);
      expect(loadedConfig.testGeneration?.validateFixes).toBeFalsy();

      // The key test: Should we skip validation?
      const skipValidation = loadedConfig.fixValidation?.enabled === false;
      expect(skipValidation).toBe(true);

      // Bug reproduction: This is the actual problematic condition
      const wouldEnterValidation = 
        loadedConfig.testGeneration?.validateFixes || 
        loadedConfig.fixValidation?.enabled !== false;
      
      // This SHOULD be false (skip validation) but the bug makes it true
      expect(wouldEnterValidation).toBe(false); // This will FAIL with current code
    });

    it('should skip validation even if testGeneration.enabled is true', async () => {
      // Arrange - This reproduces the exact scenario in our logs
      process.env.DISABLE_FIX_VALIDATION = 'true';
      process.env.ENABLE_TEST_GENERATION = 'true'; // This might be set elsewhere
      delete process.env.ENABLE_FIX_VALIDATION;

      // Act - Load config
      const loadedConfig = await loadConfig();

      // Assert - DISABLE_FIX_VALIDATION should override everything
      const skipValidation = loadedConfig.fixValidation?.enabled === false;
      expect(skipValidation).toBe(true);

      // The fixed condition should respect DISABLE_FIX_VALIDATION
      const shouldSkipValidation = 
        loadedConfig.fixValidation?.enabled === false;
      
      const wouldEnterValidation = !shouldSkipValidation && (
        loadedConfig.testGeneration?.validateFixes || 
        loadedConfig.fixValidation?.enabled !== false
      );
      
      expect(wouldEnterValidation).toBe(false); // Should NOT enter validation
    });
  });

  describe('proper validation skip logic', () => {
    interface ValidationDecisionParams {
      fixValidationEnabled?: boolean;
      testGenerationValidateFixes?: boolean;
    }

    function shouldSkipValidation(params: ValidationDecisionParams): boolean {
      // CORRECT LOGIC: DISABLE_FIX_VALIDATION should be the master override
      if (params.fixValidationEnabled === false) {
        return true; // Skip validation
      }
      return false; // Don't skip, proceed with validation
    }

    it('should skip when fixValidation.enabled is false', () => {
      const result = shouldSkipValidation({
        fixValidationEnabled: false,
        testGenerationValidateFixes: true // Shouldn't matter
      });
      expect(result).toBe(true);
    });

    it('should not skip when fixValidation.enabled is true', () => {
      const result = shouldSkipValidation({
        fixValidationEnabled: true,
        testGenerationValidateFixes: false
      });
      expect(result).toBe(false);
    });

    it('should skip regardless of testGeneration settings when disabled', () => {
      const result = shouldSkipValidation({
        fixValidationEnabled: false,
        testGenerationValidateFixes: true // Should be ignored
      });
      expect(result).toBe(true);
    });
  });
});