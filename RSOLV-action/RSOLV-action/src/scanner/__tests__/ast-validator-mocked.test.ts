import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { ASTValidator } from '../ast-validator.js';
import type { Vulnerability } from '../../security/types.js';
import { RsolvApiClient } from '../../external/api-client.js';

// Mock the API client module
vi.mock('../../external/api-client.js');

describe('AST Validator with Mocked API', () => {
  let validator: ASTValidator;
  let mockApiClient: {
    validateVulnerabilities: MockedFunction<any>;
  };
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set up the mock implementation
    mockApiClient = {
      validateVulnerabilities: vi.fn()
    };
    
    (RsolvApiClient as any).mockImplementation(() => mockApiClient);
    
    validator = new ASTValidator('test-api-key');
  });
  
  describe('False Positive Filtering', () => {
    it('should filter out vulnerabilities in comments', async () => {
      // RED: Write the test that we want to pass
      const vulnerabilities: Vulnerability[] = [
        {
          type: 'js-eval-injection',
          severity: 'critical',
          line: 2,
          column: 3,
          snippet: '// eval(userInput)',
          filePath: 'example.js'
        }
      ];
      
      const fileContents = new Map([
        ['example.js', `// Security warning
// eval(userInput) - never do this!
console.log('safe code');`]
      ]);
      
      // Mock API response - comment detected, marked as invalid
      mockApiClient.validateVulnerabilities.mockResolvedValue({
        validated: [
          {
            id: 'js-eval-injection-2-3',
            isValid: false,
            confidence: 0.1,
            reason: 'Code found in comment'
          }
        ],
        stats: {
          total: 1,
          validated: 0,
          rejected: 1
        }
      });
      
      const validated = await validator.validateVulnerabilities(vulnerabilities, fileContents);
      
      // GREEN: Should filter out the false positive
      expect(validated).toHaveLength(0);
      expect(mockApiClient.validateVulnerabilities).toHaveBeenCalledWith({
        vulnerabilities: [
          {
            id: 'js-eval-injection-2-3',
            patternId: 'js-eval-injection',
            filePath: 'example.js',
            line: 2,
            code: '// eval(userInput)',
            severity: 'critical'
          }
        ],
        files: {
          'example.js': `// Security warning
// eval(userInput) - never do this!
console.log('safe code');`
        }
      });
    });
    
    it('should keep real vulnerabilities', async () => {
      const vulnerabilities: Vulnerability[] = [
        {
          type: 'js-eval-injection',
          severity: 'critical',
          line: 5,
          column: 3,
          snippet: 'eval(userExpression)',
          filePath: 'calc.js'
        }
      ];
      
      const fileContents = new Map([
        ['calc.js', `function calculator(expr) {
  const userExpression = expr;
  // Process user input
  // This is dangerous:
  eval(userExpression);
}`]
      ]);
      
      // Mock API response - real vulnerability, marked as valid
      mockApiClient.validateVulnerabilities.mockResolvedValue({
        validated: [
          {
            id: 'js-eval-injection-5-3',
            isValid: true,
            confidence: 0.95,
            reason: null
          }
        ],
        stats: {
          total: 1,
          validated: 1,
          rejected: 0
        }
      });
      
      const validated = await validator.validateVulnerabilities(vulnerabilities, fileContents);
      
      // Should keep the real vulnerability
      expect(validated).toHaveLength(1);
      expect(validated[0]).toMatchObject({
        type: 'js-eval-injection',
        line: 5,
        severity: 'critical'
      });
    });
    
    it('should handle mixed results correctly', async () => {
      const vulnerabilities: Vulnerability[] = [
        {
          type: 'js-eval-injection',
          severity: 'critical',
          line: 1,
          column: 1,
          snippet: '// eval(x)',
          filePath: 'mixed.js'
        },
        {
          type: 'js-eval-injection',
          severity: 'critical',
          line: 5,
          column: 3,
          snippet: 'eval(userExpression)',
          filePath: 'mixed.js'
        },
        {
          type: 'python-exec-injection',
          severity: 'critical',
          line: 8,
          column: 1,
          snippet: "msg = 'exec is dangerous'",
          filePath: 'mixed.py'
        }
      ];
      
      const fileContents = new Map([
        ['mixed.js', `// eval(x) - don't use eval
function calculator(expr) {
  const userExpression = expr;
  // Process user input
  eval(userExpression); // vulnerability!
}`],
        ['mixed.py', `# Python example
def process():
    msg = 'exec is dangerous'
    print(msg)`]
      ]);
      
      // Mock API response - first is comment (invalid), second is real (valid), third is string (invalid)
      mockApiClient.validateVulnerabilities.mockResolvedValue({
        validated: [
          {
            id: 'js-eval-injection-1-1',
            isValid: false,
            confidence: 0.1,
            reason: 'Code found in comment'
          },
          {
            id: 'js-eval-injection-5-3',
            isValid: true,
            confidence: 0.95,
            reason: null
          },
          {
            id: 'python-exec-injection-8-1',
            isValid: false,
            confidence: 0.1,
            reason: 'Code found in string literal'
          }
        ],
        stats: {
          total: 3,
          validated: 1,
          rejected: 2
        }
      });
      
      const validated = await validator.validateVulnerabilities(vulnerabilities, fileContents);
      
      // Should keep only the real vulnerability
      expect(validated).toHaveLength(1);
      expect(validated[0].line).toBe(5);
      expect(validated[0].type).toBe('js-eval-injection');
    });
    
    it('should handle API failures gracefully', async () => {
      const vulnerabilities: Vulnerability[] = [
        {
          type: 'test',
          severity: 'high',
          line: 1,
          column: 1,
          snippet: 'test',
          filePath: 'test.js'
        }
      ];
      
      const fileContents = new Map([['test.js', 'test code']]);
      
      // Mock API failure
      mockApiClient.validateVulnerabilities.mockRejectedValue(new Error('API Error'));
      
      const validated = await validator.validateVulnerabilities(vulnerabilities, fileContents);
      
      // Should return all vulnerabilities when API fails (fail open)
      expect(validated).toHaveLength(1);
      expect(validated).toEqual(vulnerabilities);
    });
  });
});