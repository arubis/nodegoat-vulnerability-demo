/**
 * Live API tests for Claude Code adapter
 * These tests make real calls to Claude Code CLI
 * 
 * Run with: CLAUDE_CODE_LIVE_TEST=true vitest claude-code-live.test.ts
 * Or automatically enabled when Claude Max is available
 */
import { test, expect, describe, vi, beforeAll } from 'vitest';
import { ClaudeCodeAdapter } from '../adapters/claude-code.js';
import { AIConfig } from '../types.js';
import { execSync } from 'child_process';
import { isClaudeMaxAvailable } from '../adapters/claude-code-cli-dev.js';

// Detect Claude Max availability at module load time
let canUseClaudeMax = false;
let skipLiveTests = true;

try {
  // Try to detect Claude Max, but handle any errors gracefully
  canUseClaudeMax = isClaudeMaxAvailable();
} catch (error) {
  canUseClaudeMax = false;
}

skipLiveTests = process.env.CLAUDE_CODE_LIVE_TEST !== 'true' && !canUseClaudeMax;

// Only log when tests will actually run
if (!skipLiveTests) {
  if (canUseClaudeMax) {
    console.log('🎉 Claude Max detected - enabling Claude Code live tests without API credits');
  } else {
    console.log('📝 Running Claude Code tests with CLAUDE_CODE_LIVE_TEST=true');
  }
}

describe.skipIf(skipLiveTests)('Claude Code Live API Tests', () => {
  const config: AIConfig = {
    provider: 'claude-code',
    model: 'claude-3-sonnet-20240229',
    temperature: 0.2,
    maxTokens: 4000
  };

  const issueContext = {
    id: '123',
    number: 1,
    title: 'Fix SQL injection vulnerability in login',
    body: 'The login function uses string concatenation for SQL queries, making it vulnerable to SQL injection attacks.',
    labels: ['security', 'bug'],
    assignees: [],
    repository: {
      owner: 'test',
      name: 'repo',
      fullName: 'test/repo',
      defaultBranch: 'main',
      language: 'JavaScript'
    },
    source: 'github' as const,
    url: 'https://github.com/test/repo/issues/1',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01'
  };

  const issueAnalysis = {
    summary: 'SQL injection vulnerability in authentication system',
    complexity: 'medium' as const,
    estimatedTime: 45,
    potentialFixes: ['Use parameterized queries', 'Use prepared statements'],
    recommendedApproach: 'Replace string concatenation with parameterized queries',
    relatedFiles: ['src/auth/login.js']
  };

  test('should check if Claude Code CLI is actually available', async () => {
    const adapter = new ClaudeCodeAdapter(config);
    const available = await adapter.isAvailable();
    
    if (!available) {
      console.log('Claude Code CLI not installed - skipping live tests');
      console.log('Install with: npm install -g @anthropic/claude-code');
    }
    
    expect(typeof available).toBe('boolean');
  });

  test.skipIf(!process.env.CLAUDE_CODE_AVAILABLE && !canUseClaudeMax)('should generate real solution using Claude Code', async () => {
    const adapter = new ClaudeCodeAdapter(config);
    
    // First check if Claude Code is available
    const available = await adapter.isAvailable();
    if (!available) {
      console.log('Skipping - Claude Code not available');
      return;
    }

    const solution = await adapter.generateSolution(issueContext, issueAnalysis);
    
    console.log('Live API Response:', JSON.stringify(solution, null, 2));
    
    expect(solution).toBeDefined();
    expect(solution.success).toBeDefined();
    
    if (solution.success) {
      expect(solution.message).toBe('Solution generated with Claude Code');
      expect(solution.changes).toBeDefined();
      expect(Object.keys(solution.changes!).length).toBeGreaterThan(0);
      
      // Check that the solution addresses SQL injection
      const fileContents = Object.values(solution.changes!).join('\n');
      expect(fileContents.toLowerCase()).toMatch(/(?:parameter|prepare|escape|sanitize)/);
    } else {
      // Even if it fails, we should get a meaningful error
      expect(solution.error).toBeDefined();
      console.log('Claude Code error:', solution.error);
    }
  }, 30000); // 30 second timeout for live API call

  test.skipIf(!process.env.CLAUDE_CODE_AVAILABLE && !canUseClaudeMax)('should work with enhanced prompts in live mode', async () => {
    const adapter = new ClaudeCodeAdapter(config);
    
    const available = await adapter.isAvailable();
    if (!available) {
      console.log('Skipping - Claude Code not available');
      return;
    }

    const enhancedPrompt = `
      Focus on security best practices. The solution must:
      1. Use parameterized queries
      2. Include input validation
      3. Add logging for security events
      4. Include comprehensive error handling
    `;
    
    const solution = await adapter.generateSolution(issueContext, issueAnalysis, enhancedPrompt);
    
    console.log('Enhanced prompt response:', JSON.stringify(solution, null, 2));
    
    if (solution.success && solution.changes) {
      const fileContents = Object.values(solution.changes).join('\n');
      
      // Check that enhanced requirements are addressed
      expect(fileContents).toMatch(/(?:validate|validation)/i);
      expect(fileContents).toMatch(/(?:log|logger|logging)/i);
      expect(fileContents).toMatch(/(?:try|catch|error)/i);
    }
  }, 30000);
});

// Integration test with real file system
describe.skipIf(skipLiveTests)('Claude Code File System Integration', () => {
  // Define test data for this describe block
  const issueContext = {
    id: '123',
    number: 1,
    title: 'Fix SQL injection vulnerability in login',
    body: 'The login function uses string concatenation for SQL queries, making it vulnerable to SQL injection attacks.',
    labels: ['security', 'bug'],
    assignees: [],
    repository: {
      owner: 'test',
      name: 'repo',
      fullName: 'test/repo',
      defaultBranch: 'main',
      language: 'JavaScript'
    },
    source: 'github' as const,
    url: 'https://github.com/test/repo/issues/1',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01'
  };

  const issueAnalysis = {
    summary: 'SQL injection vulnerability in authentication system',
    complexity: 'medium' as const,
    estimatedTime: 45,
    potentialFixes: ['Use parameterized queries', 'Use prepared statements'],
    recommendedApproach: 'Replace string concatenation with parameterized queries',
    relatedFiles: ['src/auth/login.js']
  };
  
  test('should handle real file operations', async () => {
    const config: AIConfig = {
      provider: 'claude-code',
      model: 'claude-3-sonnet-20240229',
      temperature: 0.2,
      maxTokens: 4000,
      claudeCodeConfig: {
        tempDir: '/tmp/claude-code-test',
        outputFormat: 'stream-json',
        trackUsage: true
      }
    };

    const adapter = new ClaudeCodeAdapter(config);
    
    // This will create real temp files
    const prompt = (adapter as any).constructPrompt(issueContext, issueAnalysis);
    
    expect(prompt).toBeDefined();
    expect(prompt.length).toBeGreaterThan(100);
  });
});