#!/usr/bin/env bun

import { LocalPatternSource } from '../src/security/pattern-source.js';

async function debug() {
  const source = new LocalPatternSource();
  const patterns = await source.getPatternsByLanguage('ruby');
  
  console.log(`Total Ruby patterns: ${patterns.length}`);
  
  // Check how patterns would be separated
  const astPatterns = patterns.filter(p => p.astRules);
  const regexPatterns = patterns.filter(p => !p.astRules);
  
  console.log(`AST patterns: ${astPatterns.length}`);
  console.log(`Regex patterns: ${regexPatterns.length}`);
  
  // Check each pattern
  patterns.forEach(p => {
    console.log(`\nPattern: ${p.id}`);
    console.log(`  Has astRules: ${!!p.astRules}`);
    console.log(`  astRules value: ${p.astRules}`);
    console.log(`  Has regex: ${!!p.patterns.regex}`);
    console.log(`  Regex count: ${p.patterns.regex?.length || 0}`);
  });
}

debug().catch(console.error);