#!/usr/bin/env bun

import { SecurityDetectorV2 } from '../src/security/detector-v2.js';
import { LocalPatternSource } from '../src/security/pattern-source.js';

// Patch the detector to add logging
class VerboseSecurityDetector extends SecurityDetectorV2 {
  constructor() {
    super(new LocalPatternSource());
  }
  
  async detect(code: string, language: string, filePath: string = 'unknown'): Promise<any[]> {
    console.log(`\n=== VerboseSecurityDetector.detect ===`);
    console.log(`Language: ${language}`);
    console.log(`File: ${filePath}`);
    console.log(`Code length: ${code.length}`);
    
    const patterns = await this.patternSource.getPatternsByLanguage(language);
    console.log(`Patterns loaded: ${patterns.length}`);
    
    const vulnerabilities: any[] = [];
    const lines = code.split('\n');
    const seen = new Set<string>();
    
    try {
      // Separate patterns
      const astPatterns = patterns.filter(p => p.astRules);
      const regexPatterns = patterns.filter(p => !p.astRules);
      
      console.log(`AST patterns: ${astPatterns.length}`);
      console.log(`Regex patterns: ${regexPatterns.length}`);
      
      // Process regex patterns
      for (const pattern of regexPatterns) {
        console.log(`\nProcessing pattern: ${pattern.id}`);
        
        if (pattern.patterns.regex) {
          for (const regex of pattern.patterns.regex) {
            console.log(`  Testing regex: ${regex}`);
            let match;
            regex.lastIndex = 0;
            
            while ((match = regex.exec(code)) !== null) {
              const lineNumber = this.getLineNumber(code, match.index);
              const line = lines[lineNumber - 1]?.trim() || '';
              console.log(`    MATCH at line ${lineNumber}: "${line}"`);
              
              // Check safe usage
              const isSafe = this.isSafeUsage(line, pattern.type);
              console.log(`    Is safe usage: ${isSafe}`);
              
              if (isSafe) {
                continue;
              }
              
              // Check deduplication
              const key = `${lineNumber}:${pattern.type}`;
              if (seen.has(key)) {
                console.log(`    Skipping duplicate: ${key}`);
                continue;
              }
              seen.add(key);
              
              const vuln = {
                type: pattern.type,
                severity: pattern.severity,
                line: lineNumber,
                message: `${pattern.name}: ${pattern.description}`,
                description: pattern.description,
                confidence: this.getConfidence(line, pattern.type),
                cweId: pattern.cweId,
                owaspCategory: pattern.owaspCategory,
                remediation: pattern.remediation
              };
              
              console.log(`    Adding vulnerability:`, vuln);
              vulnerabilities.push(vuln);
              
              if (!regex.global) {
                break;
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in detect:', error);
    }
    
    console.log(`\nTotal vulnerabilities found: ${vulnerabilities.length}`);
    return vulnerabilities;
  }
  
  private getLineNumber(code: string, index: number): number {
    return code.substring(0, index).split('\n').length;
  }
  
  private isSafeUsage(line: string, type: any): boolean {
    // Just return false for now to ensure we're not filtering
    return false;
  }
  
  private getConfidence(line: string, type: any): 'high' | 'medium' | 'low' {
    return 'high';
  }
}

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
  const detector = new VerboseSecurityDetector();
  const vulnerabilities = await detector.detect(rubyCode, 'ruby', 'test.rb');
  console.log('\nFinal result:', JSON.stringify(vulnerabilities, null, 2));
}

test().catch(console.error);