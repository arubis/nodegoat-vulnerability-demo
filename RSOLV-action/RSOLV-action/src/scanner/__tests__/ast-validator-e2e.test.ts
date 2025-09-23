import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ASTValidator } from '../ast-validator.js';
import { RepositoryScanner } from '../repository-scanner.js';
import { RsolvApiClient } from '../../external/api-client.js';
import type { Vulnerability } from '../../security/types.js';
import type { ScanConfig } from '../types.js';

// Mock environment for tests
const TEST_API_KEY = 'test-api-key-123';
const TEST_API_URL = 'http://localhost:4000';

describe('AST Validator E2E Integration Tests', () => {
  let validator: ASTValidator;
  let scanner: RepositoryScanner;
  let originalApiUrl: string | undefined;
  let originalGithubToken: string | undefined;
  
  beforeEach(() => {
    // Save original environment
    originalApiUrl = process.env.RSOLV_API_URL;
    originalGithubToken = process.env.GITHUB_TOKEN;
    
    // Set test environment
    process.env.RSOLV_API_URL = TEST_API_URL;
    process.env.GITHUB_TOKEN = 'test-github-token';
    
    validator = new ASTValidator(TEST_API_KEY);
    scanner = new RepositoryScanner();
  });
  
  afterEach(() => {
    // Restore original environment
    if (originalApiUrl) {
      process.env.RSOLV_API_URL = originalApiUrl;
    } else {
      delete process.env.RSOLV_API_URL;
    }
    
    if (originalGithubToken) {
      process.env.GITHUB_TOKEN = originalGithubToken;
    } else {
      delete process.env.GITHUB_TOKEN;
    }
  });
  
  describe('Vulnerability Validation Flow', () => {
    it('should correctly filter false positives in comments', async () => {
      const vulnerabilities: Vulnerability[] = [
        {
          type: 'js-eval-injection',
          severity: 'high',
          line: 1,
          column: 3,
          snippet: '// eval(userInput)',
          filePath: 'test.js'
        },
        {
          type: 'js-eval-injection',
          severity: 'high',
          line: 3,
          column: 1,
          snippet: 'eval(userInput)',
          filePath: 'test.js'
        }
      ];
      
      const fileContents = new Map([
        ['test.js', `// eval(userInput) - this is just a comment
function process(userInput) {
  eval(userInput); // real vulnerability
}`]
      ]);
      
      // Mock the API response
      const mockResponse = {
        validated: [
          {
            id: 'js-eval-injection-1-3',
            isValid: false,
            confidence: 0.1,
            reason: 'Code found in comment',
            astContext: {
              inUserInputFlow: false,
              hasValidation: false
            }
          },
          {
            id: 'js-eval-injection-3-1',
            isValid: true,
            confidence: 0.95,
            astContext: {
              inUserInputFlow: true,
              hasValidation: false
            }
          }
        ],
        stats: {
          total: 2,
          validated: 1,
          rejected: 1
        }
      };
      
      // Mock the API client method
      const originalValidateVulnerabilities = RsolvApiClient.prototype.validateVulnerabilities;
      RsolvApiClient.prototype.validateVulnerabilities = vi.fn(() => Promise.resolve(mockResponse));
      
      try {
        const validated = await validator.validateVulnerabilities(vulnerabilities, fileContents);
        
        // Should filter out the comment vulnerability
        expect(validated).toHaveLength(1);
        expect(validated[0].line).toBe(3);
        expect(validated[0].snippet).toBe('eval(userInput)');
      } finally {
        // Restore original method
        RsolvApiClient.prototype.validateVulnerabilities = originalValidateVulnerabilities;
      }
    });
    
    it('should handle API failures gracefully by returning all vulnerabilities', async () => {
      const vulnerabilities: Vulnerability[] = [
        {
          type: 'js-eval-injection',
          severity: 'high',
          line: 1,
          column: 1,
          snippet: 'eval(x)',
          filePath: 'app.js'
        }
      ];
      
      const fileContents = new Map([['app.js', 'eval(x);']]);
      
      // Mock API to throw error
      const originalValidateVulnerabilities = RsolvApiClient.prototype.validateVulnerabilities;
      RsolvApiClient.prototype.validateVulnerabilities = vi.fn(() => 
        Promise.reject(new Error('Network error'))
      );
      
      try {
        const validated = await validator.validateVulnerabilities(vulnerabilities, fileContents);
        
        // Should return all vulnerabilities on failure (fail open)
        expect(validated).toHaveLength(1);
        expect(validated).toEqual(vulnerabilities);
      } finally {
        RsolvApiClient.prototype.validateVulnerabilities = originalValidateVulnerabilities;
      }
    });
    
    it('should correctly map vulnerability fields to API format', async () => {
      const vulnerabilities: Vulnerability[] = [
        {
          type: 'python-exec-injection',
          severity: 'critical',
          line: 42,
          column: 10,
          snippet: 'exec(request.form["code"])',
          filePath: 'handler.py'
        }
      ];
      
      const fileContents = new Map([
        ['handler.py', `def handle():
    user_code = request.form["code"]
    exec(user_code)  # dangerous!`]
      ]);
      
      let capturedRequest: any;
      
      // Mock to capture the request
      const originalValidateVulnerabilities = RsolvApiClient.prototype.validateVulnerabilities;
      RsolvApiClient.prototype.validateVulnerabilities = vi.fn((request) => {
        capturedRequest = request;
        return Promise.resolve({
          validated: [{
            id: 'python-exec-injection-42-10',
            isValid: true,
            confidence: 0.95,
            astContext: { inUserInputFlow: true, hasValidation: false }
          }],
          stats: { total: 1, validated: 1, rejected: 0 }
        });
      });
      
      try {
        await validator.validateVulnerabilities(vulnerabilities, fileContents);
        
        // Check request format
        expect(capturedRequest).toBeDefined();
        expect(capturedRequest.vulnerabilities).toHaveLength(1);
        expect(capturedRequest.vulnerabilities[0]).toEqual({
          id: 'python-exec-injection-42-10',
          patternId: 'python-exec-injection',
          filePath: 'handler.py',
          line: 42,
          code: 'exec(request.form["code"])',
          severity: 'critical'
        });
        expect(capturedRequest.files['handler.py']).toContain('exec(user_code)');
      } finally {
        RsolvApiClient.prototype.validateVulnerabilities = originalValidateVulnerabilities;
      }
    });
  });
  
  describe('Repository Scanner Integration', () => {
    it('should integrate AST validation when enabled in scan config', async () => {
      const scanConfig: ScanConfig = {
        repository: {
          owner: 'test',
          name: 'repo',
          defaultBranch: 'main'
        },
        enableASTValidation: true,
        rsolvApiKey: TEST_API_KEY,
        createIssues: false
      };
      
      // Mock GitHub API
      const mockGetTree = vi.fn(() => Promise.resolve({
        data: {
          tree: [
            { type: 'blob', path: 'app.js', sha: 'abc123', size: 100 }
          ]
        }
      }));
      
      const mockGetBlob = vi.fn(() => Promise.resolve({
        data: {
          content: Buffer.from(`const userInput = req.body.code;
eval(userInput); // vulnerability`).toString('base64')
        }
      }));
      
      // Mock the API validation response
      const mockValidationResponse = {
        validated: [{
          id: 'js-eval-injection-2-0',
          isValid: true,
          confidence: 0.95,
          astContext: { inUserInputFlow: true, hasValidation: false }
        }],
        stats: { total: 1, validated: 1, rejected: 0 }
      };
      
      const originalValidateVulnerabilities = RsolvApiClient.prototype.validateVulnerabilities;
      RsolvApiClient.prototype.validateVulnerabilities = vi.fn(() => 
        Promise.resolve(mockValidationResponse)
      );
      
      // @ts-ignore - Mock GitHub client methods
      scanner.github = {
        git: {
          getTree: mockGetTree,
          getBlob: mockGetBlob
        }
      };
      
      try {
        const result = await scanner.scan(scanConfig);
        
        // Verify GitHub API was called
        expect(mockGetTree).toHaveBeenCalled();
        expect(mockGetBlob).toHaveBeenCalled();
        
        // Verify AST validation was called
        expect(RsolvApiClient.prototype.validateVulnerabilities).toHaveBeenCalled();
        
        // Check scan result
        expect(result.vulnerabilities).toBeDefined();
        expect(result.totalFiles).toBe(1);
        expect(result.scannedFiles).toBe(1);
      } finally {
        RsolvApiClient.prototype.validateVulnerabilities = originalValidateVulnerabilities;
      }
    });
    
    it('should skip AST validation when disabled', async () => {
      const scanConfig: ScanConfig = {
        repository: {
          owner: 'test',
          name: 'repo',
          defaultBranch: 'main'
        },
        enableASTValidation: false, // Disabled
        createIssues: false
      };
      
      // Mock GitHub API
      const mockGetTree = vi.fn(() => Promise.resolve({
        data: { tree: [] }
      }));
      
      // @ts-ignore
      scanner.github = {
        git: { getTree: mockGetTree }
      };
      
      // Spy on validation API
      const originalValidateVulnerabilities = RsolvApiClient.prototype.validateVulnerabilities;
      let validationCalled = false;
      RsolvApiClient.prototype.validateVulnerabilities = vi.fn(() => {
        validationCalled = true;
        return Promise.resolve({ validated: [], stats: { total: 0, validated: 0, rejected: 0 } });
      });
      
      try {
        await scanner.scan(scanConfig);
        
        // AST validation should NOT be called
        expect(validationCalled).toBe(false);
      } finally {
        RsolvApiClient.prototype.validateVulnerabilities = originalValidateVulnerabilities;
      }
    });
  });
  
  describe('Edge Cases and Error Handling', () => {
    it('should handle empty vulnerability list', async () => {
      const validated = await validator.validateVulnerabilities([], new Map());
      expect(validated).toEqual([]);
    });
    
    it('should handle missing file contents', async () => {
      const vulnerabilities: Vulnerability[] = [{
        type: 'js-eval-injection',
        severity: 'high',
        line: 1,
        column: 1,
        snippet: 'eval(x)',
        filePath: 'missing.js'
      }];
      
      // Empty file contents map
      const fileContents = new Map<string, string>();
      
      const mockResponse = {
        validated: [{
          id: 'js-eval-injection-1-1',
          isValid: true,
          confidence: 0.5,
          reason: 'File content unavailable'
        }],
        stats: { total: 1, validated: 1, rejected: 0 }
      };
      
      const originalValidateVulnerabilities = RsolvApiClient.prototype.validateVulnerabilities;
      RsolvApiClient.prototype.validateVulnerabilities = vi.fn(() => Promise.resolve(mockResponse));
      
      try {
        const validated = await validator.validateVulnerabilities(vulnerabilities, fileContents);
        expect(validated).toHaveLength(1);
      } finally {
        RsolvApiClient.prototype.validateVulnerabilities = originalValidateVulnerabilities;
      }
    });
    
    it('should handle malformed API responses', async () => {
      const vulnerabilities: Vulnerability[] = [{
        type: 'test',
        severity: 'high',
        line: 1,
        column: 1,
        snippet: 'test',
        filePath: 'test.js'
      }];
      
      const fileContents = new Map([['test.js', 'test']]);
      
      // Mock malformed response
      const originalValidateVulnerabilities = RsolvApiClient.prototype.validateVulnerabilities;
      RsolvApiClient.prototype.validateVulnerabilities = vi.fn(() => 
        Promise.resolve({} as any) // Missing required fields
      );
      
      try {
        // Should not throw, but return all vulnerabilities
        const validated = await validator.validateVulnerabilities(vulnerabilities, fileContents);
        expect(validated).toEqual(vulnerabilities);
      } finally {
        RsolvApiClient.prototype.validateVulnerabilities = originalValidateVulnerabilities;
      }
    });
  });
  
  describe('Performance and Caching', () => {
    it('should batch multiple vulnerabilities in a single API call', async () => {
      const vulnerabilities: Vulnerability[] = [
        { type: 'eval', severity: 'high', line: 1, column: 1, snippet: 'eval(a)', filePath: 'a.js' },
        { type: 'eval', severity: 'high', line: 2, column: 1, snippet: 'eval(b)', filePath: 'b.js' },
        { type: 'eval', severity: 'high', line: 3, column: 1, snippet: 'eval(c)', filePath: 'c.js' }
      ];
      
      const fileContents = new Map([
        ['a.js', 'eval(a);'],
        ['b.js', 'eval(b);'],
        ['c.js', 'eval(c);']
      ]);
      
      let apiCallCount = 0;
      
      const originalValidateVulnerabilities = RsolvApiClient.prototype.validateVulnerabilities;
      RsolvApiClient.prototype.validateVulnerabilities = vi.fn((request) => {
        apiCallCount++;
        
        // Verify all vulnerabilities are in single request
        expect(request.vulnerabilities).toHaveLength(3);
        
        return Promise.resolve({
          validated: request.vulnerabilities.map((v: any) => ({
            id: v.id,
            isValid: true,
            confidence: 0.9
          })),
          stats: { total: 3, validated: 3, rejected: 0 }
        });
      });
      
      try {
        await validator.validateVulnerabilities(vulnerabilities, fileContents);
        
        // Should make only one API call for all vulnerabilities
        expect(apiCallCount).toBe(1);
      } finally {
        RsolvApiClient.prototype.validateVulnerabilities = originalValidateVulnerabilities;
      }
    });
  });
});