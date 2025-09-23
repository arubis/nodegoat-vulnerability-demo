/**
 * TDD tests for mode selection integration with index.ts
 * Following RFC-041 mode selection decisions
 */

import { describe, test, expect, beforeEach, afterEach, mock, vi } from 'vitest';
import { getModeFromArgs, getExecutionMode } from '../utils/mode-selector.js';

// Mock module values that tests can update
let mockArgvMode: string | undefined;
let mockEnvMode: string | undefined;

// Mock process.argv and process.env
const originalArgv = process.argv;
const originalEnv = process.env;

describe('Mode Selection Integration', () => {
  beforeEach(() => {
    // Reset mocks
    mockArgvMode = undefined;
    mockEnvMode = undefined;
    process.argv = [...originalArgv];
    process.env = { ...originalEnv };
    delete process.env.RSOLV_MODE;
    delete process.env.RSOLV_SCAN_MODE;
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
  });

  describe('getModeFromArgs', () => {
    test('should extract mode from CLI arguments', () => {
      // Test --mode flag
      process.argv = ['node', 'index.js', '--mode', 'scan'];
      expect(getModeFromArgs()).toBe('scan');
      
      // Test --mode=value syntax
      process.argv = ['node', 'index.js', '--mode=validate'];
      expect(getModeFromArgs()).toBe('validate');
    });

    test('should return undefined when no mode in args', () => {
      
      
      process.argv = ['node', 'index.js', '--other-flag'];
      expect(getModeFromArgs()).toBeUndefined();
    });
  });

  describe('getExecutionMode', () => {
    test('should prioritize CLI args over environment variable', () => {
      // RED: This function doesn't exist yet
      
      
      process.argv = ['node', 'index.js', '--mode', 'scan'];
      process.env.RSOLV_MODE = 'validate';
      
      expect(getExecutionMode()).toBe('scan');
    });

    test('should use environment variable when no CLI args', () => {
      
      
      process.argv = ['node', 'index.js'];
      process.env.RSOLV_MODE = 'validate';
      
      expect(getExecutionMode()).toBe('validate');
    });

    test('should default to "full" when no mode specified', () => {
      
      
      process.argv = ['node', 'index.js'];
      delete process.env.RSOLV_MODE;
      
      expect(getExecutionMode()).toBe('full');
    });

    test('should support all valid modes', () => {
      
      const validModes = ['scan', 'validate', 'mitigate', 'full'];
      
      validModes.forEach(mode => {
        process.argv = ['node', 'index.js', '--mode', mode];
        expect(getExecutionMode()).toBe(mode);
      });
    });

    test('should handle legacy RSOLV_SCAN_MODE for backward compatibility', () => {
      
      
      process.env.RSOLV_SCAN_MODE = 'scan';
      expect(getExecutionMode()).toBe('scan');
      
      // New RSOLV_MODE should override legacy
      process.env.RSOLV_MODE = 'validate';
      expect(getExecutionMode()).toBe('validate');
      
      // CLI should override both
      process.argv = ['node', 'index.js', '--mode', 'mitigate'];
      expect(getExecutionMode()).toBe('mitigate');
    });
  });

  describe('validateMode', () => {
    test('should validate mode is supported', async () => {
      const { validateMode } = await import('../utils/mode-selector.js');
      
      expect(validateMode('scan')).toBe(true);
      expect(validateMode('validate')).toBe(true);
      expect(validateMode('mitigate')).toBe(true);
      expect(validateMode('full')).toBe(true);
      expect(validateMode('invalid')).toBe(false);
    });
  });

  describe('getModeRequirements', () => {
    test('should return requirements for each mode', async () => {
      const { getModeRequirements } = await import('../utils/mode-selector.js');
      
      expect(getModeRequirements('scan')).toEqual({
        requiresIssue: false,
        requiresScanData: false,
        requiresValidation: false
      });
      
      expect(getModeRequirements('validate')).toEqual({
        requiresIssue: true, // or scan data
        requiresScanData: false, // either/or with issue
        requiresValidation: false
      });
      
      expect(getModeRequirements('mitigate')).toEqual({
        requiresIssue: true,
        requiresScanData: false,
        requiresValidation: true
      });
      
      expect(getModeRequirements('full')).toEqual({
        requiresIssue: false, // full mode does everything
        requiresScanData: false,
        requiresValidation: false
      });
    });
  });
});