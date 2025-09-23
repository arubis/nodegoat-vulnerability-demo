// Global test setup for Vitest tests
// Used automatically by vitest.config.ts setupFiles

import { afterEach, vi } from 'vitest';

// Track all active timers and intervals
const activeTimers = new Set<Timer>();
const activeIntervals = new Set<Timer>();

// Override setTimeout to track timers
const originalSetTimeout = global.setTimeout;
global.setTimeout = ((fn: Function, delay?: number, ...args: any[]) => {
  const timer = originalSetTimeout(() => {
    activeTimers.delete(timer);
    fn(...args);
  }, delay);
  activeTimers.add(timer);
  return timer;
}) as typeof setTimeout;

// Override setInterval to track intervals
const originalSetInterval = global.setInterval;
global.setInterval = ((fn: Function, delay?: number, ...args: any[]) => {
  const interval = originalSetInterval(fn, delay, ...args);
  activeIntervals.add(interval);
  return interval;
}) as typeof setInterval;

// Override clearTimeout
const originalClearTimeout = global.clearTimeout;
global.clearTimeout = (timer: Timer) => {
  activeTimers.delete(timer);
  originalClearTimeout(timer);
};

// Override clearInterval
const originalClearInterval = global.clearInterval;
global.clearInterval = (interval: Timer) => {
  activeIntervals.delete(interval);
  originalClearInterval(interval);
};

// Global cleanup after each test
if (typeof afterEach === 'function') {
  afterEach(() => {
    // Clear all active timers
    for (const timer of activeTimers) {
      clearTimeout(timer);
    }
    activeTimers.clear();
    
    // Clear all active intervals
    for (const interval of activeIntervals) {
      clearInterval(interval);
    }
    activeIntervals.clear();
    
    // Reset any global fetch mock
    if ((global as any).fetch?.mockReset) {
      (global as any).fetch.mockReset();
    }
  });
}

// Set up common environment variables for tests
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce noise in tests

// Prevent real network calls by default
const originalFetch = global.fetch;
global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  
  // Allow localhost, test domains, and staging API
  if (url.includes('localhost') || 
      url.includes('127.0.0.1') || 
      url.includes('test') ||
      url.includes('api.rsolv-staging.com')) {
    return originalFetch(input, init);
  }
  
  // Mock external calls
  console.warn(`[Test] Blocked external fetch to: ${url}`);
  return Promise.resolve(new Response('{"error": "Network call blocked in test"}', {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  }));
};

console.log('[Test Setup] Global test configuration loaded');