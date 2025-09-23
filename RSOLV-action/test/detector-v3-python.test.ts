import { describe, it, expect, vi } from 'vitest';
import { SecurityDetectorV3 } from '../src/security/detector-v3';
import { HybridPatternSource } from '../src/security/pattern-source';

describe.skip('SecurityDetectorV3 - Python Support (Needs RFC-048 Test Mode)', () => {
  it('should detect SQL injection in Python code using server-side AST', async () => {
    const pythonCode = `
def get_user(user_id):
    query = "SELECT * FROM users WHERE id = " + user_id
    cursor.execute(query)
    return cursor.fetchone()
`;

    const detector = new SecurityDetectorV3({
      patternSource: new HybridPatternSource('rsolv_test_suite_key', 'http://localhost:4002'),
      apiKey: 'rsolv_test_suite_key',
      apiUrl: 'http://localhost:4002',
      useServerAST: true
    });

    console.log('Testing Python SQL injection detection...');
    const vulnerabilities = await detector.detect(pythonCode, 'python', 'test.py');  // Now works with test.py after fixing confidence multiplier
    
    console.log('Vulnerabilities detected:', vulnerabilities.length);
    console.log('Vulnerabilities:', JSON.stringify(vulnerabilities, null, 2));
    
    // Should detect at least one SQL injection vulnerability
    expect(vulnerabilities.length).toBeGreaterThan(0);
    
    // Check for SQL injection
    const sqlInjection = vulnerabilities.find(v => 
      v.type.toLowerCase().includes('sql') || 
      v.message.toLowerCase().includes('sql')
    );
    
    expect(sqlInjection).toBeDefined();
    expect(['high', 'critical']).toContain(sqlInjection?.severity);
  });
});