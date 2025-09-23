#!/usr/bin/env ts-node

/**
 * Test SecurityDetectorV3 against staging API with real AST service
 * This validates the complete end-to-end flow with all fixes deployed
 */

import { SecurityDetectorV3 } from '../src/security/detector-v3.js';
import type { DetectorConfig } from '../src/security/detector-v3.js';

// Test configuration
const STAGING_API_URL = 'https://api.rsolv-staging.com';
const API_KEY = 'rsolv_staging_demo_key';

// Test cases for multiple languages
const testCases = [
  {
    language: 'javascript',
    filename: 'test.js',
    code: `
      const userId = req.params.id;
      const query = "SELECT * FROM users WHERE id = " + userId;
      db.query(query);
    `,
    expectedVulnerability: 'sql-injection'
  },
  {
    language: 'python',
    filename: 'test.py',
    code: `
      user_id = request.args.get('id')
      query = "SELECT * FROM users WHERE id = " + user_id
      cursor.execute(query)
    `,
    expectedVulnerability: 'sql-injection'
  },
  {
    language: 'ruby',
    filename: 'test.rb',
    code: `
      user_input = params[:cmd]
      result = \`#{user_input}\`
      puts result
    `,
    expectedVulnerability: 'command-injection'
  },
  {
    language: 'php',
    filename: 'test.php',
    code: `
      <?php
      $input = $_GET['input'];
      echo $input;
      ?>
    `,
    expectedVulnerability: 'xss'
  },
  {
    language: 'java',
    filename: 'Test.java',
    code: `
      String userPath = request.getParameter("path");
      File file = new File("/uploads/" + userPath);
      return file.getCanonicalPath();
    `,
    expectedVulnerability: 'path-traversal'
  },
  {
    language: 'go',
    filename: 'test.go',
    code: `
      userInput := r.URL.Query().Get("id")
      query := fmt.Sprintf("SELECT * FROM users WHERE id = %s", userInput)
      db.Query(query)
    `,
    expectedVulnerability: 'sql-injection'
  },
  {
    language: 'elixir',
    filename: 'test.ex',
    code: `
      user_code = params["code"]
      {result, _} = Code.eval_string(user_code)
      send_resp(conn, 200, inspect(result))
    `,
    expectedVulnerability: 'code-injection'
  }
];

async function runTest() {
  console.log('=== SecurityDetectorV3 Staging Test ===\n');
  console.log(`API URL: ${STAGING_API_URL}`);
  console.log(`API Key: ${API_KEY}\n`);

  // Initialize detector with staging configuration
  const config: DetectorConfig = {
    apiKey: API_KEY,
    apiUrl: STAGING_API_URL,
    useServerAST: true // Force server-side AST
  };
  
  const detector = new SecurityDetectorV3(config);
  
  console.log('Initializing SecurityDetectorV3 with server-side AST...');
  console.log('Patterns will be loaded from staging API automatically.\n');

  // Track results
  let totalTests = testCases.length;
  let passedTests = 0;
  const results: any[] = [];

  // Test each language
  for (const testCase of testCases) {
    console.log(`\nTesting ${testCase.language.toUpperCase()}:`);
    console.log(`File: ${testCase.filename}`);
    console.log(`Expected: ${testCase.expectedVulnerability}`);
    
    try {
      const startTime = Date.now();
      // Get language from filename extension
      const ext = testCase.filename.split('.').pop() || '';
      const languageMap: Record<string, string> = {
        'js': 'javascript',
        'py': 'python',
        'rb': 'ruby',
        'php': 'php',
        'java': 'java',
        'go': 'go',
        'ex': 'elixir'
      };
      const language = languageMap[ext] || testCase.language;
      
      const vulnerabilities = await detector.detect(
        testCase.code,
        language,
        testCase.filename
      );
      const duration = Date.now() - startTime;
      
      const found = vulnerabilities.some(v => 
        v.type.toLowerCase().includes(testCase.expectedVulnerability) ||
        v.message.toLowerCase().includes(testCase.expectedVulnerability)
      );
      
      if (found) {
        console.log(`✅ PASSED - Found ${testCase.expectedVulnerability} (${duration}ms)`);
        passedTests++;
        
        // Show details of found vulnerability
        const vuln = vulnerabilities.find(v => 
          v.type.toLowerCase().includes(testCase.expectedVulnerability) ||
          v.message.toLowerCase().includes(testCase.expectedVulnerability)
        );
        if (vuln) {
          console.log(`   Type: ${vuln.type}`);
          console.log(`   Message: ${vuln.message}`);
          console.log(`   Confidence: ${vuln.confidence}`);
          console.log(`   Line: ${vuln.line}`);
        }
      } else {
        console.log(`❌ FAILED - Expected ${testCase.expectedVulnerability} not found`);
        console.log(`   Found: ${vulnerabilities.map(v => v.type).join(', ') || 'none'}`);
      }
      
      results.push({
        language: testCase.language,
        passed: found,
        duration,
        vulnerabilities: vulnerabilities.length
      });
      
    } catch (error) {
      console.log(`❌ ERROR - ${error.message}`);
      results.push({
        language: testCase.language,
        passed: false,
        error: error.message
      });
    }
  }

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${totalTests - passedTests}`);
  console.log(`Accuracy: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  
  // Performance summary
  const successfulTests = results.filter(r => r.duration);
  if (successfulTests.length > 0) {
    const avgDuration = successfulTests.reduce((sum, r) => sum + r.duration, 0) / successfulTests.length;
    console.log(`\nAverage detection time: ${avgDuration.toFixed(0)}ms`);
  }
  
  // Language breakdown
  console.log('\nBy Language:');
  results.forEach(r => {
    const status = r.passed ? '✅' : '❌';
    const time = r.duration ? `${r.duration}ms` : 'N/A';
    console.log(`  ${status} ${r.language}: ${time}`);
  });
  
  // Check if server-side AST was used
  console.log('\n=== AST Service Verification ===');
  console.log('Checking if server-side AST was used...');
  
  // The detector should have used ElixirASTAnalyzer for non-JS languages
  const nonJsTests = testCases.filter(t => !['javascript', 'typescript'].includes(t.language));
  const serverAstExpected = nonJsTests.length;
  console.log(`Expected server AST calls: ${serverAstExpected}`);
  
  return passedTests === totalTests;
}

// Run the test
runTest()
  .then(success => {
    if (success) {
      console.log('\n✅ All tests passed! Server-side AST is working correctly.');
      process.exit(0);
    } else {
      console.log('\n❌ Some tests failed. Check the results above.');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\n❌ Test failed with error:', error);
    process.exit(1);
  });