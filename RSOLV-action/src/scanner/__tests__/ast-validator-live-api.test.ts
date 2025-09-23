import { describe, it, expect, beforeAll, beforeEach, afterAll, skipIf, vi } from 'vitest';
import { ASTValidator } from '../ast-validator.js';
import type { Vulnerability } from '../../security/types.js';
import { server } from '../../test/mocks/server.js';

// These tests require a running RSOLV-api instance
const API_URL = process.env.RSOLV_API_URL || 'http://localhost:4003';
const TEST_API_KEY = process.env.TEST_API_KEY || process.env.RSOLV_API_KEY || 'test-api-key';
const SKIP_LIVE_TESTS = process.env.SKIP_LIVE_TESTS === 'true';


describe('AST Validator Live API Tests', () => {
  let validator: ASTValidator;
  let apiAvailable = false;
  
  beforeAll(async () => {
    // Bypass MSW for live API tests
    server.close();
    // Check if API is available
    // Skip health check if we're using localhost (live API tests)
    if (API_URL.includes('localhost')) {
      apiAvailable = true;
    } else {
      try {
        const response = await fetch(`${API_URL}/health`);
        apiAvailable = response.ok;
      } catch (error) {
        apiAvailable = false;
      }
    }
    
    if (!apiAvailable) {
      console.warn(`
⚠️  Live API tests skipped - RSOLV-api not available at ${API_URL}
To run these tests:
1. Start RSOLV-api: cd ../RSOLV-platform && mix phx.server
2. Run tests: npx vitest run src/scanner/__tests__/ast-validator-live-api.test.ts
`);
    }
    
    validator = new ASTValidator(TEST_API_KEY);
  });
  
  afterAll(() => {
    // Restart MSW after live API tests
    server.listen({ onUnhandledRequest: 'warn' });
  });
  
  describe.skip('Real API Integration (Requires Forge Account)', () => {
    // These tests require the API to have proper forge account setup
    // Skip them for now until we have proper test infrastructure
    it('should validate JavaScript eval injection in comments', async () => {
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
        ['example.js', `function example() {
  // eval(userInput) - DON'T DO THIS!
  console.log('safe code');
}`]
      ]);
      
      const validated = await validator.validateVulnerabilities(vulnerabilities, fileContents);
      
      // Should filter out comment
      expect(validated).toHaveLength(0);
    });
    
    it('should validate real eval injection with user input', async () => {
      const vulnerabilities: Vulnerability[] = [
        {
          type: 'js-eval-injection',
          severity: 'critical',
          line: 3,
          column: 3,
          snippet: 'eval(userInput)',
          filePath: 'vulnerable.js'
        }
      ];
      
      const fileContents = new Map([
        ['vulnerable.js', `function processUserCode(req) {
  const userInput = req.body.code;
  eval(userInput); // Real vulnerability
  return 'done';
}`]
      ]);
      
      const validated = await validator.validateVulnerabilities(vulnerabilities, fileContents);
      
      // Should keep real vulnerability
      expect(validated).toHaveLength(1);
      expect(validated[0].line).toBe(3);
    });
    
    it('should handle Python exec in string literals', async () => {
      const vulnerabilities: Vulnerability[] = [
        {
          type: 'python-exec-injection',
          severity: 'critical',
          line: 2,
          column: 1,
          snippet: "warning = 'Never use exec()'",
          filePath: 'app.py'
        }
      ];
      
      const fileContents = new Map([
        ['app.py', `# Security warnings
warning = 'Never use exec()'
print(warning)`]
      ]);
      
      const validated = await validator.validateVulnerabilities(vulnerabilities, fileContents);
      
      // Should filter out string literal
      expect(validated).toHaveLength(0);
    });
    
    it('should handle Ruby eval with proper context', async () => {
      const vulnerabilities: Vulnerability[] = [
        {
          type: 'ruby-eval-injection',
          severity: 'critical',
          line: 3,
          column: 1,
          snippet: 'eval(params[:code])',
          filePath: 'handler.rb'
        }
      ];
      
      const fileContents = new Map([
        ['handler.rb', `class Handler
  def process(params)
    eval(params[:code]) # Dangerous!
  end
end`]
      ]);
      
      const validated = await validator.validateVulnerabilities(vulnerabilities, fileContents);
      
      // Should keep real vulnerability
      expect(validated).toHaveLength(1);
    });
    
    it('should handle batch processing with mixed results', async () => {
      const vulnerabilities: Vulnerability[] = [
        // Comment - should be filtered
        {
          type: 'js-eval-injection',
          severity: 'critical',
          line: 1,
          column: 1,
          snippet: '// eval(x)',
          filePath: 'mixed.js'
        },
        // Real vulnerability
        {
          type: 'js-eval-injection',
          severity: 'critical',
          line: 5,
          column: 3,
          snippet: 'eval(userExpression)',
          filePath: 'mixed.js'
        },
        // String literal - should be filtered
        {
          type: 'js-eval-injection',
          severity: 'critical',
          line: 8,
          column: 1,
          snippet: "const msg = 'eval is dangerous'",
          filePath: 'mixed.js'
        }
      ];
      
      const fileContents = new Map([
        ['mixed.js', `// eval(x) - don't use eval
function calculator(expr) {
  const userExpression = expr;
  // Process user input
  eval(userExpression); // vulnerability!
}

const msg = 'eval is dangerous';
console.log(msg);`]
      ]);
      
      const validated = await validator.validateVulnerabilities(vulnerabilities, fileContents);
      
      // Should keep only the real vulnerability
      expect(validated).toHaveLength(1);
      expect(validated[0].line).toBe(5);
    });
    
    it('should handle API errors gracefully', async () => {
      // Use invalid API key
      const badValidator = new ASTValidator('invalid-key-12345');
      
      const vulnerabilities: Vulnerability[] = [{
        type: 'test',
        severity: 'high',
        line: 1,
        column: 1,
        snippet: 'test',
        filePath: 'test.js'
      }];
      
      const fileContents = new Map([['test.js', 'test']]);
      
      // Should fail open and return all vulnerabilities
      const validated = await badValidator.validateVulnerabilities(vulnerabilities, fileContents);
      expect(validated).toEqual(vulnerabilities);
    });
  });
  
  describe('Performance Tests', () => {
    it('should handle large batch efficiently', async () => {
      // Create 50 vulnerabilities
      const vulnerabilities: Vulnerability[] = [];
      for (let i = 1; i <= 50; i++) {
        vulnerabilities.push({
          type: 'js-eval-injection',
          severity: 'critical',
          line: i,
          column: 1,
          snippet: `eval(input${i})`,
          filePath: `file${Math.floor(i / 10)}.js`
        });
      }
      
      // Create file contents
      const fileContents = new Map<string, string>();
      for (let f = 0; f <= 5; f++) {
        const lines = [];
        for (let l = 1; l <= 10; l++) {
          lines.push(`eval(input${f * 10 + l}); // line ${l}`);
        }
        fileContents.set(`file${f}.js`, lines.join('\n'));
      }
      
      const startTime = Date.now();
      const validated = await validator.validateVulnerabilities(vulnerabilities, fileContents);
      const duration = Date.now() - startTime;
      
      console.log(`Processed ${vulnerabilities.length} vulnerabilities in ${duration}ms`);
      
      // Should complete within reasonable time
      expect(duration).toBeLessThan(5000); // 5 seconds max
      expect(validated.length).toBeGreaterThan(0);
    });
  });
  
  describe('Multi-language Support', () => {
    it('should validate JavaScript vulnerabilities', async () => {
      const result = await testLanguageValidation(
        'javascript',
        'js-eval-injection',
        'eval(req.query.code)',
        `app.get('/calc', (req, res) => {
  eval(req.query.code);
});`
      );
      
      expect(result.validated).toHaveLength(1);
    });
    
    it('should validate Python vulnerabilities', async () => {
      const result = await testLanguageValidation(
        'python',
        'python-exec-injection',
        'exec(request.form["code"])',
        `@app.route('/exec')
def execute():
    exec(request.form["code"])
    return "done"`
      );
      
      expect(result.validated).toHaveLength(1);
    });
    
    it('should validate Ruby vulnerabilities', async () => {
      const result = await testLanguageValidation(
        'ruby',
        'ruby-eval-injection',
        'eval(params[:expr])',
        `def calculate
  result = eval(params[:expr])
  render json: { result: result }
end`
      );
      
      expect(result.validated).toHaveLength(1);
    });
    
    async function testLanguageValidation(
      language: string,
      patternId: string,
      snippet: string,
      fileContent: string
    ) {
      const vulnerabilities: Vulnerability[] = [{
        type: patternId,
        severity: 'critical',
        line: fileContent.split('\n').findIndex(l => l.includes(snippet.split('(')[0])) + 1,
        column: 1,
        snippet,
        filePath: `test.${language}`
      }];
      
      const fileContents = new Map([[`test.${language}`, fileContent]]);
      
      const validated = await validator.validateVulnerabilities(vulnerabilities, fileContents);
      return { validated };
    }
  });
});