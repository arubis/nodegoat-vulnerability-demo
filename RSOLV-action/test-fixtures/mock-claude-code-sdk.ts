/**
 * Mock implementation of Claude Code SDK for testing
 * Prevents actual process spawning in tests
 */

import { vi } from 'vitest';

// Mock the query function to prevent actual Claude Code process spawning
export const mockQuery = vi.fn(async function* (options: any) {
  // Simulate CLI-based execution without spawning processes
  const messages = [];
  
  // Add initial message
  messages.push({
    type: 'text',
    text: 'Analyzing the vulnerability...'
  });
  
  // Simulate file editing
  if (options.prompt?.includes('Edit') || options.prompt?.includes('fix')) {
    messages.push({
      type: 'tool_use',
      name: 'Edit',
      input: {
        file_path: 'src/vulnerable.js',
        old_string: 'eval(userInput)',
        new_string: 'safeEval(userInput)'
      }
    });
    
    messages.push({
      type: 'text',
      text: 'File successfully edited'
    });
  }
  
  // Simulate solution summary
  messages.push({
    type: 'text',
    text: `Solution complete. Here's the summary:
\`\`\`json
{
  "title": "Fix security vulnerability",
  "description": "Applied security patch via CLI",
  "files": [{
    "path": "src/vulnerable.js",
    "changes": "Replaced unsafe eval with safe alternative"
  }],
  "tests": ["Security test added", "No regressions"]
}
\`\`\``
  });
  
  // Yield messages
  for (const message of messages) {
    yield message;
  }
});

// Mock the entire @anthropic-ai/claude-code module
export function setupClaudeCodeMock() {
  vi.mock('@anthropic-ai/claude-code', () => ({
    query: mockQuery,
    // Add other exports if needed
    version: '1.0.67',
    ClaudeCodeError: class ClaudeCodeError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'ClaudeCodeError';
      }
    }
  }));
  
  // Also mock child_process to prevent any subprocess spawning
  vi.mock('child_process', () => ({
    spawn: vi.fn(() => ({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event, cb) => {
        if (event === 'close') {
          setTimeout(() => cb(0), 10);
        }
      }),
      kill: vi.fn()
    })),
    exec: vi.fn((cmd, opts, cb) => {
      const callback = cb || opts;
      if (typeof callback === 'function') {
        callback(null, '', '');
      }
    }),
    execSync: vi.fn((cmd) => {
      // Return appropriate responses for git commands
      if (cmd.includes('git status')) return '';
      if (cmd.includes('git diff --name-only')) return 'src/vulnerable.js';
      if (cmd.includes('git diff --stat')) return '1 file changed, 5 insertions(+), 3 deletions(-)';
      if (cmd.includes('git rev-parse HEAD')) return 'abc123def456';
      if (cmd.includes('git branch')) return '* main';
      if (cmd.includes('git config user.email')) return 'test@example.com';
      return '';
    })
  }));
}

// Setup function to be called in test setup
export function setupTestEnvironment() {
  // Set NODE_ENV to test
  process.env.NODE_ENV = 'test';
  
  // Disable actual Claude Code CLI execution
  delete process.env.CLAUDE_CODE_PATH;
  process.env.RSOLV_USE_CLI = 'false';
  process.env.FORCE_MOCK_CLAUDE_CODE = 'true';
  
  // Setup mocks
  setupClaudeCodeMock();
}