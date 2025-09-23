import { ActionConfig, IssueContext } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { getGitHubClient, getRepositoryDetails } from './api.js';

/**
 * Detect issues that need automation based on labels
 */
export async function detectIssues(config: ActionConfig): Promise<IssueContext[]> {
  try {
    logger.info('Detecting issues for automation');
    
    // Get context from environment variables
    const repoFullName = process.env.GITHUB_REPOSITORY || '';
    const [owner, repo] = repoFullName.split('/');
    
    if (!owner || !repo) {
      throw new Error('Repository information not available in environment variables');
    }
    
    // Get repository details
    const repoDetails = await getRepositoryDetails(owner, repo);
    
    // Check if a specific issue number is provided (e.g., from workflow_dispatch)
    const specificIssueNumber = process.env.RSOLV_ISSUE_NUMBER;
    if (specificIssueNumber) {
      logger.info(`Processing specific issue #${specificIssueNumber}`);
      const issue = await getSpecificIssue(owner, repo, parseInt(specificIssueNumber));
      
      // Convert single issue to array for consistent handling
      const allIssues: GitHubIssue[] = issue ? [issue] : [];
      
      // Convert GitHub issues to our internal IssueContext format
      const issueContexts = allIssues.map((issue: GitHubIssue) => ({
        id: `github-${issue.id}`,
        number: issue.number,
        title: issue.title,
        body: issue.body ?? '',
        labels: issue.labels.map((label) => 
          typeof label === 'string' ? label : label.name
        ),
        assignees: issue.assignees?.map((assignee) => assignee.login) || [],
        repository: {
          owner,
          name: repo,
          fullName: repoFullName,
          defaultBranch: repoDetails.defaultBranch,
          language: repoDetails.language,
        },
        source: 'github',
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        metadata: {
          htmlUrl: issue.html_url,
          state: issue.state,
          locked: issue.locked,
          draft: issue.draft,
        },
      }));
      
      return issueContexts;
    }
    
    // Otherwise, get issues with either the configured label or 'rsolv' label
    const labels = [config.issueLabel];
    if (!config.issueLabel.includes('rsolv')) {
      labels.push('rsolv');
    }

    const allIssues: GitHubIssue[] = [];
    const seenIds = new Set<number>();
    const maxIssues = config.maxIssues;

    // Search for each label
    for (const label of labels) {
      // Calculate remaining issues needed
      const remainingIssues = maxIssues ? maxIssues - allIssues.length : undefined;

      // If we already have enough issues, skip this label
      if (remainingIssues === 0) {
        break;
      }

      const issues = await getIssuesWithLabel(owner, repo, label, remainingIssues);
      for (const issue of issues) {
        if (!seenIds.has(issue.id)) {
          seenIds.add(issue.id);
          allIssues.push(issue);

          // Stop if we've reached max_issues
          if (maxIssues && allIssues.length >= maxIssues) {
            break;
          }
        }
      }

      // Stop if we've reached max_issues
      if (maxIssues && allIssues.length >= maxIssues) {
        logger.info(`Reached max_issues limit of ${maxIssues}, stopping issue detection`);
        break;
      }
    }
    
    logger.info(`Found ${allIssues.length} issues with labels: ${labels.join(' or ')}`);
    
    // Convert GitHub issues to our internal IssueContext format
    const issueContexts = allIssues.map((issue: GitHubIssue) => ({
      id: `github-${issue.id}`,
      number: issue.number,
      title: issue.title,
      body: issue.body ?? '',
      labels: issue.labels.map((label) => 
        typeof label === 'string' ? label : label.name
      ),
      assignees: issue.assignees?.map((assignee) => assignee.login) || [],
      repository: {
        owner,
        name: repo,
        fullName: repoFullName,
        defaultBranch: repoDetails.defaultBranch,
        language: repoDetails.language,
      },
      source: 'github',
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      metadata: {
        htmlUrl: issue.html_url,
        state: issue.state,
        locked: issue.locked,
        draft: issue.draft,
      },
    }));
    
    return issueContexts;
  } catch (error) {
    logger.error('Error detecting issues', error);
    throw new Error(`Failed to detect issues: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Interface representing a GitHub issue returned from the API
 */
interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null | undefined;
  labels: Array<string | { name: string; [key: string]: any }>;
  assignees?: Array<{ login: string; [key: string]: any }>;
  created_at: string;
  updated_at: string;
  html_url: string;
  state: string;
  locked: boolean;
  draft?: boolean;
  pull_request?: any;
  [key: string]: any;
}

/**
 * Get issues with a specific label from GitHub
 */
async function getIssuesWithLabel(
  owner: string,
  repo: string,
  label: string,
  maxIssues?: number
): Promise<GitHubIssue[]> {
  try {
    const client = getGitHubClient();

    // Limit per_page to max_issues if specified to avoid fetching too many
    const perPage = maxIssues ? Math.min(maxIssues, 100) : 100;

    // Get open issues with the specified label
    const { data } = await client.issues.listForRepo({
      owner,
      repo,
      labels: label,
      state: 'open',
      per_page: perPage,
    });

    // Filter out pull requests (GitHub API returns both issues and PRs)
    const issues = data.filter((issue: any) => !issue.pull_request) as GitHubIssue[];

    // Apply max_issues limit if specified
    if (maxIssues && issues.length > maxIssues) {
      return issues.slice(0, maxIssues);
    }

    return issues;
  } catch (error) {
    logger.error(`Error getting issues with label ${label}`, error);
    throw new Error(`Failed to get issues with label: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get a specific issue by number
 */
async function getSpecificIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue | null> {
  try {
    const client = await getGitHubClient();
    
    const { data } = await client.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });
    
    // Check if it's a pull request
    if (data.pull_request) {
      logger.warn(`Issue #${issueNumber} is actually a pull request, skipping`);
      return null;
    }
    
    return data as GitHubIssue;
  } catch (error) {
    logger.error(`Error getting issue #${issueNumber}`, error);
    if ((error as any).status === 404) {
      logger.warn(`Issue #${issueNumber} not found`);
      return null;
    }
    throw new Error(`Failed to get issue: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * For testing purposes: simulate github issues
 */
export async function simulateGitHubIssues(count: number = 3): Promise<IssueContext[]> {
  logger.debug(`Simulating ${count} GitHub issues for development`);
  
  const issues: IssueContext[] = [];
  
  for (let i = 1; i <= count; i++) {
    const issueTypes = ['bug', 'feature', 'documentation', 'performance', 'refactoring'];
    const type = issueTypes[Math.floor(Math.random() * issueTypes.length)];
    
    issues.push({
      id: `github-${1000 + i}`,
      number: i,
      title: `[${type.toUpperCase()}] Test issue #${i} for simulation`,
      body: createSampleIssueBody(type, i),
      labels: ['rsolv:automate', type],
      assignees: ['rsolv-bot'],
      repository: {
        owner: 'rsolv-dev',
        name: 'demo-repo',
        fullName: 'rsolv-dev/demo-repo',
        defaultBranch: 'main',
        language: 'TypeScript',
      },
      source: 'github',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {
        htmlUrl: `https://github.com/rsolv-dev/demo-repo/issues/${i}`,
        state: 'open',
        locked: false,
        draft: false,
      },
    });
  }
  
  return issues;
}

