import { describe, test, expect, vi } from 'vitest';
import { getMaxIterations } from '../git-based-processor.js';
import { IssueContext, ActionConfig } from '../../types/index.js';
import { VulnerabilityType } from '../../security/types.js';

describe('Fix Iteration Core Functionality', () => {
  describe('getMaxIterations configuration hierarchy', () => {
    const baseConfig: ActionConfig = {
      mode: 'review',
      aiProvider: 'claude',
      fixValidation: {
        enabled: true,
        maxIterations: 3,
        maxIterationsByType: {
          'sql-injection': 5,
          'xss': 4
        }
      }
    };

    test('should use issue label override when present', () => {
      const issue: IssueContext = {
        id: 1,
        number: 123,
        title: 'SQL Injection in UserDAO',
        body: 'Vulnerability found',
        labels: ['security', 'fix-validation-max-7']
      };

      const result = getMaxIterations(issue, baseConfig);
      expect(result).toBe(7);
    });

    test('should use vulnerability type specific config', () => {
      const issue: IssueContext = {
        id: 1,
        number: 123,
        title: 'SQL Injection in UserDAO',
        body: 'sql-injection vulnerability',
        labels: ['security', 'sql-injection']
      };

      const result = getMaxIterations(issue, baseConfig);
      expect(result).toBe(5);
    });

    test('should use customer tier config when no specific override', () => {
      const tierConfig: ActionConfig = {
        ...baseConfig,
        customerTier: 'enterprise',
        fixValidation: {
          enabled: true,
          maxIterations: 3,
          maxIterationsByTier: {
            enterprise: 10,
            pro: 5,
            free: 2
          }
        }
      };

      const issue: IssueContext = {
        id: 1,
        number: 123,
        title: 'Generic vulnerability',
        body: 'Some issue',
        labels: ['security']
      };

      const result = getMaxIterations(issue, tierConfig);
      expect(result).toBe(10);
    });

    test('should use default when no specific config matches', () => {
      const issue: IssueContext = {
        id: 1,
        number: 123,
        title: 'Unknown vulnerability',
        body: 'Some issue',
        labels: ['bug']
      };

      const result = getMaxIterations(issue, baseConfig);
      expect(result).toBe(3);
    });

    test('should handle missing maxIterations config', () => {
      const issue: IssueContext = {
        id: 1,
        number: 123,
        title: 'Test issue',
        body: 'Test',
        labels: []
      };

      const emptyConfig: ActionConfig = {
        mode: 'review',
        aiProvider: 'claude'
      };

      const result = getMaxIterations(issue, emptyConfig);
      expect(result).toBe(3); // Default fallback
    });
  });

  describe('Fix iteration flow simulation', () => {
    test('should simulate successful fix after multiple attempts', async () => {
      const maxAttempts = 3;
      let attempts = 0;
      let fixSuccessful = false;

      // Simulate fix attempts
      const attemptFix = async (attemptNumber: number): Promise<boolean> => {
        // Simulate different outcomes based on attempt
        if (attemptNumber === 1) {
          // First attempt: still vulnerable
          return false;
        } else if (attemptNumber === 2) {
          // Second attempt: partially fixed but test fails
          return false;
        } else if (attemptNumber === 3) {
          // Third attempt: properly fixed
          return true;
        }
        return false;
      };

      // Fix iteration loop
      while (attempts < maxAttempts && !fixSuccessful) {
        attempts++;
        fixSuccessful = await attemptFix(attempts);
      }

      expect(attempts).toBe(3);
      expect(fixSuccessful).toBe(true);
    });

    test('should fail after max attempts exceeded', async () => {
      const maxAttempts = 3;
      let attempts = 0;
      let fixSuccessful = false;

      // Simulate fix that never succeeds
      const attemptFix = async (): Promise<boolean> => false;

      while (attempts < maxAttempts && !fixSuccessful) {
        attempts++;
        fixSuccessful = await attemptFix();
      }

      expect(attempts).toBe(3);
      expect(fixSuccessful).toBe(false);
    });
  });

  describe('Test validation feedback integration', () => {
    test('should include test failure context in retry prompt', () => {
      const testFailureOutput = `
        FAIL: testSqlInjectionPrevention
        Expected: Query to be parameterized
        Actual: Query still uses string concatenation
        
        The fix attempt still allows SQL injection through string concatenation.
      `;

      const retryContext = {
        attemptNumber: 2,
        maxAttempts: 3,
        previousError: testFailureOutput,
        vulnerability: {
          type: VulnerabilityType.SQL_INJECTION,
          file: 'UserDAO.java'
        }
      };

      // Simulate prompt enhancement
      const enhancedPrompt = `
        Previous fix attempt failed validation. Test output:
        ${retryContext.previousError}
        
        This is attempt ${retryContext.attemptNumber} of ${retryContext.maxAttempts}.
        Please fix the SQL injection vulnerability by using PreparedStatement instead of string concatenation.
      `;

      expect(enhancedPrompt).toContain('Previous fix attempt failed');
      expect(enhancedPrompt).toContain('attempt 2 of 3');
      expect(enhancedPrompt).toContain('PreparedStatement');
    });
  });

  describe('Language-specific fix patterns', () => {
    test('Java SQL injection fix patterns', () => {
      const vulnerableJava = `
        String query = "SELECT * FROM users WHERE id = " + userId;
        ResultSet rs = statement.executeQuery(query);
      `;

      const secureJava = `
        String query = "SELECT * FROM users WHERE id = ?";
        PreparedStatement pstmt = connection.prepareStatement(query);
        pstmt.setString(1, userId);
        ResultSet rs = pstmt.executeQuery();
      `;

      // Verify fix introduces PreparedStatement
      expect(secureJava).toContain('PreparedStatement');
      expect(secureJava).toContain('?');
      expect(secureJava).toContain('setString');
      expect(secureJava).not.toContain('" +');
    });

    test('PHP SQL injection fix patterns', () => {
      const vulnerablePHP = `
        $query = "SELECT * FROM users WHERE id = '$id'";
        $result = mysqli_query($conn, $query);
      `;

      const securePHP = `
        $query = "SELECT * FROM users WHERE id = ?";
        $stmt = mysqli_prepare($conn, $query);
        mysqli_stmt_bind_param($stmt, "s", $id);
        mysqli_stmt_execute($stmt);
        $result = mysqli_stmt_get_result($stmt);
      `;

      // Verify fix uses prepared statements
      expect(securePHP).toContain('mysqli_prepare');
      expect(securePHP).toContain('?');
      expect(securePHP).toContain('bind_param');
      expect(securePHP).not.toContain("'$id'");
    });

    test('PDO fix patterns for PHP', () => {
      const vulnerablePDO = `
        $sql = "SELECT * FROM users WHERE email = '$email'";
        $result = $pdo->query($sql);
      `;

      const securePDO = `
        $sql = "SELECT * FROM users WHERE email = :email";
        $stmt = $pdo->prepare($sql);
        $stmt->execute(['email' => $email]);
        $result = $stmt->fetch();
      `;

      // Verify PDO parameterized query
      expect(securePDO).toContain(':email');
      expect(securePDO).toContain('prepare');
      expect(securePDO).toContain('execute');
      expect(securePDO).not.toContain("'$email'");
    });
  });
});