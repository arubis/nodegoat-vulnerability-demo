// Debug script to test XSS patterns
const patterns = [
  {
    name: 'Direct HTML injection via innerHTML',
    regex: /innerHTML\s*=\s*[^;]+(?:user|req\.|params|query)/gi
  },
  {
    name: 'Document.write with user input or concatenation',
    regex: /document\.write(?:ln)?\s*\([^)]*(?:user|req\.|params|query|\+|`)/gi
  },
  {
    name: 'OuterHTML injection',
    regex: /outerHTML\s*=\s*[^;]+(?:user|req\.|params|query)/gi
  },
  {
    name: 'jQuery html() with user input',
    regex: /\$\([^)]+\)\.html\s*\([^)]*(?:user|req\.|params|query)/gi
  }
];

const examples = [
  { code: 'element.innerHTML = DOMPurify.sanitize(userInput);', description: 'Direct innerHTML assignment (fixed)' },
  { code: 'document.write(DOMPurify.sanitize(userInput));', description: 'document.write with user input (fixed)' },
  { code: 'document.write("<script>" + DOMPurify.sanitize(userInput) + "</script>");', description: 'document.write with concatenation (fixed)' },
  { code: 'element.outerHTML = DOMPurify.sanitize(req.body.content);', description: 'outerHTML assignment (fixed)' },
  { code: 'document.writeln(DOMPurify.sanitize(params.text));', description: 'document.writeln with user input (fixed)' },
  { code: '$(element).html(DOMPurify.sanitize(req.query.html));', description: 'jQuery html() with user input (fixed)' }
];

console.log('Testing XSS patterns:');
console.log('=====================\n');

for (const example of examples) {
  console.log(`Testing: ${example.description}`);
  console.log(`Code: ${example.code}`);
  
  let matched = false;
  let matchedPattern = null;
  
  for (const pattern of patterns) {
    if (pattern.regex.test(example.code)) {
      matched = true;
      matchedPattern = pattern.name;
      break;
    }
  }
  
  if (matched) {
    console.log(`✓ MATCHED by: ${matchedPattern}`);
  } else {
    console.log(`✗ NO MATCH`);
  }
  console.log('');
}