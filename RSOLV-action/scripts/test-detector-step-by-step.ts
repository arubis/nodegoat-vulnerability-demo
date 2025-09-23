#!/usr/bin/env bun

import { getMinimalPatternsByLanguage } from '../src/security/minimal-patterns.js';

const rubyCode = `
class UsersController < ApplicationController
  def update
    user = User.where("id = '#{params[:user][:id]}'")[0]
    user.save
  end
end`;

// Simulate detector logic step by step
const patterns = getMinimalPatternsByLanguage('ruby');
const lines = rubyCode.split('\n');
const seen = new Set<string>();
const vulnerabilities: any[] = [];

console.log(`Processing ${patterns.length} Ruby patterns`);

// Focus on SQL injection pattern
const sqlPattern = patterns.find(p => p.id === 'ruby-sql-injection');
if (!sqlPattern) {
  console.log('ERROR: No SQL injection pattern found!');
  process.exit(1);
}

console.log('\nProcessing SQL injection pattern...');
console.log('Pattern has astRules?', !!sqlPattern.astRules);

// This is the detector logic
const astPatterns = patterns.filter(p => p.astRules);
const regexPatterns = patterns.filter(p => !p.astRules);

console.log(`Would process as AST: ${astPatterns.includes(sqlPattern)}`);
console.log(`Would process as regex: ${regexPatterns.includes(sqlPattern)}`);

// Simulate regex processing
if (sqlPattern.patterns.regex) {
  for (const regex of sqlPattern.patterns.regex) {
    console.log(`\nTesting regex: ${regex}`);
    let match;
    regex.lastIndex = 0;
    
    while ((match = regex.exec(rubyCode)) !== null) {
      const lineNumber = rubyCode.substring(0, match.index).split('\n').length;
      const line = lines[lineNumber - 1]?.trim() || '';
      console.log(`  MATCH at line ${lineNumber}: "${line}"`);
      
      // Check deduplication
      const key = `${lineNumber}:${sqlPattern.type}`;
      if (seen.has(key)) {
        console.log(`  Would skip as duplicate`);
        continue;
      }
      seen.add(key);
      
      console.log(`  Would add vulnerability`);
      
      if (!regex.global) {
        break;
      }
    }
  }
}