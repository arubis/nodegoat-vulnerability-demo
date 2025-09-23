#!/usr/bin/env bun

/**
 * Debug AST Enhancement - Check if AST rules are affecting detection
 */

import { SecurityDetectorV2 } from '../src/security/detector-v2.js';
import { createPatternSource } from '../src/security/pattern-source.js';

// Configure API access
process.env.RSOLV_API_URL = 'http://localhost:4001';
process.env.RSOLV_API_KEY = 'rsolv_test_full_access_no_quota_2025';

async function debugASTEnhancement() {
  console.log('🔍 Debugging AST Enhancement Impact...\n');
  
  const patternSource = createPatternSource();
  
  // Check Java patterns
  console.log('📋 Java Patterns Analysis:');
  const javaPatterns = await patternSource.getPatternsByLanguage('java');
  console.log(`Total Java patterns: ${javaPatterns.length}`);
  
  const javaASTPatterns = javaPatterns.filter(p => p.astRules);
  const javaRegexPatterns = javaPatterns.filter(p => !p.astRules);
  
  console.log(`AST-enhanced patterns: ${javaASTPatterns.length}`);
  console.log(`Regex-only patterns: ${javaRegexPatterns.length}`);
  
  // Check SQL injection patterns specifically
  const javaSQLPatterns = javaPatterns.filter(p => p.type === 'sql_injection');
  console.log(`SQL injection patterns: ${javaSQLPatterns.length}`);
  
  javaSQLPatterns.forEach((pattern, i) => {
    console.log(`  ${i + 1}. ${pattern.name} (${pattern.id})`);
    console.log(`     Has AST rules: ${!!pattern.astRules}`);
    console.log(`     Regex patterns: ${pattern.patterns?.regex?.length || 0}`);
    if (pattern.astRules) {
      console.log(`     AST rules: ${JSON.stringify(pattern.astRules, null, 2)}`);
    }
    console.log();
  });
  
  console.log('='.repeat(60));
  
  // Check PHP patterns (from local fallback)
  console.log('\n📋 PHP Patterns Analysis:');
  try {
    const phpPatterns = await patternSource.getPatternsByLanguage('php');
    console.log(`Total PHP patterns: ${phpPatterns.length}`);
    
    const phpASTPatterns = phpPatterns.filter(p => p.astRules);
    const phpRegexPatterns = phpPatterns.filter(p => !p.astRules);
    
    console.log(`AST-enhanced patterns: ${phpASTPatterns.length}`);
    console.log(`Regex-only patterns: ${phpRegexPatterns.length}`);
    
    // Check SQL injection patterns specifically
    const phpSQLPatterns = phpPatterns.filter(p => p.type === 'sql_injection');
    console.log(`SQL injection patterns: ${phpSQLPatterns.length}`);
    
    phpSQLPatterns.forEach((pattern, i) => {
      console.log(`  ${i + 1}. ${pattern.name} (${pattern.id})`);
      console.log(`     Has AST rules: ${!!pattern.astRules}`);
      console.log(`     Regex patterns: ${pattern.patterns?.regex?.length || 0}`);
    });
  } catch (error) {
    console.log('PHP patterns failed (expected due to API error):', error.message);
  }
  
  console.log('\n' + '='.repeat(60));
  
  // Test AST interpreter behavior
  console.log('\n🧪 Testing AST vs Regex Detection:');
  
  const testCode = `public class Test {
  protected AttackResult test(String action) {
    String query = "SELECT * FROM users WHERE id = " + action;
    ResultSet results = statement.executeQuery(query);
    return null;
  }
}`;
  
  console.log('Test code:');
  console.log(testCode);
  console.log();
  
  const detector = new SecurityDetectorV2();
  const results = await detector.detect(testCode, 'java', 'Test.java');
  
  console.log(`Detection results: ${results.length} vulnerabilities found`);
  results.forEach(vuln => {
    console.log(`- ${vuln.type} at line ${vuln.line}: ${vuln.message}`);
    console.log(`  Confidence: ${vuln.confidence}`);
  });
}

debugASTEnhancement().catch(console.error);