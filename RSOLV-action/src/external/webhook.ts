import { IssueContext, ActionConfig } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * Handle webhook data from external issue trackers
 */
export async function handleExternalWebhook(
  payload: any,
  source: string,
  _config: ActionConfig
): Promise<IssueContext[]> {
  try {
    logger.info(`Processing webhook from ${source}`);
    
    switch (source.toLowerCase()) {
    case 'jira':
      return handleJiraWebhook(payload, _config);
    case 'linear':
      return handleLinearWebhook(payload, _config);
    default:
      logger.warn(`Unsupported external source: ${source}`);
      return [];
    }
  } catch (error) {
    logger.error(`Error handling webhook from ${source}`, error);
    throw new Error(`Webhook processing failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Handle webhook data from Jira
 */
async function handleJiraWebhook(
  payload: any,
  config: ActionConfig
): Promise<IssueContext[]> {
  try {
    logger.info('Processing Jira webhook');
    
    // Validate webhook payload
    if (!payload.issue) {
      logger.warn('Invalid Jira webhook payload: missing issue data');
      return [];
    }
    
    const issue = payload.issue;
    const projectKey = issue.fields?.project?.key;
    const issueKey = issue.key;
    
    if (!projectKey || !issueKey) {
      logger.warn('Invalid Jira issue data: missing project key or issue key');
      return [];
    }
    
    // Check if issue has automation label
    const labels = issue.fields?.labels || [];
    const hasAutomationLabel = labels.some((label: string) => 
      label.toLowerCase() === config.issueLabel.toLowerCase()
    );
    
    if (!hasAutomationLabel) {
      logger.debug(`Jira issue ${issueKey} does not have automation label, skipping`);
      return [];
    }
    
    // Convert Jira issue to our internal format
    const issueContext: IssueContext = {
      id: `jira-${issue.id}`,
      number: parseInt(issueKey.split('-')[1], 10),
      title: issue.fields?.summary || '',
      body: issue.fields?.description || '',
      labels: labels,
      assignees: issue.fields?.assignee ? [issue.fields.assignee.displayName] : [],
      repository: {
        owner: projectKey,
        name: issue.fields?.project?.name || '',
        fullName: `${projectKey}/${issue.fields?.project?.name || ''}`,
        defaultBranch: 'main',
        language: ''
      },
      source: 'jira',
      createdAt: issue.fields?.created || '',
      updatedAt: issue.fields?.updated || '',
      metadata: {
        status: issue.fields?.status?.name || '',
        priority: issue.fields?.priority?.name || '',
        issueType: issue.fields?.issuetype?.name || '',
        jiraUrl: `${process.env.JIRA_BASE_URL || 'https://jira.atlassian.com'}/browse/${issueKey}`,
      }
    };
    
    logger.info(`Processed Jira issue ${issueKey}`);
    return [issueContext];
  } catch (error) {
    logger.error('Error processing Jira webhook', error);
    return [];
  }
}

/**
 * Handle webhook data from Linear
 */
async function handleLinearWebhook(
  payload: any,
  config: ActionConfig
): Promise<IssueContext[]> {
  try {
    logger.info('Processing Linear webhook');
    
    // Validate webhook payload
    if (!payload.data || !payload.data.id) {
      logger.warn('Invalid Linear webhook payload: missing issue data');
      return [];
    }
    
    const issue = payload.data;
    const teamKey = issue.team?.key || 'TEAM';
    const issueKey = `${teamKey}-${issue.number}`;
    
    // Check if issue has automation label
    const labels = issue.labels?.nodes?.map((label: any) => label.name) || [];
    const hasAutomationLabel = labels.some((label: string) => 
      label.toLowerCase() === config.issueLabel.toLowerCase()
    );
    
    if (!hasAutomationLabel) {
      logger.debug(`Linear issue ${issueKey} does not have automation label, skipping`);
      return [];
    }
    
    // Convert Linear issue to our internal format
    const issueContext: IssueContext = {
      id: `linear-${issue.id}`,
      number: issue.number,
      title: issue.title || '',
      body: issue.description || '',
      labels: labels,
      assignees: issue.assignee ? [issue.assignee.name] : [],
      repository: {
        owner: teamKey,
        name: issue.team?.name || '',
        fullName: `${teamKey}/${issue.team?.name || ''}`,
        defaultBranch: 'main',
        language: ''
      },
      source: 'linear',
      createdAt: issue.createdAt || '',
      updatedAt: issue.updatedAt || '',
      metadata: {
        status: issue.state?.name || '',
        priority: issue.priority ? linearPriorityToString(issue.priority) : '',
        linearUrl: issue.url || '',
      }
    };
    
    logger.info(`Processed Linear issue ${issueKey}`);
    return [issueContext];
  } catch (error) {
    logger.error('Error processing Linear webhook', error);
    return [];
  }
}

/**
 * Convert Linear priority to string
 */
function linearPriorityToString(priority: number): string {
  switch (priority) {
  case 0:
    return 'No priority';
  case 1:
    return 'Urgent';
  case 2:
    return 'High';
  case 3:
    return 'Medium';
  case 4:
    return 'Low';
  default:
    return 'Unknown';
  }
}

/**
 * Get repository information from external issue
 */
export async function getRepositoryFromExternalIssue(
  issueContext: IssueContext,
  _config: ActionConfig
): Promise<{ owner: string; repo: string; defaultBranch: string } | null> {
  try {
    logger.info(`Getting repository info for ${issueContext.source} issue ${issueContext.id}`);
    
    // Check if repository mapping is provided in environment variables
    const mappingEnvVar = `RSOLV_REPOSITORY_MAPPING_${issueContext.repository.owner}`;
    const mapping = process.env[mappingEnvVar];
    
    if (mapping) {
      try {
        const repoInfo = JSON.parse(mapping);
        logger.info(`Found repository mapping for ${issueContext.repository.owner}: ${repoInfo.owner}/${repoInfo.repo}`);
        return {
          owner: repoInfo.owner,
          repo: repoInfo.repo,
          defaultBranch: repoInfo.defaultBranch || 'main'
        };
      } catch (error) {
        logger.error(`Error parsing repository mapping for ${issueContext.repository.owner}`, error);
      }
    }
    
    // If no mapping is found, return default based on issue source
    switch (issueContext.source) {
    case 'jira':
      return {
        owner: process.env.JIRA_GITHUB_OWNER || '',
        repo: process.env.JIRA_GITHUB_REPO || '',
        defaultBranch: process.env.JIRA_GITHUB_BRANCH || 'main'
      };
    case 'linear':
      return {
        owner: process.env.LINEAR_GITHUB_OWNER || '',
        repo: process.env.LINEAR_GITHUB_REPO || '',
        defaultBranch: process.env.LINEAR_GITHUB_BRANCH || 'main'
      };
    default:
      return null;
    }
  } catch (error) {
    logger.error(`Error getting repository for external issue ${issueContext.id}`, error);
    return null;
  }
}