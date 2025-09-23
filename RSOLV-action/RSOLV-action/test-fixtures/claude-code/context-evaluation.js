/**
 * Context Quality Evaluation Test Harness
 * 
 * This script evaluates the quality of context gathering with and without Claude Code
 * by running the same test cases through both approaches and comparing the results.
 * 
 * Usage:
 * ```
 * bun run test-fixtures/claude-code/context-evaluation.js
 * ```
 */

import path from 'path';
import fs from 'fs';
import { getAIClient } from '../../src/ai/client';
import { AIConfig } from '../../src/ai/types';
import { RepoContext } from '../../src/ai/types';
import { analyzeIssue } from '../../src/ai/analyzer';

// Constants
const SAMPLE_REPO_PATH = path.join(__dirname, 'sample-repo');
const TEST_CASES_PATH = path.join(__dirname, 'test-cases.json');
const RESULTS_PATH = path.join(__dirname, 'evaluation-results.json');

// Define environment variables with default test values
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-api-key';

/**
 * Run a test case with both standard and Claude Code approach
 */
async function runTestCase(testCase, apiKey) {
  console.log(`\nRunning test case: ${testCase.id} - ${testCase.title}`);
  
  // Create repository context
  const repoContext = {
    owner: 'test-org',
    repo: 'sample-app',
    branch: 'main',
    source: 'github',
    basePath: SAMPLE_REPO_PATH
  };
  
  // Create issue context
  const issueContext = {
    id: testCase.id,
    title: testCase.title,
    body: testCase.description,
    repository: {
      owner: 'test-org', 
      name: 'sample-app',
      branch: 'main'
    },
    source: 'github',
    labels: [testCase.type],
    url: `https://github.com/test-org/sample-app/issues/${testCase.id}`,
    metadata: {}
  };
  
  const results = {
    testCaseId: testCase.id,
    title: testCase.title,
    type: testCase.type,
    complexity: testCase.complexity,
    standard: {},
    claudeCode: {}
  };
  
  // Run standard approach first
  try {
    console.log('Testing standard approach...');
    const standardConfig = {
      provider: 'anthropic',
      apiKey: apiKey,
      useClaudeCode: false
    };
    
    const standardClient = getAIClient(standardConfig);
    
    // First analyze the issue
    console.log('Analyzing issue...');
    const standardAnalysis = await analyzeIssue(issueContext, standardConfig);
    
    // Then generate a solution
    console.log('Generating solution...');
    const startTime = Date.now();
    const standardSolution = await standardClient.generateSolution(
      issueContext.title,
      issueContext.body,
      standardAnalysis,
      repoContext
    );
    const endTime = Date.now();
    
    // Store results
    results.standard = {
      analysis: standardAnalysis,
      solution: standardSolution,
      timeTaken: endTime - startTime,
      filesReferenced: getReferencedFiles(standardSolution),
      accuracy: calculateSolutionAccuracy(standardSolution, testCase, 'standard')
    };
    
    console.log(`Standard approach: Found ${results.standard.filesReferenced.length} referenced files`);
    console.log(`Standard approach: ${results.standard.timeTaken}ms`);
  } catch (error) {
    console.error('Error with standard approach:', error);
    results.standard = {
      error: error.message
    };
  }
  
  // Now run Claude Code approach
  try {
    console.log('Testing Claude Code approach...');
    const claudeCodeConfig = {
      provider: 'anthropic',
      apiKey: apiKey,
      useClaudeCode: true
    };
    
    const claudeCodeClient = getAIClient(claudeCodeConfig);
    
    // First analyze the issue
    console.log('Analyzing issue...');
    const claudeCodeAnalysis = await analyzeIssue(issueContext, claudeCodeConfig);
    
    // Then generate a solution
    console.log('Generating solution...');
    const startTime = Date.now();
    const claudeCodeSolution = await claudeCodeClient.generateSolution(
      issueContext.title,
      issueContext.body,
      claudeCodeAnalysis,
      repoContext
    );
    const endTime = Date.now();
    
    // Store results
    results.claudeCode = {
      analysis: claudeCodeAnalysis,
      solution: claudeCodeSolution,
      timeTaken: endTime - startTime,
      filesReferenced: getReferencedFiles(claudeCodeSolution),
      accuracy: calculateSolutionAccuracy(claudeCodeSolution, testCase, 'claudeCode')
    };
    
    console.log(`Claude Code approach: Found ${results.claudeCode.filesReferenced.length} referenced files`);
    console.log(`Claude Code approach: ${results.claudeCode.timeTaken}ms`);
  } catch (error) {
    console.error('Error with Claude Code approach:', error);
    results.claudeCode = {
      error: error.message
    };
  }
  
  return results;
}

