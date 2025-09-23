import { describe, it, expect, vi } from 'vitest';
import { SecurityDetectorV2 } from '../detector-v2.js';
import { LocalPatternSource } from '../pattern-source.js';

describe('SecurityDetectorV2 Pattern Loading', () => {
  it('should detect Ruby SQL injection with factory patterns', async () => {
    const detector = new SecurityDetectorV2(new LocalPatternSource());
    
    const rubyCode = `
class UsersController < ApplicationController
  def update
    user = User.where("id = '#{params[:user][:id]}'")[0]
    user.save
  end
end`;
    
    const vulnerabilities = await detector.detect(rubyCode, 'ruby', 'test.rb');
    
    expect(vulnerabilities.length).toBeGreaterThan(0);
    expect(vulnerabilities[0].type).toBe('sql_injection');
    expect(vulnerabilities[0].line).toBe(4); // Line with SQL injection
  });

  it('should detect Python SQL injection', async () => {
    const detector = new SecurityDetectorV2(new LocalPatternSource());
    
    const pythonCode = `
def get_user(user_id):
    query = "SELECT * FROM users WHERE id = " + user_id
    val = login.objects.raw(query)
    return val
`;
    
    const vulnerabilities = await detector.detect(pythonCode, 'python', 'test.py');
    
    expect(vulnerabilities.length).toBeGreaterThan(0);
    
    // Should find at least one SQL injection
    const sqlVulns = vulnerabilities.filter(v => v.type === 'sql_injection');
    expect(sqlVulns.length).toBeGreaterThan(0);
  });

  it('should detect Python pickle deserialization', async () => {
    const detector = new SecurityDetectorV2(new LocalPatternSource());
    
    const pythonCode = `
import pickle
import base64

def process_token(token):
    decoded = base64.b64decode(token)
    admin = pickle.loads(decoded)
    return admin
`;
    
    const vulnerabilities = await detector.detect(pythonCode, 'python', 'test.py');
    
    expect(vulnerabilities.length).toBeGreaterThan(0);
    
    // Should find pickle vulnerability
    const pickleVuln = vulnerabilities.find(v => 
      v.type === 'insecure_deserialization'
    );
    expect(pickleVuln).toBeDefined();
    expect(pickleVuln?.line).toBe(7); // Line with pickle.loads
  });

  it('should handle multiple patterns correctly', async () => {
    const detector = new SecurityDetectorV2(new LocalPatternSource());
    
    // Code with multiple vulnerabilities
    const jsCode = `
function login(username, password) {
  // SQL injection
  const query = "SELECT * FROM users WHERE username = '" + username + "'";
  db.query(query);
  
  // Eval usage
  eval(userInput);
  
  // Hardcoded secret (test pattern - not a real key)
  const api_key = "sk_test_" + "abcdef1234567890" + "abcdef1234567890";
}`;
    
    const vulnerabilities = await detector.detect(jsCode, 'javascript', 'test.js');
    
    // Should find at least 2 vulnerabilities (SQL injection and command injection)
    expect(vulnerabilities.length).toBeGreaterThanOrEqual(2);
    
    // Check we found different types
    const types = new Set(vulnerabilities.map(v => v.type));
    expect(types.has('sql_injection')).toBe(true);
    expect(types.has('command_injection')).toBe(true);
    // Hardcoded secrets detection may not be available in all pattern sets
  });

  it('should not have regex serialization issues', async () => {
    // This test verifies that patterns work after being imported
    const source = new LocalPatternSource();
    const patterns = await source.getPatternsByLanguage('ruby');
    
    expect(patterns.length).toBeGreaterThan(0);
    
    // Check that regex objects are valid
    for (const pattern of patterns) {
      if (pattern.patterns.regex) {
        for (const regex of pattern.patterns.regex) {
          expect(regex).toBeInstanceOf(RegExp);
          expect(typeof regex.test).toBe('function');
          
          // Verify regex can be used
          expect(() => regex.test('test')).not.toThrow();
        }
      }
    }
  });
});