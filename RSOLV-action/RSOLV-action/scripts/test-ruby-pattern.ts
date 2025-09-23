#!/usr/bin/env bun

import { SecurityDetectorV2 } from '../src/security/detector-v2.js';

const rubyCode = `# frozen_string_literal: true
class UsersController < ApplicationController
  def update
    message = false
    
    user = User.where("id = '#{params[:user][:id]}'")[0]
    
    if user
      user.update(user_params_without_password)
    end
  end
end`;

async function test() {
  // First test the pattern directly
  const patterns = [
    /where\s*\(\s*["'].*#\{.*\}.*["']\s*\)/gi,
    /find_by_sql\s*\(\s*["'].*#\{.*\}.*["']\s*\)/gi,
    /execute\s*\(\s*["'].*#\{.*\}.*["']\s*\)/gi
  ];
  
  console.log('Testing patterns directly:');
  patterns.forEach((pattern, i) => {
    pattern.lastIndex = 0; // Reset regex
    const match = pattern.test(rubyCode);
    console.log(`Pattern ${i}: ${pattern} matches: ${match}`);
  });
  
  // Test getting patterns from source
  const { getMinimalPatternsByLanguage } = await import('../src/security/minimal-patterns.js');
  const rubyPatterns = getMinimalPatternsByLanguage('ruby');
  console.log('\nRuby patterns from source:', rubyPatterns.length);
  const sqlPattern = rubyPatterns.find(p => p.id === 'ruby-sql-injection');
  console.log('SQL injection pattern:', sqlPattern);
  
  // Now test with detector
  const detector = new SecurityDetectorV2();
  
  // Test the SQL pattern manually within the detector's context
  if (sqlPattern && sqlPattern.patterns.regex) {
    console.log('\nTesting SQL pattern manually:');
    for (const regex of sqlPattern.patterns.regex) {
      regex.lastIndex = 0;
      const match = regex.exec(rubyCode);
      console.log(`Regex ${regex} match:`, match ? `Found at index ${match.index}` : 'No match');
      if (match) {
        const lineNumber = rubyCode.substring(0, match.index).split('\n').length;
        console.log(`  Line number: ${lineNumber}`);
        console.log(`  Matched text: "${match[0]}"`);
      }
    }
  }
  
  const vulnerabilities = await detector.detect(rubyCode, 'ruby', 'test.rb');
  
  console.log('\nRuby code:');
  console.log(rubyCode);
  console.log('\nVulnerabilities found:', vulnerabilities.length);
  console.log(JSON.stringify(vulnerabilities, null, 2));
}

test().catch(console.error);