/**
 * Extract referenced files from a solution
 */
function getReferencedFiles(solution) {
  if (!solution || !solution.files || !Array.isArray(solution.files)) {
    return [];
  }
  return solution.files.map(file => file.path);
}

/**
 * Calculate a simple accuracy score based on expected context
 */
function calculateSolutionAccuracy(solution, testCase, type) {
  if (!solution || !solution.files || !Array.isArray(solution.files)) {
    return 0;
  }
  
  const expectedFiles = testCase.expectedContextFiles || [];
  const expectedDependencies = testCase.expectedDependencies || [];
  const expectedReferences = testCase.expectedReferencesToFind || [];
  
  let score = 0;
  const maxScore = expectedFiles.length + expectedReferences.length;
  
  // Check if solution includes the expected files
  const referencedFiles = getReferencedFiles(solution);
  for (const expectedFile of expectedFiles) {
    if (referencedFiles.some(file => file.includes(expectedFile))) {
      score++;
    }
  }
  
  // Check if solution includes the expected references
  const solutionText = JSON.stringify(solution);
  for (const expectedRef of expectedReferences) {
    if (solutionText.includes(expectedRef)) {
      score++;
    }
  }
  
  // Calculate percentage
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  return {
    score,
    maxScore,
    percentage: Math.round(percentage),
    expectedQuality: testCase.expectedSolutionQuality[type] || 'unknown'
  };
}

/**
 * Run all test cases and generate a report
 */
async function runAllTestCases() {
  try {
    // Load test cases
    const testCases = JSON.parse(fs.readFileSync(TEST_CASES_PATH, 'utf8'));
    
    // Get API key from environment
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable not set');
    }
    
    // Run each test case
    const results = [];
    for (const testCase of testCases) {
      const result = await runTestCase(testCase, apiKey);
      results.push(result);
      
      // Save results incrementally
      fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
    }
    
    // Generate summary
    const summary = generateSummary(results);
    
    // Print summary
    console.log('\n===== EVALUATION SUMMARY =====');
    console.log(`Total test cases: ${results.length}`);
    console.log(`Average standard accuracy: ${summary.standardAverage.toFixed(1)}%`);
    console.log(`Average Claude Code accuracy: ${summary.claudeCodeAverage.toFixed(1)}%`);
    console.log(`Improvement: ${summary.improvementPercentage.toFixed(1)}%`);
    console.log('\nResults saved to:', RESULTS_PATH);
    
    return results;
  } catch (error) {
    console.error('Error running test cases:', error);
    throw error;
  }
}

/**
 * Generate a summary of all results
 */
function generateSummary(results) {
  let standardTotal = 0;
  let claudeCodeTotal = 0;
  let validResults = 0;
  
  for (const result of results) {
    if (result.standard?.accuracy?.percentage !== undefined && 
        result.claudeCode?.accuracy?.percentage !== undefined) {
      standardTotal += result.standard.accuracy.percentage;
      claudeCodeTotal += result.claudeCode.accuracy.percentage;
      validResults++;
    }
  }
  
  const standardAverage = validResults > 0 ? standardTotal / validResults : 0;
  const claudeCodeAverage = validResults > 0 ? claudeCodeTotal / validResults : 0;
  const improvementPercentage = standardAverage > 0 
    ? ((claudeCodeAverage - standardAverage) / standardAverage) * 100 
    : 0;
  
  return {
    standardAverage,
    claudeCodeAverage,
    improvementPercentage,
    validResults
  };
}

// Run the test if this file is executed directly
if (require.main === module) {
  runAllTestCases().catch(error => {
    console.error('Failed to run test cases:', error);
    process.exit(1);
  });
}

export {
  runTestCase,
  runAllTestCases
};