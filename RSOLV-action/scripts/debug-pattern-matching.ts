#!/usr/bin/env bun

/**
 * Debug Pattern Matching - Test regex patterns directly
 */

// Test Java SQL injection pattern matching
const javaCode = `public class Test {
  protected AttackResult injectableQueryAvailability(String action) {
    String query = "SELECT * FROM access_log WHERE action LIKE '%" + action + "%'";
    ResultSet results = statement.executeQuery(query);
    return null;
  }
}`;

const javaPatterns = [
  String.raw`\.?executeQuery\s*\(\s*["'].*["']\s*\+`,
  String.raw`\.?executeQuery\s*\([^)]*\+[^)]*\)`,
  String.raw`\.?executeUpdate\s*\(\s*["'].*["']\s*\+`,
  String.raw`\.?executeUpdate\s*\([^)]*\+[^)]*\)`,
];

console.log('🔍 Testing Java SQL injection pattern matching...\n');
console.log('Code:');
console.log(javaCode);
console.log();

console.log('Testing patterns:');
javaPatterns.forEach((pattern, i) => {
  const regex = new RegExp(pattern, 'gi');
  const matches = javaCode.match(regex);
  console.log(`${i + 1}. Pattern: ${pattern}`);
  console.log(`   Matches: ${matches ? matches.length : 0}`);
  if (matches) {
    matches.forEach(match => console.log(`   - "${match}"`));
  }
  console.log();
});

// Test PHP SQL injection
const phpCode = `<?php
$id = $_REQUEST[ 'id' ];
$query  = "SELECT first_name, last_name FROM users WHERE user_id = '$id';";
$result = mysqli_query($GLOBALS["___mysqli_ston"],  $query );
?>`;

const phpPatterns = [
  String.raw`["'](?:SELECT|DELETE|UPDATE|INSERT).*["']\s*\.\s*\$_(GET|POST|REQUEST|COOKIE)`,
  String.raw`["'](?:SELECT|UPDATE|DELETE|INSERT).*\$_(GET|POST|REQUEST|COOKIE)\[`,
];

console.log('='.repeat(60));
console.log('🔍 Testing PHP SQL injection pattern matching...\n');
console.log('Code:');
console.log(phpCode);
console.log();

console.log('Testing patterns:');
phpPatterns.forEach((pattern, i) => {
  const regex = new RegExp(pattern, 'gi');
  const matches = phpCode.match(regex);
  console.log(`${i + 1}. Pattern: ${pattern}`);
  console.log(`   Matches: ${matches ? matches.length : 0}`);
  if (matches) {
    matches.forEach(match => console.log(`   - "${match}"`));
  }
  console.log();
});

// Test if we can create better patterns
console.log('='.repeat(60));
console.log('🔧 Testing improved patterns...\n');

// Better PHP pattern that handles the DVWA case
const betterPhpPattern = String.raw`["'](?:SELECT|UPDATE|DELETE|INSERT)[^"']*\$\w+[^"']*["']`;
const phpRegex = new RegExp(betterPhpPattern, 'gi');
const phpMatches = phpCode.match(phpRegex);
console.log(`Improved PHP pattern: ${betterPhpPattern}`);
console.log(`Matches: ${phpMatches ? phpMatches.length : 0}`);
if (phpMatches) {
  phpMatches.forEach(match => console.log(`- "${match}"`));
}
console.log();

// Better Java pattern for executeQuery with any variable
const betterJavaPattern = String.raw`executeQuery\s*\(\s*\w+\s*\)`;
const javaRegex = new RegExp(betterJavaPattern, 'gi');
const javaMatches = javaCode.match(javaRegex);
console.log(`Improved Java pattern: ${betterJavaPattern}`);
console.log(`Matches: ${javaMatches ? javaMatches.length : 0}`);
if (javaMatches) {
  javaMatches.forEach(match => console.log(`- "${match}"`));
}