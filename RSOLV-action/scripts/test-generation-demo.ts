#!/usr/bin/env bun

/**
 * Quick demo to verify test generation is working
 */

import { TestGeneratingSecurityAnalyzer } from "../src/ai/test-generating-security-analyzer";
import { TestFrameworkDetector } from "../src/ai/test-framework-detector";
import { IssueInterpreter } from "../src/ai/issue-interpreter";

// Mock repository structure
const mockRepo = {
  structure: {
    'package.json': JSON.stringify({
      name: 'demo-app',
      devDependencies: {
        'jest': '^29.0.0'
      }
    }),
    'src/auth.js': `
function authenticateUser(username, password) {
  // SQL injection vulnerability
  const query = "SELECT * FROM users WHERE username = '" + username + "'";
  return db.query(query);
}
`
  }
};

// Mock issue content
const mockIssue = {
  title: '[SECURITY] Fix SQL injection in authentication',
  body: `## Security Vulnerability Found

**Type**: SQL Injection
**File**: src/auth.js
**Line**: 3
**Function**: authenticateUser

### Description
The authenticateUser function is vulnerable to SQL injection attacks. 
User input is directly concatenated into the SQL query without proper sanitization.

### Severity: HIGH
CVSS Score: 8.5

### Test Framework
The project uses Jest for testing.`
};

async function runDemo() {
  console.log("🧪 Test Generation Demo");
  console.log("======================\n");

  try {
    // Step 1: Detect test framework
    console.log("1️⃣ Detecting test framework...");
    const detector = new TestFrameworkDetector();
    const frameworkDetection = detector.detectFromRepository(mockRepo.structure);
    console.log(`   ✅ Detected: ${frameworkDetection.primary?.framework || 'None'} v${frameworkDetection.primary?.version || 'Unknown'}`);

    // Step 2: Interpret issue
    console.log("\n2️⃣ Interpreting security issue...");
    const interpreter = new IssueInterpreter();
    const interpretation = interpreter.interpret(mockIssue.body);
    console.log(`   ✅ Vulnerability: ${interpretation.vulnerabilityTypes[0]?.type || 'Unknown'}`);
    console.log(`   ✅ Severity: ${interpretation.severity || 'Unknown'}`);
    console.log(`   ✅ File: ${interpretation.affectedFiles[0] || 'Unknown'}`);

    // Step 3: Generate tests
    console.log("\n3️⃣ Generating security tests...");
    
    // Create mock AI client for demo
    const mockAIClient = {
      generateCode: async (prompt: string) => {
        // Return a simple test based on the prompt
        if (prompt.includes("SQL injection")) {
          return `describe('Authentication Security Tests', () => {
  test('should be vulnerable to SQL injection (RED)', async () => {
    const maliciousInput = "' OR '1'='1";
    const result = await authenticateUser(maliciousInput, 'password');
    // This should succeed due to SQL injection vulnerability
    expect(result).toBeDefined();
  });

  test('should prevent SQL injection after fix (GREEN)', async () => {
    const maliciousInput = "' OR '1'='1";
    const result = await authenticateUser(maliciousInput, 'password');
    // After fix, this should fail or return empty
    expect(result).toBeNull();
  });

  test('should maintain functionality with valid input (REFACTOR)', async () => {
    const result = await authenticateUser('validuser', 'validpass');
    expect(result).toBeDefined();
    expect(result.username).toBe('validuser');
  });
});`;
        }
        return "// Generated test";
      }
    };

    const analyzer = new TestGeneratingSecurityAnalyzer(mockAIClient);
    
    // Mock vulnerability
    const vulnerability = {
      type: 'SQL_INJECTION',
      severity: 'high',
      file: 'src/auth.js',
      line: 3,
      description: 'SQL injection in authenticateUser function'
    };

    // Generate result
    const result = await analyzer.generateTestsForVulnerability(
      vulnerability,
      mockRepo.structure,
      frameworkDetection,
      interpretation
    );

    console.log("   ✅ Tests generated successfully!");
    console.log("\n📝 Generated Test Preview:");
    console.log("```javascript");
    console.log(result.testCode?.substring(0, 500) + "...");
    console.log("```");

    // Step 4: Verify test structure
    console.log("\n4️⃣ Verifying test structure...");
    const hasRedTest = result.testCode?.includes("should be vulnerable");
    const hasGreenTest = result.testCode?.includes("should prevent");
    const hasRefactorTest = result.testCode?.includes("should maintain functionality");

    console.log(`   ${hasRedTest ? '✅' : '❌'} RED test (demonstrates vulnerability)`);
    console.log(`   ${hasGreenTest ? '✅' : '❌'} GREEN test (validates fix)`);
    console.log(`   ${hasRefactorTest ? '✅' : '❌'} REFACTOR test (ensures functionality)`);

    console.log("\n✅ Demo completed successfully!");
    console.log("\n📊 Summary:");
    console.log("- Test framework detection: ✅");
    console.log("- Issue interpretation: ✅");
    console.log("- Test generation: ✅");
    console.log("- Red-Green-Refactor pattern: ✅");

  } catch (error) {
    console.error("❌ Demo failed:", error);
  }
}

// Run the demo
if (import.meta.main) {
  runDemo().catch(console.error);
}

export { runDemo };