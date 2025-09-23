#!/usr/bin/env bun
/**
 * Local Development Runner for RSOLV Action
 * 
 * This script allows developers to process GitHub issues locally using Claude Code Max
 * instead of API tokens. It monitors a repository for issues and runs the same fix
 * logic as the GitHub Action, but using local Claude authentication.
 * 
 * Benefits:
 * - Zero API costs during development
 * - Faster iteration cycles
 * - Full debugging capabilities
 * - Same code paths as production
 * 
 * Usage:
 *   bun run local-fix-runner.ts --repo owner/name --issue 123
 *   bun run local-fix-runner.ts --repo owner/name --monitor
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './src/utils/logger.js';
import { isClaudeMaxAvailable } from './src/ai/adapters/claude-code-cli-dev.js';

interface Options {
  repo: string;
  issue?: number;
  monitor?: boolean;
  dryRun?: boolean;
  autoLabel?: boolean;
  model?: string;
}

interface GitHubLabel {
  name: string;
  color?: string;
  description?: string;
}

interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  body: string;
  labels: GitHubLabel[];
  createdAt: string;
}

class LocalFixRunner {
  private owner: string;
  private repo: string;
  private localRepoPath: string;
  
  constructor(private options: Options) {
    // Parse repo owner/name
    const [owner, repo] = options.repo.split('/');
    if (!owner || !repo) {
      throw new Error('Invalid repo format. Use: owner/name');
    }
    this.owner = owner;
    this.repo = repo;
    
    // Check gh CLI is available
    try {
      execSync('gh --version', { stdio: 'ignore' });
    } catch {
      throw new Error('gh CLI is not installed. Install from: https://cli.github.com');
    }
    
    // Set up local repo path
    this.localRepoPath = path.join(process.cwd(), '..', `${repo}-local-fix`);
  }
  
  async run() {
    console.log('\n🚀 RSOLV Local Fix Runner with Claude Code Max\n');
    console.log('='.repeat(50));
    
    // Check Claude Max availability
    if (!isClaudeMaxAvailable()) {
      console.error('❌ Claude Code Max is not available!');
      console.log('\nTo use this tool:');
      console.log('1. Install Claude desktop app');
      console.log('2. Sign in with your account');
      console.log('3. Ensure "claude" command is available in terminal');
      process.exit(1);
    }
    
    console.log('✅ Claude Code Max is available\n');
    
    // Set development mode
    process.env.RSOLV_DEV_MODE = 'true';
    process.env.RSOLV_USE_CLAUDE_MAX = 'true';
    
    if (this.options.issue) {
      // Process specific issue
      await this.processIssue(this.options.issue);
    } else if (this.options.monitor) {
      // Monitor for new issues
      await this.monitorIssues();
    } else {
      // List available issues
      await this.listIssues();
    }
  }
  
  async processIssue(issueNumber: number) {
    console.log(`\n📋 Processing Issue #${issueNumber}\n`);
    
    try {
      // Get issue details using gh CLI for consistency
      const issueJson = execSync(
        `gh issue view ${issueNumber} --repo ${this.owner}/${this.repo} --json title,labels,state,body`,
        { encoding: 'utf-8' }
      );
      const issue: GitHubIssue = JSON.parse(issueJson);
      
      console.log(`Title: ${issue.title}`);
      console.log(`Labels: ${issue.labels.map((l: GitHubLabel) => l.name).join(', ')}`);
      console.log(`State: ${issue.state}`);
      
      // Check if it needs processing
      const hasRsolvLabel = issue.labels.some((l: GitHubLabel) => 
        l.name === 'rsolv:automate' || l.name === 'rsolv:detected'
      );
      
      if (!hasRsolvLabel && this.options.autoLabel) {
        console.log('\n🏷️  Adding rsolv:automate label...');
        execSync(
          `gh issue edit ${issueNumber} --repo ${this.owner}/${this.repo} --add-label "rsolv:automate"`,
          { stdio: 'inherit' }
        );
      } else if (!hasRsolvLabel) {
        console.log('\n⚠️  Issue doesn\'t have rsolv labels. Use --auto-label to add.');
        return;
      }
      
      // Clone or update local repo
      await this.setupLocalRepo();
      
      // Run the fix locally
      console.log('\n🔧 Running RSOLV fix with Claude Code Max...\n');
      
      const actionPath = process.cwd();
      // Get GitHub token from gh CLI config
      const githubToken = execSync('gh auth token', { encoding: 'utf-8' }).trim();
      
      const env = {
        ...process.env,
        GITHUB_TOKEN: githubToken,
        GITHUB_REPOSITORY: `${this.owner}/${this.repo}`,
        GITHUB_WORKSPACE: this.localRepoPath,
        GITHUB_SHA: execSync('git rev-parse HEAD', { 
          cwd: this.localRepoPath, 
          encoding: 'utf-8' 
        }).trim(),
        INPUT_MODE: 'mitigate',
        INPUT_ISSUE_NUMBER: issueNumber.toString(),
        RSOLV_ISSUE_NUMBER: issueNumber.toString(),  // This is what the action expects
        INPUT_RSOLVAPIKEY: process.env.RSOLV_API_KEY || 'local-dev-mode',
        RSOLV_API_KEY: process.env.RSOLV_API_KEY || 'local-dev-mode',
        RSOLV_DEV_MODE: 'true',
        RSOLV_USE_CLAUDE_MAX: 'true',
        RSOLV_DEBUG: 'true',
        CLAUDE_MODEL: this.options.model || 'sonnet'  // Pass model to Claude CLI
      };
      
      if (this.options.dryRun) {
        console.log('🔍 Dry run mode - would execute:');
        console.log(`bun run ${actionPath}/src/index.ts`);
        console.log('With environment:', Object.keys(env).filter(k => k.startsWith('GITHUB') || k.startsWith('INPUT') || k.startsWith('RSOLV')));
        return;
      }
      
      // Execute the action locally
      const result = spawn('bun', ['run', `${actionPath}/src/index.ts`], {
        cwd: this.localRepoPath,
        env,
        stdio: 'inherit'
      });
      
      await new Promise((resolve, reject) => {
        result.on('close', (code) => {
          if (code === 0) {
            console.log('\n✅ Fix completed successfully!');
            resolve(code);
          } else {
            console.error(`\n❌ Fix failed with code ${code}`);
            reject(new Error(`Process exited with code ${code}`));
          }
        });
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('\n❌ Error processing issue:', errorMessage);
      throw error;
    }
  }
  
  async setupLocalRepo() {
    console.log('\n📁 Setting up local repository...');
    
    if (!fs.existsSync(this.localRepoPath)) {
      // Clone the repo
      console.log(`Cloning ${this.owner}/${this.repo}...`);
      execSync(
        `git clone https://github.com/${this.owner}/${this.repo}.git ${this.localRepoPath}`,
        { stdio: 'inherit' }
      );
    } else {
      // Update existing repo
      console.log('Updating existing local repo...');
      execSync('git fetch origin', { cwd: this.localRepoPath, stdio: 'inherit' });
      execSync('git checkout main || git checkout master', { cwd: this.localRepoPath, stdio: 'inherit' });
      execSync('git pull origin', { cwd: this.localRepoPath, stdio: 'inherit' });
    }
  }
  
  async listIssues() {
    console.log('\n📋 Available Issues:\n');
    
    const issuesJson = execSync(
      `gh issue list --repo ${this.owner}/${this.repo} --state open --label "rsolv:detected" --limit 20 --json number,title,labels,createdAt`,
      { encoding: 'utf-8' }
    );
    const issues: GitHubIssue[] = JSON.parse(issuesJson);
    
    if (issues.length === 0) {
      console.log('No issues with rsolv labels found.');
      return;
    }
    
    issues.forEach((issue: GitHubIssue) => {
      const labels = issue.labels.map((l: GitHubLabel) => l.name).join(', ');
      console.log(`#${issue.number}: ${issue.title}`);
      console.log(`  Labels: ${labels}`);
      console.log(`  Created: ${new Date(issue.createdAt).toLocaleDateString()}`);
      console.log('');
    });
    
    console.log(`\nTo process an issue, run:`);
    console.log(`  bun run local-fix-runner.ts --repo ${this.options.repo} --issue <number>\n`);
  }
  
  async monitorIssues() {
    console.log('\n👀 Monitoring for new issues...\n');
    console.log('Press Ctrl+C to stop\n');
    
    const processedIssues = new Set<number>();
    
    while (true) {
      try {
        const issuesJson = execSync(
          `gh issue list --repo ${this.owner}/${this.repo} --state open --label "rsolv:automate" --limit 10 --json number,title`,
          { encoding: 'utf-8' }
        );
        const issues: Array<{number: number; title: string}> = JSON.parse(issuesJson);
        
        for (const issue of issues) {
          if (!processedIssues.has(issue.number)) {
            console.log(`\n🆕 New issue detected: #${issue.number} - ${issue.title}`);
            
            try {
              await this.processIssue(issue.number);
              processedIssues.add(issue.number);
            } catch (error) {
              console.error(`Failed to process issue #${issue.number}`);
            }
          }
        }
        
        // Wait 30 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 30000));
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error checking issues:', errorMessage);
        await new Promise(resolve => setTimeout(resolve, 60000));
      }
    }
  }
}

// Parse command line arguments
function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    repo: '',
    dryRun: false,
    autoLabel: false
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--repo':
        options.repo = args[++i];
        break;
      case '--issue':
        options.issue = parseInt(args[++i]);
        break;
      case '--monitor':
        options.monitor = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--auto-label':
        options.autoLabel = true;
        break;
      case '--model':
        options.model = args[++i];
        break;
      case '--help':
        console.log(`
RSOLV Local Fix Runner - Process GitHub issues locally with Claude Code Max

Usage:
  bun run local-fix-runner.ts --repo owner/name [options]

Options:
  --repo owner/name    Repository to process (required)
  --issue <number>     Process specific issue
  --monitor            Monitor for new issues continuously
  --dry-run            Show what would be done without executing
  --auto-label         Automatically add rsolv:automate label
  --model <model>      Claude model to use (sonnet, opus, haiku) default: sonnet
  --help               Show this help message

Examples:
  # List available issues
  bun run local-fix-runner.ts --repo RSOLV-dev/nodegoat-vulnerability-demo
  
  # Process specific issue
  bun run local-fix-runner.ts --repo RSOLV-dev/nodegoat-vulnerability-demo --issue 432
  
  # Monitor and auto-process new issues
  bun run local-fix-runner.ts --repo RSOLV-dev/nodegoat-vulnerability-demo --monitor

Environment Variables:
  GITHUB_TOKEN         GitHub personal access token (required)
  RSOLV_DEBUG          Enable debug logging
`);
        process.exit(0);
    }
  }
  
  if (!options.repo) {
    console.error('Error: --repo is required');
    console.log('Run with --help for usage information');
    process.exit(1);
  }
  
  return options;
}

// Main execution
async function main() {
  try {
    const options = parseArgs();
    const runner = new LocalFixRunner(options);
    await runner.run();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Fatal error:', errorMessage);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
} else {
  // For Bun compatibility
  main();
}