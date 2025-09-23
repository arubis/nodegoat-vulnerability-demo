import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ValidationEnricher } from '../../src/validation/enricher.js';

// Mock the GitHub API utilities
vi.mock('../../src/github/api.js', () => ({
  updateIssue: vi.fn(() => Promise.resolve()),
  addLabels: vi.fn(() => Promise.resolve())
}));

describe('Validation Payload Format', () => {
  let enricher: ValidationEnricher;
  let originalFetch: typeof global.fetch;
  let fetchMock: any;
  
  beforeEach(() => {
    // Save original fetch
    originalFetch = global.fetch;
    
    // Create mock fetch
    fetchMock = vi.fn((url: string, options?: RequestInit) => {
      // Capture the request for inspection
      const body = options?.body ? JSON.parse(options.body as string) : null;
      
      // Store the last request for assertions
      fetchMock.lastRequest = {
        url,
        method: options?.method,
        headers: options?.headers,
        body
      };
      
      // Mock response based on URL
      if (url.includes('/api/v1/ast/validate')) {
        // Check if payload has correct format
        if (body?.vulnerabilities && body?.repository && body?.files) {
          return Promise.resolve({
            ok: true,
            statusText: 'OK',
            json: () => Promise.resolve({
              validated: body.vulnerabilities.map((v: any) => ({
                ...v,
                isVulnerable: true,
                falsePositive: false
              })),
              stats: {
                total: body.vulnerabilities.length,
                truePositives: body.vulnerabilities.length,
                falsePositives: 0
              }
            })
          });
        } else {
          // Wrong format - return bad request
          return Promise.resolve({
            ok: false,
            statusText: 'Bad Request',
            status: 400,
            json: () => Promise.resolve({ error: 'Invalid request format' })
          });
        }
      }
      
      return Promise.resolve({
        ok: false,
        statusText: 'Not Found',
        status: 404
      });
    });
    
    // Replace global fetch
    global.fetch = fetchMock;
    
    // Create enricher with mock tokens
    // First param is githubToken, second is rsolvApiKey
    enricher = new ValidationEnricher('test-github-token', 'test-api-key');
  });
  
  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
  });
  
  it('should send correct batch payload format to validation API', async () => {
    // Create test issue with vulnerabilities
    const issue: any = {
      id: 'RSOLV-dev/test-repo#1',
      number: 1,
      title: '[RSOLV-DETECTED] SQL Injection in database queries',
      body: `## Vulnerability Report
      
SQL injection vulnerability detected.

### Affected Files
- app/data/allocations-dao.js (line 45)
- app/data/benefits-dao.js (line 67)

\`\`\`javascript
// File: app/data/allocations-dao.js
const query = "SELECT * FROM allocations WHERE userId = '" + userId + "'";
db.query(query);
\`\`\`

\`\`\`javascript  
// File: app/data/benefits-dao.js
const sql = \`SELECT * FROM benefits WHERE id = \${benefitId}\`;
db.execute(sql);
\`\`\``,
      labels: ['rsolv:detected'],
      assignees: [],
      repository: {
        owner: 'RSOLV-dev',
        name: 'test-repo',
        fullName: 'RSOLV-dev/test-repo',
        defaultBranch: 'main'
      },
      source: 'github',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Create test files
    const testDir = '/tmp/test-validation-payload';
    fs.mkdirSync(path.join(testDir, 'app/data'), { recursive: true });
    
    fs.writeFileSync(
      path.join(testDir, 'app/data/allocations-dao.js'),
      `// Test file
const query = "SELECT * FROM allocations WHERE userId = '" + userId + "'";
db.query(query);`
    );
    
    fs.writeFileSync(
      path.join(testDir, 'app/data/benefits-dao.js'),
      `// Test file
const sql = \`SELECT * FROM benefits WHERE id = \${benefitId}\`;
db.execute(sql);`
    );
    
    // Mock process.cwd to return test directory
    const originalCwd = process.cwd();
    vi.spyOn(process, 'cwd').mockReturnValue(testDir);
    
    try {
      // Run validation
      const result = await enricher.enrichIssue(issue);
      
      // Check that fetch was called with correct format
      expect(fetchMock.lastRequest).toBeDefined();
      expect(fetchMock.lastRequest.url).toContain('/api/v1/ast/validate');
      
      // Verify payload structure
      const payload = fetchMock.lastRequest.body;
      expect(payload).toHaveProperty('repository');
      expect(payload).toHaveProperty('vulnerabilities');
      expect(payload).toHaveProperty('files');
      
      // Check repository
      expect(payload.repository).toBe('RSOLV-dev/test-repo');
      
      // Check vulnerabilities array
      expect(Array.isArray(payload.vulnerabilities)).toBe(true);
      expect(payload.vulnerabilities.length).toBeGreaterThan(0);
      
      // Check each vulnerability has required fields
      payload.vulnerabilities.forEach((vuln: any) => {
        expect(vuln).toHaveProperty('id');
        expect(vuln).toHaveProperty('type');
        expect(vuln).toHaveProperty('filePath');
        expect(vuln).toHaveProperty('line');
        expect(vuln).toHaveProperty('code');
      });
      
      // Check files object
      expect(typeof payload.files).toBe('object');
      expect(Object.keys(payload.files).length).toBeGreaterThan(0);
      
      // Check each file has content and hash
      Object.entries(payload.files).forEach(([filePath, fileData]: [string, any]) => {
        expect(fileData).toHaveProperty('content');
        expect(fileData).toHaveProperty('hash');
        expect(typeof fileData.content).toBe('string');
        expect(typeof fileData.hash).toBe('string');
      });
      
      // Verify result contains validated vulnerabilities
      expect(result.vulnerabilities).toBeDefined();
      expect(result.vulnerabilities.length).toBeGreaterThan(0);
      expect(result.enriched).toBe(true);
      
    } finally {
      // Restore mocked cwd
      vi.mocked(process.cwd).mockRestore();
      
      // Clean up test files
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });
  
  it('should handle validation response correctly', async () => {
    // Mock a successful validation response
    const mockResponse = {
      validated: [
        {
          id: 'vuln-1',
          type: 'SqlInjection',
          filePath: 'app/data/dao.js',
          line: 45,
          isVulnerable: true,
          falsePositive: false
        }
      ],
      stats: {
        total: 1,
        truePositives: 1,
        falsePositives: 0,
        cacheHits: 0,
        cacheMisses: 1
      }
    };
    
    // Override fetch mock for this test
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      statusText: 'OK',
      json: () => Promise.resolve(mockResponse)
    }));
    
    const issue: any = {
      id: 'test/repo#1',
      number: 1,
      title: '[RSOLV-DETECTED] SQL Injection',
      body: '## Vulnerability\n\nFile: app/data/dao.js\nSQL injection found.',
      labels: ['rsolv:detected'],
      assignees: [],
      repository: {
        owner: 'test',
        name: 'repo',
        fullName: 'test/repo',
        defaultBranch: 'main'
      },
      source: 'github',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Create minimal test file
    const testDir = '/tmp/test-validation-response';
    fs.mkdirSync(path.join(testDir, 'app/data'), { recursive: true });
    fs.writeFileSync(
      path.join(testDir, 'app/data/dao.js'),
      'const query = "SELECT * FROM users WHERE id = " + id;'
    );
    
    const originalCwd = process.cwd();
    vi.spyOn(process, 'cwd').mockReturnValue(testDir);
    
    try {
      const result = await enricher.enrichIssue(issue);
      
      // Should process the validation results  
      expect(result.vulnerabilities).toBeDefined();
      expect(result.issueNumber).toBe(1);
      expect(result.enriched).toBe(true);
      
    } finally {
      vi.mocked(process.cwd).mockRestore();
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });
});