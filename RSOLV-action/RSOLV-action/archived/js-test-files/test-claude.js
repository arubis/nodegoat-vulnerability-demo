// Test Claude Code integration
import { getAIClient } from '../src/ai/client';
import { logger } from '../src/utils/logger';
import { ClaudeCodeAdapter } from '../src/ai/adapters/claude-code';

// Mock logger
logger.info = () => {};
logger.warn = () => {};
logger.error = () => {};
logger.debug = () => {};

// Mock adapter
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

// Run test
async function runTest() {
  try {
    // Get Claude Code client
    const claudeClient = getAIClient({
      provider: 'anthropic',
      apiKey: 'test-api-key',
      useClaudeCode: true
    });
    console.log('Created Claude client');
    
    // Generate solution
    const solution = await claudeClient.generateSolution('Issue', 'Body', {});
    console.log('Solution title:', solution.title);
    
    // Success
    console.log('Test passed\!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

runTest();
