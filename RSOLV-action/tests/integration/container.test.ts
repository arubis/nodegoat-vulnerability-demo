import { describe, expect, test, vi, beforeEach } from 'vitest';
import { setupContainer } from '../../src/containers/setup.js';
import { runInContainer } from '../../src/containers/run.js';
import { MockDockerClient } from '../../src/containers/docker-client.js';
import { ActionConfig } from '../../src/types/index.js';

// Set NODE_ENV to test for testing
process.env.NODE_ENV = 'test';

// Mock the logger module first
vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(() => {}),
    warn: vi.fn(() => {}),
    error: vi.fn(() => {}),
    debug: vi.fn(() => {}),
    log: vi.fn(() => {})
  }
}));

// Mock child_process exec
vi.mock('child_process', () => {
  return {
    exec: (command: string, options: any, callback: any) => {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      
      // Simulate successful docker version command
      if (command.includes('docker version')) {
        callback(null, { stdout: '20.10.12', stderr: '' });
        return;
      }
      
      // Simulate successful docker pull
      if (command.includes('docker pull')) {
        callback(null, { stdout: 'Using default tag: latest\nlatest: Pulling from rsolv/code-analysis\nDigest: sha256:123456789\nStatus: Downloaded newer image', stderr: '' });
        return;
      }
      
      // Simulate successful docker run
      if (command.includes('docker run')) {
        callback(null, { stdout: 'Container execution output', stderr: '' });
        return;
      }
      
      // Default fallback
      callback(new Error(`Unexpected command: ${command}`), { stdout: '', stderr: 'Command failed' });
    }
  };
});

// Mock configuration for tests
const mockConfig: ActionConfig = {
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

// Container tests are fully mocked and don't require Docker
// Only skip if explicitly requested for debugging
const skipIfNoDocker = process.env.SKIP_DOCKER_TESTS === 'true' && process.env.FORCE_SKIP_MOCKED_TESTS === 'true';

describe.skipIf(skipIfNoDocker)('Container Integration', () => {
  beforeEach(() => {
    // Reset environment variables before each test
    process.env.NODE_ENV = 'test';
  });
  
  test('setupContainer should set up a container environment', async () => {
    // Directly call setupContainer to verify it's working
    await setupContainer(mockConfig);
    // If it doesn't throw, the test passes
    expect(true).toBe(true);
  });
  
  test('setupContainer should skip setup if containers are disabled', async () => {
    const disabledConfig = {
      ...mockConfig,
      containerConfig: {
        ...mockConfig.containerConfig,
        enabled: false
      }
    };
    
    // Directly call setupContainer to verify it's working
    await setupContainer(disabledConfig);
    // If it doesn't throw, the test passes
    expect(true).toBe(true);
  });
  
  test('setupContainer should validate container configuration', async () => {
    const invalidConfig = {
      ...mockConfig,
      containerConfig: {
        ...mockConfig.containerConfig,
        image: '',
        memoryLimit: 'invalid'
      }
    };
    
    await expect(setupContainer(invalidConfig)).rejects.toThrow();
  });
  
  test('runInContainer should execute a command in a container', async () => {
    const result = await runInContainer(mockConfig, {
      command: 'echo "Hello, world!"'
    });
    
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
  });
  
  test('runInContainer should handle container execution failure', async () => {
    // Create a mock Docker client that simulates command failure
    const mockDockerClient = new MockDockerClient();
    
    // Configure the mock to throw an error for invalid commands
    mockDockerClient.setRunOutput({ stdout: '', stderr: 'Command not found' });
    const originalRunContainer = mockDockerClient.runContainer;
    mockDockerClient.runContainer = async (command: string) => {
      if (command.includes('invalid-command')) {
        throw new Error('Command not found');
      }
      return originalRunContainer.call(mockDockerClient, command);
    };
    
    const result = await runInContainer(mockConfig, {
      command: 'invalid-command'
    }, mockDockerClient);
    
    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Command not found');
  });
});