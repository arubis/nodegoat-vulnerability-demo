#!/usr/bin/env node

/**
 * Memory Analysis Tool for Test Suite
 * Identifies memory-hungry test files and provides optimization recommendations
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

// ANSI color codes
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

/**
 * Format bytes to human readable
 */
function formatMemory(bytes) {
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(2)} MB`;
  }
  return `${(mb / 1024).toFixed(2)} GB`;
}

/**
 * Run a single test file and measure memory
 */
async function measureTestMemory(testFile) {
  return new Promise((resolve) => {
    const startMemory = process.memoryUsage();
    
    // Run test with memory tracking
    const child = spawn('node', [
      '--expose-gc',
      '--max-old-space-size=4096',
      'node_modules/.bin/vitest',
      'run',
      testFile,
      '--reporter=json',
      '--no-coverage'
    ], {
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let output = '';
    let error = '';
    let peakHeap = 0;
    let samples = [];
    
    // Sample memory every 100ms
    const memoryInterval = setInterval(() => {
      try {
        // Get child process memory if possible
        const memInfo = process.memoryUsage();
        samples.push(memInfo.heapUsed);
        peakHeap = Math.max(peakHeap, memInfo.heapUsed);
      } catch (e) {
        // Ignore errors
      }
    }, 100);
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    child.on('close', (code) => {
      clearInterval(memoryInterval);
      
      const endMemory = process.memoryUsage();
      const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;
      
      // Parse test results
      let testCount = 0;
      let duration = 0;
      let passed = false;
      
      try {
        const jsonOutput = JSON.parse(output);
        if (jsonOutput.testResults && jsonOutput.testResults[0]) {
          const result = jsonOutput.testResults[0];
          testCount = result.assertionResults?.length || 0;
          duration = result.endTime - result.startTime;
          passed = result.status === 'passed';
        }
      } catch (e) {
        // Try to parse from stderr for test counts
        const testMatch = error.match(/(\d+) test/);
        if (testMatch) {
          testCount = parseInt(testMatch[1]);
        }
        passed = code === 0;
      }
      
      // Calculate average memory per test
      const avgMemoryPerTest = testCount > 0 ? memoryDelta / testCount : memoryDelta;
      
      resolve({
        file: testFile,
        passed,
        testCount,
        duration,
        memoryDelta,
        peakHeap,
        avgMemoryPerTest,
        samples,
        error: code !== 0 ? error : null
      });
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      child.kill();
      resolve({
        file: testFile,
        passed: false,
        error: 'Timeout',
        memoryDelta: 0,
        peakHeap,
        samples
      });
    }, 30000);
  });
}

/**
 * Analyze test directory
 */
async function analyzeTestDirectory(pattern) {
  console.log(`${colors.blue}Analyzing test files matching: ${pattern}${colors.reset}\n`);
  
  // Find all test files
  const testFiles = await glob(pattern);
  console.log(`Found ${testFiles.length} test files\n`);
  
  const results = [];
  
  // Measure each file
  for (let i = 0; i < testFiles.length; i++) {
    const file = testFiles[i];
    const shortName = path.relative(process.cwd(), file);
    
    process.stdout.write(`[${i + 1}/${testFiles.length}] Testing ${shortName}... `);
    
    // Run garbage collection before each test
    if (global.gc) {
      global.gc();
    }
    
    const result = await measureTestMemory(file);
    results.push(result);
    
    if (result.error === 'Timeout') {
      console.log(`${colors.red}TIMEOUT${colors.reset}`);
    } else if (!result.passed) {
      console.log(`${colors.red}FAILED${colors.reset}`);
    } else {
      const color = result.peakHeap > 100 * 1024 * 1024 ? colors.yellow : colors.green;
      console.log(`${color}${formatMemory(result.peakHeap)}${colors.reset}`);
    }
  }
  
  return results;
}

/**
 * Generate report
 */
function generateReport(results) {
  console.log('\n' + '='.repeat(80));
  console.log('MEMORY ANALYSIS REPORT');
  console.log('='.repeat(80) + '\n');
  
  // Sort by peak memory usage
  const sorted = results.sort((a, b) => b.peakHeap - a.peakHeap);
  
  // Top memory consumers
  console.log(`${colors.red}Top 10 Memory Consumers:${colors.reset}`);
  console.log('-'.repeat(80));
  
  sorted.slice(0, 10).forEach((result, i) => {
    const shortName = path.relative(process.cwd(), result.file);
    const memColor = result.peakHeap > 200 * 1024 * 1024 ? colors.red : 
                     result.peakHeap > 100 * 1024 * 1024 ? colors.yellow : 
                     colors.green;
    
    console.log(
      `${i + 1}. ${shortName}\n` +
      `   Peak: ${memColor}${formatMemory(result.peakHeap)}${colors.reset} | ` +
      `   Tests: ${result.testCount || '?'} | ` +
      `   Avg/Test: ${formatMemory(result.avgMemoryPerTest || 0)}`
    );
  });
  
  // Statistics
  console.log('\n' + '-'.repeat(80));
  console.log(`${colors.blue}Statistics:${colors.reset}`);
  
  const totalMemory = results.reduce((sum, r) => sum + r.peakHeap, 0);
  const avgMemory = totalMemory / results.length;
  const maxMemory = Math.max(...results.map(r => r.peakHeap));
  
  console.log(`Total files analyzed: ${results.length}`);
  console.log(`Average peak memory: ${formatMemory(avgMemory)}`);
  console.log(`Maximum peak memory: ${formatMemory(maxMemory)}`);
  console.log(`Total memory used: ${formatMemory(totalMemory)}`);
  
  // Problem files
  const problemFiles = results.filter(r => r.peakHeap > 200 * 1024 * 1024);
  if (problemFiles.length > 0) {
    console.log(`\n${colors.red}Problem files (>200MB):${colors.reset} ${problemFiles.length}`);
    problemFiles.forEach(f => {
      console.log(`  - ${path.relative(process.cwd(), f.file)}: ${formatMemory(f.peakHeap)}`);
    });
  }
  
  // Recommendations
  console.log('\n' + '-'.repeat(80));
  console.log(`${colors.yellow}Recommendations:${colors.reset}`);
  
  if (maxMemory > 500 * 1024 * 1024) {
    console.log('⚠ Some tests use >500MB - consider splitting into smaller files');
  }
  
  const highMemoryTests = results.filter(r => r.avgMemoryPerTest > 50 * 1024 * 1024);
  if (highMemoryTests.length > 0) {
    console.log(`⚠ ${highMemoryTests.length} files have high per-test memory (>50MB/test)`);
    console.log('  Consider:');
    console.log('  - Reducing mock data size');
    console.log('  - Adding afterEach cleanup hooks');
    console.log('  - Using shallow mocks instead of deep ones');
  }
  
  // Save detailed report
  const reportPath = path.join(process.cwd(), 'memory-analysis-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      totalFiles: results.length,
      avgMemory,
      maxMemory,
      totalMemory
    },
    details: sorted
  }, null, 2));
  
  console.log(`\n✓ Detailed report saved to: ${reportPath}`);
}

/**
 * Main
 */
async function main() {
  const pattern = process.argv[2] || 'src/**/*.test.ts';
  
  console.log(`${colors.blue}Test Memory Analyzer${colors.reset}`);
  console.log('='.repeat(80));
  console.log('This tool measures memory usage for each test file');
  console.log('It may take several minutes to complete...\n');
  
  try {
    const results = await analyzeTestDirectory(pattern);
    generateReport(results);
  } catch (error) {
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  // Check if glob is installed
  try {
    require('glob');
  } catch (e) {
    console.error('Please install glob: npm install glob');
    process.exit(1);
  }
  
  main().catch(console.error);
}

module.exports = { measureTestMemory, analyzeTestDirectory };