import { ActionConfig, ContainerConfig } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { DockerOperations, createDockerClient } from './docker-client.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface ContainerRunOptions {
  command: string;
  workDir?: string;
  timeout?: number;
  env?: Record<string, string>;
  mounts?: { src: string; dst: string }[];
}

interface ContainerRunResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run a command in a container for secure code analysis
 */
export async function runInContainer(
  config: ActionConfig,
  options: ContainerRunOptions,
  dockerClient?: DockerOperations
): Promise<ContainerRunResult> {
  try {
    if (!config.containerConfig.enabled) {
      throw new Error('Container execution requested but containers are disabled in configuration');
    }
    
    logger.info(`Running command in container: ${options.command}`);
    
    // Create Docker client if not provided (for testing)
    const docker = dockerClient || createDockerClient();
    
    // Create temporary directory for container mounts if needed
    const tempDir = options.workDir || await createTempWorkDir();
    
    // Build Docker run command
    const dockerCommand = buildDockerCommand(config.containerConfig, options, tempDir);
    
    // Run the container
    const result = await runContainer(
      dockerCommand,
      options.timeout || config.containerConfig.timeout || 300,
      docker
    );
    
    // Clean up if we created a temp dir
    if (!options.workDir) {
      await cleanupTempDir(tempDir);
    }
    
    return result;
  } catch (error) {
    logger.error('Error running command in container', error);
    return {
      success: false,
      stdout: '',
      stderr: `Error: ${error instanceof Error ? error.message : String(error)}`,
      exitCode: 1
    };
  }
}

/**
 * Create a temporary working directory for the container
 */
async function createTempWorkDir(): Promise<string> {
  const tempDir = path.join(os.tmpdir(), `rsolv-container-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  logger.debug(`Created temporary directory for container: ${tempDir}`);
  return tempDir;
}

/**
 * Clean up the temporary working directory
 */
async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      logger.debug(`Removed temporary directory: ${tempDir}`);
    }
  } catch (error) {
    logger.warn(`Error cleaning up temporary directory: ${tempDir}`, error);
  }
}

/**
 * Build Docker command for running the container
 */
function buildDockerCommand(
  containerConfig: ContainerConfig,
  options: ContainerRunOptions,
  workDir: string
): string {
  const image = containerConfig.image || 'rsolv/code-analysis:latest';
  
  // Base Docker run command
  let cmd = 'docker run --rm';
  
  // Add resource limits
  if (containerConfig.memoryLimit) {
    cmd += ` --memory=${containerConfig.memoryLimit}`;
  }
  
  if (containerConfig.cpuLimit) {
    cmd += ` --cpus=${containerConfig.cpuLimit}`;
  }
  
  // Add security options
  cmd += ' --security-opt=no-new-privileges';
  
  // Add environment variables
  const envVars = { ...containerConfig.environmentVariables, ...options.env };
  
  for (const [key, value] of Object.entries(envVars)) {
    cmd += ` -e ${key}=${escapeShellArg(value)}`;
  }
  
  // Add volume mounts
  cmd += ` -v ${workDir}:/workspace`;
  
  if (options.mounts && options.mounts.length > 0) {
    for (const mount of options.mounts) {
      cmd += ` -v ${escapeShellArg(mount.src)}:${escapeShellArg(mount.dst)}`;
    }
  }
  
  // Set working directory
  cmd += ' -w /workspace';
  
  // Add image and command
  cmd += ` ${image} /bin/sh -c ${escapeShellArg(options.command)}`;
  
  return cmd;
}

/**
 * Run the container and capture output
 */
async function runContainer(
  dockerCommand: string,
  timeoutSeconds: number,
  docker: DockerOperations
): Promise<ContainerRunResult> {
  try {
    logger.debug(`Running Docker command: ${dockerCommand}`);
    
    // Execute the command using Docker client
    const { stdout, stderr } = await docker.runContainer(dockerCommand);
    
    logger.debug('Container execution completed');
    
    return {
      success: true,
      stdout,
      stderr,
      exitCode: 0
    };
  } catch (error: any) {
    // Handle timeout
    if (error.code === 'ETIMEDOUT') {
      logger.error(`Container execution timed out after ${timeoutSeconds} seconds`);
      return {
        success: false,
        stdout: error.stdout || '',
        stderr: `Timeout after ${timeoutSeconds} seconds: ${error.stderr || ''}`,
        exitCode: 124 // Standard timeout exit code
      };
    }
    
    // Handle process errors
    return {
      success: false,
      stdout: error.stdout || '',
      stderr: error.stderr || String(error),
      exitCode: error.code || 1
    };
  }
}

/**
 * Escape a shell argument to prevent command injection
 */
function escapeShellArg(arg: string): string {
  // Double quote the argument and escape any double quotes inside it
  return `"${arg.replace(/"/g, '\\"')}"`;
}