// Simple test script for Claude Code integration
import { getAIClient } from '../src/ai/client';

const standardConfig = {
  provider: 'anthropic',
  apiKey: 'test-api-key-not-valid'
};

const claudeCodeConfig = {
  provider: 'anthropic',
  apiKey: 'test-api-key-not-valid',
  useClaudeCode: true
};

// Mock logger to prevent console noise
import { logger } from '../src/utils/logger';
logger.info = () => {};
logger.warn = () => {};
logger.error = () => {};
logger.debug = () => {};

// Mock ClaudeCodeAdapter to avoid real API calls
import { ClaudeCodeAdapter } from '../src/ai/adapters/claude-code';
class MockClaudeCodeAdapter extends ClaudeCodeAdapter {
  constructor(config) {
    super(config);
  }
  
  isAvailable() {
    return Promise.resolve(true);
  }
  
  generateSolution() {
    return Promise.resolve({
      title: 'Mock solution',
      description: 'This is a mock solution',
      files: [],
      tests: []
    });
  }
}

// Override the real adapter so our wrapper will use the mock
ClaudeCodeAdapter.prototype.isAvailable = function() {
  return Promise.resolve(true);
};

ClaudeCodeAdapter.prototype.generateSolution = function() {
  return Promise.resolve({
    title: 'Mock solution',
    description: 'This is a mock solution',
    files: [],
    tests: []
  });
};

// Run a simple test
async function testClaudeCodeIntegration() {
  try {
    console.log('Testing client factory with Claude Code flag...');
    
    // Try with useClaudeCode: true
    const claudeClient = getAIClient(claudeCodeConfig);
    console.log('Claude client created successfully');
    
    // Test if it can generate a solution
    const solution = await claudeClient.generateSolution('Test issue', 'Test body', {});
    console.log('Generated solution:', solution ? 'Yes' : 'No');
    console.log('Solution title:', solution.title);
    
    // Try with standard config
    const standardClient = getAIClient(standardConfig);
    console.log('Standard client created, different from Claude client:', 
                standardClient \!= claudeClient);
    
    // Success\!
    console.log('Test completed successfully');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testClaudeCodeIntegration();
