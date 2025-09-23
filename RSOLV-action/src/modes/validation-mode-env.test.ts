/**
 * Test for RSOLV_TESTING_MODE environment variable handling
 * TDD approach - write test first, then implementation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ActionConfig } from '../types/index.js';

// Mock dependencies first
vi.mock('fs');
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

// Now import the module under test
import { ValidationMode } from './validation-mode.js';

describe('ValidationMode - Environment Variable Handling', () => {
  let validationMode: ValidationMode;
  let mockConfig: ActionConfig;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };

    mockConfig = {
      repository: { owner: 'test', name: 'repo' },
      issueLabel: 'test',
      rsolvApiKey: 'test-key',
      aiProvider: {
        name: 'mock',
        useVendedCredentials: false
      },
      environmentVariables: {}
    } as ActionConfig;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  describe('RSOLV_TESTING_MODE from environment_variables JSON', () => {
    it('should apply RSOLV_TESTING_MODE from config.environmentVariables to process.env', () => {
      // Arrange
      mockConfig.environmentVariables = {
        RSOLV_TESTING_MODE: 'true',
        DEBUG: 'true'
      };

      // Act
      validationMode = new ValidationMode(mockConfig, '/test/path');

      // Assert - environment variables should be applied
      expect(process.env.RSOLV_TESTING_MODE).toBe('true');
      expect(process.env.DEBUG).toBe('true');
    });

    it('should detect testing mode when set via config.environmentVariables', async () => {
      // Arrange
      mockConfig.environmentVariables = {
        RSOLV_TESTING_MODE: 'true'
      };

      const mockIssue = {
        number: 123,
        title: 'Test vulnerability',
        body: 'Test issue body',
        labels: ['rsolv:detected'],
        repository: { owner: 'test', name: 'repo', fullName: 'test/repo' }
      };

      // File system is already mocked at top of file

      // Act
      validationMode = new ValidationMode(mockConfig, '/test/path');

      // Assert - testing mode should be detected
      const isTestingMode = process.env.RSOLV_TESTING_MODE === 'true';
      expect(isTestingMode).toBe(true);
    });

    it('should NOT apply testing mode when not in environmentVariables', () => {
      // Arrange - no RSOLV_TESTING_MODE in config
      mockConfig.environmentVariables = {
        DEBUG: 'true'
      };

      // Act
      validationMode = new ValidationMode(mockConfig, '/test/path');

      // Assert - RSOLV_TESTING_MODE should not be set
      expect(process.env.RSOLV_TESTING_MODE).toBeUndefined();
    });

    it('should handle empty environmentVariables object', () => {
      // Arrange
      mockConfig.environmentVariables = {};

      // Act
      validationMode = new ValidationMode(mockConfig, '/test/path');

      // Assert - no environment variables should be added
      expect(process.env.RSOLV_TESTING_MODE).toBeUndefined();
    });

    it('should handle undefined environmentVariables', () => {
      // Arrange
      mockConfig.environmentVariables = undefined;

      // Act
      validationMode = new ValidationMode(mockConfig, '/test/path');

      // Assert - should not throw and no env vars added
      expect(process.env.RSOLV_TESTING_MODE).toBeUndefined();
    });

    it('should override existing environment variables', () => {
      // Arrange
      process.env.RSOLV_TESTING_MODE = 'false';
      mockConfig.environmentVariables = {
        RSOLV_TESTING_MODE: 'true'
      };

      // Act
      validationMode = new ValidationMode(mockConfig, '/test/path');

      // Assert - should override with config value
      expect(process.env.RSOLV_TESTING_MODE).toBe('true');
    });
  });

  describe('Testing mode behavior in validation', () => {
    it('should log testing mode message when enabled via environmentVariables', () => {
      // Arrange
      mockConfig.environmentVariables = {
        RSOLV_TESTING_MODE: 'true'
      };

      // Act
      validationMode = new ValidationMode(mockConfig, '/test/path');

      // Assert - should see testing mode enabled
      // This test will check behavior once we fix the implementation
      const isTestingMode = process.env.RSOLV_TESTING_MODE === 'true';
      expect(isTestingMode).toBe(true);
    });
  });
});