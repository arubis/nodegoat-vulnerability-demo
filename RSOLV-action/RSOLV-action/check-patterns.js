const { createPatternSource } = require('./dist/security/pattern-source.js');

async function checkPatterns() {
  const source = createPatternSource();
  const languages = ['javascript', 'typescript', 'python', 'ruby', 'php', 'java'];
  
  for (const lang of languages) {
    const patterns = await source.getPatternsByLanguage(lang);
    console.log(`${lang}: ${patterns.length} patterns`);
  }
}

checkPatterns().catch(console.error);
