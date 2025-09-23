#!/usr/bin/env bun
/**
 * Demo script for RSOLV action
 * This script simulates the action functionality by processing a GitHub issue and generating a PR
 */
import { getGitHubClient } from './github/api.js';
import { createPullRequest } from './github/pr.js';
import { generateSolution } from './ai/solution.js';
import { analyzeIssue } from './ai/analyzer.js';
import { ActionConfig } from './types/index.js';
import { IssueContext } from './types/index.js';

// Ensure GitHub token is set
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
  console.error('❌ Error: GITHUB_TOKEN environment variable is not set');
  console.error('Please set it with: export GITHUB_TOKEN=your_github_token');
  process.exit(1);
}

// Get issue URL from command line arguments
const issueUrl = process.argv[2];
if (!issueUrl) {
  console.error('❌ Error: No issue URL provided');
  console.error('Usage: bun run demo <issue_url>');
  console.error('Example: bun run demo https://github.com/owner/repo/issues/123');
  process.exit(1);
}

// Parse the issue URL
const issueUrlRegex = /github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/;
const match = issueUrl.match(issueUrlRegex);
if (!match) {
  console.error('❌ Error: Invalid GitHub issue URL');
  console.error('Expected format: https://github.com/owner/repo/issues/123');
  process.exit(1);
}

const [, owner, repo, issueNumber] = match;

async function main() {
  console.log(`🚀 Starting RSOLV demo for issue: ${owner}/${repo}#${issueNumber}`);
  
  // Create basic config for demo
  const config: ActionConfig = {
    apiKey: process.env.RSOLV_API_KEY || 'demo-key',
    configPath: 'rsolv.config.json',
    issueLabel: 'rsolv:fix',
    repoToken: GITHUB_TOKEN,
    aiProvider: {
      provider: 'anthropic',
      model: 'claude-3-sonnet-20240229',
      apiKey: process.env.ANTHROPIC_API_KEY
    },
    containerConfig: {
      enabled: false
    },
    securitySettings: {
      scanDependencies: true,
      preventSecretLeakage: true
    }
  };

  // Initialize GitHub client
  const octokit = getGitHubClient(config);
  
  try {
    // Get issue details
    console.log('📥 Fetching issue details...');
    const { data: issue } = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: parseInt(issueNumber, 10)
    });
    
    // Create issue context
    const issueContext: IssueContext = {
      id: issueNumber,
      number: issue.number,
      source: 'github',
      title: issue.title,
      body: issue.body || '',
      labels: issue.labels?.map((label: any) => 
        typeof label === 'string' ? label : label.name
      ) || [],
      assignees: issue.assignees?.map((a: any) => a.login) || [],
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      repository: {
        owner,
        name: repo,
        fullName: `${owner}/${repo}`,
        defaultBranch: 'main' // Assuming main branch
      },
      metadata: {
        htmlUrl: issue.html_url,
        url: issue.html_url,
        user: issue.user?.login || 'unknown',
        state: issue.state,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at
      }
    };
    
    // Create AI config (using default values for demo)
    // Allow selecting provider via environment variable
    const provider = process.env.AI_PROVIDER || 'anthropic';
    let apiKey = '';
    let modelName = '';
    
    // Set appropriate API key and model based on provider
    switch (provider) {
    case 'anthropic':
      apiKey = process.env.ANTHROPIC_API_KEY || '';
      modelName = 'claude-sonnet-4-20250514';
      break;
    case 'openrouter':
      apiKey = process.env.OPENROUTER_API_KEY || '';
      modelName = 'anthropic/claude-3-opus';
      break;
    case 'ollama':
      apiKey = process.env.OLLAMA_API_KEY || ''; // Can be URL:TOKEN format
      modelName = process.env.OLLAMA_MODEL || 'llama3';
      break;
    default:
      apiKey = process.env.ANTHROPIC_API_KEY || '';
      modelName = 'claude-sonnet-4-20250514';
    }
    
    // Create proper ActionConfig
    const config: ActionConfig = {
      apiKey: process.env.RSOLV_API_KEY || 'demo-key',
      configPath: '.github/rsolv.yml',
      issueLabel: 'rsolv:automate',
      enableSecurityAnalysis: true,
      aiProvider: {
        provider: provider as any,
        apiKey,
        model: modelName,
        temperature: 0.2,
        // maxTokens omitted - resolved by token-utils
        contextLimit: 100000,
        timeout: 60000,
        useVendedCredentials: !!process.env.RSOLV_API_KEY
      },
      containerConfig: {
        enabled: false,
        image: 'rsolv/code-analysis:latest',
        memoryLimit: '2g',
        cpuLimit: '1',
        timeout: 300,
        securityProfile: 'default'
      },
      securitySettings: {
        disableNetworkAccess: true,
        scanDependencies: true,
        preventSecretLeakage: true,
        maxFileSize: 1024 * 1024,
        timeoutSeconds: 300,
        requireCodeReview: true
      }
    };
    
    // Analyze the issue
    console.log('🔍 Analyzing issue...');
    const analysis = await analyzeIssue(issueContext, config);
    console.log('✅ Issue analysis complete:');
    console.log(`  Complexity: ${analysis.estimatedComplexity}`);
    console.log(`  Suggested Approach: ${analysis.suggestedApproach}`);
    console.log(`  Files to Modify: ${analysis.filesToModify?.join(', ') || 'None'}`);
    
    // Generate solution
    console.log('🧠 Generating solution...');
    const solution = await generateSolution(issueContext, analysis, config);
    console.log('✅ Solution generated:');
    console.log(`  Success: ${solution.success}`);
    console.log(`  Message: ${solution.message}`);
    console.log(`  Changes: ${solution.changes ? Object.keys(solution.changes).length : 0} files`);
    
    // Create pull request
    console.log('🔄 Creating pull request...');
    const result = await createPullRequest(
      issueContext,
      solution.changes || {},
      analysis,
      config
    );
    
    if (!result.success) {
      throw new Error(result.message);
    }
    
    // Get the PR URL
    const prUrl = result.pullRequestUrl;
    
    console.log('✨ Demo completed successfully!');
    console.log(`Pull request created: ${prUrl}`);
    
  } catch (error) {
    console.error('❌ Error during demo execution:', error);
    process.exit(1);
  }
}

main();