#!/usr/bin/env bun

/**
 * Test script to verify pattern source behavior
 * Used in CI to ensure we fail loudly on minimal patterns
 */

import { createPatternSource } from '../security/pattern-source.js';
import { logger } from '../utils/logger.js';

async function testPatternSource() {
  console.log('🧪 Testing pattern source configuration...\n');
  
  // Check environment
  console.log('Environment:');
  console.log(`  RSOLV_API_KEY: ${process.env.RSOLV_API_KEY ? '✅ Set' : '❌ Not set'}`);
  console.log(`  USE_LOCAL_PATTERNS: ${process.env.USE_LOCAL_PATTERNS || 'not set'}`);
  console.log(`  USE_FAIL_ON_MINIMAL_PATTERNS: ${process.env.USE_FAIL_ON_MINIMAL_PATTERNS || 'not set'}`);
  console.log('');
  
  try {
    // Create pattern source
    const source = createPatternSource();
    console.log('✅ Pattern source created successfully\n');
    
    // Test fetching patterns
    const languages = ['javascript', 'python'];
    
    for (const language of languages) {
      console.log(`Testing ${language} patterns...`);
      const patterns = await source.getPatternsByLanguage(language);
      
      console.log(`  Pattern count: ${patterns.length}`);
      console.log(`  Coverage: ${patterns.length >= 25 ? '✅ Full' : '⚠️ Limited'}`);
      
      if (patterns.length < 25) {
        console.error(`  ⚠️ WARNING: Only ${patterns.length} patterns available for ${language}`);
        console.error(`  This will result in poor vulnerability detection!`);
      }
      console.log('');
    }
    
    // Get all patterns
    const allPatterns = await source.getAllPatterns();
    console.log(`Total patterns available: ${allPatterns.length}`);
    
    // Check vulnerability type coverage
    const typeMap = new Map<string, number>();
    for (const pattern of allPatterns) {
      typeMap.set(pattern.type, (typeMap.get(pattern.type) || 0) + 1);
    }
    
    console.log('\nVulnerability type coverage:');
    for (const [type, count] of typeMap.entries()) {
      console.log(`  ${type}: ${count} patterns`);
    }
    
    // Exit code based on pattern availability
    if (allPatterns.length < 50 && !process.env.USE_LOCAL_PATTERNS) {
      console.error('\n❌ Insufficient patterns detected!');
      console.error('This indicates a configuration or API issue.');
      process.exit(1);
    }
    
    console.log('\n✅ Pattern source test completed');
    
  } catch (error) {
    console.error('\n❌ Pattern source test failed:');
    console.error(error);
    process.exit(1);
  }
}

// Run the test
testPatternSource().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});