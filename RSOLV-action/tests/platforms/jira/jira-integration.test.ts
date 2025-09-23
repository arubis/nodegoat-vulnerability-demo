import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { JiraAdapter } from '../../../src/platforms/jira/jira-adapter';
import type { UnifiedIssue } from '../../../src/platforms/types';

/**
 * Integration tests for Jira adapter
 * 
 * To run these tests, set the following environment variables:
 * - JIRA_TEST_HOST: Your Jira instance (e.g., 'test.atlassian.net')
 * - JIRA_TEST_EMAIL: Your Jira email
 * - JIRA_TEST_API_TOKEN: Your Jira API token
 * - JIRA_TEST_PROJECT: A test project key (e.g., 'TEST')
 * 
 * Run with: JIRA_TEST_HOST=... JIRA_TEST_EMAIL=... vitest jira-integration.test.ts
 */
describe.skip('JiraAdapter Integration Tests', () => {
  let adapter: JiraAdapter;
  let testIssueKey: string;

  const config = {
    host: process.env.JIRA_TEST_HOST!,
    email: process.env.JIRA_TEST_EMAIL!,
    apiToken: process.env.JIRA_TEST_API_TOKEN!,
    autofixLabel: 'rsolv-test'
  };

  beforeAll(async () => {
    if (!process.env.JIRA_TEST_HOST) {
      console.log('Skipping Jira integration tests - no credentials provided');
      return;
    }

    adapter = new JiraAdapter(config);
    await adapter.authenticate();
  });

  test('should authenticate successfully', async () => {
    // Authentication happens in beforeAll
    expect(adapter).toBeDefined();
  });

  test('should create and search for test issue', async () => {
    // Note: Creating issues requires additional setup
    // This test assumes you have a test issue with the rsolv-test label
    const issues = await adapter.searchIssues(`labels = "${config.autofixLabel}"`);
    
    if (issues.length > 0) {
      testIssueKey = issues[0].key!;
      expect(issues[0].platform).toBe('jira');
      expect(issues[0].labels).toContain(config.autofixLabel);
    }
  });

  test('should add comment to issue', async () => {
    if (!testIssueKey) {
      console.log('No test issue found, skipping comment test');
      return;
    }

    await adapter.createComment(
      testIssueKey,
      `RSOLV integration test comment - ${new Date().toISOString()}`
    );
    
    // If no error thrown, comment was added successfully
    expect(true).toBe(true);
  });

  test('should link external resource', async () => {
    if (!testIssueKey) {
      console.log('No test issue found, skipping link test');
      return;
    }

    await adapter.addLink(
      testIssueKey,
      'https://github.com/rsolv-dev/rsolv-action/pull/999',
      'Test PR from RSOLV Integration'
    );
    
    // If no error thrown, link was created successfully
    expect(true).toBe(true);
  });

  afterAll(async () => {
    // Clean up test data if needed
    console.log('Jira integration tests completed');
  });
});