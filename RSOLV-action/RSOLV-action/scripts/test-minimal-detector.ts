#!/usr/bin/env bun

const rubyCode = `user = User.where("id = '#{params[:user][:id]}'")[0]`;

async function test() {
  // Direct pattern test
  const pattern = /where\s*\(\s*["'].*#\{.*\}.*["']\s*\)/gi;
  pattern.lastIndex = 0;
  const directMatch = pattern.test(rubyCode);
  console.log('Direct regex test:', directMatch);
  console.log('Code:', rubyCode);
  
  // Test with minimal patterns
  const { minimalFallbackPatterns } = await import('../src/security/minimal-patterns.js');
  const rubyPatterns = minimalFallbackPatterns.filter(p => p.languages.includes('ruby'));
  console.log('\nRuby patterns:', rubyPatterns.length);
  
  const sqlPattern = rubyPatterns.find(p => p.id === 'ruby-sql-injection');
  if (sqlPattern) {
    console.log('\nSQL injection pattern found');
    console.log('Pattern regexes:', sqlPattern.patterns.regex?.length);
    
    if (sqlPattern.patterns.regex) {
      for (const regex of sqlPattern.patterns.regex) {
        regex.lastIndex = 0;
        const match = regex.test(rubyCode);
        console.log(`Regex ${regex}: ${match}`);
      }
    }
  }
}

test().catch(console.error);