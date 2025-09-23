/**
 * Git-based PR creation that uses actual git commits
 * instead of creating file changes programmatically
 */
import { IssueContext, ActionConfig, AnalysisData } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { getGitHubClient } from './api.js';
import { execSync } from 'child_process';
import { RsolvApiClient } from '../external/api-client.js';

/**
 * Result of git-based PR creation
 */
export interface GitPrResult {
  success: boolean;
  message: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  branchName?: string;
  commitHash?: string;
  error?: string;
}

/**
 * Create a pull request from git commits
 */
export async function createPullRequestFromGit(
  issue: IssueContext,
  commitHash: string,
  summary: {
    title: string;
    description: string;
    securityImpact?: string;
    tests?: string[];
  },
  config: ActionConfig,
  diffStats?: {
    insertions: number;
    deletions: number;
    filesChanged: number;
  }
): Promise<GitPrResult> {
  try {
    logger.info(`Creating pull request from commit ${commitHash.substring(0, 8)} for issue #${issue.number}`);
    
    // 1. Create and push branch with the commit
    const branchName = `rsolv/fix-issue-${issue.number}`;
    const pushResult = await pushCommitToBranch(commitHash, branchName, config);
    
    if (!pushResult.success) {
      return {
        success: false,
        message: 'Failed to push changes',
        error: pushResult.error
      };
    }
    
    // 2. Generate comprehensive PR description
    const prBody = generateGitPrDescription(issue, summary, diffStats);
    
    // 3. Create the pull request
    const github = getGitHubClient();
    const [owner, repo] = issue.repository.fullName.split('/');
    
    try {
      const { data: pullRequest } = await github.pulls.create({
        owner,
        repo,
        title: `[RSOLV] ${summary.title} (fixes #${issue.number})`,
        body: prBody,
        head: branchName,
        base: issue.repository.defaultBranch || 'main',
        maintainer_can_modify: true
      });
      
      logger.info(`Created pull request #${pullRequest.number}: ${pullRequest.html_url}`);
      
      // 4. Track in RSOLV API if configured
      if (config.rsolvApiKey) {
        try {
          const apiClient = new RsolvApiClient(config.rsolvApiKey);
          await apiClient.createFixAttempt({
            issueId: issue.id,
            issueNumber: issue.number,
            repository: issue.repository.fullName,
            pullRequestUrl: pullRequest.html_url,
            pullRequestNumber: pullRequest.number,
            branchName,
            commitHash
          });
          logger.info('Tracked fix attempt in RSOLV API');
        } catch (apiError) {
          logger.warn('Failed to track fix attempt in RSOLV API', apiError);
        }
      }
      
      return {
        success: true,
        message: `Created pull request #${pullRequest.number}`,
        pullRequestUrl: pullRequest.html_url,
        pullRequestNumber: pullRequest.number,
        branchName,
        commitHash
      };
      
    } catch (error) {
      // Check if PR already exists
      if ((error as any).status === 422 && (error as any).message?.includes('pull request already exists')) {
        logger.warn('Pull request already exists for this branch');
        
        // Try to find the existing PR
        const { data: pulls } = await github.pulls.list({
          owner,
          repo,
          head: `${owner}:${branchName}`,
          state: 'open'
        });
        
        if (pulls.length > 0) {
          const existingPr = pulls[0];
          return {
            success: true,
            message: `Pull request already exists: #${existingPr.number}`,
            pullRequestUrl: existingPr.html_url,
            pullRequestNumber: existingPr.number,
            branchName,
            commitHash
          };
        }
      }
      
      throw error;
    }
    
  } catch (error) {
    logger.error('Failed to create pull request from git', error);
    return {
      success: false,
      message: 'Failed to create pull request',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Push commit to a new branch
 */
async function pushCommitToBranch(
  commitHash: string,
  branchName: string,
  config: ActionConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    // Create branch from commit
    execSync(`git checkout -b ${branchName} ${commitHash}`, {
      encoding: 'utf-8'
    });
    
    logger.info(`Created branch ${branchName} from commit ${commitHash.substring(0, 8)}`);
    
    // Push the branch
    execSync(`git push origin ${branchName}`, {
      encoding: 'utf-8'
    });
    
    logger.info(`Pushed branch ${branchName} to origin`);
    
    // Switch back to main branch
    execSync(`git checkout -`, {
      encoding: 'utf-8'
    });
    
    return { success: true };
    
  } catch (error) {
    logger.error('Failed to push branch', error);
    
    // Try to clean up
    try {
      execSync('git checkout -', { encoding: 'utf-8' });
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Generate PR description for git-based fixes
 */
function generateGitPrDescription(
  issue: IssueContext,
  summary: {
    title: string;
    description: string;
    securityImpact?: string;
    tests?: string[];
    vulnerabilityDetails?: {
      type: string;
      severity: string;
      cwe?: string;
    };
  },
  diffStats?: {
    insertions: number;
    deletions: number;
    filesChanged: number;
  }
): string {
  const sections: string[] = [];
  
  // Header
  sections.push(`# ${summary.title}\n`);
  sections.push(`**Fixes:** #${issue.number}\n`);
  
  // Summary
  sections.push('## Summary\n');
  sections.push(summary.description);
  sections.push('');
  
  // Changes Made
  if (diffStats && diffStats.filesChanged > 0) {
    sections.push('## Changes Made\n');
    sections.push(`- **Files Changed:** ${diffStats.filesChanged}`);
    sections.push(`- **Lines Added:** ${diffStats.insertions}`);
    sections.push(`- **Lines Removed:** ${diffStats.deletions}`);
    sections.push('');
  }
  
  // Security Details
  if (summary.vulnerabilityDetails) {
    sections.push('## Security Details\n');
    sections.push(`- **Vulnerability Type:** ${summary.vulnerabilityDetails.type}`);
    sections.push(`- **Severity:** ${summary.vulnerabilityDetails.severity}`);
    if (summary.vulnerabilityDetails.cwe) {
      sections.push(`- **CWE:** ${summary.vulnerabilityDetails.cwe}`);
    }
    sections.push('');
  }
  
  // Security Impact
  if (summary.securityImpact) {
    sections.push('## Security Impact\n');
    sections.push(summary.securityImpact);
    sections.push('');
  }
  
  // Testing
  if (summary.tests && summary.tests.length > 0) {
    sections.push('## Testing Instructions\n');
    summary.tests.forEach((test, index) => {
      sections.push(`${index + 1}. ${test}`);
    });
    sections.push('');
  }
  
  // Review Checklist
  sections.push('## Review Checklist\n');
  sections.push('- [ ] Changes fix the reported vulnerability');
  sections.push('- [ ] No new vulnerabilities introduced');
  sections.push('- [ ] Existing functionality preserved');
  sections.push('- [ ] Code follows project conventions');
  sections.push('- [ ] Tests pass (if applicable)');
  sections.push('');
  
  // Footer
  sections.push('---\n');
  sections.push('This PR was automatically generated by [RSOLV](https://rsolv.dev) using direct file editing.');
  sections.push(`Issue: #${issue.number}`);
  
  return sections.join('\n');
}