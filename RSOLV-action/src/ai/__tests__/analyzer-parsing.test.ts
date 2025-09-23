/**
 * Tests for improved analyzer parsing logic
 */
import { analyzeIssue } from '../analyzer.js';
import { IssueContext } from '../../types/index.js';

// Mock the AI client
const mockAiClient = {
  complete: vi.fn()
};

const mockIssue: IssueContext = {
  id: '123',
  number: 1,
  title: 'Login endpoint vulnerable to timing attack',
  body: 'The /api/auth/login endpoint in src/auth/login.js doesn\'t implement constant-time comparison for passwords',
  labels: ['rsolv:automate'],
  author: 'test-user',
  assignees: [],
  url: 'https://github.com/test/repo/issues/1',
  repository: {
    name: 'test-repo',
    owner: 'test-owner',
    fullName: 'test-owner/test-repo',
    url: 'https://github.com/test-owner/test-repo',
    defaultBranch: 'main'
  },
  createdAt: new Date().toISOString()
};

describe('Improved Analyzer Parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should detect files mentioned without quotes', async () => {
    mockAiClient.complete.mockResolvedValue(
      'This issue affects the src/auth/login.js file. The vulnerability is in the password comparison logic.'
    );

    const config = { aiProvider: { provider: 'anthropic' as const } };
    const result = await analyzeIssue(mockIssue, config, mockAiClient);

    expect(result.filesToModify).toContain('src/auth/login.js');
    expect(result.canBeFixed).toBe(true);
  });

  test('should detect common auth files mentioned casually', async () => {
    mockAiClient.complete.mockResolvedValue(
      'The login.js file has a timing vulnerability that needs to be fixed with constant-time comparison.'
    );

    const config = { aiProvider: { provider: 'anthropic' as const } };
    const result = await analyzeIssue(mockIssue, config, mockAiClient);

    expect(result.filesToModify).toContain('login.js');
    expect(result.canBeFixed).toBe(true);
  });

  test('should extract approach from "Solution:" keyword', async () => {
    mockAiClient.complete.mockResolvedValue(
      'Solution: Use crypto.timingSafeEqual() for password comparison to prevent timing attacks.'
    );

    const config = { aiProvider: { provider: 'anthropic' as const } };
    const result = await analyzeIssue(mockIssue, config, mockAiClient);

    expect(result.suggestedApproach).toContain('Use crypto.timingSafeEqual()');
    expect(result.canBeFixed).toBe(true);
  });

  test('should extract approach from "Fix:" keyword', async () => {
    mockAiClient.complete.mockResolvedValue(
      'Fix: Replace string comparison with constant-time function in auth.js'
    );

    const config = { aiProvider: { provider: 'anthropic' as const } };
    const result = await analyzeIssue(mockIssue, config, mockAiClient);

    expect(result.suggestedApproach).toContain('Replace string comparison');
    expect(result.filesToModify).toContain('auth.js');
    expect(result.canBeFixed).toBe(true);
  });

  test('should use whole response as approach if no keywords found', async () => {
    mockAiClient.complete.mockResolvedValue(
      'This is a timing attack vulnerability that can be exploited by measuring response times. The issue needs to be addressed by implementing constant-time comparison.'
    );

    const config = { aiProvider: { provider: 'anthropic' as const } };
    const result = await analyzeIssue(mockIssue, config, mockAiClient);

    expect(result.suggestedApproach).toContain('timing attack vulnerability');
    expect(result.suggestedApproach.length).toBeGreaterThan(50);
  });

  test('should detect multiple file types', async () => {
    mockAiClient.complete.mockResolvedValue(
      'Affects multiple files: src/auth/login.ts, test/auth.test.js, and config/security.py'
    );

    const config = { aiProvider: { provider: 'anthropic' as const } };
    const result = await analyzeIssue(mockIssue, config, mockAiClient);

    expect(result.filesToModify).toContain('src/auth/login.ts');
    expect(result.filesToModify).toContain('test/auth.test.js');
    expect(result.filesToModify).toContain('config/security.py');
    expect(result.canBeFixed).toBe(true);
  });

  test('should handle responses with "To fix this" keyword', async () => {
    mockAiClient.complete.mockResolvedValue(
      'To fix this vulnerability, you need to update the authentication logic in login.js'
    );

    const config = { aiProvider: { provider: 'anthropic' as const } };
    const result = await analyzeIssue(mockIssue, config, mockAiClient);

    expect(result.suggestedApproach).toContain('update the authentication logic');
    expect(result.filesToModify).toContain('login.js');
    expect(result.canBeFixed).toBe(true);
  });

  test('should still fail if response is too short', async () => {
    mockAiClient.complete.mockResolvedValue('No fix possible.');

    const config = { aiProvider: { provider: 'anthropic' as const } };
    const result = await analyzeIssue(mockIssue, config, mockAiClient);

    expect(result.canBeFixed).toBe(false);
  });

  test('should handle mixed format responses', async () => {
    mockAiClient.complete.mockResolvedValue(`
The issue is in src/auth/login.js on line 15.

Recommendation: Use the crypto.timingSafeEqual() function instead of direct string comparison.

This affects authentication.ts as well.
    `);

    const config = { aiProvider: { provider: 'anthropic' as const } };
    const result = await analyzeIssue(mockIssue, config, mockAiClient);

    expect(result.filesToModify).toContain('src/auth/login.js');
    expect(result.filesToModify).toContain('authentication.ts');
    expect(result.suggestedApproach).toContain('crypto.timingSafeEqual()');
    expect(result.canBeFixed).toBe(true);
  });
});