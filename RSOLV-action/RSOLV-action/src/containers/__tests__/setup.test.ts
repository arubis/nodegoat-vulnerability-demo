import { describe, expect, test, beforeEach, vi } from 'vitest';
import { setupContainer } from '../setup.js';
import { MockDockerClient } from '../docker-client.js';
import { ActionConfig } from '../../types/index.js';

describe('Container Setup', () => {
  let mockDocker: MockDockerClient;
  let mockConfig: ActionConfig;

  beforeEach(() => {
    mockDocker = new MockDockerClient();
    mockConfig = {
      apiKey: 'test-api-key',
      configPath: '.github/rsolv.yml',
      issueLabel: 'rsolv:automate',
      aiProvider: {
        provider: 'anthropic',
        model: 'claude-3-sonnet-20240229'
      },
      containerConfig: {
        enabled: true,
        image: 'rsolv/code-analysis:latest',
        memoryLimit: '2g',
        cpuLimit: '1',
        timeout: 300,
        securityProfile: 'default'
      },
      securitySettings: {
        disableNetworkAccess: true,
        scanDependencies: true,
        preventSecretLeakage: true
      }
    };
  });

  test('should set up container when Docker is available', async () => {
    mockDocker.setAvailable(true);
    mockDocker.setPullSucceeds(true);

    await setupContainer(mockConfig, mockDocker);
    
    // Container config should remain enabled
    expect(mockConfig.containerConfig.enabled).toBe(true);
  });

  test('should disable containers when Docker is not available', async () => {
    mockDocker.setAvailable(false);

    await setupContainer(mockConfig, mockDocker);
    
    // Container config should be disabled
    expect(mockConfig.containerConfig.enabled).toBe(false);
  });

  test('should skip setup if containers are already disabled', async () => {
    mockConfig.containerConfig.enabled = false;

    await setupContainer(mockConfig, mockDocker);
    
    // Container config should remain disabled
    expect(mockConfig.containerConfig.enabled).toBe(false);
  });

  test('should validate container configuration', async () => {
    // Test missing image
    mockConfig.containerConfig.image = '';
    
    await expect(setupContainer(mockConfig, mockDocker)).rejects.toThrow(
      'Container image is required when container analysis is enabled'
    );
  });

  test('should validate memory limit format', async () => {
    mockConfig.containerConfig.memoryLimit = 'invalid';
    
    await expect(setupContainer(mockConfig, mockDocker)).rejects.toThrow(
      'Invalid memory limit format: invalid'
    );
  });

  test('should validate CPU limit format', async () => {
    mockConfig.containerConfig.cpuLimit = 'invalid';
    
    await expect(setupContainer(mockConfig, mockDocker)).rejects.toThrow(
      'Invalid CPU limit format: invalid'
    );
  });

  test('should validate timeout value', async () => {
    mockConfig.containerConfig.timeout = -1;
    
    await expect(setupContainer(mockConfig, mockDocker)).rejects.toThrow(
      'Invalid timeout value: -1'
    );
  });

  test('should handle image pull failure in development mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    
    mockDocker.setAvailable(true);
    mockDocker.setPullSucceeds(false);

    try {
      await setupContainer(mockConfig, mockDocker);
      // Should not throw in development mode
      expect(mockConfig.containerConfig.enabled).toBe(true);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  test('should throw on image pull failure in production mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    
    mockDocker.setAvailable(true);
    mockDocker.setPullSucceeds(false);

    try {
      await expect(setupContainer(mockConfig, mockDocker)).rejects.toThrow();
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  test('should apply strict security profile', async () => {
    mockConfig.containerConfig.securityProfile = 'strict';
    mockDocker.setAvailable(true);
    mockDocker.setPullSucceeds(true);

    await setupContainer(mockConfig, mockDocker);
    
    // Should complete without error
    expect(mockConfig.containerConfig.enabled).toBe(true);
  });

  test('should apply relaxed security profile', async () => {
    mockConfig.containerConfig.securityProfile = 'relaxed';
    mockDocker.setAvailable(true);
    mockDocker.setPullSucceeds(true);

    await setupContainer(mockConfig, mockDocker);
    
    // Should complete without error
    expect(mockConfig.containerConfig.enabled).toBe(true);
  });

  test('should configure network restrictions', async () => {
    mockConfig.securitySettings.allowedDomains = ['github.com', 'api.github.com'];
    mockDocker.setAvailable(true);
    mockDocker.setPullSucceeds(true);

    await setupContainer(mockConfig, mockDocker);
    
    // Should complete without error
    expect(mockConfig.containerConfig.enabled).toBe(true);
  });

  test('should set environment variables', async () => {
    mockConfig.containerConfig.environmentVariables = {
      NODE_ENV: 'test',
      API_KEY: 'test-key'
    };
    mockDocker.setAvailable(true);
    mockDocker.setPullSucceeds(true);

    await setupContainer(mockConfig, mockDocker);
    
    // Should complete without error
    expect(mockConfig.containerConfig.enabled).toBe(true);
  });
});