#!/usr/bin/env bun
/**
 * E2E Demo showing Claude Code Max usage for fixing vulnerabilities
 * This simulates what would happen if we could run the fixes locally
 */

import { ClaudeCodeMaxAdapter } from './src/ai/adapters/claude-code-cli-dev.js';
import { isClaudeMaxAvailable } from './src/ai/adapters/claude-code-cli-dev.js';
import { AIConfig, IssueAnalysis } from './src/ai/types.js';
import { IssueContext } from './src/types/index.js';

// Track token usage
let apiCallsAvoided = 0;
let estimatedTokensSaved = 0;

async function simulateE2EWithClaudeMax() {
  console.log('\n=== E2E Test Simulation with Claude Code Max ===\n');
  console.log('This demonstrates how Claude Code Max would handle the 9 issues\n');
  
  // Check Claude Code Max availability
  const maxAvailable = isClaudeMaxAvailable();
  console.log(`Claude Code Max: ${maxAvailable ? '✅ Available' : '❌ Not Available'}`);
  
  if (!maxAvailable) {
    console.log('\n⚠️  Claude Code Max not available. In production, this would use API tokens.');
    console.log('To enable Claude Code Max:');
    console.log('1. Install Claude desktop app');
    console.log('2. Sign in with your account');
    console.log('3. Ensure "claude" command is available');
    return;
  }
  
  // Set development mode
  process.env.RSOLV_DEV_MODE = 'true';
  
  // Issues from our E2E test
  const issues = [
    { number: 432, title: 'Command_injection', files: 1, complexity: 'low' },
    { number: 433, title: 'Insecure_deserialization', files: 2, complexity: 'medium' },
    { number: 434, title: 'Xml_external_entities', files: 1, complexity: 'low' },
    { number: 435, title: 'Cross-Site Scripting (XSS)', files: 1, complexity: 'low' },
    { number: 436, title: 'Hardcoded_secrets', files: 1, complexity: 'low' },
    { number: 437, title: 'Denial_of_service', files: 14, complexity: 'high' },
    { number: 438, title: 'Open_redirect', files: 2, complexity: 'medium' },
    { number: 439, title: 'Weak_cryptography', files: 1, complexity: 'low' },
    { number: 440, title: 'Information_disclosure', files: 6, complexity: 'medium' }
  ];
  
  console.log(`\n📊 Processing ${issues.length} issues:\n`);
  
  const results = {
    success: 0,
    vendorDetected: 0,
    failed: 0
  };
  
  for (const issue of issues) {
    console.log(`\n🔧 Issue #${issue.number}: ${issue.title} (${issue.files} file${issue.files > 1 ? 's' : ''})`);
    
    // Simulate vendor detection for known vendor files
    const isVendor = issue.title === 'Weak_cryptography' || 
                     issue.title === 'Xml_external_entities' ||
                     issue.title === 'Insecure_deserialization' ||
                     issue.title === 'Information_disclosure';
    
    if (isVendor) {
      console.log('  📦 Vendor file detected - would create update recommendation');
      results.vendorDetected++;
      apiCallsAvoided++;
      estimatedTokensSaved += 2000; // Vendor issues still analyzed but not fixed
    } else {
      console.log('  🚀 Using Claude Code Max for fix (NO API TOKENS)');
      
      // Simulate successful fix
      console.log('  ✅ Fixed with Claude Code Max');
      results.success++;
      apiCallsAvoided++;
      
      // Estimate tokens saved based on complexity
      const tokensPerFix = issue.complexity === 'high' ? 8000 : 
                           issue.complexity === 'medium' ? 4000 : 2000;
      estimatedTokensSaved += tokensPerFix;
    }
  }
  
  // Calculate savings
  const apiCostPerMillionTokens = 3.00; // Claude Sonnet pricing
  const tokensSavedInMillions = estimatedTokensSaved / 1_000_000;
  const dollarsSaved = tokensSavedInMillions * apiCostPerMillionTokens;
  
  console.log('\n' + '='.repeat(50));
  console.log('\n📈 E2E TEST RESULTS WITH CLAUDE CODE MAX:\n');
  console.log(`Issues Processed: ${issues.length}`);
  console.log(`✅ Fixed: ${results.success}`);
  console.log(`📦 Vendor Detected: ${results.vendorDetected}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`Success Rate: ${((results.success + results.vendorDetected) / issues.length * 100).toFixed(0)}%`);
  
  console.log('\n💰 COST SAVINGS:\n');
  console.log(`API Calls Avoided: ${apiCallsAvoided}`);
  console.log(`Estimated Tokens Saved: ${estimatedTokensSaved.toLocaleString()}`);
  console.log(`Estimated Cost Saved: $${dollarsSaved.toFixed(2)}`);
  console.log(`Cost with API: ~$${dollarsSaved.toFixed(2)}`);
  console.log(`Cost with Claude Code Max: $0.00 (using subscription)`);
  console.log(`Savings: 100% 🎉`);
  
  console.log('\n📝 NOTES:\n');
  console.log('• Claude Code Max uses your signed-in account');
  console.log('• No API tokens consumed during development');
  console.log('• Retry mechanism still available for reliability');
  console.log('• Production deployments would still use API tokens');
  
  // Demonstrate an actual fix with Claude Code Max
  console.log('\n' + '='.repeat(50));
  console.log('\n🔬 LIVE DEMO: Fixing a vulnerability with Claude Code Max\n');
  
  const fs = require('fs');
  const testFile = 'demo-vulnerable.js';
  
  // Create a vulnerable file
  fs.writeFileSync(testFile, `
// Vulnerable: Command injection
const exec = require('child_process').exec;
function runCommand(userInput) {
  exec('echo ' + userInput); // Dangerous!
}
`);
  
  console.log('Created vulnerable file:');
  console.log(fs.readFileSync(testFile, 'utf-8'));
  
  // Use Claude Code Max to fix it
  const config: AIConfig = {
    provider: 'anthropic',
    model: 'claude-3-sonnet',
    temperature: 0.2
  };
  
  const adapter = new ClaudeCodeMaxAdapter(config, process.cwd());
  
  const issueContext: IssueContext = {
    id: '1',
    title: 'Command injection vulnerability',
    body: 'User input is passed directly to exec without sanitization',
    number: 1,
    labels: ['security'],
    assignees: [],
    repository: { 
      owner: 'demo', 
      name: 'test',
      fullName: 'demo/test',
      defaultBranch: 'main'
    },
    source: 'github',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  const analysis: IssueAnalysis = {
    summary: 'Command injection vulnerability needs fixing',
    complexity: 'low',
    estimatedTime: 5,
    potentialFixes: ['Use execFile', 'Sanitize input'],
    recommendedApproach: 'Use execFile or sanitize input',
    relatedFiles: [testFile]
  };
  
  console.log('\nFixing with Claude Code Max...');
  
  const result = await adapter.generateSolution(
    issueContext,
    analysis,
    `Fix the command injection vulnerability in ${testFile}. 
     Use execFile instead of exec, or properly sanitize the input.
     Use the Edit tool to modify the file.`
  );
  
  if (result.success) {
    console.log('\n✅ Fixed! New code:');
    console.log(fs.readFileSync(testFile, 'utf-8'));
  } else {
    console.log('\n❌ Fix failed:', result.error);
  }
  
  // Clean up
  if (fs.existsSync(testFile)) {
    fs.unlinkSync(testFile);
  }
  
  console.log('\n🎉 Demo Complete!\n');
}

// Run the simulation
simulateE2EWithClaudeMax().catch(console.error);