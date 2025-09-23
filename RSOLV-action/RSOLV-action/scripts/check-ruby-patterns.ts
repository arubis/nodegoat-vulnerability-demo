#!/usr/bin/env bun

import { minimalFallbackPatterns } from '../src/security/minimal-patterns.js';

const rubyPatterns = minimalFallbackPatterns.filter(p => p.languages.includes('ruby'));

console.log('Ruby patterns:');
for (const pattern of rubyPatterns) {
  console.log(`\n${pattern.id}:`);
  console.log('  astRules:', pattern.astRules);
  console.log('  Has astRules:', !!pattern.astRules);
  console.log('  Type of astRules:', typeof pattern.astRules);
}

// Check SQL injection pattern specifically
const sqlPattern = rubyPatterns.find(p => p.id === 'ruby-sql-injection');
if (sqlPattern) {
  console.log('\nSQL Injection pattern full structure:');
  console.log(JSON.stringify(sqlPattern, null, 2));
}