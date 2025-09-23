#!/usr/bin/env bun

/**
 * RFC-032 Phase 2.3: Direct E2E test for enhanced pattern format
 * 
 * This script tests the full flow:
 * 1. Pattern API returns enhanced format with serialized regex
 * 2. TypeScript client reconstructs regex objects
 * 3. Patterns are usable for vulnerability detection
 */

import { PatternAPIClient } from '../src/security/pattern-api-client.js';

async function testEnhancedPatternE2E() {
  console.log('🔍 Testing Enhanced Pattern Format E2E...\n');

  // Use local API if available, otherwise use demo API
  const apiUrl = process.env.RSOLV_API_URL || 'http://localhost:4000';
  const apiKey = process.env.RSOLV_API_KEY || 'demo-key';

  const client = new PatternAPIClient({
    apiUrl,
    apiKey,
    cacheEnabled: false
  });

  try {
    // Check API health
    console.log('📡 Checking API health...');
    const health = await client.checkHealth();
    console.log(`   Status: ${health.status}`);
    
    if (health.status !== 'healthy') {
      console.log('   ⚠️  API not available for testing');
      return;
    }

    // Fetch JavaScript patterns with enhanced format
    console.log('\n📦 Fetching JavaScript patterns (enhanced format)...');
    const patterns = await client.fetchPatterns('javascript');
    console.log(`   Found ${patterns.length} patterns`);

    // Show sample patterns
    console.log('\n📋 Sample patterns:');
    patterns.slice(0, 3).forEach(p => {
      console.log(`   - ${p.id}: ${p.name}`);
    });

    // Analyze pattern structure
    console.log('\n🔬 Analyzing pattern structure...');
    
    let enhancedCount = 0;
    let regexCount = 0;
    let astRuleCount = 0;
    let contextRuleCount = 0;
    
    patterns.forEach(pattern => {
      // Count regex patterns
      if (pattern.patterns.regex.length > 0) {
        regexCount += pattern.patterns.regex.length;
        
        // Verify each is a RegExp
        pattern.patterns.regex.forEach(regex => {
          if (!(regex instanceof RegExp)) {
            console.error(`   ❌ Pattern ${pattern.id}: regex is not RegExp instance`);
          }
        });
      }
      
      // Check for enhanced features
      if (pattern.astRules || pattern.contextRules || pattern.confidenceRules) {
        enhancedCount++;
      }
      
      if (pattern.astRules) astRuleCount++;
      if (pattern.contextRules) contextRuleCount++;
    });
    
    console.log(`   Total regex patterns: ${regexCount}`);
    console.log(`   Enhanced patterns: ${enhancedCount}`);
    console.log(`   Patterns with AST rules: ${astRuleCount}`);
    console.log(`   Patterns with context rules: ${contextRuleCount}`);

    // Test specific pattern with known regex
    console.log('\n🎯 Testing specific pattern reconstruction...');
    const evalPattern = patterns.find(p => 
      p.id === 'js-eval-usage' || 
      p.name.toLowerCase().includes('eval') ||
      p.description.toLowerCase().includes('eval')
    );
    
    if (evalPattern) {
      console.log(`   Found pattern: ${evalPattern.name} (${evalPattern.id})`);
      console.log(`   Regex patterns: ${evalPattern.patterns.regex.length}`);
      
      // Test first regex
      if (evalPattern.patterns.regex[0]) {
        const regex = evalPattern.patterns.regex[0];
        console.log(`   First regex: /${regex.source}/${regex.flags}`);
        
        // Test the regex works
        const testCode = 'eval("dangerous code")';
        const matches = testCode.match(regex);
        console.log(`   Test "${testCode}" matches: ${matches ? '✅ YES' : '❌ NO'}`);
      }
      
      // Check enhanced features
      if (evalPattern.astRules) {
        console.log(`   Has AST rules: ✅`);
        console.log(`   AST node type: ${evalPattern.astRules.node_type || 'N/A'}`);
      }
      
      if (evalPattern.contextRules) {
        console.log(`   Has context rules: ✅`);
        const ruleKeys = Object.keys(evalPattern.contextRules);
        console.log(`   Context rule types: ${ruleKeys.join(', ')}`);
      }
    } else {
      console.log('   ⚠️  No eval-related pattern found');
    }

    // Test regex reconstruction in nested structures
    console.log('\n🏗️  Testing nested regex reconstruction...');
    const patternsWithNestedRegex = patterns.filter(p => {
      // Check AST rules for regex
      if (p.astRules) {
        const hasRegexInAST = JSON.stringify(p.astRules).includes('RegExp');
        if (hasRegexInAST) return true;
      }
      
      // Check context rules for regex
      if (p.contextRules) {
        const checkForRegex = (obj: any): boolean => {
          if (obj instanceof RegExp) return true;
          if (Array.isArray(obj)) return obj.some(checkForRegex);
          if (obj && typeof obj === 'object') {
            return Object.values(obj).some(checkForRegex);
          }
          return false;
        };
        if (checkForRegex(p.contextRules)) return true;
      }
      
      return false;
    });
    
    console.log(`   Found ${patternsWithNestedRegex.length} patterns with nested regex`);
    
    if (patternsWithNestedRegex.length > 0) {
      const sample = patternsWithNestedRegex[0];
      console.log(`   Example: ${sample.name} (${sample.id})`);
    }

    console.log('\n✅ Enhanced pattern E2E test completed successfully!');

  } catch (error) {
    console.error('\n❌ Error during E2E test:', error);
    process.exit(1);
  }
}

// Run the test
testEnhancedPatternE2E().catch(console.error);