/**
 * Standardized test fixtures for Claude Code adapters
 * Prioritizes CLI usage over SDK
 */

import { vi } from 'vitest';
import type { AIConfig } from '../src/ai/types.js';

/**
 * Create a mock Claude Code CLI adapter
 */
export function createMockClaudeCodeCLIAdapter() {
  return {
    config: {} as AIConfig,
    repoPath: '/test/repo',
    claudeConfig: {
      useStructuredPhases: true,
      preferCLI: true
    },
    
    async generateSolution(issueContext: any, analysis: any, enhancedPrompt?: string) {
      // Simulate CLI-based solution generation
      return {
        success: true,
        message: 'Solution generated via Claude Code CLI',
        changes: {
          'src/vulnerable.js': 'Fixed vulnerability content'
        },
        metadata: {
          title: 'Fix security vulnerability',
          description: 'Applied security fix via CLI',
          tests: ['Vulnerability patched', 'No regression']
        },
        messages: [], // CLI doesn't return conversation messages
        cliOutput: 'Claude Code CLI executed successfully'
      };
    },
    
    async generateSolutionWithGit(issueContext: any, analysis: any) {
      // Simulate git-based workflow with CLI
      const modifiedFiles = ['src/vulnerable.js'];
      
      return {
        success: true,
        message: 'Fixed vulnerabilities using Claude Code CLI',
        filesModified: modifiedFiles,
        commitHash: 'abc123def456',
        diffStats: {
          filesChanged: 1,
          insertions: 5,
          deletions: 3
        },
        summary: {
          title: 'Fix security vulnerability',
          description: 'Applied fix via CLI with git integration',
          securityImpact: 'Vulnerability patched',
          tests: ['Security test added']
        }
      };
    },
    
    constructPrompt(issueContext: any, analysis: any) {
      return `[CLI Mode] Fix the following vulnerability:
Issue: ${issueContext.title}
Description: ${issueContext.body}
Files: ${analysis.filesToModify?.join(', ')}

Use the Edit tool to modify files directly.
Provide a JSON summary after fixing.`;
    },
    
    async isAvailable() {
      // Check if CLI is available
      return process.env.CLAUDE_CODE_PATH !== undefined || process.env.RSOLV_USE_CLI === 'true';
    }
  };
}

/**
 * Create mock for GitBasedClaudeCodeAdapter that uses CLI
 */
export function createMockGitBasedAdapter() {
  const cliAdapter = createMockClaudeCodeCLIAdapter();
  
  return {
    ...cliAdapter,
    
    getModifiedFiles() {
      return ['src/vulnerable.js'];
    },
    
    getDiffStats() {
      return {
        filesChanged: 1,
        insertions: 5,
        deletions: 3
      };
    },
    
    createCommit(files: string[], message: string) {
      return 'abc123def456';
    },
    
    parsePhaseCompletion(messages: any[]) {
      // CLI doesn't have phases in the same way
      return {
        phase1Complete: true,
        filesEdited: true,
        jsonProvided: true
      };
    }
  };
}

/**
 * Mock execSync for git operations
 */
export function createMockExecSync() {
  return vi.fn((command: string) => {
    if (command === 'git status --porcelain') {
      return ''; // Clean working directory
    }
    if (command === 'git diff --name-only') {
      return 'src/vulnerable.js\n';
    }
    if (command === 'git diff --stat') {
      return '1 file changed, 5 insertions(+), 3 deletions(-)';
    }
    if (command === 'git rev-parse HEAD') {
      return 'abc123def456';
    }
    if (command.includes('git config user.email')) {
      return 'rsolv@users.noreply.github.com';
    }
    if (command.includes('claude-code')) {
      // Simulate Claude Code CLI execution
      return 'Files successfully edited';
    }
    return '';
  });
}

/**
 * Create standardized test config for Claude Code
 */
export function createTestConfig(overrides: Partial<AIConfig> = {}): AIConfig {
  return {
    provider: 'claude-code',
    apiKey: 'test-api-key',
    model: 'claude-3-sonnet-20240229',
    temperature: 0.1,
    maxTokens: 4096,
    claudeCodeConfig: {
      preferCLI: true, // Prioritize CLI over SDK
      useStructuredPhases: true,
      verboseLogging: false,
      timeout: 30000,
      ...overrides.claudeCodeConfig
    },
    ...overrides
  };
}

/**
 * Create mock solution result
 */
export function createMockSolutionResult(success = true) {
  return {
    success,
    message: success ? 'Solution generated successfully' : 'Failed to generate solution',
    changes: success ? {
      'src/vulnerable.js': 'Fixed content'
    } : {},
    error: success ? undefined : 'Mock error',
    metadata: {
      provider: 'claude-code-cli',
      duration: 1500,
      tokensUsed: 0 // CLI doesn't report tokens
    }
  };
}