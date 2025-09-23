import { IssueContext, ActionConfig, AnalysisData } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { getGitHubClient } from './api.js';
import { buildPrDescriptionPrompt } from '../ai/prompts.js';
import { getAiClient } from '../ai/client.js';
import { CompleteExplanation } from '../security/explanation-framework.js';
import { RsolvApiClient } from '../external/api-client.js';

/**
 * Result of PR creation
 */
export interface PrResult {
  success: boolean;
  message: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  error?: string;
}

/**
 * Create a pull request with the generated solution
 */
export async function createPullRequest(
  issue: IssueContext,
  changes: Record<string, string>,
  analysisData: AnalysisData,
  config: ActionConfig,
  securityAnalysis?: any,
  explanations?: CompleteExplanation
): Promise<PrResult> {
  try {
    logger.info(`Creating pull request for issue #${issue.number}`);
    
    // 1. Create a new branch for the changes
    const branchName = await createBranch(issue);
    
    // 2. Apply changes to the branch
    await applyChanges(branchName, changes, issue);
    
    // 3. Generate pull request description with AI
    const prDescription = await generatePrDescription(issue, analysisData, changes, config, securityAnalysis, explanations);
    
    // 4. Create pull request
    const prResult = await createGitHubPR(
      issue,
      branchName,
      prDescription,
      analysisData,
      config
    );
    
    logger.info(`Successfully created PR #${prResult.pullRequestNumber} for issue #${issue.number}`);
    return prResult;
  } catch (error) {
    logger.error(`Error creating pull request for issue #${issue.number}`, error);
    return {
      success: false,
      message: `Error creating pull request: ${error instanceof Error ? error.message : String(error)}`,
      error: String(error)
    };
  }
}

/**
 * Create a new branch for the changes
 */
