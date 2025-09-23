import { describe, it, expect, vi } from 'vitest';
import { SecurityDetectorV2 } from '../detector-v2.js';
import { LocalPatternSource } from '../pattern-source.js';
import { getMinimalPatternsByLanguage } from '../minimal-patterns.js';

describe('Ruby Vulnerability Detection', () => {
  it('should have Ruby SQL injection pattern', () => {
    const patterns = getMinimalPatternsByLanguage('ruby');
    const sqlPattern = patterns.find(p => p.id === 'ruby-sql-injection');
    
    expect(sqlPattern).toBeDefined();
    expect(sqlPattern?.patterns.regex).toBeDefined();
    expect(sqlPattern?.patterns.regex?.length).toBe(3);
  });

  it('should match Ruby SQL injection with regex', () => {
    const patterns = getMinimalPatternsByLanguage('ruby');
    const sqlPattern = patterns.find(p => p.id === 'ruby-sql-injection');
    
    const vulnerableCode = `user = User.where("id = '#{params[:user][:id]}'")[0]`;
    
    let matched = false;
    if (sqlPattern?.patterns.regex) {
      for (const regex of sqlPattern.patterns.regex) {
        regex.lastIndex = 0;
        if (regex.test(vulnerableCode)) {
          matched = true;
          break;
        }
      }
    }
    
    expect(matched).toBe(true);
  });

  it('should detect Ruby SQL injection with detector', async () => {
    // Force use of local patterns for testing
    process.env.USE_LOCAL_PATTERNS = 'true';
    
    const detector = new SecurityDetectorV2();
    
    // Simple single line test first
    const vulnerabilities = await detector.detect(
      `user = User.where("id = '#{params[:user][:id]}'")[0]`,
      'ruby',
      'test.rb'
    );
    
    console.log('Single line vulnerabilities:', vulnerabilities);
    expect(vulnerabilities.length).toBeGreaterThan(0);
    
    // Cleanup
    delete process.env.USE_LOCAL_PATTERNS;
  });

  it('should detect Ruby SQL injection in full code', async () => {
    // Force use of local patterns for testing
    process.env.USE_LOCAL_PATTERNS = 'true';
    
    const detector = new SecurityDetectorV2();
    
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
    
    const vulnerabilities = await detector.detect(rubyCode, 'ruby', 'users_controller.rb');
    
    console.log('Full code vulnerabilities:', vulnerabilities);
    expect(vulnerabilities.length).toBeGreaterThan(0);
    
    if (vulnerabilities.length > 0) {
      expect(vulnerabilities[0].type).toBe('sql_injection');
      expect(vulnerabilities[0].line).toBe(6);
    }
    
    // Cleanup
    delete process.env.USE_LOCAL_PATTERNS;
  });
});