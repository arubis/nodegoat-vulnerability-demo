import { describe, it, expect } from 'vitest';
import { AITestGenerator } from '../ai-test-generator.js';

describe('AITestGenerator - Escaped Quote Edge Cases', () => {
  describe('parseTestSuite - escaped quotes handling', () => {
    // Access the private method via prototype for testing
    const generator = new AITestGenerator({} as any);
    const parseTestSuite = (response: string) => {
      return (generator as any).parseTestSuite(response);
    };

    it('should handle JSON with escaped quotes that appears truncated but is actually valid', () => {
      // This simulates the exact failure from production logs
      const response = `{
  "red": {
    "testName": "Math.random() predictability test",
    "testCode": "const originalRandom = Math.random;\\nMath.random = jest.fn(() => 0.5);\\nconst result1 = Math.random();\\nconst result2 = Math.random();\\nexpect(result1).toBe(result2);\\nexpect(Math.random).toHaveBeenCalledTimes(2);\\nMath.random = originalRandom;",
    "attackVector": "predictable sequence",
    "expectedBehavior": "Math.random() produces predictable values when mocked"
  },
  "green": {
    "testName": "crypto.randomBytes security test",
    "testCode": "const crypto = require('crypto');\\nconst result1 = crypto.randomBytes(16).toString('hex');\\nconst result2 = crypto.randomBytes(16).toString('hex');\\nexpect(result1).toMatch(/^[0-9a-f]{32}$/);\\nexpect(result1).not.toBe(result2);",
    "validInput": "crypto.randomBytes(16)",
    "expectedBehavior": "crypto.randomBytes produces unpredictable secure values"
  },
  "refactor": {
    "testName": "secure ID generation maintains functionality",
    "testCode": "const crypto = require('crypto');\\nconst generateSecureId = () => crypto.randomBytes(8).toString('hex');\\nconst id1 = generateSecureId();\\nconst id2 = generateSecureId();\\nexpect(id1).toMatch(/^[0-9a-f]{16}$/);\\nexpect(id1).not.toBe(id2);",
    "testCases": ["hex string format", "unique values", "correct length"],
    "expectedBehavior": "secure random generation maintains expected functionality"
  }
}`;

      const result = parseTestSuite(response);
      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result!.red).toBeDefined();
      expect(result!.green).toBeDefined();
      expect(result!.refactor).toBeDefined();
      expect(result!.red.testCode).toContain('Math.random');
      expect(result!.green.testCode).toContain('crypto.randomBytes');
    });

    it('should handle JSON truncated mid-string with escaped quotes properly', () => {
      // This simulates the actual truncation from production
      const response = `{
  "red": {
    "testName": "Math.random() predictability test",
    "testCode": "const originalRandom = Math.random;\\nMath.random = jest.fn(() => 0.5);\\nconst result1 = Math.random();\\nconst result2 = Math.random();\\nexpected(result1).toBe(result2);\\nexpected(Math.random).toHaveBeenCalledTimes(2);\\nMath.random = originalRandom;",
    "attackVector": "predictable sequence",
    "expectedBehavior": "Math.random() produces predictable values when mocked"
  },
  "green": {
    "testName": "crypto.rand`;

      const result = parseTestSuite(response);
      // Should handle gracefully - either parse what it can or return null
      // The key is it shouldn't throw an exception
      if (result) {
        expect(result.red).toBeDefined();
        expect(result.red.testCode).toContain('Math.random');
      }
    });

    it('should correctly distinguish between escaped quotes and actual string terminators', () => {
      const response = `{
  "red": {
    "testName": "XXE File Read Attack",
    "testCode": "const xmlPayload = '<?xml version=\\"1.0\\"?><!DOCTYPE root [<!ENTITY xxe SYSTEM \\"file:///etc/passwd\\">]><root>&xxe;</root>';\\nconst parser = new DOMParser();\\nconst doc = parser.parseFromString(xmlPayload, 'text/xml');\\nconst result = doc.documentElement.textContent;\\nexpect(result).not.toContain('root:x:0:0');",
    "attackVector": "XML with external entity referencing system file",
    "expectedBehavior": "Should fail on vulnerable parsers"
  }
}`;

      const result = parseTestSuite(response);
      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result!.red.testCode).toContain('<!DOCTYPE root');
      expect(result!.red.testCode).toContain('file:///etc/passwd');
    });

    it('should detect actual unterminated strings vs escaped quotes', () => {
      // Case 1: Actually unterminated string (missing closing quote)
      const actuallyTruncated = `{
  "red": {
    "testName": "Test",
    "testCode": "const test = 'hello world`;

      const result1 = parseTestSuite(actuallyTruncated);
      // Should attempt repair or return null gracefully

      // Case 2: String with escaped quotes that looks truncated but isn't
      const validWithEscapes = `{
  "red": {
    "testName": "Test",
    "testCode": "const test = 'hello \\"world\\"';"
  }
}`;

      const result2 = parseTestSuite(validWithEscapes);
      expect(result2).toBeDefined();
      expect(result2!.red.testCode).toContain('hello "world"');
    });
  });
});