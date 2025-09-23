/**
 * RED Tests for Mode Selection Infrastructure
 * RFC-041: Three-Phase Architecture
 * 
 * Following TDD: These tests should FAIL initially
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ModeSelector } from '../mode-selector.js';
import { ModeConfig } from '../types.js';

describe('ModeSelector', () => {
  const originalEnv = process.env;
  
  beforeEach(() => {
    // Clean environment for each test
    process.env = { ...originalEnv };
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });
  
  describe('getModeConfig', () => {
    it('should require RSOLV_MODE environment variable', () => {
      // No environment variables set
      delete process.env.RSOLV_MODE;
      
      expect(() => ModeSelector.getModeConfig()).toThrow(
        'RSOLV_MODE environment variable is required. Options: scan, validate, mitigate, fix, full'
      );
    });
    
    it('should recognize scan mode from RSOLV_MODE', () => {
      process.env.RSOLV_MODE = 'scan';
      
      const config = ModeSelector.getModeConfig();
      
      expect(config.mode).toBe('scan');
    });
    
    it('should recognize validate mode', () => {
      process.env.RSOLV_MODE = 'validate';
      process.env.RSOLV_ISSUE_ID = '123';
      
      const config = ModeSelector.getModeConfig();
      
      expect(config.mode).toBe('validate');
      expect(config.issueId).toBe(123);
    });
    
    it('should recognize mitigate mode', () => {
      process.env.RSOLV_MODE = 'mitigate';
      process.env.RSOLV_ISSUE_ID = '456';
      
      const config = ModeSelector.getModeConfig();
      
      expect(config.mode).toBe('mitigate');
      expect(config.issueId).toBe(456);
    });
    
    it('should recognize full mode', () => {
      process.env.RSOLV_MODE = 'full';
      
      const config = ModeSelector.getModeConfig();
      
      expect(config.mode).toBe('full');
    });
    
    it('should handle batch validation with multiple issue IDs', () => {
      process.env.RSOLV_MODE = 'validate';
      process.env.RSOLV_ISSUE_IDS = '123,456,789';
      
      const config = ModeSelector.getModeConfig();
      
      expect(config.mode).toBe('validate');
      expect(config.issueIds).toEqual([123, 456, 789]);
    });
    
    it('should respect max issues limit', () => {
      process.env.RSOLV_MODE = 'fix';
      process.env.RSOLV_ISSUE_ID = '123';  // Now required for fix mode
      process.env.RSOLV_MAX_ISSUES = '5';
      
      const config = ModeSelector.getModeConfig();
      
      expect(config.maxIssues).toBe(5);
    });
    
    it('should handle skip cache flag', () => {
      process.env.RSOLV_MODE = 'validate';
      process.env.RSOLV_ISSUE_ID = '123';
      process.env.RSOLV_SKIP_CACHE = 'true';
      
      const config = ModeSelector.getModeConfig();
      
      expect(config.skipCache).toBe(true);
    });
    
    it('should throw error when validate mode lacks issue ID', () => {
      process.env.RSOLV_MODE = 'validate';
      // No issue ID provided
      
      expect(() => ModeSelector.getModeConfig()).toThrow(
        "Mode 'validate' requires RSOLV_ISSUE_ID or RSOLV_ISSUE_IDS to be set"
      );
    });
    
    it('should throw error when mitigate mode lacks issue ID', () => {
      process.env.RSOLV_MODE = 'mitigate';
      // No issue ID provided
      
      expect(() => ModeSelector.getModeConfig()).toThrow(
        "Mode 'mitigate' requires RSOLV_ISSUE_ID or RSOLV_ISSUE_IDS to be set"
      );
    });
    
    it('should throw error when both single and multiple issue IDs are provided', () => {
      process.env.RSOLV_MODE = 'validate';
      process.env.RSOLV_ISSUE_ID = '123';
      process.env.RSOLV_ISSUE_IDS = '456,789';
      
      expect(() => ModeSelector.getModeConfig()).toThrow(
        'Cannot specify both RSOLV_ISSUE_ID and RSOLV_ISSUE_IDS'
      );
    });
    
    it('should throw error when fix mode lacks issue ID', () => {
      process.env.RSOLV_MODE = 'fix';
      // No issue ID provided
      
      expect(() => ModeSelector.getModeConfig()).toThrow(
        "Mode 'fix' requires RSOLV_ISSUE_ID or RSOLV_ISSUE_IDS to be set"
      );
    });
  });
  
  describe('normalizeMode', () => {
    it('should normalize mode aliases', () => {
      const testCases = [
        { input: 'SCAN', expected: 'scan', needsIssue: false },
        { input: 'detect', expected: 'scan', needsIssue: false },
        { input: 'validation', expected: 'validate', needsIssue: true },
        { input: 'test', expected: 'validate', needsIssue: true },
        { input: 'mitigation', expected: 'mitigate', needsIssue: true },
        { input: 'repair', expected: 'mitigate', needsIssue: true },
        { input: 'auto', expected: 'fix', needsIssue: true },
        { input: 'combined', expected: 'fix', needsIssue: true },
        { input: 'all', expected: 'full', needsIssue: false },
        { input: 'complete', expected: 'full', needsIssue: false }
      ];
      
      testCases.forEach(({ input, expected, needsIssue }) => {
        process.env.RSOLV_MODE = input;
        // Add issue ID if mode requires it
        if (needsIssue) {
          process.env.RSOLV_ISSUE_ID = '123';
        } else {
          delete process.env.RSOLV_ISSUE_ID;
        }
        const config = ModeSelector.getModeConfig();
        expect(config.mode).toBe(expected);
      });
    });
    
    it('should throw error for unknown modes', () => {
      process.env.RSOLV_MODE = 'unknown-mode';
      
      expect(() => ModeSelector.getModeConfig()).toThrow(
        "Unknown mode 'unknown-mode'. Valid options: scan, validate, mitigate, fix, full"
      );
    });
  });
  
  describe('getModeDescription', () => {
    it('should return appropriate descriptions for each mode', () => {
      expect(ModeSelector.getModeDescription('scan'))
        .toBe('Scanning repository for vulnerabilities');
      
      expect(ModeSelector.getModeDescription('validate'))
        .toBe('Validating vulnerabilities with RED tests');
      
      expect(ModeSelector.getModeDescription('mitigate'))
        .toBe('Mitigating proven vulnerabilities');
      
      expect(ModeSelector.getModeDescription('fix'))
        .toBe('Validating and fixing vulnerabilities (combined mode)');
      
      expect(ModeSelector.getModeDescription('full'))
        .toBe('Running full pipeline: scan, validate, and mitigate');
    });
  });
  
  describe('mode requirements', () => {
    it('should identify which modes require AI', () => {
      expect(ModeSelector.requiresAI('scan')).toBe(false);
      expect(ModeSelector.requiresAI('validate')).toBe(true);
      expect(ModeSelector.requiresAI('mitigate')).toBe(true);
      expect(ModeSelector.requiresAI('fix')).toBe(true);
      expect(ModeSelector.requiresAI('full')).toBe(true);
    });
    
    it('should identify which modes require test generation', () => {
      expect(ModeSelector.requiresTestGeneration('scan')).toBe(false);
      expect(ModeSelector.requiresTestGeneration('validate')).toBe(true);
      expect(ModeSelector.requiresTestGeneration('mitigate')).toBe(false);
      expect(ModeSelector.requiresTestGeneration('fix')).toBe(true);
      expect(ModeSelector.requiresTestGeneration('full')).toBe(true);
    });
    
    it('should identify which modes require fix generation', () => {
      expect(ModeSelector.requiresFixGeneration('scan')).toBe(false);
      expect(ModeSelector.requiresFixGeneration('validate')).toBe(false);
      expect(ModeSelector.requiresFixGeneration('mitigate')).toBe(true);
      expect(ModeSelector.requiresFixGeneration('fix')).toBe(true);
      expect(ModeSelector.requiresFixGeneration('full')).toBe(true);
    });
  });
});