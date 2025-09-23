/**
 * Tests for Claude Code adapter
 */
import { test, expect, vi, describe } from 'vitest';
import { ClaudeCodeAdapter } from '../adapters/claude-code.js';
import { AIConfig } from '../types.js';

// Mock the logger to avoid console output during tests
vi.mock('../../utils/logger', () => ({
  Logger: class {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    debug = vi.fn();
  },
  logger: {
    debug: vi.fn(() => {}),
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
  }
}));

describe('Claude Code Adapter', () => {
  // Mock child_process for CLI availability check
  vi.mock('child_process', () => {
    return {
      spawn: (command: string, args: string[], _options: unknown) => {
        const mockProcess = {
          stdout: {
            on: (event: string, callback: (data: Buffer) => void) => {
              if (event === 'data' && command === 'claude' && args.includes('-v')) {
                // Simulate version check success
                setTimeout(() => callback(Buffer.from('Claude CLI version 1.0.0')), 10);
              }
              return mockProcess.stdout;
            }
          },
          stderr: {
            on: (_event: string, _callback: (data: Buffer) => void) => {
              return mockProcess.stderr;
            }
          },
          on: (event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              setTimeout(() => callback(0), 20); // Exit code 0 (success)
            }
            return mockProcess;
          }
        };
        return mockProcess;
      }
    };
  });

  const config: AIConfig = {
    provider: 'claude-code',
    model: 'claude-3-sonnet-20240229',
    temperature: 0.2,
    maxTokens: 4000
  };

  const issueContext = {
    id: '123',
    number: 1,
    title: 'Test Issue',
    body: 'Test issue body',
    labels: ['bug'],
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
    summary: 'Test summary',
    complexity: 'low' as const,
    estimatedTime: 30,
    potentialFixes: ['Fix 1', 'Fix 2'],
    recommendedApproach: 'Fix 1',
    relatedFiles: ['test.ts']
  };

  test('constructor should initialize with provided values', () => {
    const adapter = new ClaudeCodeAdapter(config);
    expect(adapter).toBeDefined();
  });

  test('constructPrompt should prioritize enhanced prompt when provided', () => {
    const adapter = new ClaudeCodeAdapter(config);
    const enhancedPrompt = 'Enhanced prompt with feedback';
    
    // Access private method through prototype
    // Access private method for testing
    const prompt = (adapter as any).constructPrompt(issueContext, issueAnalysis, enhancedPrompt);
    
    expect(prompt).toContain(enhancedPrompt);
  });

  test('constructPrompt should create default prompt when no enhanced prompt provided', () => {
    const adapter = new ClaudeCodeAdapter(config);
    
    // Access private method through prototype
    // Access private method for testing
    const prompt = (adapter as any).constructPrompt(issueContext, issueAnalysis);
    
    expect(prompt).toContain(issueContext.title);
    expect(prompt).toContain('Repository Exploration');
    expect(prompt).toContain('Deep Analysis');
  });

});