/**
 * Create a sample issue body for simulation
 */
function createSampleIssueBody(type: string, id: number): string {
  switch (type) {
  case 'bug':
    return `## Description
There's a bug in the authentication system where users are getting logged out unexpectedly.

## Steps to Reproduce
1. Log in with valid credentials
2. Navigate to the settings page
3. Wait for 5 minutes without activity
4. Try to save changes

## Expected Behavior
The user should be able to save changes without being logged out.

## Actual Behavior
The user is logged out and changes are lost.

## Environment
- Browser: Chrome 98.0
- OS: Windows 10
- Device: Desktop

## Additional Context
This seems to happen more frequently when the user has multiple tabs open.

## Files to Check
- \`src/auth/session.ts\`
- \`src/utils/timeouts.ts\``;

  case 'feature':
    return `## Feature Request
Add support for dark mode in the web application.

## Why is this needed?
Many users work late at night and a dark mode would reduce eye strain.

## Proposed Solution
Add a toggle in the user settings page that allows switching between light and dark themes.

## Acceptance Criteria
- A toggle button in the user settings page
- Dark theme CSS for all major components
- Theme preference should be saved in user settings
- Theme should default to system preference when available

## Technical Details
We can use CSS variables to make the transition between themes smooth. Theme settings should be stored in localStorage and also in the user profile if they're logged in.

## Files to Modify
- \`src/styles/theme.css\`
- \`src/components/Settings.tsx\`
- \`src/utils/userPreferences.ts\``;

  case 'documentation':
    return `## Documentation Improvement
The API documentation for the authentication endpoints is incomplete and missing examples.

## What's Missing
- Code examples for login and registration endpoints
- Error response details
- Rate limiting information
- Authentication token format explanation

## Proposed Changes
Update the API documentation to include comprehensive examples and details for all authentication endpoints.

## Files to Update
- \`docs/api/authentication.md\`
- \`README.md\` (to update the quick start section)`;

  case 'performance':
    return `## Performance Issue
The data processing function in the analytics module is causing significant slowdowns when processing large datasets.

## Current Performance
With a dataset of 10,000 records, the processing takes about 15 seconds.

## Expected Performance
Should process 10,000 records in under 1 second.

## Profiling Results
The bottleneck appears to be in the data aggregation function, which is using a nested loop approach with O(n²) complexity.

## Suggested Approach
Refactor the aggregation function to use a hashmap-based approach which would reduce the complexity to O(n).

## Files to Optimize
- \`src/analytics/dataProcessor.ts\`
- \`src/utils/aggregation.ts\``;

  case 'refactoring':
    return `## Refactoring Request
The error handling in the API client is inconsistent and duplicated across multiple methods.

## Current Issues
- Each API method has its own error handling logic
- Some methods miss important error cases
- Error reporting format is inconsistent
- Duplicate try/catch blocks throughout the codebase

## Proposed Refactoring
Create a centralized error handling utility that can be used by all API methods to ensure consistent error processing and reporting.

## Files to Refactor
- \`src/api/client.ts\`
- \`src/utils/errors.ts\` (to be created)
- \`src/types/api.ts\` (to add error types)`;

  default:
    return `## Issue #${id}
This is a sample issue for testing purposes.

## Details
This is a simulated issue for development and testing of the RSOLV automation system.

## Files
- \`src/index.ts\`
- \`src/utils/helper.ts\``;
  }
}