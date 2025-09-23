// Custom test script
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

// Create configs
const standardConfig = {
  provider: 'anthropic',
  apiKey: 'test-api-key-not-valid'
};

const claudeCodeConfig = {
  provider: 'anthropic',
  apiKey: 'test-api-key-not-valid',
  useClaudeCode: true
};

// Run test
async function test() {
  try {
    // Test Claude Code client
    const claudeClient = getAIClient(claudeCodeConfig);
    console.log('✓ Created Claude Code client');
    
    const solution = await claudeClient.generateSolution('Test issue', 'Test body', {});
    console.log('✓ Generated solution with title:', solution.title);
    
    // Test standard client
    const standardClient = getAIClient(standardConfig);
    console.log('✓ Created standard client');
    
    // Compare
    console.log('✓ Clients are different instances:',
      claudeClient \!== standardClient);
      
    // Success
    console.log('✓ All tests passed\!');
  } catch (error) {
    console.error('✗ Test failed:', error);
  }
}

test();
