#!/usr/bin/env bun

/**
 * Example: Using RSOLV with Jira programmatically
 * 
 * This example shows how to use the Jira adapter to find and process issues
 */

import { JiraAdapter } from '../src/platforms/jira/jira-adapter';
import { PlatformFactory } from '../src/platforms/platform-factory';

async function processJiraIssues() {
  // Method 1: Direct adapter usage
  const adapter = new JiraAdapter({
    host: process.env.JIRA_HOST!,
    email: process.env.JIRA_EMAIL!,
    apiToken: process.env.JIRA_API_TOKEN!,
    autofixLabel: 'rsolv-autofix'
  });

  await adapter.authenticate();
  
  // Find issues with our label
  const issues = await adapter.searchAutofixIssues();
  console.log(`Found ${issues.length} issues to process`);

  for (const issue of issues) {
    console.log(`\nProcessing ${issue.key}: ${issue.title}`);
    
    // Here you would:
    // 1. Analyze the issue description
    // 2. Generate a fix using AI
    // 3. Create a PR in the linked repository
    // 4. Update the Jira issue
    
    await adapter.addComment(
      issue.key!,
      'RSOLV is analyzing this issue...'
    );

    // Simulate processing
    await Bun.sleep(1000);

    // Link the PR
    await adapter.linkExternalResource(
      issue.key!,
      `https://github.com/example/repo/pull/${Math.floor(Math.random() * 1000)}`,
      `Fix: ${issue.title}`
    );

    // Update status (if configured)
    try {
      await adapter.updateStatus(issue.key!, 'In Progress');
    } catch (e) {
      console.log('  Status update skipped (may need configuration)');
    }
  }
}

async function usingFactory() {
  // Method 2: Using the platform factory
  const config = {
    jira: {
      host: process.env.JIRA_HOST!,
      email: process.env.JIRA_EMAIL!,
      apiToken: process.env.JIRA_API_TOKEN!,
    }
  };

  const jira = await PlatformFactory.createAndAuthenticate('jira', config);
  
  // Custom JQL query
  const criticalIssues = await jira.searchIssues(
    'project = DEV AND priority = Critical AND labels = "autofix"'
  );
  
  console.log(`\nFound ${criticalIssues.length} critical issues`);
}

// Run examples
if (import.meta.main) {
  console.log('=== RSOLV Jira Integration Example ===\n');
  
  if (!process.env.JIRA_HOST) {
    console.error('Please set JIRA_HOST, JIRA_EMAIL, and JIRA_API_TOKEN');
    process.exit(1);
  }

  try {
    await processJiraIssues();
    await usingFactory();
    console.log('\n✅ Example completed successfully');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}