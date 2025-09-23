import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ASTValidator } from '../../src/scanner/ast-validator.js';
import { RsolvApiClient } from '../../src/external/api-client.js';
import type { Vulnerability } from '../../src/security/types.js';
import { VulnerabilityType } from '../../src/security/types.js';

// Mock the API client
vi.mock('../../src/external/api-client.js', () => {
  return {
    RsolvApiClient: vi.fn(() => ({
      validateVulnerabilities: vi.fn()
    }))
  };
});

describe('ASTValidator', () => {
  let validator: ASTValidator;
  let mockApiClient: any;

  beforeEach(() => {
    mockApiClient = new RsolvApiClient({ apiKey: 'test-key', baseUrl: 'http://test' });
    validator = new ASTValidator('test-key');
    // Replace the client with our mock
    (validator as any).apiClient = mockApiClient;
  });

  describe('validateVulnerabilities', () => {
    it('should validate vulnerabilities using the API', async () => {
      const vulnerabilities: Vulnerability[] = [
        {
          type: VulnerabilityType.COMMAND_INJECTION,
          severity: 'critical' as const,
          description: 'Eval injection vulnerability',
          message: 'Using eval() with user input can lead to code injection',
          line: 10,
          column: 5,
          filePath: 'src/app.js',
          snippet: '  eval(userInput);',
          confidence: 90,
          cweId: 'CWE-95',
          owaspCategory: 'A03:2021',
          remediation: 'Do not use eval with user input'
        }
      ];

      const fileContents = new Map([
        ['src/app.js', 'function process(userInput) { eval(userInput); }']
      ]);

      const mockResponse = {
        validated: [
          {
            id: 'command_injection-10-5',
            isValid: true,
            confidence: 0.95,
            astContext: {
              inUserInputFlow: true,
              hasValidation: false
            }
          }
        ],
        stats: {
          total: 1,
          validated: 1,
          rejected: 0
        }
      };

      mockApiClient.validateVulnerabilities.mockResolvedValue(mockResponse);

      const result = await validator.validateVulnerabilities(vulnerabilities, fileContents);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(vulnerabilities[0]);
      expect(mockApiClient.validateVulnerabilities).toHaveBeenCalledWith({
        vulnerabilities: [{
          id: 'command_injection-10-5',
          patternId: 'command_injection',
          filePath: 'src/app.js',
          line: 10,
          code: '  eval(userInput);',
          severity: 'critical'
        }],
        files: {
          'src/app.js': 'function process(userInput) { eval(userInput); }'
        }
      });
    });

    it('should filter out false positives', async () => {
      const vulnerabilities: Vulnerability[] = [
        {
          type: VulnerabilityType.COMMAND_INJECTION,
          severity: 'critical' as const,
          description: 'Real vulnerability',
          message: 'Using eval() with user input can lead to code injection',
          line: 10,
          column: 5,
          filePath: 'src/app.js',
          snippet: '  eval(userInput);',
          confidence: 90,
          cweId: 'CWE-95',
          owaspCategory: 'A03:2021',
          remediation: 'Do not use eval'
        },
        {
          type: VulnerabilityType.COMMAND_INJECTION,
          severity: 'critical' as const,
          description: 'False positive in comment',
          message: 'Using eval() with user input can lead to code injection',
          line: 20,
          column: 5,
          filePath: 'src/app.js',
          snippet: '  // eval is dangerous',
          confidence: 90,
          cweId: 'CWE-95',
          owaspCategory: 'A03:2021',
          remediation: 'Do not use eval'
        }
      ];

      const fileContents = new Map([
        ['src/app.js', 'function process(userInput) { eval(userInput); }\n// eval is dangerous']
      ]);

      const mockResponse = {
        validated: [
          {
            id: 'command_injection-10-5',
            isValid: true,
            confidence: 0.95,
            astContext: { inUserInputFlow: true, hasValidation: false }
          },
          {
            id: 'command_injection-20-5',
            isValid: false,
            confidence: 0.1,
            reason: 'Code found in comment',
            astContext: { inUserInputFlow: false, hasValidation: false }
          }
        ],
        stats: { total: 2, validated: 1, rejected: 1 }
      };

      mockApiClient.validateVulnerabilities.mockResolvedValue(mockResponse);

      const result = await validator.validateVulnerabilities(vulnerabilities, fileContents);

      // Should only return the valid vulnerability
      expect(result).toHaveLength(1);
      expect(result[0].line).toBe(10);
    });

    it('should handle API errors gracefully', async () => {
      const vulnerabilities: Vulnerability[] = [
        {
          type: VulnerabilityType.COMMAND_INJECTION,
          severity: 'critical' as const,
          description: 'Eval injection',
          message: 'Using eval() with user input can lead to code injection',
          line: 10,
          column: 5,
          filePath: 'src/app.js',
          snippet: '  eval(x);',
          confidence: 90,
          cweId: 'CWE-95',
          owaspCategory: 'A03:2021',
          remediation: 'Do not use eval'
        }
      ];

      const fileContents = new Map([['src/app.js', 'eval(x);']]);

      mockApiClient.validateVulnerabilities.mockRejectedValue(new Error('API error'));

      // Should return all vulnerabilities when API fails (fail open)
      const result = await validator.validateVulnerabilities(vulnerabilities, fileContents);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(vulnerabilities[0]);
    });

    it('should handle missing file content', async () => {
      const vulnerabilities: Vulnerability[] = [
        {
          type: VulnerabilityType.COMMAND_INJECTION,
          severity: 'critical' as const,
          description: 'Eval injection',
          message: 'Using eval() with user input can lead to code injection',
          line: 10,
          column: 5,
          filePath: 'missing.js',
          snippet: '  eval(x);',
          confidence: 90,
          cweId: 'CWE-95',
          owaspCategory: 'A03:2021',
          remediation: 'Do not use eval'
        }
      ];

      const fileContents = new Map<string, string>(); // No content

      const mockResponse = {
        validated: [{
          id: 'command_injection-10-5',
          isValid: true,
          confidence: 0.5,
          reason: 'File content unavailable'
        }],
        stats: { total: 1, validated: 1, rejected: 0 }
      };

      mockApiClient.validateVulnerabilities.mockResolvedValue(mockResponse);

      const result = await validator.validateVulnerabilities(vulnerabilities, fileContents);

      expect(result).toHaveLength(1);
      expect(mockApiClient.validateVulnerabilities).toHaveBeenCalledWith({
        vulnerabilities: expect.any(Array),
        files: {} // Empty files object
      });
    });

    it('should batch vulnerabilities by file for efficiency', async () => {
      const vulnerabilities: Vulnerability[] = [
        {
          type: VulnerabilityType.COMMAND_INJECTION,
          severity: 'critical' as const,
          description: 'Eval in file1',
          message: 'Using eval() with user input can lead to code injection',
          line: 10,
          column: 5,
          filePath: 'file1.js',
          snippet: 'eval(x);',
          confidence: 90,
          cweId: 'CWE-95',
          owaspCategory: 'A03:2021',
          remediation: 'Do not use eval'
        },
        {
          type: VulnerabilityType.COMMAND_INJECTION,
          severity: 'critical' as const,
          description: 'Another eval in file1',
          message: 'Using eval() with user input can lead to code injection',
          line: 20,
          column: 5,
          filePath: 'file1.js',
          snippet: 'eval(y);',
          confidence: 90,
          cweId: 'CWE-95',
          owaspCategory: 'A03:2021',
          remediation: 'Do not use eval'
        },
        {
          type: VulnerabilityType.COMMAND_INJECTION,
          severity: 'critical' as const,
          description: 'Eval in file2',
          message: 'Using eval() with user input can lead to code injection',
          line: 5,
          column: 10,
          filePath: 'file2.js',
          snippet: 'eval(z);',
          confidence: 90,
          cweId: 'CWE-95',
          owaspCategory: 'A03:2021',
          remediation: 'Do not use eval'
        }
      ];

      const fileContents = new Map([
        ['file1.js', 'eval(x);\neval(y);'],
        ['file2.js', 'eval(z);']
      ]);

      mockApiClient.validateVulnerabilities.mockResolvedValue({
        validated: [
          { id: 'command_injection-10-5', isValid: true, confidence: 0.9 },
          { id: 'command_injection-20-5', isValid: true, confidence: 0.9 },
          { id: 'command_injection-5-10', isValid: true, confidence: 0.9 }
        ],
        stats: { total: 3, validated: 3, rejected: 0 }
      });

      await validator.validateVulnerabilities(vulnerabilities, fileContents);

      // Should make a single API call with all vulnerabilities and files
      expect(mockApiClient.validateVulnerabilities).toHaveBeenCalledTimes(1);
      expect(mockApiClient.validateVulnerabilities).toHaveBeenCalledWith({
        vulnerabilities: expect.arrayContaining([
          expect.objectContaining({ id: 'command_injection-10-5' }),
          expect.objectContaining({ id: 'command_injection-20-5' }),
          expect.objectContaining({ id: 'command_injection-5-10' })
        ]),
        files: {
          'file1.js': 'eval(x);\neval(y);',
          'file2.js': 'eval(z);'
        }
      });
    });
  });

  describe('getCacheKey', () => {
    it('should generate consistent cache keys', () => {
      const validator = new ASTValidator('test-key');
      
      const key1 = (validator as any).getCacheKey('file.js', 'pattern-1', 'hash123');
      const key2 = (validator as any).getCacheKey('file.js', 'pattern-1', 'hash123');
      
      expect(key1).toBe(key2);
      expect(key1).toContain('file.js');
      expect(key1).toContain('pattern-1');
      expect(key1).toContain('hash123');
    });
  });
});