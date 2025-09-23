import { describe, it, expect, vi } from 'vitest';
import { parse } from '@babel/parser';

describe('Babel Parser Language Support', () => {
  it('should parse JavaScript code successfully', () => {
    const jsCode = 'const x = eval("test");';
    
    expect(() => {
      const ast = parse(jsCode, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx']
      });
      expect(ast).toBeDefined();
    }).not.toThrow();
  });

  it('should fail to parse Python code', () => {
    const pythonCode = `
import mysql.connector

def get_user(user_id):
    query = "SELECT * FROM users WHERE id = " + user_id
    cursor.execute(query)
`;
    
    expect(() => {
      parse(pythonCode, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx']
      });
    }).toThrow();
  });

  it('should fail to parse Ruby code', () => {
    const rubyCode = `
class FileProcessor
  def process_file(filename)
    result = \`cat #{filename}\`
  end
end
`;
    
    expect(() => {
      parse(rubyCode, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx']
      });
    }).toThrow();
  });

  it('should fail to parse PHP code', () => {
    const phpCode = `<?php echo $_GET["name"]; ?>`;
    
    expect(() => {
      parse(phpCode, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx']
      });
    }).toThrow();
  });
});