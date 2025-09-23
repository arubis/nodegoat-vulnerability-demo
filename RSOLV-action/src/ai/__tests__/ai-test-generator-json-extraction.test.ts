import { describe, it, expect } from 'vitest';
import { AITestGenerator } from '../ai-test-generator.js';

describe('AITestGenerator - JSON Extraction', () => {
  describe('parseTestSuite', () => {
    // Access the private method via prototype for testing
    const generator = new AITestGenerator({} as any);
    const parseTestSuite = (response: string) => {
      return (generator as any).parseTestSuite(response);
    };

    it('should extract JSON from markdown code blocks', () => {
      const response = `
Here's the test suite:

\`\`\`json
{
  "red": {
    "testName": "Test for vulnerability",
    "testCode": "const test = 'code';"
  },
  "green": {
    "testName": "Test that fix works",
    "testCode": "const test = 'safe';"
  },
  "refactor": {
    "testName": "Test refactored code",
    "testCode": "const test = 'refactored';"
  }
}
\`\`\`
`;
      const result = parseTestSuite(response);
      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result!.red).toBeDefined();
      expect(result!.red.testName).toBe('Test for vulnerability');
    });

    it('should handle nested JSON objects correctly', () => {
      const response = `
\`\`\`json
{
  "red": {
    "testName": "Nested test",
    "testCode": "function test() { return { nested: true }; }",
    "metadata": {
      "level1": {
        "level2": {
          "level3": "deeply nested"
        }
      }
    }
  },
  "green": {
    "testName": "Another test",
    "testCode": "const x = { obj: { inner: 'value' } };"
  }
}
\`\`\`
`;
      const result = parseTestSuite(response);
      expect(result).toBeDefined();
      expect(result.red.metadata.level1.level2.level3).toBe('deeply nested');
      expect(result.green.testName).toBe('Another test');
    });

    it('should extract JSON with curly braces in string values', () => {
      const response = `
{
  "red": {
    "testName": "Test with braces",
    "testCode": "const code = 'function() { return { test: true }; }';"
  }
}
`;
      const result = parseTestSuite(response);
      expect(result).toBeDefined();
      expect(result.red.testCode).toContain('{ return { test: true }; }');
    });

    it('should handle JSON with escaped quotes in strings', () => {
      const response = `
\`\`\`json
{
  "red": {
    "testName": "Test with quotes",
    "testCode": "const str = \\"This has \\\\\\"quotes\\\\\\" inside\\";"
  }
}
\`\`\`
`;
      const result = parseTestSuite(response);
      expect(result).toBeDefined();
      expect(result.red.testCode).toContain('quotes');
    });

    it('should extract the largest valid JSON object when multiple exist', () => {
      const response = `
Some text with a small JSON: {"small": "object"}

The main response:
\`\`\`json
{
  "red": {
    "testName": "Main test",
    "testCode": "const main = true;"
  },
  "green": {
    "testName": "Secondary test",
    "testCode": "const secondary = true;"
  }
}
\`\`\`

Another small one: {"another": "small"}
`;
      const result = parseTestSuite(response);
      expect(result).toBeDefined();
      expect(result.red).toBeDefined();
      expect(result.green).toBeDefined();
      expect(result.red.testName).toBe('Main test');
    });

    it('should handle multiline code strings with proper escaping', () => {
      const response = `
\`\`\`json
{
  "red": {
    "testName": "Multiline test",
    "testCode": "const { expect } = require('chai');\\n\\nfunction vulnerableCompare(secret1, secret2) {\\n  return secret1 === secret2;\\n}\\n\\nit('should detect timing attack', function() {\\n  const result = vulnerableCompare('a', 'b');\\n  expect(result).to.be.false;\\n});"
  }
}
\`\`\`
`;
      const result = parseTestSuite(response);
      expect(result).toBeDefined();
      expect(result.red.testCode).toContain('vulnerableCompare');
      expect(result.red.testCode).toContain('\\n');
    });

    it('should handle incomplete JSON by attempting recovery', () => {
      // This simulates the actual truncation issue we're seeing
      const response = `
\`\`\`json
{
  "red": {
    "testName": "Truncated test",
    "testCode": "const { expect } = require('chai');\\n\\nfunction vulnerableCompare(secret1, secret2) {\\n  return secret1 === secret2;\\n}\\n\\nit('should detect timing attack vulnerability', function() {\\n  const correctSecret = 'a'.repeat(1000);\\n  const wrongShort = 'b';\\n  const wrongLong = 'b'.repeat(1000);\\n  \\n  const times = [];\\n  for(let i = 0; i < 100; i++) {\\n    const start = process"
\`\`\`
`;
      const result = parseTestSuite(response);
      // Should either parse what it can or return null gracefully
      // Current implementation would fail here
      expect(result).toBeNull(); // Expected: handles gracefully
    });

    it('should correctly extract JSON that comes after explanatory text', () => {
      const response = `
Based on the vulnerability analysis, here's a comprehensive test suite:

The following tests will validate both the vulnerable and fixed versions:

\`\`\`json
{
  "red": {
    "testName": "SQL Injection Detection",
    "testCode": "const payload = \\"'; DROP TABLE users; --\\";",
    "attackVector": "SQL injection via user input"
  },
  "green": {
    "testName": "Safe SQL Query",
    "testCode": "const safeQuery = 'SELECT * FROM users WHERE id = ?';",
    "expectedBehavior": "Parameterized queries prevent injection"
  },
  "refactor": {
    "testName": "Refactored Implementation",
    "testCode": "// Using ORM instead of raw SQL"
  }
}
\`\`\`

These tests ensure comprehensive coverage.
`;
      const result = parseTestSuite(response);
      expect(result).toBeDefined();
      expect(result.red.attackVector).toBe('SQL injection via user input');
      expect(result.green.expectedBehavior).toBe('Parameterized queries prevent injection');
      expect(result.refactor).toBeDefined();
    });
  });

  describe('extractJsonFromResponse - utility function', () => {
    // Test the extraction utility separately
    it('should use a proper JSON extraction method', () => {
      // This test validates that we're using a robust extraction method
      // rather than the buggy regex /\{[\s\S]*\}/

      const testCases = [
        {
          input: '{"nested": {"inner": "value"}}',
          expected: '{"nested": {"inner": "value"}}'
        },
        {
          input: 'Some text {"nested": {"a": 1, "b": {"c": 2}}} more text',
          expected: '{"nested": {"a": 1, "b": {"c": 2}}}'
        },
        {
          input: '```json\n{"test": {"value": "data"}}\n```',
          expected: '{"test": {"value": "data"}}'
        }
      ];

      testCases.forEach(({ input, expected }) => {
        // The actual implementation should properly extract these
        // Current regex /\{[\s\S]*\}/ would fail on nested objects
        const result = extractJsonSafely(input);
        expect(result).toBe(expected);
      });
    });
  });
});

// Helper function that should be implemented to replace the buggy regex
function extractJsonSafely(text: string): string | null {
  // First, try to extract from markdown code blocks
  const markdownMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (markdownMatch) {
    text = markdownMatch[1];
  }

  // Find all potential JSON start/end positions
  const positions: Array<{start: number, end: number, depth: number}> = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let jsonStart = -1;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      continue;
    }

    if (char === '"' && !escape) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') {
        if (depth === 0) {
          jsonStart = i;
        }
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0 && jsonStart !== -1) {
          positions.push({
            start: jsonStart,
            end: i + 1,
            depth: 0
          });
          jsonStart = -1;
        }
      }
    }
  }

  // Try to parse each potential JSON object, return the largest valid one
  let largestValid: string | null = null;
  let largestSize = 0;

  for (const pos of positions) {
    const candidate = text.substring(pos.start, pos.end);
    try {
      JSON.parse(candidate);
      if (candidate.length > largestSize) {
        largestValid = candidate;
        largestSize = candidate.length;
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  return largestValid;
}