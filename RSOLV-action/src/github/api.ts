import { Octokit } from '@octokit/rest';
import { ActionConfig } from '../types/index.js';
import { logger } from '../utils/logger.js';

let githubClient: Octokit | null = null;

/**
 * Get or create a GitHub API client
 */
export function getGitHubClient(config?: ActionConfig): Octokit {
  if (githubClient) {
    return githubClient;
  }
  
  // Create new GitHub client
  const token = config?.repoToken || process.env.GITHUB_TOKEN;
  
  if (!token) {
    logger.error('No GitHub token found');
    throw new Error('No GitHub token found. Please set GITHUB_TOKEN environment variable or provide repoToken in config.');
  }
  
  githubClient = new Octokit({
    auth: token,
    timeZone: 'UTC',
  });
  
  logger.debug('GitHub API client created');
  
  return githubClient;
}

/**
 * Get repository details
 */
export async function getRepositoryDetails(owner: string, repo: string): Promise<any> {
  try {
    const client = getGitHubClient();
    
    const { data } = await client.repos.get({
      owner,
      repo,
    });
    
    return {
      id: data.id,
      name: data.name,
      fullName: data.full_name,
      owner: data.owner.login,
      defaultBranch: data.default_branch,
      language: data.language,
      private: data.private,
    };
  } catch (error) {
    logger.error(`Error getting repository details for ${owner}/${repo}`, error);
    throw new Error(`Failed to get repository details: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get an issue from GitHub
 */
export async function getIssue(
  owner: string,
  repo: string,
  issueNumber: number
): Promise<any> {
  try {
    const client = getGitHubClient();
    
    const { data } = await client.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });
    
    return {
      id: data.id.toString(),
      number: data.number,
      title: data.title,
      body: data.body || '',
      labels: data.labels.map(label => 
        typeof label === 'string' ? label : label.name || ''
      ),
      assignees: data.assignees?.map(a => a.login) || [],
      repository: {
        owner,
        name: repo,
        fullName: `${owner}/${repo}`,
        defaultBranch: 'main' // Would need separate API call to get this
      },
      source: 'github',
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      metadata: {
        state: data.state,
        user: data.user?.login
      }
    };
  } catch (error) {
    logger.error(`Error getting issue #${issueNumber} from ${owner}/${repo}`, error);
    return null;
  }
}

/**
 * Create a comment on an issue
 */
export async function createIssueComment(
  owner: string, 
  repo: string, 
  issueNumber: number, 
  body: string
): Promise<void> {
  try {
    const client = getGitHubClient();
    
    await client.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });
    
    logger.info(`Comment created on issue #${issueNumber}`);
  } catch (error) {
    logger.error(`Error creating comment on issue #${issueNumber}`, error);
    throw new Error(`Failed to create issue comment: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create or update a file in a repository
 */
export async function createOrUpdateFile(
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string
): Promise<void> {
  try {
    const client = getGitHubClient();
    
    // Check if file exists
    let sha: string | undefined;
    try {
      const { data } = await client.repos.getContent({
        owner,
        repo,
        path,
        ref: branch,
      });
      
      if (!Array.isArray(data)) {
        sha = data.sha;
      }
    } catch (error) {
      // File doesn't exist, which is fine
      logger.debug(`File ${path} doesn't exist, will create it`);
    }
    
    // Create or update file
    await client.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content: Buffer.from(content).toString('base64'),
      branch,
      sha,
    });
    
    logger.info(`File ${path} created or updated on branch ${branch}`);
  } catch (error) {
    logger.error(`Error creating or updating file ${path}`, error);
    throw new Error(`Failed to create or update file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create a branch in a repository
 */
export async function createBranch(
  owner: string,
  repo: string,
  branchName: string,
  fromBranch?: string
): Promise<void> {
  try {
    const client = getGitHubClient();
    
    // Get the SHA of the latest commit on the base branch
    const baseBranch = fromBranch || 'main';
    
    const { data: refData } = await client.git.getRef({
      owner,
      repo,
      ref: `heads/${baseBranch}`,
    });
    
    // Create the new branch
    await client.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: refData.object.sha,
    });
    
    logger.info(`Branch ${branchName} created from ${baseBranch}`);
  } catch (error) {
    logger.error(`Error creating branch ${branchName}`, error);
    throw new Error(`Failed to create branch: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create a pull request
 */
export async function createPullRequest(
  owner: string,
  repo: string,
  title: string,
  body: string,
  head: string,
  base: string = 'main'
): Promise<{ number: number; html_url: string }> {
  try {
    const client = getGitHubClient();
    
    const { data } = await client.pulls.create({
      owner,
      repo,
      title,
      body,
      head,
      base,
    });
    
    logger.info(`Pull request #${data.number} created: ${data.html_url}`);
    
    return {
      number: data.number,
      html_url: data.html_url,
    };
  } catch (error) {
    logger.error('Error creating pull request', error);
    throw new Error(`Failed to create pull request: ${error instanceof Error ? error.message : String(error)}`);
  }
}
// Helper functions for ValidationEnricher
export async function updateIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  updates: { body?: string; title?: string; state?: string }
): Promise<void> {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `token ${process.env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });
  
  if (!response.ok) {
    throw new Error(`Failed to update issue: ${response.statusText}`);
  }
}

export async function addLabels(
  owner: string,
  repo: string,
  issueNumber: number,
  labels: string[]
): Promise<void> {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/labels`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `token ${process.env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ labels })
  });

  if (!response.ok) {
    throw new Error(`Failed to add labels: ${response.statusText}`);
  }
}

export async function removeLabel(
  owner: string,
  repo: string,
  issueNumber: number,
  label: string
): Promise<void> {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `token ${process.env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (!response.ok && response.status !== 404) {
    // 404 is ok - label was already removed
    throw new Error(`Failed to remove label: ${response.statusText}`);
  }
}