async function createBranch(issue: IssueContext): Promise<string> {
  // Create a branch name based on the issue
  const safeIssueName = issue.title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s]+/g, '-')
    .substring(0, 30);
  
  const branchName = `rsolv/${issue.number}-${safeIssueName}`;
  
  try {
    logger.info(`Creating branch: ${branchName}`);
    
    // Get GitHub client
    const github = getGitHubClient();
    const { owner, name: repo } = issue.repository;
    
    
    try {
      // Create branch using GitHub API
      await github.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: await getDefaultBranchSha(owner, repo, issue.repository.defaultBranch)
      });
      
      logger.info(`Branch ${branchName} created successfully`);
    } catch (error: any) {
      // Check if branch already exists (422 error)
      if (error.status === 422) {
        logger.warn(`Branch ${branchName} already exists, using existing branch`);
      } else {
        throw error;
      }
    }
    
    return branchName;
  } catch (error) {
    logger.error(`Error creating branch ${branchName}`, error);
    
    
    throw new Error(`Failed to create branch: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get the SHA of the default branch
 */
async function getDefaultBranchSha(owner: string, repo: string, defaultBranch: string): Promise<string> {
  try {
    const github = getGitHubClient();
    
    // Get the reference to the default branch
    const { data } = await github.git.getRef({
      owner,
      repo,
      ref: `heads/${defaultBranch}`
    });
    
    return data.object.sha;
  } catch (error) {
    logger.error(`Error getting SHA for ${defaultBranch}`, error);
    throw new Error(`Failed to get SHA for ${defaultBranch}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Apply changes to the branch
 */
async function applyChanges(
  branchName: string,
  changes: Record<string, string>,
  issue: IssueContext
): Promise<void> {
  try {
    logger.info(`Applying ${Object.keys(changes).length} file changes to branch ${branchName}`);
    
    // Get GitHub client
    const github = getGitHubClient();
    const { owner, name: repo } = issue.repository;
    
    
    // Process files in batches to avoid rate limiting
    const batchSize = 5;
    const filePaths = Object.keys(changes);
    
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      
      // Update files in parallel
      await Promise.all(batch.map(async (filePath) => {
        try {
          // Get current file content to check if it exists
          let sha: string | undefined;
          try {
            const response = await github.repos.getContent({
              owner,
              repo,
              path: filePath,
              ref: branchName
            });
            
            // If response is not an array, it's a file and we need its SHA
            if (!Array.isArray(response.data)) {
              sha = response.data.sha;
            }
          } catch (error: any) {
            // 404 error means file doesn't exist yet, which is fine
            if (error.status !== 404) {
              throw error;
            }
          }
          
          // Create or update the file
          await github.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: filePath,
            message: `Update ${filePath} for issue #${issue.number}`,
            content: Buffer.from(changes[filePath]).toString('base64'),
            branch: branchName,
            sha
          });
          
          logger.debug(`Updated file: ${filePath}`);
        } catch (error) {
          logger.error(`Error updating file ${filePath}`, error);
          throw error;
        }
      }));
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < filePaths.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    logger.info('All changes applied successfully');
  } catch (error) {
    logger.error('Error applying changes to branch', error);
    
    
    throw new Error(`Failed to apply changes: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generate pull request description with AI
 */
async function generatePrDescription(
  issue: IssueContext,
  analysisData: AnalysisData,
  changes: Record<string, string>,
  config: ActionConfig,
  securityAnalysis?: any,
  explanations?: CompleteExplanation
): Promise<string> {
  try {
    logger.info(`Generating PR description for issue #${issue.number}`);
    
    // Get AI client
    const aiClient = await getAiClient(config.aiProvider);
    
    // Build PR description prompt
    const prompt = buildPrDescriptionPrompt(issue, analysisData, changes);
    
    // Generate PR description (using STANDARD token limit for concise descriptions)
    const response = await aiClient.complete(prompt, {
      temperature: 0.3,
      // maxTokens omitted - resolves to STANDARD (4000) for PR descriptions
      model: config.aiProvider.model
    });
    
    // Parse PR description from response
    let prDescription = response;
    
    // Add security analysis if available
    if (securityAnalysis && securityAnalysis.vulnerabilities && securityAnalysis.vulnerabilities.length > 0) {
      prDescription += '\n\n## 🔒 Security Fixes\n\nThis PR addresses the following security vulnerabilities:\n\n';
      
      securityAnalysis.vulnerabilities.forEach((vuln: any) => {
        prDescription += `- **${vuln.severity}**: ${vuln.type} in \`${vuln.file}:${vuln.line}\`\n`;
        prDescription += `  - Risk: ${vuln.risk}\n`;
        prDescription += `  - Fixed by: ${vuln.recommendation}\n\n`;
      });
      
      prDescription += '\n### Security Impact\n';
      prDescription += `- **Vulnerabilities Fixed**: ${securityAnalysis.vulnerabilities.length}\n`;
      prDescription += `- **Risk Level**: ${securityAnalysis.riskLevel || 'Medium'}\n`;
      prDescription += '- **Compliance**: OWASP Top 10 coverage\n';
    }
    
    // Add three-tier explanations if available
    if (explanations) {
      logger.info('Including three-tier explanations in PR description');
      
      prDescription += '\n\n## 📚 Educational Explanations\n\n';
      
      // Add business-level explanation summary
      const business = explanations.businessLevelExplanation;
      prDescription += '### Executive Summary\n\n';
      prDescription += `**Risk Score**: ${business.riskScore}/100\n\n`;
      prDescription += `${business.content}\n\n`;
      
      // Add key business impacts
      prDescription += '**Key Business Impacts:**\n';
      prDescription += `- 💰 Financial: ${business.businessImpact.financialImpact}\n`;
      prDescription += `- 🏢 Reputation: ${business.businessImpact.reputationalDamage}\n`;
      prDescription += `- 📊 Operations: ${business.businessImpact.operationalDisruption}\n`;
      prDescription += `- 🔒 Data: ${business.businessImpact.dataLoss}\n\n`;
      
      // Add priority recommendations
      if (business.priorities.length > 0) {
        prDescription += '**Recommended Actions:**\n';
        business.priorities.forEach(priority => {
          prDescription += `- ${priority}\n`;
        });
        prDescription += '\n';
      }
      
      // Add a link to view full explanations
      prDescription += '<details>\n<summary>View detailed technical explanations</summary>\n\n';
      
      // Add concept-level explanations  
      if (explanations.conceptLevelExplanations.length > 0) {
        prDescription += '### Security Concepts\n\n';
        explanations.conceptLevelExplanations.forEach(concept => {
          prDescription += `**${concept.title}**\n`;
          prDescription += `${concept.content}\n\n`;
          if (concept.preventionMethods.length > 0) {
            prDescription += 'Prevention methods:\n';
            concept.preventionMethods.forEach(method => {
              prDescription += `- ${method}\n`;
            });
            prDescription += '\n';
          }
        });
      }
      
      prDescription += '</details>\n';
    }
    
    prDescription += `\n\nThis PR was automatically generated by [RSOLV](https://rsolv.dev) to address issue #${issue.number}.`;
    
    return prDescription;
  } catch (error) {
    logger.error('Error generating PR description', error);
    
    // Fallback to a basic PR description
    return `Fix for issue #${issue.number}\n\nThis PR addresses the issue "${issue.title}" by making changes to ${Object.keys(changes).length} files.\n\nThis PR was automatically generated by [RSOLV](https://rsolv.dev).`;
  }
}

/**
 * Create a pull request on GitHub
 */
async function createGitHubPR(
  issue: IssueContext,
  branchName: string,
  prDescription: string,
  analysisData: AnalysisData,
  config: ActionConfig
): Promise<PrResult> {
  try {
    // Generate PR title based on issue
    const prTitle = `[RSOLV] ${issue.title} (fixes #${issue.number})`;
    
    logger.info(`Creating PR: ${prTitle}`);
    
    // Get GitHub client
    const github = getGitHubClient();
    const { owner, name: repo } = issue.repository;
    
    
    // Create the pull request using GitHub API
    const { data } = await github.pulls.create({
      owner,
      repo,
      title: prTitle,
      body: prDescription,
      head: branchName,
      base: issue.repository.defaultBranch,
      draft: false, // Set to true if you want to create draft PRs
    });
    
    logger.info(`Pull request created: ${data.html_url}`);
    
    // Add labels to the PR based on the issue type
    await github.issues.addLabels({
      owner,
      repo,
      issue_number: data.number,
      labels: ['rsolv:automated', `type:${analysisData.issueType}`]
    });
    
    // Add a comment to the original issue linking to the PR
    await github.issues.createComment({
      owner,
      repo,
      issue_number: issue.number,
      body: `I've created a pull request to address this issue: ${data.html_url}\n\nThis was automatically generated by [RSOLV](https://rsolv.dev).`
    });
    
    // Record fix attempt for billing
    await recordFixAttempt(issue, data, prTitle, config);
    
    return {
      success: true,
      message: 'Pull request created successfully',
      pullRequestUrl: data.html_url,
      pullRequestNumber: data.number
    };
  } catch (error) {
    logger.error('Error creating GitHub PR', error);
    
        
    throw new Error(`Failed to create GitHub PR: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Record fix attempt for billing tracking
 */
async function recordFixAttempt(
  issue: IssueContext,
  prData: any,
  prTitle: string,
  config: ActionConfig
): Promise<void> {
  try {

    // Check if API URL and key are configured
    const apiUrl = process.env.RSOLV_API_URL || 'https://api.rsolv.dev';
    const apiKey = process.env.RSOLV_API_KEY || config.rsolvApiKey;

    if (!apiKey) {
      logger.warn('RSOLV API key not configured, skipping fix attempt recording');
      return;
    }

    // Create API client
    const apiClient = new RsolvApiClient({
      baseUrl: apiUrl,
      apiKey
    });

    // Prepare fix attempt data
    const fixAttemptData = {
      github_org: issue.repository.owner,
      repo_name: issue.repository.name,
      issue_number: issue.number,
      pr_number: prData.number,
      pr_title: prTitle,
      pr_url: prData.html_url,
      issue_title: issue.title,
      issue_url: `https://github.com/${issue.repository.fullName}/issues/${issue.number}`,
      api_key_used: apiKey,
      metadata: {
        branch: prData.head?.ref || `rsolv/${issue.number}`,
        labels: ['rsolv:automated'],
        created_by: 'rsolv-action'
      }
    };

    // Record the fix attempt
    logger.info(`Recording fix attempt for PR #${prData.number}`);
    const result = await apiClient.recordFixAttempt(fixAttemptData);

    if (result.success) {
      logger.info(`Fix attempt recorded successfully: ID ${result.data?.id}`);
    } else {
      logger.error(`Failed to record fix attempt: ${result.error}`);
    }
  } catch (error) {
    logger.error('Error recording fix attempt', error);
    // Don't throw - this shouldn't fail the PR creation
  }
}