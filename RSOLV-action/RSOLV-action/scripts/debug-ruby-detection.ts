#!/usr/bin/env bun

import { SecurityDetectorV2 } from '../src/security/detector-v2.js';
import { LocalPatternSource } from '../src/security/pattern-source.js';
import { logger } from '../src/utils/logger.js';

async function debug() {
  const detector = new SecurityDetectorV2(new LocalPatternSource());
  
  const rubyCode = `
class UsersController < ApplicationController
  def update
    user = User.where("id = '#{params[:user][:id]}'")[0]
    user.save
  end
end`;

  // Test pattern directly
  const source = new LocalPatternSource();
  const patterns = await source.getPatternsByLanguage('ruby');
  
  console.log('Ruby patterns found:', patterns.length);
  
  const sqlPattern = patterns.find(p => p.id === 'ruby-sql-injection');
  if (sqlPattern) {
    console.log('SQL pattern found:', sqlPattern);
    console.log('Regex count:', sqlPattern.patterns.regex?.length);
    
    if (sqlPattern.patterns.regex) {
      for (let i = 0; i < sqlPattern.patterns.regex.length; i++) {
        const regex = sqlPattern.patterns.regex[i];
        console.log(`\nTesting regex ${i}: ${regex}`);
        console.log('Regex is RegExp?', regex instanceof RegExp);
        
        // Test each line
        const lines = rubyCode.split('\n');
        lines.forEach((line, idx) => {
          if (line.trim()) {
            regex.lastIndex = 0;
            const match = regex.test(line);
            if (match) {
              console.log(`  Match on line ${idx}: "${line.trim()}"`);
            }
          }
        });
      }
    }
  }
  
  console.log('\nRunning detector...');
  const vulnerabilities = await detector.detect(rubyCode, 'ruby', 'test.rb');
  console.log('Vulnerabilities found:', vulnerabilities.length);
  console.log('Details:', JSON.stringify(vulnerabilities, null, 2));
}

debug().catch(console.error);