import { vi } from 'vitest';

/**
 * Factory function to create a mock ClaudeCodeAdapter
 * This provides a consistent, predictable mock for tests
 */
export function createMockClaudeCodeAdapter(overrides?: Partial<any>) {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    
    generateSolution: vi.fn().mockImplementation(async (issueContext, analysisResult, config) => {
      // Default successful response
      return {
        success: true,
        message: 'Solution generated',
        changes: {
          'test.js': '// Fixed code'
        }
      };
    }),
    
    cleanup: vi.fn(),
    
    // Allow overriding specific methods
    ...overrides
  };
}

/**
 * Mock for the ClaudeCodeAdapter class itself
 * Use this with vi.mock() in test files
 */
export const MockClaudeCodeAdapter = vi.fn().mockImplementation((config) => {
  return createMockClaudeCodeAdapter();
});

/**
 * Helper to setup ClaudeCodeAdapter mock in tests
 * Call this in beforeEach() or at the top of test files
 */
export function setupClaudeCodeMock() {
  vi.mock('../../src/ai/adapters/claude-code', () => ({
    ClaudeCodeAdapter: MockClaudeCodeAdapter
  }));
}