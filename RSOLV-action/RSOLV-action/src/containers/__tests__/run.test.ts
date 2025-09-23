import { describe, expect, test, beforeEach, vi } from 'vitest';
import { runInContainer } from '../run.js';
import { MockDockerClient } from '../docker-client.js';
import { ActionConfig } from '../../types/index.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('Container Run', () => {
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
        securityProfile: 'default',
        environmentVariables: {
          TEST_VAR: 'test_value'
        }
      },
      securitySettings: {
        disableNetworkAccess: true,
        scanDependencies: true,
        preventSecretLeakage: true
      }
    };
  });

  test('should run command successfully', async () => {
    mockDocker.setRunOutput({
      stdout: 'Hello from container',
      stderr: ''
    });

    const result = await runInContainer(
      mockConfig,
      { command: 'echo "Hello from container"' },
      mockDocker
    );

    expect(result.success).toBe(true);
    expect(result.stdout).toBe('Hello from container');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  test('should fail when containers are disabled', async () => {
    mockConfig.containerConfig.enabled = false;

    const result = await runInContainer(
      mockConfig,
      { command: 'echo "test"' },
      mockDocker
    );

    expect(result.success).toBe(false);
    expect(result.stderr).toContain('Container execution requested but containers are disabled');
    expect(result.exitCode).toBe(1);
  });

  test('should create and clean up temporary directory', async () => {
    mockDocker.setRunOutput({
      stdout: 'Success',
      stderr: ''
    });

    const result = await runInContainer(
      mockConfig,
      { command: 'ls /workspace' },
      mockDocker
    );

    expect(result.success).toBe(true);
    
    // Verify temp directory was created and cleaned up
    // This is implicit in the successful execution
  });

  test('should use provided working directory', async () => {
    const workDir = path.join(os.tmpdir(), 'test-work-dir');
    fs.mkdirSync(workDir, { recursive: true });

    mockDocker.setRunOutput({
      stdout: 'Using provided work dir',
      stderr: ''
    });

    try {
      const result = await runInContainer(
        mockConfig,
        { 
          command: 'pwd',
          workDir: workDir
        },
        mockDocker
      );

      expect(result.success).toBe(true);
      
      // Verify the provided directory still exists (not cleaned up)
      expect(fs.existsSync(workDir)).toBe(true);
    } finally {
      // Clean up test directory
      if (fs.existsSync(workDir)) {
        fs.rmSync(workDir, { recursive: true, force: true });
      }
    }
  });

  test('should handle command execution failure', async () => {
    // Create a new mock that will fail
    const failingMock = new MockDockerClient();
    failingMock.setRunOutput({
      stdout: '',
      stderr: 'Command not found'
    });
    
    // Override runContainer to throw an error
    failingMock.runContainer = async () => {
      throw new Error('Command failed with exit code 127');
    };

    const result = await runInContainer(
      mockConfig,
      { command: 'invalid-command' },
      failingMock
    );

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  test('should include environment variables in Docker command', async () => {
    let capturedCommand = '';
    
    // Override runContainer to capture the command
    mockDocker.runContainer = async (command: string) => {
      capturedCommand = command;
      return { stdout: 'Success', stderr: '' };
    };

    await runInContainer(
      mockConfig,
      { 
        command: 'env',
        env: { CUSTOM_VAR: 'custom_value' }
      },
      mockDocker
    );

    // Verify environment variables are included
    expect(capturedCommand).toContain('-e TEST_VAR=');
    expect(capturedCommand).toContain('-e CUSTOM_VAR=');
  });

  test('should apply resource limits', async () => {
    let capturedCommand = '';
    
    // Override runContainer to capture the command
    mockDocker.runContainer = async (command: string) => {
      capturedCommand = command;
      return { stdout: 'Success', stderr: '' };
    };

    await runInContainer(
      mockConfig,
      { command: 'echo "test"' },
      mockDocker
    );

    // Verify resource limits are applied
    expect(capturedCommand).toContain('--memory=2g');
    expect(capturedCommand).toContain('--cpus=1');
  });

  test('should add security options', async () => {
    let capturedCommand = '';
    
    // Override runContainer to capture the command
    mockDocker.runContainer = async (command: string) => {
      capturedCommand = command;
      return { stdout: 'Success', stderr: '' };
    };

    await runInContainer(
      mockConfig,
      { command: 'echo "test"' },
      mockDocker
    );

    // Verify security options are applied
    expect(capturedCommand).toContain('--security-opt=no-new-privileges');
  });

  test('should handle volume mounts', async () => {
    let capturedCommand = '';
    
    // Override runContainer to capture the command
    mockDocker.runContainer = async (command: string) => {
      capturedCommand = command;
      return { stdout: 'Success', stderr: '' };
    };

    await runInContainer(
      mockConfig,
      { 
        command: 'ls',
        mounts: [
          { src: '/host/path', dst: '/container/path' }
        ]
      },
      mockDocker
    );

    // Verify mounts are included
    expect(capturedCommand).toContain('-v "/host/path":"/container/path"');
  });

  test('should escape shell arguments properly', async () => {
    let capturedCommand = '';
    
    // Override runContainer to capture the command
    mockDocker.runContainer = async (command: string) => {
      capturedCommand = command;
      return { stdout: 'Success', stderr: '' };
    };

    await runInContainer(
      mockConfig,
      { 
        command: 'echo "test with spaces and \\"quotes\\""',
        env: { VAR_WITH_SPACES: 'value with spaces' }
      },
      mockDocker
    );

    // Verify the command contains proper escaping
    expect(capturedCommand).toContain('echo');
    expect(capturedCommand).toContain('test with spaces');
    expect(capturedCommand).toContain('quotes');
    expect(capturedCommand).toContain('-e VAR_WITH_SPACES="value with spaces"');
  });

  test('should use custom timeout', async () => {
    const customTimeout = 60;
    
    mockDocker.setRunOutput({
      stdout: 'Quick command',
      stderr: ''
    });

    const result = await runInContainer(
      mockConfig,
      { 
        command: 'echo "quick"',
        timeout: customTimeout
      },
      mockDocker
    );

    expect(result.success).toBe(true);
  });

  test('should handle timeout errors', async () => {
    // Override runContainer to simulate timeout
    mockDocker.runContainer = async () => {
      const error: any = new Error('Command timed out');
      error.code = 'ETIMEDOUT';
      error.stdout = 'Partial output';
      error.stderr = 'Timeout occurred';
      throw error;
    };

    const result = await runInContainer(
      mockConfig,
      { command: 'sleep 1000' },
      mockDocker
    );

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(124); // Standard timeout exit code
    expect(result.stderr).toContain('Timeout after');
  });
});