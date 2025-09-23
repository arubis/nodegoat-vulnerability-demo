/**
 * MSW Server Setup for Tests
 * Provides network-level API mocking for all HTTP requests
 */

import { beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from './handlers.js';

// Create the server instance with default handlers
export const server = setupServer(...handlers);

// Start server before all tests
export function setupMSW() {
  beforeAll(() => {
    server.listen({
      onUnhandledRequest: 'warn' // Warn about unhandled requests in tests
    });
  });

  // Reset handlers after each test
  afterEach(() => {
    server.resetHandlers();
  });

  // Clean up after all tests
  afterAll(() => {
    server.close();
  });
}

// Export for manual control in tests
export { HttpResponse } from 'msw';