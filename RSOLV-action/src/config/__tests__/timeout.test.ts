import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig } from '../index';
import * as yaml from 'js-yaml';

// Mock the logger to avoid debug function issues
vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(() => {}),
    info: () => {},
    warn: () => {},
    error: () => {}
  }
}));

// Mock fs module for both named and default exports
vi.mock('fs', () => {
  const mockFns = {
    existsSync: vi.fn(),
    readFileSync: vi.fn()
  };
  return {
    default: mockFns,
    ...mockFns
  };
});

import fs from 'fs';

// Mock environment variables
const originalEnv = process.env;

describe('Config Timeout Settings', () => {
  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    // Set required API key
    process.env.RSOLV_API_KEY = 'test-api-key';
    // Clear any existing mocks
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
  });

  test('should have default timeout configurations', async () => {
    // Mock fs to return no config file
    (fs.existsSync as any).mockReturnValue(false);
    
    const config = await loadConfig();
    
    // Check AI provider timeout (60 minutes)
    expect(config.aiProvider.timeout).toBe(3600000);
    
    // Check container timeout (300 seconds)
    expect(config.containerConfig.timeout).toBe(300);
    
    // Check security timeout (300 seconds)
    expect(config.securitySettings.timeoutSeconds).toBe(300);
  });

  test('should load timeout from environment variables', async () => {
    // Mock fs to return no config file
    (fs.existsSync as any).mockReturnValue(false);
    
    // Set environment variables - need RSOLV_CONTAINER_ENABLED for containerConfig to be processed
    process.env.RSOLV_CONTAINER_ENABLED = 'true';
    process.env.RSOLV_CONTAINER_TIMEOUT = '600';
    
    const config = await loadConfig();
    
    // Container timeout should be updated from env
    expect(config.containerConfig.timeout).toBe(600);
    
    // Other timeouts should remain at defaults
    expect(config.aiProvider.timeout).toBe(3600000);
    expect(config.securitySettings.timeoutSeconds).toBe(300);
  });

  test('should load timeout from config file', async () => {
    const configContent = {
      aiProvider: {
        provider: 'claude-code',
        model: 'claude-sonnet-4-20250514',
        timeout: 45000 // 45 seconds
      },
      containerConfig: {
        enabled: true,
        timeout: 180 // 3 minutes
      },
      securitySettings: {
        timeoutSeconds: 120 // 2 minutes
      }
    };
    
    // Mock fs to return config file
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(yaml.dump(configContent));
    
    const config = await loadConfig();
    
    // All timeouts should be updated from config file
    expect(config.aiProvider.timeout).toBe(45000);
    expect(config.containerConfig.timeout).toBe(180);
    expect(config.securitySettings.timeoutSeconds).toBe(120);
  });

  test('should merge timeouts with priority: env > file > default', async () => {
    const configContent = {
      aiProvider: {
        provider: 'claude-code',
        model: 'claude-sonnet-4-20250514',
        timeout: 45000 // Will be used
      },
      containerConfig: {
        enabled: true,
        timeout: 180 // Will be overridden by env
      }
    };
    
    // Mock fs to return config file
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(yaml.dump(configContent));
    
    // Set environment variable to override container timeout
    process.env.RSOLV_CONTAINER_ENABLED = 'true';
    process.env.RSOLV_CONTAINER_TIMEOUT = '240';
    
    const config = await loadConfig();
    
    // AI timeout from file
    expect(config.aiProvider.timeout).toBe(45000);
    
    // Container timeout from env (overrides file)
    expect(config.containerConfig.timeout).toBe(240);
    
    // Security timeout from default (not in file or env)
    expect(config.securitySettings.timeoutSeconds).toBe(300);
  });

  test('should validate timeout values are numbers', async () => {
    // Mock fs to return no config file
    (fs.existsSync as any).mockReturnValue(false);
    
    // Set invalid timeout value
    process.env.RSOLV_CONTAINER_TIMEOUT = 'not-a-number';
    
    const config = await loadConfig();
    
    // Should use default since env value is invalid (parseInt returns NaN)
    expect(config.containerConfig.timeout).toBe(300);
  });

  test('should handle missing timeout properties gracefully', async () => {
    const configContent = {
      aiProvider: {
        provider: 'claude-code',
        model: 'claude-sonnet-4-20250514'
        // No timeout specified
      },
      containerConfig: {
        enabled: true
        // No timeout specified
      }
    };
    
    // Mock fs to return config file
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(yaml.dump(configContent));
    
    const config = await loadConfig();
    
    // Should use defaults when not specified
    expect(config.aiProvider.timeout).toBe(3600000);
    expect(config.containerConfig.timeout).toBe(300);
    expect(config.securitySettings.timeoutSeconds).toBe(300);
  });

  test('should ensure AI provider timeout is reasonable', async () => {
    // Mock fs to return no config file
    (fs.existsSync as any).mockReturnValue(false);
    
    const config = await loadConfig();
    
    // Default timeout should be 3600000ms (60 minutes)
    expect(config.aiProvider.timeout).toBe(3600000);
    expect(config.aiProvider.timeout).toBeGreaterThanOrEqual(10000); // Min 10 seconds
  });
});