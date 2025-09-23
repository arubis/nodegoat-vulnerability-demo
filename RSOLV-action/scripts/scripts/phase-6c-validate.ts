#!/usr/bin/env bun

/**
 * Phase 6C: Quick validation that we have Java/PHP pattern support
 */

console.log('Phase 6C: Java/PHP Pattern Support Check\n');

// Check minimal patterns
import { getMinimalPatterns } from '../src/security/minimal-patterns.js';

const patterns = getMinimalPatterns();
console.log(`Total patterns: ${patterns.length}`);

// Check for Java patterns
const javaPatterns = patterns.filter(p => 
  p.languages?.includes('java') || 
  p.id.toLowerCase().includes('java') ||
  p.description?.toLowerCase().includes('java')
);

console.log(`\nJava patterns found: ${javaPatterns.length}`);
javaPatterns.forEach(p => {
  console.log(`- ${p.id}: ${p.description}`);
});

// Check for PHP patterns  
const phpPatterns = patterns.filter(p => 
  p.languages?.includes('php') || 
  p.id.toLowerCase().includes('php') ||
  p.description?.toLowerCase().includes('php')
);

console.log(`\nPHP patterns found: ${phpPatterns.length}`);
phpPatterns.forEach(p => {
  console.log(`- ${p.id}: ${p.description}`);
});

// Summary
console.log('\n=== Summary ===');
console.log(`✅ Java support: ${javaPatterns.length > 0 ? 'YES' : 'NO'}`);
console.log(`✅ PHP support: ${phpPatterns.length > 0 ? 'YES' : 'NO'}`);

if (javaPatterns.length === 0 || phpPatterns.length === 0) {
  console.log('\n⚠️  Missing patterns for Phase 6C validation!');
  console.log('Need to add language-specific patterns to minimal-patterns.ts');
}