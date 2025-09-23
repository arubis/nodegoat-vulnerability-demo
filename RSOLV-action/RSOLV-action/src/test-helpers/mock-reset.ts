/**
 * Helper to reset module mocks between tests
 * This is a workaround for Bun's mock isolation issues
 */
// @ts-ignore - Bun test types
import { test } from 'bun:test';

export function resetAllMocks() {
  // Reset all module mocks by re-mocking with original implementations
  // This is a temporary workaround until Bun improves mock isolation
  
  // Note: In a proper solution, we would:
  // 1. Track all mocked modules
  // 2. Restore their original implementations
  // 3. Clear the mock cache
  
  // For now, we'll document this as a known issue
  console.warn('Mock reset not fully implemented - known test isolation issue');
}

export function isolatedTest(name: string, fn: () => void | Promise<void>) {
  // Wrapper for tests that need isolation
  // This is a placeholder for future improvements
  return test(name, async () => {
    try {
      await fn();
    } finally {
      resetAllMocks();
    }
  });
}