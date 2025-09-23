import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import * as fs from 'fs';
import * as path from 'path';

// Mock the logger to avoid debug function issues
vi.mock('../../src/utils/logger.js', () => ({
  Logger: class {
    debug = vi.fn();
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  },
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Create mockFiles object directly
const mockFiles: Record<string, string> = {};

// Function to clear mock files
function clearMockFiles() {
  for (const key in mockFiles) {
    delete mockFiles[key];
  }
}

// Mock file system
vi.mock('fs', () => {
  const actualFs = require('fs');
  
  return {
    ...actualFs,
    existsSync: (filePath: string) => {
      if (filePath in mockFiles) {
        return true;
      }
      return actualFs.existsSync(filePath);
    },
    readFileSync: (filePath: string, options: any) => {
      if (filePath in mockFiles) {
        return mockFiles[filePath];
      }
      return actualFs.readFileSync(filePath, options);
    },
    writeFileSync: (filePath: string, data: string) => {
      mockFiles[filePath] = data;
    }
  };
});

describe('Configuration Loading', () => {
  beforeEach(() => {
    // Clear mock files
    clearMockFiles();
  });
  
  afterEach(() => {
    // Clear mock files
    clearMockFiles();
  });
  
  test('loadConfig should load configuration from environment variables', async () => {
    // Create a custom environment with the API key set as environment variable
    const originalEnv = { ...process.env };
    
    // Set environment variables - these should take precedence over file config
    process.env = {
      NODE_ENV: 'test',
      GITHUB_TOKEN: 'github-token',
      RSOLV_CONFIG_PATH: '.github/rsolv.yml',
      RSOLV_API_KEY: 'env-api-key',  // Set as environment variable
      RSOLV_ISSUE_LABEL: 'env-label'
    };
    
    // Mock configuration file with different values
    fs.writeFileSync('.github/rsolv.yml', `
      apiKey: file-api-key
      issueLabel: file-label
      repoToken: file-token
      configPath: .github/rsolv.yml
      aiProvider:
        provider: anthropic
        model: claude-3-opus-20240229
      containerConfig:
        enabled: false
      securitySettings: {}
    `);
    
    try {
      // Environment variables should override file values
      const config = await loadConfig();
      
      expect(config).toBeDefined();
      expect(config.apiKey).toBe('env-api-key');  // From environment
      expect(config.issueLabel).toBe('env-label'); // From environment
      expect(config.repoToken).toBe('github-token'); // From environment
      expect(config.containerConfig.enabled).toBe(false); // From file
    } finally {
      // Restore original environment
      process.env = originalEnv;
    }
  });
  
  test('loadConfig should load configuration from file', async () => {
    // Create mock config file
    fs.writeFileSync('.github/rsolv.yml', `
      apiKey: file-api-key
      issueLabel: file-label
      aiProvider:
        provider: openai
        model: gpt-4
        temperature: 0.3
    `);
    
    // Setup environment for file test - exclude API key and label so file values are used
    const originalEnv = { ...process.env };
    process.env = {
      GITHUB_TOKEN: 'github-token',
      NODE_ENV: 'test',
      RSOLV_CONFIG_PATH: '.github/rsolv.yml'
      // Explicitly NOT setting RSOLV_API_KEY or RSOLV_ISSUE_LABEL so file values are used
    };
    
    try {
      const config = await loadConfig();
      
      expect(config).toBeDefined();
      expect(config.apiKey).toBe('file-api-key');
      expect(config.issueLabel).toBe('file-label');
      expect(config.aiProvider.provider).toBe('openai');
      expect(config.aiProvider.model).toBe('gpt-4');
      expect(config.aiProvider.temperature).toBe(0.3);
    } finally {
      // Restore environment
      process.env = originalEnv;
    }
  });
  
  test('loadConfig should merge configuration from multiple sources', async () => {
    // Create mock config file
    fs.writeFileSync('.github/rsolv.yml', `
      apiKey: file-api-key
      securitySettings:
        disableNetworkAccess: false
        scanDependencies: true
    `);
    
    // Save original process.env
    const originalEnv = { ...process.env };
    
    // Create environment with some values
    process.env = {
      RSOLV_API_KEY: 'env-api-key',
      RSOLV_CONFIG_PATH: '.github/rsolv.yml',
      RSOLV_ISSUE_LABEL: 'env-label',
      GITHUB_TOKEN: 'github-token',
      NODE_ENV: 'test'
    };
    
    try {
      const config = await loadConfig();
      
      expect(config).toBeDefined();
      // Environment variables take precedence over file
      expect(config.apiKey).toBe('env-api-key');
      expect(config.issueLabel).toBe('env-label');
      // File values should be merged
      expect(config.securitySettings.disableNetworkAccess).toBe(false);
      expect(config.securitySettings.scanDependencies).toBe(true);
    } finally {
      // Restore environment
      process.env = originalEnv;
    }
  });
  
  test('loadConfig should use default values for missing properties', async () => {
    // Only provide API key, rest should use defaults
    const originalEnv = { ...process.env };
    process.env = {
      RSOLV_API_KEY: 'env-api-key',
      GITHUB_TOKEN: 'github-token',
      NODE_ENV: 'test',
      RSOLV_CONFIG_PATH: '.github/rsolv.yml'
    };
    
    // Create an empty config file
    fs.writeFileSync('.github/rsolv.yml', '');
    
    try {
      const config = await loadConfig();
      
      expect(config).toBeDefined();
      expect(config.apiKey).toBe('env-api-key');
      expect(config.configPath).toBe('.github/rsolv.yml');
      // Check if properties are defined without asserting specific values
      expect(config.aiProvider).toBeDefined();
      expect(config.containerConfig).toBeDefined();
      expect(config.securitySettings).toBeDefined();
    } finally {
      // Restore environment
      process.env = originalEnv;
    }
  });
  
  test('loadConfig should validate configuration', async () => {
    // Save original process.env
    const originalEnv = { ...process.env };
    
    // Create a clean environment without API key
    process.env = {
      NODE_ENV: 'test',
      GITHUB_TOKEN: 'test-token'
    };
    
    // Create empty config file to avoid any existing file data
    fs.writeFileSync('.github/rsolv.yml', '');
    
    let error = null;
    try {
      await loadConfig();
    } catch (err) {
      error = err;
    } finally {
      // Restore environment
      process.env = originalEnv;
    }
    
    // Verify we got an error
    expect(error).not.toBeNull();
    expect(error.message).toContain('Configuration error');
  });
  
  test('loadConfig should validate configuration schema', async () => {
    // Create mock implementation for loadConfig
    const originalLoadConfig = loadConfig;
    
    try {
      // Create invalid config file
      fs.writeFileSync('.github/rsolv.yml', `
        apiKey: test-api-key
        containerConfig:
          enabled: "not-a-boolean"
      `);
      
      // Set up environment
      const originalEnv = { ...process.env };
      process.env = {
        RSOLV_CONFIG_PATH: '.github/rsolv.yml',
        NODE_ENV: 'test'
      };
      
      let error: any = null;
      
      try {
        await loadConfig();
        // If we get here, the test should fail as we expect an error
        expect(true).toBe(false); // This will fail if loadConfig doesn't throw
      } catch (err) {
        error = err;
      } finally {
        // Restore environment
        process.env = originalEnv;
      }
      
      // Verify we got the expected error
      expect(error).not.toBeNull();
      expect(error.message).toContain('Invalid configuration');
      expect(error.message).toContain('containerConfig.enabled');
      expect(error.message).toContain('Expected boolean');
    } finally {
      // Clean up - restore original function if needed
      if (originalLoadConfig !== loadConfig) {
        // @ts-ignore - Typescript doesn't like us replacing a function
        global.loadConfig = originalLoadConfig;
      }
    }
  });
});