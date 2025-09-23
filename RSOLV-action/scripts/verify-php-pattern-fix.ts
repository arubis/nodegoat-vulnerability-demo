#!/usr/bin/env bun

/**
 * End-to-end verification of PHP pattern AST enhancement fix
 * This script verifies that:
 * 1. PHP patterns are returned with proper astRules field
 * 2. The astRules are properly formatted and usable
 * 3. No old format keys (rules, :ast_rules) exist
 */

import { PatternAPIClient } from '../src/security/pattern-api-client';
import { createHash } from 'crypto';

// Test against local API if available, otherwise use production
const API_URL = process.env.RSOLV_API_URL || 'http://localhost:4000';

async function verifyPhpPatternFix() {
  console.log('🔍 Verifying PHP Pattern AST Enhancement Fix\n');
  console.log(`API URL: ${API_URL}`);
  
  // Test with a mock API key to get full patterns
  const mockApiKey = createHash('sha256').update('test-php-ast-verification').digest('hex');
  
  const client = new PatternAPIClient({
    apiUrl: API_URL,
    apiKey: mockApiKey
  });

  try {
    // Fetch PHP patterns
    console.log('\n1️⃣ Fetching PHP patterns...');
    const patterns = await client.fetchPatterns('php');
    console.log(`✅ Received ${patterns.length} PHP patterns`);
    
    // Check for patterns with AST rules
    const patternsWithAst = patterns.filter(p => p.astRules);
    console.log(`✅ Patterns with AST rules: ${patternsWithAst.length}`);
    
    if (patternsWithAst.length === 0) {
      console.error('❌ FAIL: No PHP patterns have AST rules!');
      process.exit(1);
    }
    
    // Verify AST rule structure
    console.log('\n2️⃣ Verifying AST rule structure...');
    let hasErrors = false;
    
    patternsWithAst.forEach(pattern => {
      console.log(`\n  Checking ${pattern.id}:`);
      
      // Check astRules is properly structured
      if (!pattern.astRules) {
        console.error(`    ❌ Missing astRules`);
        hasErrors = true;
      } else if (!Array.isArray(pattern.astRules) && typeof pattern.astRules !== 'object') {
        console.error(`    ❌ astRules is not array or object: ${typeof pattern.astRules}`);
        hasErrors = true;
      } else {
        console.log(`    ✅ Has astRules (${Array.isArray(pattern.astRules) ? 'array' : 'object'})`);
      }
      
      // Check for old format keys
      const patternKeys = Object.keys(pattern);
      if (patternKeys.includes('rules')) {
        console.error(`    ❌ Found old 'rules' key`);
        hasErrors = true;
      }
      if (patternKeys.some(k => k.includes(':ast_rules'))) {
        console.error(`    ❌ Found atom key ':ast_rules'`);
        hasErrors = true;
      }
      
      // Verify minConfidence if present
      if (pattern.minConfidence !== undefined) {
        console.log(`    ✅ Has minConfidence: ${pattern.minConfidence}`);
      }
    });
    
    // Test specific patterns we know should have AST
    console.log('\n3️⃣ Testing specific enhanced patterns...');
    const expectedEnhancedPatterns = [
      'php-command-injection',
      'php-sql-injection-concat',
      'php-xss-echo',
      'php-file-inclusion'
    ];
    
    for (const patternId of expectedEnhancedPatterns) {
      const pattern = patterns.find(p => p.id === patternId);
      if (!pattern) {
        console.error(`❌ Pattern ${patternId} not found`);
        hasErrors = true;
        continue;
      }
      
      if (!pattern.astRules) {
        console.error(`❌ Pattern ${patternId} has no AST rules`);
        hasErrors = true;
      } else {
        console.log(`✅ Pattern ${patternId} has AST rules`);
      }
    }
    
    // Final result
    console.log('\n' + '='.repeat(50));
    if (hasErrors) {
      console.error('\n❌ VERIFICATION FAILED: PHP patterns have issues');
      process.exit(1);
    } else {
      console.log('\n✅ VERIFICATION PASSED: PHP patterns are properly formatted!');
      console.log('\nSummary:');
      console.log(`  - Total PHP patterns: ${patterns.length}`);
      console.log(`  - Patterns with AST rules: ${patternsWithAst.length}`);
      console.log(`  - All enhanced patterns verified ✓`);
      console.log(`  - No old format keys found ✓`);
    }
    
  } catch (error) {
    console.error('\n❌ Error during verification:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run verification
verifyPhpPatternFix();