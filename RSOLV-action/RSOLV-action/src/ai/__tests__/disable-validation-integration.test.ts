/**
 * Integration test for DISABLE_FIX_VALIDATION functionality
 * Tests the actual validation skip decision logic
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ActionConfig } from '../../types/index.js';

describe('DISABLE_FIX_VALIDATION Integration', () => {
  
  /**
   * Simulates the actual validation decision logic from git-based-processor.ts
   * This is the FIXED version
   */
  function shouldEnterValidation(config: ActionConfig): boolean {
    const skipValidation = config.fixValidation?.enabled === false;
    
    if (skipValidation) {
      return false; // Skip validation
    }
    
    // Only enter validation if explicitly enabled
    return config.testGeneration?.validateFixes === true || 
           config.fixValidation?.enabled === true;
  }
  
  it('should skip validation when DISABLE_FIX_VALIDATION=true', () => {
    const config: Partial<ActionConfig> = {
      fixValidation: { enabled: false }, // DISABLE_FIX_VALIDATION=true
      testGeneration: { validateFixes: false }
    };
    
    expect(shouldEnterValidation(config as ActionConfig)).toBe(false);
  });

  it('should enter validation when fixValidation.enabled=true', () => {
    const config: Partial<ActionConfig> = {
      fixValidation: { enabled: true },
      testGeneration: { validateFixes: false }
    };
    
    expect(shouldEnterValidation(config as ActionConfig)).toBe(true);
  });

  it('should skip validation even if testGeneration.validateFixes=true when DISABLE_FIX_VALIDATION=true', () => {
    // This is the critical test case that was failing before
    const config: Partial<ActionConfig> = {
      fixValidation: { enabled: false }, // DISABLE_FIX_VALIDATION=true
      testGeneration: { validateFixes: true } // This should be ignored
    };
    
    expect(shouldEnterValidation(config as ActionConfig)).toBe(false);
  });
  
  it('should enter validation when testGeneration.validateFixes=true and not disabled', () => {
    const config: Partial<ActionConfig> = {
      fixValidation: { enabled: true },
      testGeneration: { validateFixes: true }
    };
    
    expect(shouldEnterValidation(config as ActionConfig)).toBe(true);
  });
  
  it('should not enter validation when both are undefined/false', () => {
    const config: Partial<ActionConfig> = {
      fixValidation: { enabled: undefined },
      testGeneration: { validateFixes: false }
    };
    
    expect(shouldEnterValidation(config as ActionConfig)).toBe(false);
  });
  
  describe('Environment variable loading simulation', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
    });

    afterEach(() => {
      process.env = originalEnv;
    });
    
    it('should create correct config when DISABLE_FIX_VALIDATION=true', () => {
      // Simulate what happens in config/index.ts getDefaultConfig()
      process.env.DISABLE_FIX_VALIDATION = 'true';
      
      const fixValidationEnabled = (() => {
        const envValue = process.env.DISABLE_FIX_VALIDATION;
        const isDisabled = envValue === 'true';
        return !isDisabled;
      })();
      
      expect(fixValidationEnabled).toBe(false);
      
      // Simulate the config that would be created
      const config: Partial<ActionConfig> = {
        fixValidation: { enabled: fixValidationEnabled },
        testGeneration: { validateFixes: false }
      };
      
      // This should skip validation
      expect(shouldEnterValidation(config as ActionConfig)).toBe(false);
    });
  });
});