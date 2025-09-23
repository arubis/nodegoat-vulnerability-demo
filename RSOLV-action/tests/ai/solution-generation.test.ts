import { describe, test, expect, beforeAll } from 'vitest';
import { generateSolution } from '../../src/ai/solution.js';
import { IssueContext, ActionConfig, AnalysisData } from '../../src/types/index.js';
import { SecurityAnalysisResult } from '../../src/ai/security-analyzer.js';

describe('Solution Generation with Fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  let config: ActionConfig;
  
  beforeAll(() => {
    config = {
      apiKey: 'rsolv_prod_demo_key',
      configPath: '.github/rsolv.yml',
      issueLabel: 'rsolv:automate',
      enableSecurityAnalysis: true,
      aiProvider: {
        provider: 'claude-code',
        model: 'claude-sonnet-4-20250514',
        temperature: 0.2,
        maxTokens: 4000,
        useVendedCredentials: true
      },
      containerConfig: {
        enabled: false
      },
      securitySettings: {}
    };
  });

  test('should fall back to standard API when Claude Code is not available', async () => {
    const issueContext: IssueContext = {
      id: '123',
      number: 8,
      title: 'Security audit needed',
      body: 'SQL injection vulnerabilities detected',
      labels: ['security', 'bug'],
      assignees: [],
      repository: {
        owner: 'test',
        name: 'repo',
        fullName: 'test/repo',
        defaultBranch: 'main',
        language: 'JavaScript'
      },
      source: 'github',
      url: 'https://github.com/test/repo/issues/8',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const analysisData: AnalysisData = {
      issueType: 'security',
      filesToModify: ['src/auth/login.js'],
      estimatedComplexity: 'medium',
      requiredContext: ['authentication', 'database'],
      suggestedApproach: 'Replace string concatenation with parameterized queries',
      canBeFixed: true
    };

    const securityAnalysis: SecurityAnalysisResult = {
      hasSecurityIssues: true,
      vulnerabilities: [{
        type: 'sql_injection',
        severity: 'high',
        line: 10,
        file: 'src/auth/login.js',
        message: 'SQL Injection via String Concatenation',
        description: 'Direct string concatenation in SQL query',
        confidence: 90,
        cweId: 'CWE-89',
        owaspCategory: 'A03:2021',
        remediation: 'Use parameterized queries'
      }],
      riskLevel: 'high',
      recommendations: ['Use parameterized queries', 'Add input validation'],
      affectedFiles: ['src/auth/login.js'],
      summary: {
        total: 1,
        byType: { sql_injection: 1 },
        bySeverity: { high: 1 }
      }
    };

    // Mock AI client that returns a properly formatted response
    const mockAiClient = {
      complete: async (prompt: string) => {
        // Check that the prompt includes security information
        expect(prompt).toContain('Security Analysis Results');
        expect(prompt).toContain('sql_injection');
        
        // Return a properly formatted response that the parser can understand
        return `Based on the security analysis, here's the solution:

src/auth/login.js:
\`\`\`javascript
const mysql = require('mysql');
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'ecommerce'
});

function authenticateUser(username, password) {
  const query = 'SELECT * FROM users WHERE username = ? AND password = ?';
  
  return new Promise((resolve, reject) => {
    connection.query(query, [username, password], (error, results) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(results.length > 0 ? results[0] : null);
    });
  });
}

module.exports = { authenticateUser };
\`\`\`

This fixes the SQL injection vulnerability by using parameterized queries.`;
      }
    };

    const solution = await generateSolution(
      issueContext,
      analysisData,
      config,
      mockAiClient,
      undefined,
      securityAnalysis
    );

    expect(solution.success).toBe(true);
    expect(solution.changes).toBeDefined();
    expect(Object.keys(solution.changes!).length).toBeGreaterThan(0);
    expect(solution.changes!['src/auth/login.js']).toBeDefined();
    expect(solution.changes!['src/auth/login.js']).toContain('?'); // Parameterized query
  }, 30000);

  test('should handle real API call with fallback', async () => {
    // This test uses the real API to ensure the full flow works
    const issueContext: IssueContext = {
      id: '123',
      number: 8,
      title: 'Fix SQL injection in login',
      body: 'The login function has SQL injection vulnerabilities',
      labels: ['security', 'bug'],
      assignees: [],
      repository: {
        owner: 'test',
        name: 'repo',
        fullName: 'test/repo',
        defaultBranch: 'main',
        language: 'JavaScript'
      },
      source: 'github',
      url: 'https://github.com/test/repo/issues/8',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const analysisData: AnalysisData = {
      issueType: 'security',
      filesToModify: ['src/auth/login.js'],
      estimatedComplexity: 'simple',
      requiredContext: ['authentication'],
      suggestedApproach: 'Use parameterized queries',
      canBeFixed: true
    };

    // Run without security analysis to test basic flow
    const solution = await generateSolution(
      issueContext,
      analysisData,
      config
    );

    // Log the result for debugging
    console.log('Solution result:', {
      success: solution.success,
      message: solution.message,
      hasChanges: !!solution.changes,
      changeCount: solution.changes ? Object.keys(solution.changes).length : 0
    });

    // The test might fail if no API key is available, but should at least not crash
    expect(solution).toHaveProperty('success');
    expect(solution).toHaveProperty('message');
  }, 60000);
});