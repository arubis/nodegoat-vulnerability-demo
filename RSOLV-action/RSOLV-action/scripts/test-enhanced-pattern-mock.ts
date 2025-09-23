#!/usr/bin/env bun

/**
 * RFC-032 Phase 2.3: Mock test for enhanced pattern reconstruction
 * 
 * This tests the reconstruction logic with a mock enhanced pattern response
 * to verify it works correctly before the API returns enhanced format.
 */

import { PatternAPIClient } from '../src/security/pattern-api-client.js';

// Mock enhanced pattern data as it would come from the API
const mockEnhancedPattern = {
  id: "js-eval-usage",
  name: "JavaScript eval() Usage",
  type: "command_injection",
  description: "Detects potentially dangerous uses of eval() function",
  severity: "high" as const,
  languages: ["javascript"],
  recommendation: "Avoid using eval(). Use JSON.parse() for JSON data or Function constructor for dynamic code generation.",
  cwe_id: "CWE-95",
  owasp_category: "A03:2021",
  // Enhanced format with serialized regex
  regex_patterns: [
    {
      "__type__": "regex",
      "source": "eval\\s*\\(",
      "flags": ["i"]
    },
    {
      "__type__": "regex",
      "source": "new\\s+Function\\s*\\(",
      "flags": ["i", "m"]
    }
  ],
  ast_rules: {
    node_type: "CallExpression",
    callee: {
      type: "Identifier",
      name_pattern: {
        "__type__": "regex",
        "source": "^(eval|execScript)$",
        "flags": ["i"]
      }
    }
  },
  context_rules: {
    exclude_paths: [
      {
        "__type__": "regex",
        "source": "node_modules/",
        "flags": []
      },
      {
        "__type__": "regex",
        "source": "\\.test\\.(js|ts)$",
        "flags": ["i"]
      }
    ],
    safe_if_wrapped: ["sanitizeInput", "escapeJS"]
  },
  confidence_rules: {
    base: 80,
    adjustments: {
      "in_test_file": -30,
      "has_validation": -20,
      "user_input": 15
    }
  },
  test_cases: {
    vulnerable: [
      "eval(userInput)",
      "eval('alert(' + data + ')')",
      "new Function('return ' + userCode)()"
    ],
    safe: [
      "JSON.parse(jsonString)",
      "const result = evaluate(expression)",
      "math.evaluate('2 + 2')"
    ]
  }
};

async function testMockEnhancedPattern() {
  console.log('🧪 Testing Enhanced Pattern Reconstruction with Mock Data...\n');

  const client = new PatternAPIClient();

  try {
    // Test the conversion directly
    console.log('🔄 Converting mock enhanced pattern...');
    
    // @ts-expect-error - Access private method for testing
    const reconstructed = client.convertToSecurityPattern(mockEnhancedPattern as any);
    
    console.log('\n✅ Pattern successfully reconstructed!');
    console.log(`   ID: ${reconstructed.id}`);
    console.log(`   Name: ${reconstructed.name}`);
    
    // Verify regex patterns
    console.log('\n📝 Regex patterns:');
    reconstructed.patterns.regex.forEach((regex, i) => {
      console.log(`   ${i + 1}. /${regex.source}/${regex.flags}`);
      console.log(`      Instance of RegExp: ${regex instanceof RegExp ? '✅' : '❌'}`);
      
      // Test the regex
      const testCases = ['eval("test")', 'new Function("code")', 'JSON.parse(data)'];
      testCases.forEach(test => {
        const matches = test.match(regex);
        console.log(`      "${test}" → ${matches ? '🎯 matches' : '⭕ no match'}`);
      });
    });
    
    // Verify AST rules
    console.log('\n🌳 AST rules:');
    if (reconstructed.astRules) {
      console.log(`   Node type: ${reconstructed.astRules.node_type}`);
      
      if (reconstructed.astRules.callee?.name_pattern instanceof RegExp) {
        const pattern = reconstructed.astRules.callee.name_pattern;
        console.log(`   Callee pattern: /${pattern.source}/${pattern.flags}`);
        
        // Test AST pattern
        ['eval', 'execScript', 'setTimeout'].forEach(name => {
          const matches = name.match(pattern);
          console.log(`   "${name}" → ${matches ? '🎯 matches' : '⭕ no match'}`);
        });
      }
    }
    
    // Verify context rules
    console.log('\n🔧 Context rules:');
    if (reconstructed.contextRules) {
      if (reconstructed.contextRules.exclude_paths) {
        console.log('   Exclude paths:');
        reconstructed.contextRules.exclude_paths.forEach((path: any, i: number) => {
          if (path instanceof RegExp) {
            console.log(`   ${i + 1}. /${path.source}/${path.flags} (RegExp ✅)`);
            
            // Test paths
            ['node_modules/lib.js', 'src/app.test.js', 'src/app.js'].forEach(testPath => {
              const matches = testPath.match(path);
              console.log(`      "${testPath}" → ${matches ? '🚫 excluded' : '✅ included'}`);
            });
          } else {
            console.log(`   ${i + 1}. "${path}" (string)`);
          }
        });
      }
      
      if (reconstructed.contextRules.safe_if_wrapped) {
        console.log(`   Safe if wrapped: ${reconstructed.contextRules.safe_if_wrapped.join(', ')}`);
      }
    }
    
    // Verify confidence rules
    console.log('\n📊 Confidence rules:');
    if (reconstructed.confidenceRules) {
      console.log(`   Base confidence: ${reconstructed.confidenceRules.base}`);
      console.log('   Adjustments:');
      Object.entries(reconstructed.confidenceRules.adjustments || {}).forEach(([key, value]) => {
        console.log(`     ${key}: ${(value as number) > 0 ? '+' : ''}${value}`);
      });
    }
    
    console.log('\n🎉 All enhanced features successfully reconstructed!');
    
  } catch (error) {
    console.error('\n❌ Error during reconstruction:', error);
    process.exit(1);
  }
}

// Run the test
testMockEnhancedPattern().catch(console.error);