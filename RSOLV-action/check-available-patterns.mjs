import { createPatternSource } from './dist/security/pattern-source.js';

const source = createPatternSource();
const jsPatterns = await source.getPatternsByLanguage('javascript');

console.log(`Total JS patterns available: ${jsPatterns.length}`);

// Group by type
const byType = {};
for (const pattern of jsPatterns) {
  byType[pattern.type] = (byType[pattern.type] || 0) + 1;
}

console.log('\nPatterns by type:');
for (const [type, count] of Object.entries(byType).sort()) {
  console.log(`  ${type}: ${count}`);
}

// Check for hardcoded secrets pattern
const hasSecrets = jsPatterns.some(p => 
  p.type === 'hardcoded_secrets' || 
  p.type === 'hardcoded_secret' ||
  p.type === 'secret' ||
  p.name?.toLowerCase().includes('secret') ||
  p.name?.toLowerCase().includes('key')
);

console.log(`\nHas secrets detection: ${hasSecrets}`);

// List all unique types
const uniqueTypes = [...new Set(jsPatterns.map(p => p.type))];
console.log('\nAll unique pattern types:', uniqueTypes);
