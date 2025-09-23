#!/usr/bin/env node

// Simple script to merge vitest shard JSON reports
const fs = require('fs');
const path = require('path');

const shardDir = '.vitest-shards';
const outputFile = 'test-report.json';

// Read all shard files
const shardFiles = fs.readdirSync(shardDir)
  .filter(f => f.startsWith('shard-') && f.endsWith('.json'))
  .sort();

if (shardFiles.length === 0) {
  console.error('No shard files found');
  process.exit(1);
}

// Merge results
const merged = {
  numTotalTestSuites: 0,
  numPassedTestSuites: 0,
  numFailedTestSuites: 0,
  numPendingTestSuites: 0,
  numTotalTests: 0,
  numPassedTests: 0,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  startTime: null,
  endTime: null,
  success: true,
  testResults: []
};

shardFiles.forEach(file => {
  try {
    const shard = JSON.parse(fs.readFileSync(path.join(shardDir, file), 'utf8'));
    
    merged.numTotalTestSuites += shard.numTotalTestSuites || 0;
    merged.numPassedTestSuites += shard.numPassedTestSuites || 0;
    merged.numFailedTestSuites += shard.numFailedTestSuites || 0;
    merged.numPendingTestSuites += shard.numPendingTestSuites || 0;
    merged.numTotalTests += shard.numTotalTests || 0;
    merged.numPassedTests += shard.numPassedTests || 0;
    merged.numFailedTests += shard.numFailedTests || 0;
    merged.numPendingTests += shard.numPendingTests || 0;
    merged.numTodoTests += shard.numTodoTests || 0;
    
    if (!merged.startTime || shard.startTime < merged.startTime) {
      merged.startTime = shard.startTime;
    }
    if (!merged.endTime || shard.endTime > merged.endTime) {
      merged.endTime = shard.endTime;
    }
    
    if (!shard.success) merged.success = false;
    
    if (shard.testResults) {
      merged.testResults.push(...shard.testResults);
    }
  } catch (e) {
    console.error(`Error reading ${file}:`, e.message);
  }
});

// Add computed fields
merged.passRate = merged.numTotalTests > 0 
  ? ((merged.numPassedTests / merged.numTotalTests) * 100).toFixed(2) + '%'
  : '0%';

// Write merged report
fs.writeFileSync(outputFile, JSON.stringify(merged, null, 2));

console.log('Test Results Summary:');
console.log('====================');
console.log(`Total Tests: ${merged.numTotalTests}`);
console.log(`Passed: ${merged.numPassedTests}`);
console.log(`Failed: ${merged.numFailedTests}`);
console.log(`Skipped: ${merged.numPendingTests + merged.numTodoTests}`);
console.log(`Pass Rate: ${merged.passRate}`);
console.log('');
console.log(`Report written to ${outputFile}`);