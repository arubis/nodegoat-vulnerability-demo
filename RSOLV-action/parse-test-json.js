#!/usr/bin/env node

// Parse vitest JSON reporter output
const fs = require('fs');

// Read from stdin
let data = '';
process.stdin.on('data', chunk => {
  data += chunk;
});

process.stdin.on('end', () => {
  try {
    const json = JSON.parse(data);
    console.log('Test Results:');
    console.log('=============');
    console.log(`Total Tests: ${json.numTotalTests}`);
    console.log(`Passed: ${json.numPassedTests}`);
    console.log(`Failed: ${json.numFailedTests}`);
    console.log(`Pending: ${json.numPendingTests}`);
    
    if (json.numTotalTests > 0) {
      const passRate = (json.numPassedTests / json.numTotalTests * 100).toFixed(2);
      console.log(`Pass Rate: ${passRate}%`);
    }
    
    // Show failures if any
    if (json.numFailedTests > 0) {
      console.log('\nFailed Tests:');
      json.testResults.forEach(suite => {
        suite.assertionResults
          .filter(test => test.status === 'failed')
          .forEach(test => {
            console.log(`  ✗ ${test.fullName}`);
          });
      });
    }
  } catch (e) {
    console.error('Failed to parse JSON:', e.message);
    console.error('Raw data:', data.substring(0, 200));
  }
});
