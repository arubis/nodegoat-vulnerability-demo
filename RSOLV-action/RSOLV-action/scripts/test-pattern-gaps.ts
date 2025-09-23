#!/usr/bin/env bun

/**
 * Test Pattern Gaps - Identify specific patterns that need improvement
 */

console.log('🔍 Analysis of Pattern Detection Gaps\n');

// Test what patterns WOULD detect vs what we have
const testCases = [
  {
    name: 'Java - Direct concatenation in executeQuery (DETECTED)',
    language: 'java',
    code: `statement.executeQuery("SELECT * FROM users WHERE id = " + userId);`,
    shouldDetect: true,
    pattern: 'executeQuery.*\\+'
  },
  {
    name: 'Java - Variable with concatenation then executeQuery (MISSED)',
    language: 'java', 
    code: `String query = "SELECT * FROM users WHERE id = " + userId;\nstatement.executeQuery(query);`,
    shouldDetect: true,
    pattern: 'Need: taint analysis or multi-line detection'
  },
  {
    name: 'PHP - Direct concatenation (DETECTED)',
    language: 'php',
    code: `mysqli_query($conn, "SELECT * FROM users WHERE id = " . $_GET['id']);`,
    shouldDetect: true,
    pattern: '"SELECT.*"\\s*\\.\\s*\\$_'
  },
  {
    name: 'PHP - Variable assignment then interpolation (MISSED)',
    language: 'php',
    code: `$id = $_REQUEST['id'];\n$query = "SELECT * FROM users WHERE id = '$id'";`,
    shouldDetect: true,
    pattern: 'Need: taint analysis or variable tracking'
  },
  {
    name: 'PHP - Direct interpolation in quotes (MISSED)',
    language: 'php',
    code: `$query = "SELECT * FROM users WHERE id = '{$_GET['id']}'";`,
    shouldDetect: true,
    pattern: 'Need: "{\\$_" pattern'
  }
];

// Test current patterns
console.log('📋 Current Pattern Coverage Analysis:\n');

testCases.forEach((testCase, i) => {
  console.log(`${i + 1}. ${testCase.name}`);
  console.log(`   Code: ${testCase.code.replace(/\n/g, '\\n')}`);
  console.log(`   Should detect: ${testCase.shouldDetect}`);
  console.log(`   Pattern needed: ${testCase.pattern}`);
  console.log();
});

console.log('🔧 Proposed Pattern Improvements:\n');

console.log('Java Improvements:');
console.log('1. Add data flow analysis to track variables from user input to SQL execution');
console.log('2. Add patterns for common variable names that indicate user input');
console.log('3. Look for String concatenation + in SQL query construction separately from executeQuery');
console.log();

console.log('PHP Improvements:');
console.log('1. Add variable tracking for $_REQUEST assignment to variables');
console.log('2. Add interpolation patterns: "...${variable}..." and "...$variable..."');
console.log('3. Add mysqli_query/mysql_query patterns that check the query parameter');
console.log();

console.log('🎯 Root Cause: Pattern vs Static Analysis Gap\n');
console.log('Current RSOLV patterns are designed for:');
console.log('- Single-line, direct vulnerabilities');
console.log('- Regex-based pattern matching');
console.log('- No variable tracking or data flow analysis');
console.log();
console.log('Real vulnerabilities often involve:');
console.log('- Multi-line code with variable assignments');
console.log('- Data flow from user input → variable → SQL query');
console.log('- Indirect patterns that require context understanding');
console.log();

console.log('💡 Immediate Solutions:');
console.log('1. Add more comprehensive single-line patterns');
console.log('2. Add AST-based detection for variable tracking');
console.log('3. Expand patterns to cover more real-world coding patterns');
console.log();

// Test specific pattern improvements we could implement
console.log('🧪 Testing Specific Pattern Improvements:\n');

const improvedPatterns = {
  php: [
    // Current patterns
    'Current: ["\\\'](?:SELECT|DELETE|UPDATE|INSERT).*["\\\']\\s*\\.\\s*\\$_(GET|POST|REQUEST|COOKIE)',
    // Proposed improvements
    'Improved 1: \\$\\w+\\s*=\\s*\\$_(GET|POST|REQUEST|COOKIE).*["\\\'](?:SELECT|UPDATE|DELETE|INSERT)[^"\\\\\']*\\$\\w+',
    'Improved 2: ["\\\'](?:SELECT|UPDATE|DELETE|INSERT)[^"\\\\\']*\\$\\w+[^"\\\\\']*["\\\']',
    'Improved 3: ["\\\'](?:SELECT|UPDATE|DELETE|INSERT)[^"\\\\\']*\\{\\$_(GET|POST|REQUEST|COOKIE)'
  ],
  java: [
    // Current patterns  
    'Current: \\.?executeQuery\\s*\\([^)]*\\+[^)]*\\)',
    // Proposed improvements
    'Improved 1: String\\s+\\w+\\s*=\\s*[^;]*\\+.*executeQuery\\s*\\(\\s*\\w+\\s*\\)',
    'Improved 2: ["\\\'](?:SELECT|UPDATE|DELETE|INSERT)[^"\\\']*["\\\']\\s*\\+.*executeQuery',
    'Improved 3: \\w+\\s*\\+.*["\\'].*executeQuery\\s*\\('
  ]
};

Object.entries(improvedPatterns).forEach(([lang, patterns]) => {
  console.log(`${lang.toUpperCase()} Pattern Evolution:`);
  patterns.forEach(pattern => console.log(`  ${pattern}`));
  console.log();
});

console.log('🚀 Next Steps for Implementation:');
console.log('1. Update SecurityDetectorV2 to use AST parsing for better detection');
console.log('2. Add multi-line pattern matching capabilities');
console.log('3. Implement basic variable tracking for common vulnerability patterns');
console.log('4. Add more comprehensive regex patterns as interim solution');
console.log('5. Test against vulnerable codebases to validate improvements');