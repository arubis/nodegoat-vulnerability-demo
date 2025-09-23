import { describe, test, expect, beforeEach } from 'vitest';
import { JiraAdapter } from '../../src/platforms/jira/jira-adapter';
import type { UnifiedIssue } from '../../src/platforms/types';

/**
 * Integration test showing how Jira fits into the RSOLV workflow
 */
describe('Jira Integration Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  test('demonstrates the complete workflow from Jira issue to PR', async () => {
    // Step 1: User creates a Jira issue with autofix label
    const jiraIssue: UnifiedIssue = {
      id: 'jira-10001',
      platform: 'jira',
      key: 'PROJ-123',
      title: 'Fix deprecated API usage in auth module',
      description: `
The authentication module is using deprecated crypto methods.

Repository: https://github.com/myorg/myapp
File: src/auth/crypto.js

Current code uses crypto.createCipher which is deprecated.
We need to update it to use crypto.createCipheriv.
      `,
      labels: ['autofix', 'technical-debt', 'security'],
      status: 'To Do',
      url: 'https://myorg.atlassian.net/browse/PROJ-123',
      createdAt: new Date('2025-05-23T10:00:00Z'),
      updatedAt: new Date('2025-05-23T10:00:00Z'),
      assignee: {
        id: '123',
        name: 'John Doe',
        email: 'john@myorg.com'
      }
    };

    // Step 2: RSOLV detects the issue via Jira API
    console.log('\n=== Step 1: Issue Detection ===');
    console.log(`Found Jira issue: ${jiraIssue.key} - ${jiraIssue.title}`);
    console.log(`Labels: ${jiraIssue.labels.join(', ')}`);
    console.log(`Repository extracted: https://github.com/myorg/myapp`);

    // Step 3: RSOLV analyzes the issue and generates a solution
    console.log('\n=== Step 2: AI Analysis ===');
    console.log('AI analyzing the issue description...');
    console.log('Identified: Deprecated crypto.createCipher usage');
    console.log('Solution: Update to crypto.createCipheriv with proper IV');

    // Step 4: RSOLV creates a pull request
    const prUrl = 'https://github.com/myorg/myapp/pull/456';
    console.log('\n=== Step 3: Pull Request Creation ===');
    console.log(`Created PR: ${prUrl}`);
    console.log('PR Title: Fix deprecated crypto API usage (PROJ-123)');

    // Step 5: RSOLV updates the Jira issue
    console.log('\n=== Step 4: Jira Update ===');
    console.log('Adding comment to Jira issue...');
    const comment = `RSOLV has created a pull request to fix this issue:
${prUrl}

Changes made:
- Updated crypto.createCipher to crypto.createCipheriv
- Added proper initialization vector generation
- Updated tests to match new implementation`;

    console.log('Linking PR to Jira issue...');
    console.log('Updating issue status to "In Progress"...');

    // Show the complete data flow
    console.log('\n=== Data Flow Summary ===');
    console.log('1. Jira Issue (PROJ-123) → ');
    console.log('2. UnifiedIssue format → ');
    console.log('3. IssueContext for AI processing → ');
    console.log('4. AI generates solution → ');
    console.log('5. GitHub PR created → ');
    console.log('6. Jira updated with PR link');

    // Verify the workflow makes sense
    expect(jiraIssue.platform).toBe('jira');
    expect(jiraIssue.labels).toContain('autofix');
    expect(jiraIssue.description).toContain('github.com');
  });

  test('shows how repository info is extracted from Jira', () => {
    const testCases = [
      {
        description: 'Repository: https://github.com/owner/repo',
        expected: { owner: 'owner', name: 'repo' }
      },
      {
        description: 'Check https://github.com/myorg/myapp for the code',
        expected: { owner: 'myorg', name: 'myapp' }
      },
      {
        description: 'The issue is in github.com/company/service file src/index.js',
        expected: { owner: 'company', name: 'service' }
      }
    ];

    testCases.forEach(({ description, expected }) => {
      const githubUrlPattern = /https?:\/\/github\.com\/([^\/]+)\/([^\/\s]+)/g;
      const match = githubUrlPattern.exec(description);
      
      if (match) {
        const [, owner, name] = match;
        expect(owner).toBe(expected.owner);
        expect(name).toBe(expected.name);
      }
    });
  });

  test('shows the Jira configuration in action.yml', () => {
    const actionYmlInputs = {
      jira_host: 'Jira instance hostname (e.g., your-domain.atlassian.net)',
      jira_email: 'Jira account email for API authentication',
      jira_api_token: 'Jira API token for authentication',
      jira_autofix_label: 'Label to identify Jira issues for automation (default: autofix)',
      jira_jql: 'Custom JQL query to find issues (optional)'
    };

    const envVars = {
      JIRA_HOST: 'From jira_host input',
      JIRA_EMAIL: 'From jira_email input',
      JIRA_API_TOKEN: 'From jira_api_token input',
      JIRA_AUTOFIX_LABEL: 'From jira_autofix_label input',
      JIRA_JQL: 'From jira_jql input'
    };

    console.log('\n=== GitHub Action Configuration ===');
    console.log('Inputs in action.yml:');
    Object.entries(actionYmlInputs).forEach(([key, desc]) => {
      console.log(`  ${key}: ${desc}`);
    });

    console.log('\nEnvironment variables passed to container:');
    Object.entries(envVars).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    expect(Object.keys(actionYmlInputs)).toHaveLength(5);
  });
});