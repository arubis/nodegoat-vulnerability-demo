#!/usr/bin/env bun

import { PatternAPIClient } from '../src/security/pattern-api-client';

async function testPHPPatterns() {
  const apiKey = process.env.RSOLV_API_KEY;
  console.log('API Key available:', !!apiKey);
  
  const client = new PatternAPIClient({
    apiUrl: process.env.RSOLV_API_URL || 'https://api.rsolv.com',
    apiKey: apiKey
  });

  try {
    console.log('Fetching PHP patterns...');
    const patterns = await client.fetchPatterns('php');
    
    console.log(`\nReceived ${patterns.length} PHP patterns`);
    
    // Check for AST rules
    const patternsWithAst = patterns.filter(p => p.astRules);
    console.log(`Patterns with AST rules: ${patternsWithAst.length}`);
    
    // Check first pattern structure
    if (patterns.length > 0) {
      const firstPattern = patterns[0];
      console.log('\nFirst pattern structure:');
      console.log('ID:', firstPattern.id);
      console.log('Name:', firstPattern.name);
      console.log('Has astRules:', !!firstPattern.astRules);
      
      if (firstPattern.astRules) {
        console.log('AST Rules type:', typeof firstPattern.astRules);
        console.log('AST Rules:', JSON.stringify(firstPattern.astRules, null, 2));
      }
    }
    
    // Try enhanced format
    console.log('\n\nTrying enhanced format...');
    const enhancedPatterns = await client.fetchPatterns('php');
    console.log(`Enhanced patterns: ${enhancedPatterns.length}`);
    
    const enhancedWithAst = enhancedPatterns.filter(p => p.astRules);
    console.log(`Enhanced patterns with AST: ${enhancedWithAst.length}`);
    
  } catch (error) {
    console.error('Error fetching PHP patterns:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
  }
}

testPHPPatterns();