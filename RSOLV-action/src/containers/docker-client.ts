import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';

const execPromise = promisify(exec);

/**
 * Docker operations interface for testability
 */
export interface DockerOperations {
  checkAvailability(): Promise<string>;
  pullImage(imageName: string): Promise<void>;
  runContainer(command: string): Promise<{ stdout: string; stderr: string }>;
  stopContainer(containerId: string): Promise<void>;
  removeContainer(containerId: string): Promise<void>;
}

/**
 * Real Docker client implementation
 */
export class DockerClient implements DockerOperations {
  async checkAvailability(): Promise<string> {
    const { stdout } = await execPromise('docker version --format "{{.Server.Version}}"');
    return stdout.trim();
  }

  async pullImage(imageName: string): Promise<void> {
    const { stdout, stderr } = await execPromise(`docker pull ${imageName}`);
    logger.debug(`Docker pull output: ${stdout}`);
    if (stderr) {
      logger.warn(`Docker pull stderr: ${stderr}`);
    }
  }

  async runContainer(command: string): Promise<{ stdout: string; stderr: string }> {
    return await execPromise(command);
  }

  async stopContainer(containerId: string): Promise<void> {
    await execPromise(`docker stop ${containerId}`);
  }

  async removeContainer(containerId: string): Promise<void> {
    await execPromise(`docker rm ${containerId}`);
  }
}

/**
 * Mock Docker client for testing
 */
export class MockDockerClient implements DockerOperations {
  private _isAvailable: boolean = true;
  private _pullSucceeds: boolean = true;
  private _runOutput: { stdout: string; stderr: string } = { stdout: '', stderr: '' };

  setAvailable(available: boolean): void {
    this._isAvailable = available;
  }

  setPullSucceeds(succeeds: boolean): void {
    this._pullSucceeds = succeeds;
  }

  setRunOutput(output: { stdout: string; stderr: string }): void {
    this._runOutput = output;
  }

  async checkAvailability(): Promise<string> {
    if (!this._isAvailable) {
      throw new Error('Docker not available');
    }
    return '20.10.12';
  }

  async pullImage(imageName: string): Promise<void> {
    logger.debug(`Mock: Pulling image ${imageName}`);
    if (!this._pullSucceeds) {
      throw new Error(`Failed to pull image: ${imageName}`);
    }
  }

  async runContainer(command: string): Promise<{ stdout: string; stderr: string }> {
    logger.debug(`Mock: Running command ${command}`);
    return this._runOutput;
  }

  async stopContainer(containerId: string): Promise<void> {
    logger.debug(`Mock: Stopping container ${containerId}`);
  }

  async removeContainer(containerId: string): Promise<void> {
    logger.debug(`Mock: Removing container ${containerId}`);
  }
}

/**
 * Factory to create Docker client based on environment
 */
export function createDockerClient(): DockerOperations {
  if (process.env.NODE_ENV === 'test') {
    return new MockDockerClient();
  }
  return new DockerClient();
}