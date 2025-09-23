import { describe, it, expect } from 'vitest';
import { PatternAPIClient, PatternData } from './pattern-api-client.js';

/**
 * RFC-032 Phase 2.2: Test successful TypeScript regex reconstruction
 * 
 * These tests verify that the implemented reconstruction methods
 * properly handle the JSON serialized regex format from the enhanced API.
 */
describe('Pattern API Regex Reconstruction Success', () => {
  describe('Phase 2.2: Successful regex reconstruction', () => {
    it('should reconstruct regex from serialized format', () => {
      const client = new PatternAPIClient();
      
      // Test the private method via the convertToSecurityPattern flow
      const enhancedPatternData: PatternData = {
        id: "js-eval-usage",
        name: "JavaScript eval() Usage",
        type: "command_injection",
        description: "Detects usage of eval() function",
        severity: "high",
        languages: ["javascript"],
        recommendation: "Avoid using eval()",
        regex_patterns: [
          {
            "__type__": "regex",
            "source": "eval\\s*\\(",
            "flags": ["i"]
          } as any
        ]
      };

      // @ts-expect-error - Access private method for testing
      const pattern = client.convertToSecurityPattern(enhancedPatternData);
      
      // Verify regex was reconstructed
      expect(pattern.patterns.regex).toHaveLength(1);
      expect(pattern.patterns.regex[0]).toBeInstanceOf(RegExp);
      expect(pattern.patterns.regex[0].source).toBe("eval\\s*\\(");
      expect(pattern.patterns.regex[0].flags).toBe("i");
    });

    it('should handle multiple regex with different flags', () => {
      const client = new PatternAPIClient();
      
      const patternData: PatternData = {
        id: "test-pattern",
        name: "Test Pattern",
        type: "xss",
        description: "Test",
        severity: "high",
        languages: ["javascript"],
        recommendation: "Fix it",
        regex_patterns: [
          {
            "__type__": "regex",
            "source": "test1",
            "flags": ["i", "m"]
          } as any,
          {
            "__type__": "regex",
            "source": "test2",
            "flags": []
          } as any,
          {
            "__type__": "regex",
            "source": "test3",
            "flags": ["g", "i", "s"]
          } as any
        ]
      };

      // @ts-expect-error - Access private method for testing
      const pattern = client.convertToSecurityPattern(patternData);
      
      expect(pattern.patterns.regex).toHaveLength(3);
      expect(pattern.patterns.regex[0].flags).toBe("im");
      expect(pattern.patterns.regex[1].flags).toBe("");
      expect(pattern.patterns.regex[2].flags).toBe("gis");
    });

    it('should handle regex in AST rules', () => {
      const client = new PatternAPIClient();
      
      const patternData: PatternData = {
        id: "test-ast-regex",
        name: "Test AST Regex",
        type: "xss",
        description: "Test",
        severity: "high",
        languages: ["javascript"],
        recommendation: "Fix it",
        regex_patterns: [],
        ast_rules: {
          node_type: "CallExpression",
          callee_pattern: {
            "__type__": "regex",
            "source": "^(eval|Function)$",
            "flags": ["i"]
          } as any
        }
      };

      // @ts-expect-error - Access private method for testing
      const pattern = client.convertToSecurityPattern(patternData);
      
      // Verify AST rules were reconstructed with regex
      expect(pattern.astRules).toBeDefined();
      expect(pattern.astRules?.callee_pattern).toBeInstanceOf(RegExp);
      expect(pattern.astRules?.callee_pattern.source).toBe("^(eval|Function)$");
    });

    it('should handle regex in context rules', () => {
      const client = new PatternAPIClient();
      
      const patternData: PatternData = {
        id: "test-context-regex",
        name: "Test Context Regex",
        type: "xss",
        description: "Test",
        severity: "high",
        languages: ["javascript"],
        recommendation: "Fix it",
        regex_patterns: [],
        context_rules: {
          exclude_paths: [
            {
              "__type__": "regex",
              "source": "node_modules/",
              "flags": []
            } as any,
            "/test/fixtures/"  // Mixed with string
          ]
        }
      };

      // @ts-expect-error - Access private method for testing
      const pattern = client.convertToSecurityPattern(patternData);
      
      // Verify context rules were reconstructed
      expect(pattern.contextRules).toBeDefined();
      expect(pattern.contextRules?.exclude_paths).toHaveLength(2);
      expect(pattern.contextRules?.exclude_paths[0]).toBeInstanceOf(RegExp);
      expect(pattern.contextRules?.exclude_paths[0].source).toBe("node_modules\\/");
      expect(pattern.contextRules?.exclude_paths[1]).toBe("/test/fixtures/");
    });

    it('should handle deeply nested regex objects', () => {
      const client = new PatternAPIClient();
      
      const patternData: PatternData = {
        id: "test-nested",
        name: "Test Nested",
        type: "xss",
        description: "Test",
        severity: "high",
        languages: ["javascript"],
        recommendation: "Fix it",
        regex_patterns: [],
        ast_rules: {
          conditions: {
            any_of: [
              {
                name_matches: {
                  "__type__": "regex",
                  "source": "dangerous.*",
                  "flags": ["i"]
                } as any
              }
            ]
          }
        }
      };

      // @ts-expect-error - Access private method for testing
      const pattern = client.convertToSecurityPattern(patternData);
      
      // Verify deeply nested regex was reconstructed
      const nameMatches = pattern.astRules?.conditions?.any_of?.[0]?.name_matches;
      expect(nameMatches).toBeInstanceOf(RegExp);
      expect(nameMatches.source).toBe("dangerous.*");
      expect(nameMatches.flags).toBe("i");
    });

    it('should handle mixed string and regex patterns gracefully', () => {
      const client = new PatternAPIClient();
      
      const patternData: PatternData = {
        id: "test-mixed",
        name: "Test Mixed",
        type: "xss",
        description: "Test",
        severity: "high",
        languages: ["javascript"],
        recommendation: "Fix it",
        regex_patterns: [
          "simple_string_pattern",  // Legacy string format
          {
            "__type__": "regex",
            "source": "enhanced_pattern",
            "flags": ["i"]
          } as any
        ] as any  // Mixed array
      };

      // @ts-expect-error - Access private method for testing
      const pattern = client.convertToSecurityPattern(patternData);
      
      // Both should be converted to RegExp
      expect(pattern.patterns.regex).toHaveLength(2);
      expect(pattern.patterns.regex[0]).toBeInstanceOf(RegExp);
      expect(pattern.patterns.regex[0].source).toBe("simple_string_pattern");
      expect(pattern.patterns.regex[1]).toBeInstanceOf(RegExp);
      expect(pattern.patterns.regex[1].source).toBe("enhanced_pattern");
      expect(pattern.patterns.regex[1].flags).toBe("i");
    });
  });
});