import { describe, it, expect, vi } from 'vitest';
import { SecurityDetectorV2 } from '../src/security/detector-v2';

describe('Memory Investigation', () => {
  it('should check pattern loading without detection', async () => {
    const detector = new SecurityDetectorV2();
    
    // Try to access the pattern source directly
    const patternSource = (detector as any).patternSource;
    console.log('Pattern source type:', patternSource.constructor.name);
    
    // Try loading patterns for a language
    console.log('Loading JavaScript patterns...');
    const jsPatterns = await patternSource.getPatternsByLanguage('javascript');
    console.log('JavaScript patterns loaded:', jsPatterns.length);
    
    // Try loading patterns for Python (should be minimal/empty if using local)
    console.log('Loading Python patterns...');
    const pyPatterns = await patternSource.getPatternsByLanguage('python');
    console.log('Python patterns loaded:', pyPatterns.length);
    
    expect(jsPatterns).toBeDefined();
    expect(pyPatterns).toBeDefined();
  });

  it('should test small code detection', async () => {
    const detector = new SecurityDetectorV2();
    
    // Very small code sample
    const code = 'eval("test")';
    console.log('Testing detection on small code...');
    
    try {
      const results = await detector.detect(code, 'javascript', 'test.js');
      console.log('Detection results:', results.length);
      expect(results).toBeDefined();
    } catch (error) {
      console.error('Detection failed:', error);
      throw error;
    }
  });

  it('should check AST interpreter directly', async () => {
    const detector = new SecurityDetectorV2();
    const astInterpreter = (detector as any).astInterpreter;
    
    console.log('AST Interpreter type:', astInterpreter.constructor.name);
    
    // Check if it has any suspicious properties
    const keys = Object.keys(astInterpreter);
    console.log('AST Interpreter properties:', keys);
    
    expect(astInterpreter).toBeDefined();
  });
});