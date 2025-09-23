#!/usr/bin/env node

const fs = require('fs');

const report = JSON.parse(fs.readFileSync('test-report.json', 'utf8'));

const failures = {};
const categories = {};
const errorTypes = {};

// Analyze each failed test
report.testResults.forEach(result => {
  if (result.status === 'failed') {
    const filename = result.name.split('/').pop();
    const filepath = result.name;
    
    // Extract category from filename
    let category = 'other';
    if (filename.includes('ast')) category = 'AST';
    else if (filename.includes('pattern')) category = 'Pattern';
    else if (filename.includes('detector')) category = 'Detector';
    else if (filename.includes('analyzer')) category = 'Analyzer';
    else if (filename.includes('server')) category = 'Server/AST';
    else if (filename.includes('phase')) category = 'Phase';
    else if (filename.includes('validation')) category = 'Validation';
    else if (filename.includes('vending') || filename.includes('anthropic')) category = 'AI/Vending';
    else if (filename.includes('scanner')) category = 'Scanner';
    
    if (!categories[category]) categories[category] = [];
    
    // Get failed assertions
    const failedAssertions = (result.assertionResults || [])
      .filter(a => a.status === 'failed')
      .map(a => {
        // Extract error type from failure message
        let errorType = 'Unknown';
        const msg = (a.failureMessages && a.failureMessages[0]) || '';
        
        if (msg.includes('expected undefined')) errorType = 'Undefined Result';
        else if (msg.includes('expected 0')) errorType = 'Zero/Empty Result';
        else if (msg.includes('to be greater than')) errorType = 'Count Mismatch';
        else if (msg.includes('to deeply equal')) errorType = 'Object Mismatch';
        else if (msg.includes('TypeError')) errorType = 'Type Error';
        else if (msg.includes('Cannot find')) errorType = 'Module Not Found';
        else if (msg.includes('timeout')) errorType = 'Timeout';
        else if (msg.includes('to contain')) errorType = 'Missing Expected Value';
        
        if (!errorTypes[errorType]) errorTypes[errorType] = 0;
        errorTypes[errorType]++;
        
        return {
          title: a.title,
          errorType,
          message: msg.split('\\n')[0]
        };
      });
    
    categories[category].push({
      file: filename,
      path: filepath,
      failureCount: failedAssertions.length,
      failures: failedAssertions
    });
  }
});

// Sort categories by failure count
const sortedCategories = Object.entries(categories)
  .map(([name, tests]) => ({
    name,
    totalFiles: tests.length,
    totalFailures: tests.reduce((sum, t) => sum + t.failureCount, 0),
    tests
  }))
  .sort((a, b) => b.totalFailures - a.totalFailures);

// Output analysis
console.log('');
console.log('='.repeat(70));
console.log('TEST FAILURE ANALYSIS');
console.log('='.repeat(70));
console.log('');

console.log('SUMMARY');
console.log('-'.repeat(30));
console.log(`Total Failed Test Files: ${report.numFailedTestSuites || Object.values(categories).flat().length}`);
console.log(`Total Failed Assertions: ${report.numFailedTests || Object.values(categories).flat().reduce((sum, t) => sum + t.failureCount, 0)}`);
console.log('');

console.log('FAILURES BY CATEGORY');
console.log('-'.repeat(30));
sortedCategories.forEach(cat => {
  console.log(`${cat.name}: ${cat.totalFiles} files, ${cat.totalFailures} failures`);
});
console.log('');

console.log('ERROR TYPES');
console.log('-'.repeat(30));
Object.entries(errorTypes)
  .sort((a, b) => b[1] - a[1])
  .forEach(([type, count]) => {
    console.log(`${type}: ${count}`);
  });
console.log('');

console.log('DETAILED BREAKDOWN BY CATEGORY');
console.log('='.repeat(70));

sortedCategories.forEach(cat => {
  console.log('');
  console.log(`[${cat.name}] - ${cat.totalFailures} failures in ${cat.totalFiles} files`);
  console.log('-'.repeat(50));
  
  cat.tests.forEach(test => {
    console.log(`  📁 ${test.file}`);
    test.failures.forEach(f => {
      console.log(`     ❌ ${f.title}`);
      console.log(`        Type: ${f.errorType}`);
    });
  });
});

// Common patterns
console.log('');
console.log('='.repeat(70));
console.log('COMMON PATTERNS & RECOMMENDATIONS');
console.log('='.repeat(70));

if (errorTypes['Undefined Result'] > 3) {
  console.log('');
  console.log('⚠️  Multiple "Undefined Result" errors');
  console.log('   → Likely issue: API responses or mocked data not returning expected structure');
  console.log('   → Check: Mock implementations and API response handling');
}

if (errorTypes['Count Mismatch'] > 2) {
  console.log('');
  console.log('⚠️  Multiple "Count Mismatch" errors');
  console.log('   → Likely issue: Pattern detection not finding expected vulnerabilities');
  console.log('   → Check: Pattern regex compilation and test data');
}

if (categories['AST'] && categories['AST'].length > 2) {
  console.log('');
  console.log('⚠️  Multiple AST-related failures');
  console.log('   → Likely issue: AST service integration or parsing issues');
  console.log('   → Check: AST service mocks and pattern matching logic');
}

if (categories['Pattern'] && categories['Pattern'].length > 1) {
  console.log('');
  console.log('⚠️  Pattern system failures');
  console.log('   → Likely issue: Pattern API changes or regex serialization');
  console.log('   → Check: Pattern API client and regex reconstruction');
}

console.log('');
console.log('='.repeat(70));