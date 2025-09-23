#!/usr/bin/env bun

/**
 * Phase 6C Validation Script
 * Tests Java (WebGoat) and PHP (DVWA) vulnerability detection and test generation
 */

// Configure API access for full pattern coverage
// Use local API to avoid 500 errors with PHP patterns
process.env.RSOLV_API_URL = 'http://localhost:4001';

// Use local full access API key for testing
process.env.RSOLV_API_KEY = 'rsolv_test_full_access_no_quota_2025';

import { AdaptiveTestGenerator } from '../src/ai/adaptive-test-generator.js';
import { TestFrameworkDetector } from '../src/ai/test-framework-detector.js';
import { CoverageAnalyzer } from '../src/ai/coverage-analyzer.js';
import { IssueInterpreter } from '../src/ai/issue-interpreter.js';
import { SecurityDetectorV2 } from '../src/security/detector-v2.js';
import { VulnerabilityType } from '../src/security/types.js';
import { readFileSync, existsSync } from 'fs';
import * as path from 'path';

// Test apps configuration
const TEST_APPS = {
  webgoat: {
    path: '../vulnerable-apps/WebGoat',
    language: 'java',
    vulnerabilities: [
      {
        type: VulnerabilityType.SQL_INJECTION,
        file: 'src/main/java/org/owasp/webgoat/lessons/sqlinjection/advanced/SqlInjectionAdvanced.java',
        description: 'SQL injection in advanced lesson'
      },
      {
        type: VulnerabilityType.SQL_INJECTION,
        file: 'src/it/java/org/owasp/webgoat/integration/SqlInjectionLessonIntegrationTest.java',
        description: 'SQL injection integration test example'
      }
    ]
  },
  dvwa: {
    path: '../vulnerable-apps/DVWA',
    language: 'php',
    vulnerabilities: [
      {
        type: VulnerabilityType.SQL_INJECTION,
        file: 'vulnerabilities/sqli/source/low.php',
        description: 'SQL injection in user input'
      },
      {
        type: VulnerabilityType.COMMAND_INJECTION,
        file: 'vulnerabilities/exec/source/low.php',
        description: 'Command injection via ping functionality'
      },
      {
        type: VulnerabilityType.CSRF,
        file: 'vulnerabilities/csrf/source/low.php',
        description: 'CSRF vulnerability in password change'
      }
    ]
  }
};

async function validateApp(appName: string, appConfig: any) {
  console.log(`\n🔍 Validating ${appName.toUpperCase()}...`);
  console.log('=' .repeat(50));
  
  const basePath = path.join(__dirname, appConfig.path);
  
  // Check if app exists
  if (!existsSync(basePath)) {
    console.error(`❌ ${appName} not found at ${basePath}`);
    console.log(`   Please clone ${appName} to vulnerable-apps/ directory`);
    return;
  }
  
  // Initialize components
  const frameworkDetector = new TestFrameworkDetector();
  const coverageAnalyzer = new CoverageAnalyzer();
  const issueInterpreter = new IssueInterpreter();
  const testGenerator = new AdaptiveTestGenerator(
    frameworkDetector,
    coverageAnalyzer,
    issueInterpreter
  );
  const securityDetector = new SecurityDetectorV2();
  
  // Build repo structure (simplified)
  const repoStructure: Record<string, string> = {};
  
  if (appConfig.language === 'java') {
    // Add pom.xml for WebGoat
    const pomPath = path.join(basePath, 'pom.xml');
    if (existsSync(pomPath)) {
      repoStructure['pom.xml'] = readFileSync(pomPath, 'utf8');
    }
  } else if (appConfig.language === 'php') {
    // Add composer.json for DVWA if exists
    const composerPath = path.join(basePath, 'composer.json');
    if (existsSync(composerPath)) {
      repoStructure['composer.json'] = readFileSync(composerPath, 'utf8');
    } else {
      // Create a mock composer.json for DVWA
      repoStructure['composer.json'] = JSON.stringify({
        "require-dev": {
          "phpunit/phpunit": "^9.5"
        }
      });
    }
  }
  
  // Test each vulnerability
  for (const vuln of appConfig.vulnerabilities) {
    console.log(`\n📋 Testing ${vuln.type}:`);
    console.log(`   File: ${vuln.file}`);
    console.log(`   Description: ${vuln.description}`);
    
    const filePath = path.join(basePath, vuln.file);
    
    // 1. Detect vulnerability
    if (existsSync(filePath)) {
      const fileContent = readFileSync(filePath, 'utf8');
      repoStructure[vuln.file] = fileContent;
      
      console.log(`\n   1️⃣ Detecting vulnerability...`);
      const detectionResult = await securityDetector.detect(
        fileContent,
        appConfig.language,
        vuln.file
      );
      
      const found = detectionResult.find(v => 
        v.type === vuln.type
      );
      
      if (found) {
        console.log(`   ✅ Vulnerability detected at line ${found.line}`);
      } else {
        console.log(`   ⚠️  Vulnerability not detected by patterns`);
      }
      
      // 2. Generate tests
      console.log(`\n   2️⃣ Generating tests...`);
      const testResult = await testGenerator.generateAdaptiveTests(
        {
          id: `${appName}-${vuln.type}`,
          title: vuln.description,
          body: vuln.description,
          repository: { language: appConfig.language },
          type: vuln.type,
          file: vuln.file
        } as any,
        repoStructure
      );
      
      if (testResult.success) {
        console.log(`   ✅ Test generated with ${testResult.framework} framework`);
        console.log(`   📄 Test preview:`);
        console.log(testResult.testCode.split('\n').slice(0, 10).join('\n'));
        console.log('   ...');
        
        // Validate test structure
        validateTestStructure(testResult.testCode, testResult.framework, appConfig.language);
      } else {
        console.log(`   ❌ Test generation failed: ${testResult.error}`);
      }
    } else {
      console.log(`   ⚠️  File not found: ${filePath}`);
    }
  }
}

