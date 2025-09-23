import { ActionConfig, IssueContext } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { detectIssues as detectGitHubIssues } from '../github/issues.js';
import { PlatformFactory } from './platform-factory.js';
import type { PlatformConfig, UnifiedIssue } from './types.js';

/**
 * Detect issues from all configured platforms
 */
export async function detectIssuesFromAllPlatforms(config: ActionConfig): Promise<IssueContext[]> {
  const allIssues: IssueContext[] = [];
  const maxIssues = config.maxIssues;

  // Always check GitHub (default behavior)
  try {
    const githubIssues = await detectGitHubIssues(config);
    allIssues.push(...githubIssues);
    logger.info(`Found ${githubIssues.length} GitHub issues`);

    // If we already have enough issues, return early
    if (maxIssues && allIssues.length >= maxIssues) {
      logger.info(`Limiting to first ${maxIssues} issues (max_issues: ${maxIssues})`);
      return allIssues.slice(0, maxIssues);
    }
  } catch (error) {
    logger.error('Error detecting GitHub issues', error);
  }

  // Check Jira if configured (only if we need more issues)
  if (process.env.JIRA_HOST && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN) {
    if (!maxIssues || allIssues.length < maxIssues) {
      try {
        const jiraIssues = await detectJiraIssues(config);
        allIssues.push(...jiraIssues);
        logger.info(`Found ${jiraIssues.length} Jira issues`);

        // Check again if we have enough issues
        if (maxIssues && allIssues.length >= maxIssues) {
          logger.info(`Limiting to first ${maxIssues} issues (max_issues: ${maxIssues})`);
          return allIssues.slice(0, maxIssues);
        }
      } catch (error) {
        logger.error('Error detecting Jira issues', error);
      }
    }
  }

  // Check Linear if configured (only if we need more issues)
  if (process.env.LINEAR_API_KEY) {
    if (!maxIssues || allIssues.length < maxIssues) {
      try {
        const linearIssues = await detectLinearIssues(config);
        allIssues.push(...linearIssues);
        logger.info(`Found ${linearIssues.length} Linear issues`);

        // Check again if we have enough issues
        if (maxIssues && allIssues.length >= maxIssues) {
          logger.info(`Limiting to first ${maxIssues} issues (max_issues: ${maxIssues})`);
          return allIssues.slice(0, maxIssues);
        }
      } catch (error) {
        logger.error('Error detecting Linear issues', error);
      }
    }
  }

  // Check GitLab if configured (future)
  if (process.env.GITLAB_TOKEN) {
    logger.info('GitLab integration not yet implemented');
  }

  logger.info(`Total issues found across all platforms: ${allIssues.length}`);

  // Final limiting if needed
  if (maxIssues && allIssues.length > maxIssues) {
    logger.info(`Limiting to first ${maxIssues} issues (max_issues: ${maxIssues})`);
    return allIssues.slice(0, maxIssues);
  }

  return allIssues;
}

/**
 * Detect Jira issues
 */
async function detectJiraIssues(_config: ActionConfig): Promise<IssueContext[]> {
  const platformConfig: PlatformConfig = {
    jira: {
      host: process.env.JIRA_HOST!,
      email: process.env.JIRA_EMAIL!,
      apiToken: process.env.JIRA_API_TOKEN!,
      autofixLabel: process.env.JIRA_AUTOFIX_LABEL || 'autofix',
      rsolvLabel: process.env.JIRA_RSOLV_LABEL || 'rsolv'
    }
  };
  
  const adapter = PlatformFactory.create('jira', platformConfig);
  
  // Use custom JQL if provided, otherwise search for both labels
  let jiraIssues: UnifiedIssue[];
  if (process.env.JIRA_JQL) {
    // Cast to JiraAdapter to access searchIssues method
    const jiraAdapter = adapter as any;
    jiraIssues = await jiraAdapter.searchIssues(process.env.JIRA_JQL);
  } else {
    // Use the new method that searches for both labels
    jiraIssues = await adapter.searchRsolvIssues();
  }
  
  logger.info(`Found ${jiraIssues.length} Jira issues with rsolv/autofix labels`);
  
  // Convert Jira issues to IssueContext format
  return jiraIssues.map(issue => convertToIssueContext(issue));
}

/**
 * Detect Linear issues
 */
async function detectLinearIssues(_config: ActionConfig): Promise<IssueContext[]> {
  const platformConfig: PlatformConfig = {
    linear: {
      apiKey: process.env.LINEAR_API_KEY!,
      teamId: process.env.LINEAR_TEAM_ID,
      autofixLabel: process.env.LINEAR_AUTOFIX_LABEL || 'autofix',
      rsolvLabel: process.env.LINEAR_RSOLV_LABEL || 'rsolv'
    }
  };
  
  const adapter = PlatformFactory.create('linear', platformConfig);
  const linearIssues = await adapter.searchRsolvIssues();
  
  logger.info(`Found ${linearIssues.length} Linear issues with rsolv/autofix labels`);
  
  // Convert Linear issues to IssueContext format
  return linearIssues.map(issue => convertToIssueContext(issue));
}

/**
 * Convert UnifiedIssue to IssueContext format
 */
function convertToIssueContext(issue: UnifiedIssue): IssueContext {
  // Extract repository info from issue description or custom fields
  // This is a simplified version - in production, you'd parse the issue
  // to find GitHub repo references
  const repoInfo = extractRepositoryInfo(issue);
  
  return {
    id: issue.id,
    number: parseInt(issue.key?.split('-')[1] || '0'),
    title: issue.title,
    body: issue.description,
    labels: issue.labels,
    assignees: issue.assignee ? [typeof issue.assignee === 'string' ? issue.assignee : issue.assignee.name] : [],
    repository: repoInfo || {
      owner: 'unknown',
      name: 'unknown',
      fullName: 'unknown/unknown',
      defaultBranch: 'main',
      language: 'unknown'
    },
    source: issue.platform,
    createdAt: issue.createdAt.toISOString(),
    updatedAt: issue.updatedAt.toISOString(),
    metadata: {
      htmlUrl: issue.url,
      state: issue.status,
      locked: false,
      draft: false,
      platformKey: issue.key
    }
  };
}

/**
 * Extract repository information from issue content
 */
function extractRepositoryInfo(issue: UnifiedIssue): IssueContext['repository'] | null {
  // Look for GitHub URLs in the issue description
  const githubUrlPattern = /https?:\/\/github\.com\/([^/]+)\/([^/\s]+)/g;
  const match = githubUrlPattern.exec(issue.description);
  
  if (match) {
    const [, owner, name] = match;
    return {
      owner,
      name,
      fullName: `${owner}/${name}`,
      defaultBranch: 'main', // Would need to fetch this from GitHub API
      language: 'unknown' // Would need to fetch this from GitHub API
    };
  }
  
  // Check custom fields if available
  if (issue.customFields?.githubRepository) {
    const [owner, name] = issue.customFields.githubRepository.split('/');
    return {
      owner,
      name,
      fullName: issue.customFields.githubRepository,
      defaultBranch: issue.customFields.githubDefaultBranch || 'main',
      language: issue.customFields.githubLanguage || 'unknown'
    };
  }
  
  return null;
}