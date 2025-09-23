#!/usr/bin/env bun

import { SecurityDetectorV3 } from '../src/security/detector-v3.js';
import { ApiPatternSource } from '../src/security/pattern-source.js';

// Test multi-language detection with real staging API
async function testMultiLanguageDetection() {
  console.log('🧪 Testing SecurityDetectorV3 with real staging API...\n');

  const apiKey = process.env.RSOLV_API_KEY;
  if (!apiKey) {
    console.error('❌ RSOLV_API_KEY not set. Please set it to test with real API.');
    process.exit(1);
  }

  // Create detector with staging API
  const detector = new SecurityDetectorV3({
    apiKey,
    apiUrl: 'https://api.rsolv-staging.com',
    patternSource: new ApiPatternSource({
      apiUrl: 'https://api.rsolv-staging.com',
      apiKey
    })
  });

  console.log('✅ Detector created with staging API\n');

  // Test cases for different languages
  const testCases = [
    {
      name: 'JavaScript SQL Injection',
      language: 'javascript',
      code: `
const query = "SELECT * FROM users WHERE id = " + req.params.id;
db.query(query);
      `,
      expectedType: 'sql-injection'
    },
    {
      name: 'Python SQL Injection',
      language: 'python',
      code: `
query = "SELECT * FROM users WHERE id = " + user_id
cursor.execute(query)
      `,
      expectedType: 'sql-injection'
    },
    {
      name: 'Ruby Command Injection',
      language: 'ruby',
      code: `
cmd = "echo " + params[:message]
system(cmd)
      `,
      expectedType: 'command-injection'
    },
    {
      name: 'PHP XSS',
      language: 'php',
      code: `
<?php
echo "<div>" . $_GET['name'] . "</div>";
?>
      `,
      expectedType: 'xss'
    },
    {
      name: 'Java Path Traversal',
      language: 'java',
      code: `
String filename = request.getParameter("file");
File file = new File("/uploads/" + filename);
      `,
      expectedType: 'path-traversal'
    },
    {
      name: 'Go SQL Injection',
      language: 'go',
      code: `
query := "SELECT * FROM users WHERE id = " + userID
rows, err := db.Query(query)
      `,
      expectedType: 'sql-injection'
    }
  ];

  let totalTests = 0;
  let passedTests = 0;

  for (const testCase of testCases) {
    totalTests++;
    console.log(`\n📝 Testing: ${testCase.name}`);
    console.log(`   Language: ${testCase.language}`);
    
    try {
      const vulnerabilities = await detector.detect(
        testCase.code, 
        testCase.language, 
        `test.${testCase.language}`
      );

      if (vulnerabilities.length > 0) {
        console.log(`   ✅ Found ${vulnerabilities.length} vulnerabilities:`);
        for (const vuln of vulnerabilities) {
          console.log(`      - ${vuln.type} (line ${vuln.line}, confidence: ${vuln.confidence}%)`);
          if (vuln.type === testCase.expectedType) {
            passedTests++;
          }
        }
      } else {
        console.log(`   ❌ No vulnerabilities found`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }

  // Test batch analysis
  console.log('\n\n📦 Testing batch analysis...');
  const files = testCases.map((tc, i) => ({
    path: `test${i}.${tc.language}`,
    content: tc.code
  }));

  try {
    const results = await detector.analyzeFiles(files);
    console.log(`✅ Batch analysis completed for ${results.size} files`);
    
    for (const [path, vulns] of results) {
      if (vulns.length > 0) {
        console.log(`   ${path}: ${vulns.length} vulnerabilities`);
      }
    }
  } catch (error) {
    console.log(`❌ Batch analysis error: ${error.message}`);
  }

  // Summary
  console.log(`\n\n📊 Summary:`);
  console.log(`   Total tests: ${totalTests}`);
  console.log(`   Passed: ${passedTests}`);
  console.log(`   Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  console.log(`   Supported languages: ${detector.getSupportedLanguages().join(', ')}`);
}

// Run tests
testMultiLanguageDetection().catch(console.error);