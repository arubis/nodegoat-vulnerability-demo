import { bench, describe } from 'vitest';
import { ClaudeCodeAdapter } from '../claude-code.js';
import { ClaudeCodeCLIAdapter } from '../claude-code-cli.js';

describe('Claude Code Adapter Performance', () => {
  const mockConfig = {
    provider: 'claude-code' as const,
    apiKey: 'test-key',
    model: 'claude-3-sonnet-20240229',
    temperature: 0.1,
    maxTokens: 4096,
    claudeCodeConfig: {
      preferCLI: true,
      timeout: 30000
    }
  };

  const mockIssue = {
    id: 'perf-test',
    number: 1,
    title: 'Performance test issue',
    body: 'Test vulnerability',
    repository: {
      owner: 'test',
      name: 'repo',
      fullName: 'test/repo'
    }
  };

  const mockAnalysis = {
    complexity: 'medium',
    estimatedTime: 30,
    filesToModify: ['test.js']
  };

  bench('ClaudeCodeAdapter initialization', () => {
    new ClaudeCodeAdapter(mockConfig, '/test/repo');
  });

  bench('ClaudeCodeCLIAdapter initialization', () => {
    new ClaudeCodeCLIAdapter(mockConfig, '/test/repo');
  });

  bench('Prompt construction', () => {
    const adapter = new ClaudeCodeCLIAdapter(mockConfig, '/test/repo');
    (adapter as any).constructPrompt(mockIssue, mockAnalysis);
  });

  bench('Solution extraction from text', () => {
    const adapter = new ClaudeCodeAdapter(mockConfig, '/test/repo');
    const jsonText = JSON.stringify({
      title: 'Fix',
      description: 'Fixed',
      files: [{ path: 'test.js', changes: 'fixed' }],
      tests: []
    });
    
    (adapter as any).extractSolutionFromText(`
      Here's the fix:
      \`\`\`json
      ${jsonText}
      \`\`\`
    `);
  });

  bench('Parse phase completion', () => {
    const adapter = new ClaudeCodeAdapter(mockConfig, '/test/repo');
    const messages = [
      { type: 'text', text: 'PHASE 1 COMPLETE' },
      { type: 'tool_use', name: 'Edit', input: {} },
      { type: 'text', text: '```json\n{}\n```' }
    ];
    
    (adapter as any).parsePhaseCompletion?.(messages);
  });
});