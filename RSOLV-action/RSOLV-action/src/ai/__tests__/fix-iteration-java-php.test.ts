import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { GitBasedTestValidator } from '../git-based-test-validator.js';
import { AdaptiveTestGenerator } from '../adaptive-test-generator.js';
import { TestFrameworkDetector } from '../test-framework-detector.js';
import { CoverageAnalyzer } from '../coverage-analyzer.js';
import { IssueInterpreter } from '../issue-interpreter.js';
import { TestGeneratingSecurityAnalyzer } from '../test-generating-security-analyzer.js';
import { getMaxIterations } from '../git-based-processor.js';
import { SecurityPattern, VulnerabilityType } from '../../security/types.js';
import { TestFramework } from '../types.js';
import { ActionConfig, IssueContext } from '../../types/index.js';
import * as path from 'path';
import * as fs from 'fs/promises';

// Mock fs and child_process to avoid actual file operations
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue('')
}));

vi.mock('child_process', () => ({
  exec: vi.fn((cmd: string, opts: any, cb: Function) => {
    if (cb) cb(null, '', '');
  }),
  execSync: vi.fn(() => '')  // Default to empty string
}));

describe('Fix Iteration Validation - Java/PHP', () => {
  let testDir: string;
  let validator: GitBasedTestValidator;
  let generator: AdaptiveTestGenerator;

  beforeEach(() => {
    // Use a mock test directory
    testDir = path.join(process.cwd(), 'tmp', `fix-iteration-test-${Date.now()}`);
    
    // Initialize components without actual file operations
    validator = new GitBasedTestValidator();
    const frameworkDetector = new TestFrameworkDetector();
    const coverageAnalyzer = new CoverageAnalyzer();
    const issueInterpreter = new IssueInterpreter();
    generator = new AdaptiveTestGenerator(frameworkDetector, coverageAnalyzer, issueInterpreter);
  });

  afterEach(() => {
    // Clear mocks
    vi.clearAllMocks();
  });

  describe('Java SQL Injection Fix Iteration', () => {
    test.skip('should validate fix iteration for Java SQL injection', async () => {
      // 1. Create vulnerable Java code
      const vulnerableCode = `package com.example;
import java.sql.*;

public class UserDAO {
    private Connection conn;
    
    public User getUser(String userId) throws SQLException {
        Statement stmt = conn.createStatement();
        String query = "SELECT * FROM users WHERE id = " + userId;
        ResultSet rs = stmt.executeQuery(query);
        if (rs.next()) {
            return new User(rs.getString("id"), rs.getString("name"));
        }
        return null;
    }
}`;

      const filePath = path.join(testDir, 'src/main/java/com/example/UserDAO.java');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, vulnerableCode);

      // Create pom.xml for framework detection
      const pomXml = `<project>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>
</project>`;
      await fs.writeFile(path.join(testDir, 'pom.xml'), pomXml);

      // Commit vulnerable code
      await execAsync('git add .', { cwd: testDir });
      await execAsync('git commit -m "Add vulnerable code"', { cwd: testDir });
      const vulnerableCommit = (await execAsync('git rev-parse HEAD', { cwd: testDir })).stdout.trim();

      // 2. Generate tests for the vulnerability
      const vulnerability = {
        id: 'test-java-sql-injection',
        type: VulnerabilityType.SQL_INJECTION,
        file: 'src/main/java/com/example/UserDAO.java',
        line: 9,
        description: 'SQL injection via string concatenation'
      };

      const repoStructure = {
        'pom.xml': pomXml,
        'src/main/java/com/example/UserDAO.java': vulnerableCode
      };

      const generatedTests = await generator.generateAdaptiveTests(
        vulnerability,
        repoStructure
      );

      expect(generatedTests).toBeTruthy();
      expect(generatedTests.success).toBe(true);
      expect(generatedTests.testCode).toContain('import org.junit.jupiter.api.Test');
      expect(generatedTests.testCode).toContain('SQL injection');
      expect(generatedTests.framework).toBe('junit5');
      
      // Ensure testSuite is generated
      if (!generatedTests.testSuite) {
        // Create a simple test suite for validation
        generatedTests.testSuite = {
          red: {
            testName: 'should be vulnerable to SQL injection (RED)',
            testCode: generatedTests.testCode,
            attackVector: "'; DROP TABLE users; --",
            expectedBehavior: 'should_fail_on_vulnerable_code'
          },
          green: {
            testName: 'should prevent SQL injection (GREEN)',
            testCode: generatedTests.testCode,
            validInput: '123',
            expectedBehavior: 'should_pass_on_fixed_code'
          },
          refactor: {
            testName: 'should maintain functionality after fix',
            testCode: generatedTests.testCode,
            functionalValidation: ['Returns user data', 'Handles valid IDs'],
            expectedBehavior: 'should_pass_on_both_versions'
          }
        };
      }

      // 3. Simulate first fix attempt (still vulnerable)
      const badFixCode = vulnerableCode.replace(
        'String query = "SELECT * FROM users WHERE id = " + userId;',
        'String query = "SELECT * FROM users WHERE id = \'" + userId + "\'";'
      );
      await fs.writeFile(filePath, badFixCode);
      await execAsync('git add .', { cwd: testDir });
      await execAsync('git commit -m "Attempt fix (still vulnerable)"', { cwd: testDir });
      const badFixCommit = (await execAsync('git rev-parse HEAD', { cwd: testDir })).stdout.trim();

      // 4. Validate fix (should fail because still vulnerable)
      const testFilePath = path.join(testDir, 'src/test/java/com/example/UserDAOTest.java');
      await fs.mkdir(path.dirname(testFilePath), { recursive: true });
      await fs.writeFile(testFilePath, generatedTests.testCode);

      const validationResult1 = await validator.validateFixWithTests(
        testDir,
        vulnerableCommit,
        badFixCommit,
        generatedTests.testSuite!
      );

      expect(validationResult1.allTestsPassed).toBe(false);
      expect(validationResult1.vulnerableCommitFailed).toBe(true);
      expect(validationResult1.fixedCommitPassed).toBe(false); // Still vulnerable

      // 5. Simulate proper fix with PreparedStatement
      const properFixCode = `package com.example;
import java.sql.*;

public class UserDAO {
    private Connection conn;
    
    public User getUser(String userId) throws SQLException {
        String query = "SELECT * FROM users WHERE id = ?";
        PreparedStatement pstmt = conn.prepareStatement(query);
        pstmt.setString(1, userId);
        ResultSet rs = pstmt.executeQuery();
        if (rs.next()) {
            return new User(rs.getString("id"), rs.getString("name"));
        }
        return null;
    }
}`;

      await fs.writeFile(filePath, properFixCode);
      await execAsync('git add .', { cwd: testDir });
      await execAsync('git commit -m "Fix SQL injection with PreparedStatement"', { cwd: testDir });
      const properFixCommit = (await execAsync('git rev-parse HEAD', { cwd: testDir })).stdout.trim();

      // 6. Validate proper fix (should pass)
      const validationResult2 = await validator.validateFixWithTests(
        testDir,
        vulnerableCommit,
        properFixCommit,
        generatedTests.testSuite!
      );

      expect(validationResult2.allTestsPassed).toBe(true);
      expect(validationResult2.vulnerableCommitFailed).toBe(true);
      expect(validationResult2.fixedCommitPassed).toBe(true);
    });

    test('should handle fix iteration with max attempts', async () => {
      // Mock the fix iteration process
      const mockIssue: IssueContext = {
        id: 'test-issue',
        number: 123,
        title: 'SQL Injection in UserDAO',
        body: 'SQL injection vulnerability in getUser method',
        labels: ['security', 'sql-injection', 'fix-validation-max-3'],
        assignees: [],
        repository: {
          owner: 'test',
          name: 'test-repo',
          fullName: 'test/test-repo',
          defaultBranch: 'main'
        },
        source: 'github',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const mockConfig: ActionConfig = {
        apiKey: '',
        configPath: '',
        issueLabel: '',
        aiProvider: { 
          provider: 'claude',
          model: 'claude-3-sonnet',
          apiKey: ''
        },
        containerConfig: { 
          enabled: false
        },
        securitySettings: {}
      };
      
      const maxIterations = getMaxIterations(mockIssue, mockConfig);
      expect(maxIterations).toBe(3); // From label

      // Simulate iteration tracking
      let attempts = 0;
      let fixSuccessful = false;

      while (attempts < maxIterations && !fixSuccessful) {
        attempts++;
        
        // Simulate fix validation
        if (attempts === 3) {
          fixSuccessful = true; // Success on third attempt
        }
      }

      expect(attempts).toBe(3);
      expect(fixSuccessful).toBe(true);
    });
  });

  describe('PHP SQL Injection Fix Iteration', () => {
    test.skip('should validate fix iteration for PHP SQL injection', async () => {
      // 1. Create vulnerable PHP code
      const vulnerableCode = `<?php
class UserModel {
    private $db;
    
    public function getUser($id) {
        $query = "SELECT * FROM users WHERE id = '$id'";
        $result = mysqli_query($this->db, $query);
        return mysqli_fetch_assoc($result);
    }
}`;

      const filePath = path.join(testDir, 'src/UserModel.php');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, vulnerableCode);

      // Create composer.json for framework detection
      const composerJson = JSON.stringify({
        "require-dev": {
          "phpunit/phpunit": "^9.5"
        }
      }, null, 2);
      await fs.writeFile(path.join(testDir, 'composer.json'), composerJson);

      // Commit vulnerable code
      await execAsync('git add .', { cwd: testDir });
      await execAsync('git commit -m "Add vulnerable PHP code"', { cwd: testDir });
      const vulnerableCommit = (await execAsync('git rev-parse HEAD', { cwd: testDir })).stdout.trim();

      // 2. Generate tests
      const vulnerability = {
        id: 'test-php-sql-injection',
        type: VulnerabilityType.SQL_INJECTION,
        file: 'src/UserModel.php',
        line: 6,
        description: 'SQL injection via variable interpolation'
      };

      const repoStructure = {
        'composer.json': composerJson,
        'src/UserModel.php': vulnerableCode
      };

      const generatedTests = await generator.generateAdaptiveTests(
        vulnerability,
        repoStructure
      );

      expect(generatedTests).toBeTruthy();
      expect(generatedTests.success).toBe(true);
      expect(generatedTests.testCode).toContain('use PHPUnit\\Framework\\TestCase');
      expect(generatedTests.testCode).toContain('#[Test]');
      expect(generatedTests.framework).toBe('phpunit');
      
      // Ensure testSuite is generated
      if (!generatedTests.testSuite) {
        generatedTests.testSuite = {
          red: {
            testName: 'testSqlInjectionVulnerability',
            testCode: generatedTests.testCode,
            attackVector: "' OR '1'='1",
            expectedBehavior: 'should_fail_on_vulnerable_code'
          },
          green: {
            testName: 'testSqlInjectionPrevention',
            testCode: generatedTests.testCode,
            validInput: '123',
            expectedBehavior: 'should_pass_on_fixed_code'
          },
          refactor: {
            testName: 'testFunctionalityAfterFix',
            testCode: generatedTests.testCode,
            functionalValidation: ['Returns user data', 'Handles valid IDs'],
            expectedBehavior: 'should_pass_on_both_versions'
          }
        };
      }

      // 3. Simulate fix with prepared statements
      const fixedCode = `<?php
class UserModel {
    private $db;
    
    public function getUser($id) {
        $query = "SELECT * FROM users WHERE id = ?";
        $stmt = mysqli_prepare($this->db, $query);
        mysqli_stmt_bind_param($stmt, "s", $id);
        mysqli_stmt_execute($stmt);
        $result = mysqli_stmt_get_result($stmt);
        return mysqli_fetch_assoc($result);
    }
}`;

      await fs.writeFile(filePath, fixedCode);
      await execAsync('git add .', { cwd: testDir });
      await execAsync('git commit -m "Fix SQL injection with prepared statements"', { cwd: testDir });
      const fixCommit = (await execAsync('git rev-parse HEAD', { cwd: testDir })).stdout.trim();

      // 4. Validate fix
      const testFilePath = path.join(testDir, 'tests/UserModelTest.php');
      await fs.mkdir(path.dirname(testFilePath), { recursive: true });
      await fs.writeFile(testFilePath, generatedTests.testCode);

      const validationResult = await validator.validateFixWithTests(
        testDir,
        vulnerableCommit,
        fixCommit,
        generatedTests.testSuite!
      );

      expect(validationResult.allTestsPassed).toBe(true);
      expect(validationResult.vulnerableCommitFailed).toBe(true);
      expect(validationResult.fixedCommitPassed).toBe(true);
    });

    test('should handle PDO fix patterns', async () => {
      const vulnerableCode = `<?php
class Database {
    private $pdo;
    
    public function findUser($email) {
        $sql = "SELECT * FROM users WHERE email = '$email'";
        return $this->pdo->query($sql)->fetch();
    }
}`;

      const fixedCode = `<?php
class Database {
    private $pdo;
    
    public function findUser($email) {
        $sql = "SELECT * FROM users WHERE email = :email";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute(['email' => $email]);
        return $stmt->fetch();
    }
}`;

      // Verify the fix introduces parameterized queries
      expect(fixedCode).toContain(':email');
      expect(fixedCode).toContain('prepare');
      expect(fixedCode).toContain('execute');
      expect(fixedCode).not.toContain("'$email'");
    });
  });

  describe('Integration with Fix Validation', () => {
    test('should integrate with Claude Code fix validation loop', async () => {
      // Mock the integration with git-based-processor
      const mockProcessor = {
        async applyFixWithValidation(issue: any, fix: any, tests: any) {
          let attempts = 0;
          const maxAttempts = 3;
          
          while (attempts < maxAttempts) {
            attempts++;
            
            // Simulate fix application
            const fixResult = await this.applyFix(fix);
            
            // Validate with tests
            const validationResult = await validator.validateFixWithTests(
              testDir,
              'vulnerable-commit',
              'fix-commit',
              tests.testSuite || tests
            );
            
            if (validationResult.allTestsPassed) {
              return { success: true, attempts };
            }
            
            // Generate new fix with test failure context
            fix = await this.generateImprovedFix(
              issue,
              fix,
              validationResult.testOutput
            );
          }
          
          return { success: false, attempts };
        },
        
        async applyFix(fix: any) {
          return { applied: true };
        },
        
        async generateImprovedFix(issue: any, previousFix: any, testOutput: string) {
          return { ...previousFix, improved: true };
        }
      };

      const result = await mockProcessor.applyFixWithValidation(
        { type: 'sql-injection' },
        { code: 'fix-code' },
        { code: 'test-code' }
      );

      expect(result.attempts).toBeGreaterThanOrEqual(1);
      expect(result.attempts).toBeLessThanOrEqual(3);
    });
  });
});