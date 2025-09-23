import { describe, expect, test, beforeEach, vi } from 'vitest';
import { AnthropicClient } from '../anthropic.js';
import { AIConfig, IssueAnalysis } from '../../types.js';

// Mock child_process at module level
vi.mock('child_process', () => ({
  exec: vi.fn((command: string, options: any, callback: any) => {
    // Handle different commands
    if (typeof callback === 'undefined' && typeof options === 'function') {
      callback = options;
      options = {};
    }
    
    if (command.includes('claude-code')) {
      callback(null, {
        stdout: `
\`\`\`json
{
  "title": "Fix: Test solution title",
  "description": "Test solution description",
  "files": [
    {
      "path": "src/file1.ts",
      "changes": "Updated file1 content"
    },
    {
      "path": "src/file2.ts",
      "changes": "Updated file2 content"
    }
  ],
  "tests": ["Test 1", "Test 2"]
}
\`\`\`
        `,
        stderr: ''
      });
    } else if (command.includes('cat /tmp/claude-output-')) {
      callback(null, { stdout: 'Mock Claude output', stderr: '' });
    } else if (command.includes('rm /tmp/claude-output-')) {
      callback(null, { stdout: '', stderr: '' });
    } else {
      callback(new Error(`Unexpected command: ${command}`));
    }
  })
}));

// Mock the claude-code module
vi.mock('@anthropic-ai/claude-code', () => ({
  query: vi.fn(async function* (options: any) {
    yield {
      type: 'assistant',
      text: JSON.stringify({
        title: 'Fix: Test solution',
        description: 'Test solution description',
        files: [{
          path: 'src/test.ts',
          changes: 'console.log("fixed");'
        }],
        tests: ['Test case 1']
      })
    };
  })
}));

describe('Anthropic Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set test environment
    process.env.NODE_ENV = 'test';
  });
  
  test('constructor should initialize with default values', () => {
    const config: AIConfig = {
      provider: 'anthropic',
      apiKey: 'test-api-key-12345678901234567890'
    };
    
    const client = new AnthropicClient(config);
    expect(client).toBeDefined();
  });
  
  test('constructor should accept valid API key', () => {
    const config: AIConfig = {
      provider: 'anthropic',
      apiKey: 'test-api-key-12345678901234567890'
    };
    
    const client = new AnthropicClient(config);
    expect(client).toBeDefined();
  });
  
  test('analyzeIssue should return issue analysis', async () => {
    const config: AIConfig = {
      provider: 'anthropic',
      apiKey: 'test-api-key-12345678901234567890'
    };
    
    const client = new AnthropicClient(config);
    const analysis = await client.analyzeIssue(
      'Test issue title',
      'Test issue body with some content'
    );
    
    expect(analysis).toBeDefined();
    expect(analysis.summary).toBeDefined();
    expect(analysis.complexity).toBeDefined();
    expect(analysis.estimatedTime).toBeDefined();
    expect(analysis.recommendedApproach).toBeDefined();
  });
  
  test('generateSolution should return pull request solution', async () => {
    const config: AIConfig = {
      provider: 'anthropic',
      apiKey: 'test-api-key-12345678901234567890'
    };
    
    const client = new AnthropicClient(config);
    
    const issueAnalysis: IssueAnalysis = {
      summary: 'Test issue summary',
      complexity: 'low',
      estimatedTime: 30,
      potentialFixes: ['Fix 1', 'Fix 2'],
      recommendedApproach: 'Use Fix 1',
      relatedFiles: ['src/test.ts']
    };
    
    const solution = await client.generateSolution(
      'Test Issue',
      'Test issue body',
      issueAnalysis
    );
    
    expect(solution).toBeDefined();
    expect(solution.title).toBe('Fix: Test Issue');
    expect(solution.description).toContain('fixes the test issue');
    expect(solution.files).toHaveLength(1);
    expect(solution.tests).toHaveLength(2);
  });
});