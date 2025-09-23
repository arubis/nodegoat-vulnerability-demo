import { vi } from 'vitest';
import * as actualFs from 'fs';

/**
 * Create a mock for fs that allows certain files to be "found"
 * while still allowing access to real files for other paths
 */
export function createFsMock(mockFiles: Record<string, boolean> = {}) {
  return {
    ...actualFs,
    existsSync: vi.fn((path: string) => {
      // Check if this path is in our mock files
      if (path in mockFiles) {
        return mockFiles[path];
      }
      
      // For Claude Code CLI paths, return true in test environment
      if (path.includes('claude-code') || path.includes('cli.js')) {
        return true;
      }
      
      // Otherwise use real fs
      return actualFs.existsSync(path);
    }),
    
    readFileSync: vi.fn((path: string, options?: any) => {
      // For mocked files, return empty content
      if (path in mockFiles && mockFiles[path]) {
        return '';
      }
      // Otherwise use real fs
      return actualFs.readFileSync(path, options);
    })
  };
}

/**
 * Setup fs mock for Claude Code tests
 * This ensures the CLI appears to be available
 */
export function setupClaudeCodeFsMock() {
  const fsMock = createFsMock({
    '/home/dylan/dev/rsolv/RSOLV-action/node_modules/@anthropic-ai/claude-code/cli.js': true
  });
  
  vi.doMock('fs', () => fsMock);
  return fsMock;
}