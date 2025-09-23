import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ValidationEnricher } from '../enricher.js';
import { IssueContext } from '../../types/index.js';

describe('ValidationEnricher', () => {
  let enricher: ValidationEnricher;
  
  beforeEach(() => {
    vi.clearAllMocks();
    enricher = new ValidationEnricher('github-token', 'rsolv-api-key');
  });

  describe('parseIssueForFiles', () => {
    it('should detect file paths in backticks', () => {
      const issue: IssueContext = {
        id: 'test-1',
        number: 1,
        title: 'Test Issue',
        body: 'There is a bug in `app/routes/profile.js` that needs fixing.',
        labels: [],
        repository: {
          owner: 'test',
          name: 'repo',
          fullName: 'test/repo'
        }
      };

      // Access private method via reflection for testing
      const files = (enricher as any).parseIssueForFiles(issue);
      
      expect(files).toContain('app/routes/profile.js');
    });

    it('should detect file paths in Affected Files section', () => {
      const issue: IssueContext = {
        id: 'test-2',
        number: 2,
        title: 'Test Issue',
        body: '**Affected Files**:\n- app/routes/profile.js\n- lib/db.js',
        labels: [],
        repository: {
          owner: 'test',
          name: 'repo',
          fullName: 'test/repo'
        }
      };

      const files = (enricher as any).parseIssueForFiles(issue);
      
      expect(files).toContain('app/routes/profile.js');
      expect(files).toContain('lib/db.js');
    });

    it('should detect file paths with File: prefix in code blocks', () => {
      const issue: IssueContext = {
        id: 'test-3',
        number: 3,
        title: 'Test Issue',
        body: '```javascript\n// File: app/routes/profile.js\nconst code = "test";\n```',
        labels: [],
        repository: {
          owner: 'test',
          name: 'repo',
          fullName: 'test/repo'
        }
      };

      const files = (enricher as any).parseIssueForFiles(issue);
      
      expect(files).toContain('app/routes/profile.js');
    });

    // RED TEST - This should fail initially
    it('should detect file paths in plain comments within code blocks', () => {
      const issue: IssueContext = {
        id: 'test-4',
        number: 4,
        title: 'SQL Injection vulnerability',
        body: 'There is a SQL injection vulnerability:\n\n```javascript\n// app/routes/profile.js\nconst query = "SELECT * FROM users WHERE id = \'" + req.params.id + "\'";\n```',
        labels: [],
        repository: {
          owner: 'test',
          name: 'repo',
          fullName: 'test/repo'
        }
      };

      const files = (enricher as any).parseIssueForFiles(issue);
      
      expect(files).toContain('app/routes/profile.js');
    });

    // Additional RED TEST - Should detect multiple file formats
    it('should detect various file path comment formats', () => {
      const issue: IssueContext = {
        id: 'test-5',
        number: 5,
        title: 'Multiple vulnerabilities',
        body: '```javascript\n// app/routes/profile.js\ncode1();\n```\n\n```python\n# lib/auth.py\ncode2()\n```\n\n```ruby\n# app/models/user.rb\ncode3\n```',
        labels: [],
        repository: {
          owner: 'test',
          name: 'repo',
          fullName: 'test/repo'
        }
      };

      const files = (enricher as any).parseIssueForFiles(issue);
      
      expect(files).toContain('app/routes/profile.js');
      expect(files).toContain('lib/auth.py');
      expect(files).toContain('app/models/user.rb');
    });
  });

  describe('analyzeFile', () => {
    beforeEach(() => {
      // Mock file system
      vi.mock('fs', () => ({
        existsSync: vi.fn(() => true),
        readFileSync: vi.fn()
      }));
    });

    it('should detect SQL injection vulnerability in file content', async () => {
      const fs = await import('fs');
      vi.mocked(fs.readFileSync).mockReturnValue(
        'const query = "SELECT * FROM users WHERE id = \'" + req.params.id + "\'";\ndb.query(query);'
      );

      const issue: IssueContext = {
        id: 'test-sql',
        number: 100,
        title: 'SQL Injection vulnerability',
        body: 'SQL injection found',
        labels: [],
        repository: {
          owner: 'test',
          name: 'repo',
          fullName: 'test/repo'
        }
      };

      const fileContents = {};
      const vulnerabilities = await (enricher as any).analyzeFile('app/routes/profile.js', issue, fileContents);
      
      expect(vulnerabilities).toHaveLength(1);
      expect(vulnerabilities[0]).toMatchObject({
        file: 'app/routes/profile.js',
        pattern: 'String concatenation in SQL query',
        cweId: 'CWE-89',
        owasp: 'A03:2021'
      });
    });

    it('should detect XSS vulnerability in file content', async () => {
      const fs = await import('fs');
      vi.mocked(fs.readFileSync).mockReturnValue(
        'element.innerHTML = req.query.userInput;'
      );

      const issue: IssueContext = {
        id: 'test-xss',
        number: 101,
        title: 'Cross-Site Scripting (XSS) vulnerability',
        body: 'XSS found',
        labels: [],
        repository: {
          owner: 'test',
          name: 'repo',
          fullName: 'test/repo'
        }
      };

      const fileContents = {};
      const vulnerabilities = await (enricher as any).analyzeFile('app/views/render.js', issue, fileContents);
      
      expect(vulnerabilities.length).toBeGreaterThan(0);
      expect(vulnerabilities[0]).toMatchObject({
        file: 'app/views/render.js',
        cweId: 'CWE-79'
      });
      // Check that pattern exists and contains relevant keywords
      expect(vulnerabilities[0].pattern).toBeDefined();
      expect(vulnerabilities[0].pattern.toLowerCase()).toMatch(/html|xss|injection|innerhtml/i);
    });
  });

  describe('extractVulnerabilityType', () => {
    it('should detect SQL injection from issue title', () => {
      const issue: IssueContext = {
        id: 'test-6',
        number: 6,
        title: 'SQL Injection in app/routes/profile.js',
        body: 'SQL injection vulnerability found',
        labels: [],
        repository: {
          owner: 'test',
          name: 'repo',
          fullName: 'test/repo'
        }
      };

      const vulnType = (enricher as any).extractVulnerabilityType(issue);
      
      expect(vulnType).toBe('sql-injection');
    });

    it('should detect XSS from issue title', () => {
      const issue: IssueContext = {
        id: 'test-7',
        number: 7,
        title: 'Cross-Site Scripting (XSS) vulnerability',
        body: 'XSS vulnerability found',
        labels: [],
        repository: {
          owner: 'test',
          name: 'repo',
          fullName: 'test/repo'
        }
      };

      const vulnType = (enricher as any).extractVulnerabilityType(issue);
      
      expect(vulnType).toBe('xss');
    });
  });
});