function validateTestStructure(testCode: string, framework: string, language: string) {
  console.log(`\n   3️⃣ Validating test structure...`);
  
  let checks = [];
  
  if (language === 'java') {
    if (framework === 'junit5') {
      checks = [
        { name: 'JUnit 5 imports', pattern: /import org\.junit\.jupiter\.api\.(Test|DisplayName)/ },
        { name: 'Parameterized test', pattern: /@ParameterizedTest|@MethodSource/ },
        { name: 'Red test', pattern: /vulnerability.*RED|vulnerable.*exists/ },
        { name: 'Green test', pattern: /prevent.*vulnerability|GREEN/ },
        { name: 'Assertions', pattern: /assertThrows|assertEquals|assertTrue/ }
      ];
    } else if (framework === 'testng') {
      checks = [
        { name: 'TestNG imports', pattern: /import org\.testng\.annotations\.(Test|DataProvider)/ },
        { name: 'Data provider', pattern: /@DataProvider/ },
        { name: 'Test annotation', pattern: /@Test/ }
      ];
    }
  } else if (language === 'php') {
    if (framework === 'phpunit') {
      checks = [
        { name: 'PHPUnit class', pattern: /extends TestCase/ },
        { name: 'Test methods', pattern: /public function test\w+/ },
        { name: 'Assertions', pattern: /\$this->assert\w+/ },
        { name: 'Red/Green/Refactor', pattern: /RED|GREEN|REFACTOR/ }
      ];
    } else if (framework === 'pest') {
      checks = [
        { name: 'Pest test functions', pattern: /it\(|test\(/ },
        { name: 'Expect assertions', pattern: /expect\(/ },
        { name: 'Dataset', pattern: /dataset\(|->with\(/ }
      ];
    }
  }
  
  for (const check of checks) {
    if (check.pattern.test(testCode)) {
      console.log(`   ✅ ${check.name}`);
    } else {
      console.log(`   ❌ Missing: ${check.name}`);
    }
  }
}

// Main execution
async function main() {
  console.log('🚀 Phase 6C Validation - Java/PHP Vulnerable Apps');
  console.log('=' .repeat(50));
  
  // Validate WebGoat (Java)
  await validateApp('webgoat', TEST_APPS.webgoat);
  
  // Validate DVWA (PHP)
  await validateApp('dvwa', TEST_APPS.dvwa);
  
  console.log('\n✅ Validation complete!');
  console.log('\nNext steps:');
  console.log('1. Run generated tests in actual applications');
  console.log('2. Verify tests fail on vulnerable code (RED)');
  console.log('3. Apply fixes and verify tests pass (GREEN)');
  console.log('4. Test fix validation iteration');
}

main().catch(console.error);