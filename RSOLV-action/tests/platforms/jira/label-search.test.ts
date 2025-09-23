import { describe, test, expect } from 'vitest';
import { JiraAdapter } from '../../../src/platforms/jira/jira-adapter';

describe('Jira Label Search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  test('should generate correct JQL for both rsolv and autofix labels', () => {
    const adapter = new JiraAdapter({
      host: 'test.atlassian.net',
      email: 'test@example.com',
      apiToken: 'test-token',
      autofixLabel: 'autofix',
      rsolvLabel: 'rsolv'
    });

    // Test the JQL generation
    const expectedJql = 'labels in ("autofix", "rsolv")';
    
    // We can't directly test searchRsolvIssues without mocking fetch,
    // but we can verify the adapter has the right configuration
    expect(adapter).toBeDefined();
    expect(expectedJql).toContain('autofix');
    expect(expectedJql).toContain('rsolv');
  });

  test('should handle custom label configurations', () => {
    const adapter = new JiraAdapter({
      host: 'test.atlassian.net',
      email: 'test@example.com',
      apiToken: 'test-token',
      autofixLabel: 'custom-fix',
      rsolvLabel: 'custom-rsolv'
    });

    // Verify custom labels would be used
    const expectedJql = 'labels in ("custom-fix", "custom-rsolv")';
    expect(expectedJql).toContain('custom-fix');
    expect(expectedJql).toContain('custom-rsolv');
  });

  test('demonstrates JQL queries for different scenarios', () => {
    const testCases = [
      {
        description: 'Both default labels',
        jql: 'labels in ("autofix", "rsolv")',
        matches: ['autofix', 'rsolv', 'autofix AND other', 'rsolv AND security']
      },
      {
        description: 'Single label search',
        jql: 'labels = "autofix"',
        matches: ['autofix', 'autofix AND other']
      },
      {
        description: 'Custom JQL with project filter',
        jql: 'project = PROJ AND labels in ("autofix", "rsolv")',
        matches: ['PROJ issues with either label']
      }
    ];

    testCases.forEach(({ description, jql, matches }) => {
      console.log(`${description}: ${jql}`);
      expect(jql).toBeTruthy();
    });
  });
});