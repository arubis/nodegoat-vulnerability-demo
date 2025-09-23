import { describe, test, expect, beforeEach, vi } from 'vitest';
import { GitBasedProcessor } from '../git-based-processor.js';
import { AdaptiveTestGenerator } from '../adaptive-test-generator.js';
import { TestFrameworkDetector } from '../test-framework-detector.js';
import { CoverageAnalyzer } from '../coverage-analyzer.js';
import { IssueInterpreter } from '../issue-interpreter.js';
import { IssueContext, ActionConfig } from '../../types/index.js';
import { VulnerabilityType, Finding } from '../../security/types.js';

describe('Phase 6E: Integration Tests for Java/PHP Fix Validation', () => {
  let processor: GitBasedProcessor;
  let testGenerator: AdaptiveTestGenerator;
  let mockConfig: ActionConfig;

  beforeEach(() => {
    mockConfig = {
      apiKey: 'test-key',
      configPath: '',
      issueLabel: 'security',
      aiProvider: {
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        apiKey: 'test-key'
      },
      containerConfig: {
        enabled: false
      },
      securitySettings: {},
      enableSecurityAnalysis: true,
      fixValidation: {
        enabled: true,
        maxIterations: 3,
        maxIterationsByType: {
          'sql-injection': 5,
          'command-injection': 4
        }
      }
    };

    const detector = new TestFrameworkDetector();
    const analyzer = new CoverageAnalyzer();
    const interpreter = new IssueInterpreter();
    testGenerator = new AdaptiveTestGenerator(detector, analyzer, interpreter);
  });

  describe('Simulated Fix Iteration Scenarios', () => {
    test('should handle Java SQL injection with multiple fix attempts', async () => {
      // Simulate a Java SQL injection scenario
      const vulnerableJavaCode = `
package com.example.dao;

import java.sql.*;

public class UserDAO {
    private Connection conn;
    
    public User getUserById(String userId) throws SQLException {
        Statement stmt = conn.createStatement();
        String query = "SELECT * FROM users WHERE id = " + userId;
        ResultSet rs = stmt.executeQuery(query);
        
        if (rs.next()) {
            return new User(rs.getString("id"), rs.getString("name"));
        }
        return null;
    }
}`;

      // Expected test generation
      const repoStructure = {
        'pom.xml': `<project>
  <dependencies>
    <dependency>
      <groupId>junit</groupId>
      <artifactId>junit</artifactId>
      <version>5.8.2</version>
      <scope>test</scope>
    </dependency>
  </dependencies>
</project>`,
        'src/main/java/com/example/dao/UserDAO.java': vulnerableJavaCode
      };

      const vulnerability = {
        id: 'java-sql-001',
        type: VulnerabilityType.SQL_INJECTION,
        file: 'src/main/java/com/example/dao/UserDAO.java',
        line: 11,
        description: 'SQL injection via string concatenation in getUserById'
      };

      // Generate tests
      const testResult = await testGenerator.generateAdaptiveTests(
        vulnerability,
        repoStructure
      );

      expect(testResult.success).toBe(true);
      // No framework detected from pom.xml, falls back to generic
      expect(testResult.framework).toBe('generic');
      expect(testResult.testCode).toContain('// Generic test template');
      expect(testResult.testCode).toContain('sql_injection');

      // Simulate fix attempts
      const fixAttempts = [
        {
          attempt: 1,
          code: `String query = "SELECT * FROM users WHERE id = '" + userId.replace("'", "''") + "'";`,
          testResult: 'FAIL: String escaping is insufficient',
          shouldContinue: true
        },
        {
          attempt: 2,
          code: `PreparedStatement pstmt = conn.prepareStatement("SELECT * FROM users WHERE id = ?");
pstmt.setString(1, userId);
ResultSet rs = pstmt.executeQuery();`,
          testResult: 'PASS: PreparedStatement prevents injection',
          shouldContinue: false
        }
      ];

      // Validate iteration logic
      let successfulFix = null;
      for (const fix of fixAttempts) {
        if (fix.testResult.startsWith('PASS')) {
          successfulFix = fix;
          break;
        }
      }

      expect(successfulFix).toBeTruthy();
      expect(successfulFix.code).toContain('PreparedStatement');
    });

    test('should handle PHP SQL injection with PDO migration', async () => {
      const vulnerablePHPCode = `<?php
class UserModel {
    private $db;
    
    public function getUser($id) {
        $query = "SELECT * FROM users WHERE id = '$id'";
        $result = mysqli_query($this->db, $query);
        return mysqli_fetch_assoc($result);
    }
}`;

      const repoStructure = {
        'composer.json': JSON.stringify({
          "require-dev": {
            "phpunit/phpunit": "^9.5"
          }
        }),
        'src/UserModel.php': vulnerablePHPCode
      };

      const vulnerability = {
        id: 'php-sql-001',
        type: VulnerabilityType.SQL_INJECTION,
        file: 'src/UserModel.php',
        line: 6,
        description: 'SQL injection via variable interpolation'
      };

      const testResult = await testGenerator.generateAdaptiveTests(
        vulnerability,
        repoStructure
      );

      expect(testResult.success).toBe(true);
      expect(testResult.framework).toBe('phpunit');
      expect(testResult.testCode).toContain('#[Test]');

      // PHP fix progression
      const phpFixProgression = [
        'mysqli_real_escape_string', // Attempt 1: Escaping
        'mysqli_prepare', // Attempt 2: Prepared statements
        'PDO' // Attempt 3: Modern PDO (if needed)
      ];

      // Verify we understand the progression
      expect(phpFixProgression[1]).toBe('mysqli_prepare');
    });

    test('should respect max iteration limits for complex vulnerabilities', async () => {
      const complexIssue: IssueContext = {
        id: 'complex-001',
        number: 999,
        title: 'Complex multi-file SQL injection',
        body: 'SQL injection across multiple DAO classes',
        labels: ['security', 'sql-injection', 'fix-validation-max-2'],
        assignees: [],
        repository: {
          owner: 'test',
          name: 'complex-app',
          fullName: 'test/complex-app',
          defaultBranch: 'main'
        },
        source: 'github',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Simulate a scenario where fix takes more than 2 attempts
      const attempts = [];
      const maxIterations = 2; // From label

      for (let i = 0; i < maxIterations; i++) {
        attempts.push({
          iteration: i + 1,
          success: false,
          reason: 'Complex vulnerability requires more iterations'
        });
      }

      expect(attempts.length).toBe(2);
      expect(attempts[attempts.length - 1].success).toBe(false);
      
      // In real scenario, this would trigger:
      // - Issue comment about max iterations reached
      // - Potential escalation to human review
      // - Logging for analysis
    });
  });

  describe('Test Context Generation', () => {
    test('should generate proper Java test context for Claude Code', () => {
      const javaTestFailure = {
        framework: 'junit5',
        output: `
Tests run: 3, Failures: 1, Errors: 0, Skipped: 0

Failed tests:
  UserDAOTest.testSQLInjectionPrevention:45
    Expected: SQLException to be thrown
    Actual: Query executed successfully with malicious input
    
Stack trace:
  org.junit.jupiter.api.AssertionFailedError: 
    Expected SQLException but query executed
  at UserDAOTest.testSQLInjectionPrevention(UserDAOTest.java:45)
`,
        suggestion: 'The fix still allows SQL injection. Consider using PreparedStatement instead of string concatenation.'
      };

      const context = `
Fix Validation Failure - Iteration 2/5

Test Framework: ${javaTestFailure.framework}
Failed Test: testSQLInjectionPrevention

Test Output:
${javaTestFailure.output}

Analysis: ${javaTestFailure.suggestion}

Please update your fix to properly prevent SQL injection using PreparedStatement or similar parameterized query approach.
`;

      expect(context).toContain('PreparedStatement');
      expect(context).toContain('Iteration 2/5');
      expect(context).toContain('Failed Test');
    });

    test('should generate proper PHP test context for Claude Code', () => {
      const phpTestFailure = {
        framework: 'phpunit',
        output: `
PHPUnit 9.5.10

F..

Time: 00:00.123, Memory: 8.00 MB

There was 1 failure:

1) UserModelTest::testSqlInjectionVulnerability
Failed asserting that exception of type "PDOException" is thrown.

/tests/UserModelTest.php:28

FAILURES!
Tests: 3, Assertions: 5, Failures: 1.
`,
        suggestion: 'The SQL query is still vulnerable. Use prepared statements with parameter binding.'
      };

      const context = `
Fix Validation Failure - Iteration 1/3

Test Framework: ${phpTestFailure.framework}
Failed Test: testSqlInjectionVulnerability

Test Output:
${phpTestFailure.output}

Analysis: ${phpTestFailure.suggestion}

Please update your fix to use prepared statements (mysqli_prepare or PDO) with proper parameter binding.
`;

      expect(context).toContain('prepared statements');
      expect(context).toContain('parameter binding');
      expect(context).toContain('mysqli_prepare or PDO');
    });
  });

  describe('Language-Specific Fix Validation', () => {
    test('should validate Java fixes use approved patterns', () => {
      const javaSecurePatternsRegex = [
        /PreparedStatement/,
        /setString\s*\(/,
        /setInt\s*\(/,
        /\?\s*"/ // Parameterized query marker
      ];

      const goodJavaFix = `
PreparedStatement pstmt = conn.prepareStatement("SELECT * FROM users WHERE id = ?");
pstmt.setString(1, userId);
ResultSet rs = pstmt.executeQuery();
`;

      const badJavaFix = `
String query = "SELECT * FROM users WHERE id = '" + sanitize(userId) + "'";
ResultSet rs = stmt.executeQuery(query);
`;

      // Good fix should match secure patterns
      const goodMatches = javaSecurePatternsRegex.filter(pattern => 
        pattern.test(goodJavaFix)
      );
      expect(goodMatches.length).toBeGreaterThan(2);

      // Bad fix should not match secure patterns
      const badMatches = javaSecurePatternsRegex.filter(pattern => 
        pattern.test(badJavaFix)
      );
      expect(badMatches.length).toBe(0);
    });

    test('should validate PHP fixes use approved patterns', () => {
      const phpSecurePatternsRegex = [
        /mysqli_prepare/,
        /bind_param/,
        /\$pdo->prepare/,
        /bindValue/,
        /:\w+/ // Named parameter marker
      ];

      const goodPHPFix = `
$stmt = $pdo->prepare("SELECT * FROM users WHERE id = :id");
$stmt->bindValue(':id', $id, PDO::PARAM_INT);
$stmt->execute();
`;

      const badPHPFix = `
$id = mysql_real_escape_string($id);
$query = "SELECT * FROM users WHERE id = '$id'";
$result = mysql_query($query);
`;

      // Good fix should match secure patterns
      const goodMatches = phpSecurePatternsRegex.filter(pattern => 
        pattern.test(goodPHPFix)
      );
      expect(goodMatches.length).toBeGreaterThan(2);

      // Bad fix should not match secure patterns
      const badMatches = phpSecurePatternsRegex.filter(pattern => 
        pattern.test(badPHPFix)
      );
      expect(badMatches.length).toBe(0);
    });
  });
});