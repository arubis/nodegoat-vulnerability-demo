#!/usr/bin/env bun
/**
 * End-to-End Test for Claude Code with Real Repository
 * 
 * This test script:
 * 1. Clones a real test repository
 * 2. Runs the Claude Code adapter on a predefined issue
 * 3. Validates the solution quality
 * 4. Compares with the standard approach
 * 
 * Usage:
 * ```
 * # Set API key
 * export ANTHROPIC_API_KEY=your_key_here
 * 
 * # Run test
 * bun run e2e-tests/claude-code-real-repo.js
 * ```
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { AIConfig } from '../src/ai/types';
import { ClaudeCodeAdapter } from '../src/ai/adapters/claude-code';
import { AnthropicClient } from '../src/ai/providers/anthropic';

// Test configuration
const TEST_REPO_URL = 'https://github.com/expresjs/express';
const TEST_REPO_PATH = path.join(process.cwd(), 'e2e-tests', 'test-repos', 'express');
const RESULTS_PATH = path.join(process.cwd(), 'e2e-tests', 'results');

// Create test issue context
const issueContext = {
  id: 'test-e2e-1',
  title: 'Route parameters not correctly merged with query parameters',
  body: `When using Express router, if a route parameter has the same name as a query parameter, the query parameter value is being overwritten by the route parameter. This behavior is causing issues with our API endpoints.

For example, with a route like '/users/:id' and a request to '/users/123?id=456', req.params.id is correctly set to '123', but req.query.id is also being set to '123' instead of '456'.

This seems to be an issue with parameter merging in the router implementation.`,
  repository: {
    owner: 'expressjs',
    name: 'express',
    branch: 'master'
  },
  source: 'github',
  labels: ['bug'],
  url: 'https://github.com/expressjs/express/issues/test-e2e-1',
  metadata: {}
};

// Mock analysis
const issueAnalysis = {
  summary: 'Issue with parameter merging in Express router',
  complexity: 'medium',
  estimatedTime: 45,
  potentialFixes: [
    'Fix parameter merging logic in the router',
    'Ensure route parameters don\'t overwrite query parameters'
  ],
  recommendedApproach: 'Identify where parameters are merged and fix the logic',
  relatedFiles: [
    'lib/router/index.js',
    'lib/request.js',
    'lib/application.js'
  ]
};

// Prepare test environment
async function setupTest() {
  console.log('🔧 Setting up test environment...');
  
  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ Error: ANTHROPIC_API_KEY not set. Please set it before running test.');
    process.exit(1);
  }
  
  // Create directories
  if (!fs.existsSync(path.join(process.cwd(), 'e2e-tests'))) {
    fs.mkdirSync(path.join(process.cwd(), 'e2e-tests'));
  }
  
  if (!fs.existsSync(path.join(process.cwd(), 'e2e-tests', 'test-repos'))) {
    fs.mkdirSync(path.join(process.cwd(), 'e2e-tests', 'test-repos'));
  }
  
  if (!fs.existsSync(RESULTS_PATH)) {
    fs.mkdirSync(RESULTS_PATH);
  }
  
  // Clone test repository if needed
  if (!fs.existsSync(TEST_REPO_PATH)) {
    console.log(`📦 Cloning test repository: ${TEST_REPO_URL}`);
    execSync(`git clone ${TEST_REPO_URL} ${TEST_REPO_PATH}`, { stdio: 'inherit' });
  } else {
    console.log('📦 Test repository already exists, skipping clone');
  }
  
  console.log('✅ Test environment set up successfully');
}

// Run test with Claude Code adapter
async function testClaudeCode() {
  console.log('\n🧪 Testing Claude Code adapter with real repository...');
  
  // Create config
  const config = {
    provider: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    useClaudeCode: true
  };
  
  // Create adapter
  const adapter = new ClaudeCodeAdapter(config, TEST_REPO_PATH);
  
  console.log('🔍 Checking if Claude Code is available...');
  const available = await adapter.isAvailable();
  if (!available) {
    console.error('❌ Claude Code CLI not available. Please install it and try again.');
    process.exit(1);
  }
  
  // Generate solution
  console.log('🤖 Generating solution with Claude Code...');
  console.log(`Repository path: ${TEST_REPO_PATH}`);
  console.log(`Issue: ${issueContext.title}`);
  
  const startTime = Date.now();
  const solution = await adapter.generateSolution(issueContext, issueAnalysis);
  const endTime = Date.now();
  
  // Save results
  const claudeCodeResultPath = path.join(RESULTS_PATH, 'claude-code-result.json');
  fs.writeFileSync(claudeCodeResultPath, JSON.stringify(solution, null, 2));
  
  console.log('✅ Claude Code solution generated successfully');
  console.log(`⏱️ Time taken: ${((endTime - startTime) / 1000).toFixed(2)}s`);
  console.log(`📝 Files modified: ${solution.files.length}`);
  console.log(`📄 Results saved to: ${claudeCodeResultPath}`);
  
  return {
    solution,
    timeTaken: endTime - startTime
  };
}

// Run test with standard approach
async function testStandardApproach() {
  console.log('\n🧪 Testing standard approach with real repository...');
  
  // Create config
  const config = {
    provider: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    modelName: 'claude-3-opus-20240229'
  };
  
  // Create client
  const client = new AnthropicClient(config);
  
  // Generate solution
  console.log('🤖 Generating solution with standard approach...');
  console.log(`Issue: ${issueContext.title}`);
  
  const startTime = Date.now();
  const solution = await client.generateSolution(
    issueContext.title,
    issueContext.body,
    issueAnalysis,
    {
      owner: issueContext.repository.owner,
      repo: issueContext.repository.name,
      branch: issueContext.repository.branch
    }
  );
  const endTime = Date.now();
  
  // Save results
  const standardResultPath = path.join(RESULTS_PATH, 'standard-result.json');
  fs.writeFileSync(standardResultPath, JSON.stringify(solution, null, 2));
  
  console.log('✅ Standard solution generated successfully');
  console.log(`⏱️ Time taken: ${((endTime - startTime) / 1000).toFixed(2)}s`);
  console.log(`📝 Files modified: ${solution.files.length}`);
  console.log(`📄 Results saved to: ${standardResultPath}`);
  
  return {
    solution,
    timeTaken: endTime - startTime
  };
}

// Compare results
function compareResults(standardResult, claudeCodeResult) {
  console.log('\n📊 Comparing results...');
  
  // Save comparison
  const comparisonPath = path.join(RESULTS_PATH, 'comparison.json');
  
  // Count files referenced
  const standardFiles = standardResult.solution.files.map(f => f.path);
  const claudeCodeFiles = claudeCodeResult.solution.files.map(f => f.path);
  
  // Find unique and common files
  const uniqueToStandard = standardFiles.filter(f => !claudeCodeFiles.includes(f));
  const uniqueToClaudeCode = claudeCodeFiles.filter(f => !standardFiles.includes(f));
  const commonFiles = standardFiles.filter(f => claudeCodeFiles.includes(f));
  
  // Create comparison results
  const comparison = {
    standardApproach: {
      timeTaken: standardResult.timeTaken,
      fileCount: standardFiles.length,
      uniqueFiles: uniqueToStandard,
      solutionSize: JSON.stringify(standardResult.solution).length
    },
    claudeCodeApproach: {
      timeTaken: claudeCodeResult.timeTaken,
      fileCount: claudeCodeFiles.length,
      uniqueFiles: uniqueToClaudeCode,
      solutionSize: JSON.stringify(claudeCodeResult.solution).length
    },
    common: {
      fileCount: commonFiles.length,
      files: commonFiles
    }
  };
  
  fs.writeFileSync(comparisonPath, JSON.stringify(comparison, null, 2));
  
  // Display comparison
  console.log('📈 Standard Approach:');
  console.log(`- Time: ${(comparison.standardApproach.timeTaken / 1000).toFixed(2)}s`);
  console.log(`- Files: ${comparison.standardApproach.fileCount}`);
  console.log(`- Solution size: ${(comparison.standardApproach.solutionSize / 1024).toFixed(2)}KB`);
  
  console.log('\n📈 Claude Code Approach:');
  console.log(`- Time: ${(comparison.claudeCodeApproach.timeTaken / 1000).toFixed(2)}s`);
  console.log(`- Files: ${comparison.claudeCodeApproach.fileCount}`);
  console.log(`- Solution size: ${(comparison.claudeCodeApproach.solutionSize / 1024).toFixed(2)}KB`);
  
  console.log('\n📈 Comparison:');
  console.log(`- Common files: ${comparison.common.fileCount}`);
  console.log(`- Unique to standard: ${comparison.standardApproach.uniqueFiles.length}`);
  console.log(`- Unique to Claude Code: ${comparison.claudeCodeApproach.uniqueFiles.length}`);
  
  // Calculate improvement metrics
  const timeDiff = comparison.standardApproach.timeTaken - comparison.claudeCodeApproach.timeTaken;
  const timePercentage = (timeDiff / comparison.standardApproach.timeTaken) * 100;
  
  const fileDiff = comparison.claudeCodeApproach.fileCount - comparison.standardApproach.fileCount;
  const filePercentage = (fileDiff / comparison.standardApproach.fileCount) * 100;
  
  console.log('\n📊 Improvement Metrics:');
  console.log(`- Time difference: ${timePercentage.toFixed(2)}%`);
  console.log(`- File coverage difference: ${filePercentage.toFixed(2)}%`);
  
  console.log(`\n📄 Full comparison saved to: ${comparisonPath}`);
  
  return comparison;
}

// Run the test
async function runTest() {
  try {
    console.log('🚀 Starting End-to-End Test for Claude Code with Real Repository');
    
    // Setup test environment
    await setupTest();
    
    // Run tests
    const standardResult = await testStandardApproach();
    const claudeCodeResult = await testClaudeCode();
    
    // Compare results
    const comparison = compareResults(standardResult, claudeCodeResult);
    
    console.log('\n✅ End-to-End test completed successfully');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  runTest();
}

export { runTest };