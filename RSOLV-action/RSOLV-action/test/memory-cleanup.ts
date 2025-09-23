/**
 * Memory Cleanup Utilities for Test Files
 * 
 * Import this in memory-intensive test files to ensure proper cleanup
 * between tests and prevent memory leaks.
 */

import { afterEach, afterAll, beforeEach } from 'vitest';

/**
 * Track large objects for cleanup
 */
const trackedObjects = new WeakSet();
const largeArrays: any[][] = [];
const largeObjects: Record<string, any>[] = [];

/**
 * Register memory cleanup hooks for a test suite
 * Call this at the top of your test file
 */
export function setupMemoryCleanup(options: {
  verbose?: boolean;
  gcInterval?: number;
  clearMocks?: boolean;
} = {}) {
  const { verbose = false, gcInterval = 0, clearMocks = true } = options;
  
  // Before each test
  beforeEach(() => {
    if (verbose) {
      const mem = process.memoryUsage();
      console.log(`[Memory] Before test - Heap: ${(mem.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    }
  });
  
  // After each test
  afterEach(() => {
    // Clear tracked arrays and objects
    largeArrays.forEach(arr => arr.length = 0);
    largeArrays.length = 0;
    
    largeObjects.forEach(obj => {
      for (const key in obj) {
        delete obj[key];
      }
    });
    largeObjects.length = 0;
    
    // Clear all mocks if requested
    if (clearMocks) {
      vi.clearAllMocks();
      vi.resetAllMocks();
      vi.restoreAllMocks();
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      if (verbose) {
        const mem = process.memoryUsage();
        console.log(`[Memory] After cleanup - Heap: ${(mem.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      }
    }
    
    // Optional delay between tests
    if (gcInterval > 0) {
      return new Promise(resolve => setTimeout(resolve, gcInterval));
    }
  });
  
  // After all tests in the file
  afterAll(() => {
    // Final cleanup
    largeArrays.length = 0;
    largeObjects.length = 0;
    
    // Force final GC
    if (global.gc) {
      global.gc();
      if (verbose) {
        console.log('[Memory] Final cleanup completed');
      }
    }
  });
}

/**
 * Track a large object for automatic cleanup
 */
export function trackForCleanup<T>(obj: T): T {
  if (Array.isArray(obj)) {
    largeArrays.push(obj);
  } else if (typeof obj === 'object' && obj !== null) {
    largeObjects.push(obj as any);
  }
  return obj;
}

/**
 * Clear AST cache (for security tests)
 */
export function clearASTCache() {
  // Clear any global AST caches
  const globalAny = global as any;
  
  // Common AST parser caches
  if (globalAny.__ast_cache) {
    globalAny.__ast_cache.clear?.();
    delete globalAny.__ast_cache;
  }
  
  if (globalAny.__babel_cache) {
    globalAny.__babel_cache = null;
  }
  
  if (globalAny.__typescript_cache) {
    globalAny.__typescript_cache = null;
  }
}

/**
 * Clear large mock data (for AI tests)
 */
export function clearLargeMocks() {
  const mocks = vi.mocked;
  
  // Clear any large string/buffer mocks
  for (const key in mocks) {
    const mock = (mocks as any)[key];
    if (mock && typeof mock === 'object') {
      // Clear mock implementation data
      if (mock.mockImplementation) {
        mock.mockClear();
      }
      
      // Clear recorded calls with large data
      if (mock.calls) {
        mock.calls.length = 0;
      }
      
      if (mock.results) {
        mock.results.length = 0;
      }
    }
  }
}

/**
 * Memory-safe test wrapper
 * Wraps a test function to ensure cleanup even if test fails
 */
export function withMemoryCleanup<T extends (...args: any[]) => any>(
  testFn: T,
  options: { maxHeap?: number } = {}
): T {
  return (async (...args: Parameters<T>) => {
    const startHeap = process.memoryUsage().heapUsed;
    
    try {
      const result = await testFn(...args);
      return result;
    } finally {
      // Always cleanup
      clearLargeMocks();
      
      if (global.gc) {
        global.gc();
      }
      
      // Check if we exceeded heap limit
      if (options.maxHeap) {
        const endHeap = process.memoryUsage().heapUsed;
        const heapDelta = endHeap - startHeap;
        
        if (heapDelta > options.maxHeap) {
          console.warn(
            `[Memory Warning] Test used ${(heapDelta / 1024 / 1024).toFixed(2)}MB ` +
            `(limit: ${(options.maxHeap / 1024 / 1024).toFixed(2)}MB)`
          );
        }
      }
    }
  }) as T;
}

/**
 * Create a memory-limited describe block
 */
export function describeWithMemoryLimit(
  name: string,
  options: {
    maxHeapPerTest?: number;
    verbose?: boolean;
  },
  fn: () => void
) {
  describe(name, () => {
    setupMemoryCleanup({
      verbose: options.verbose,
      clearMocks: true,
      gcInterval: 100 // Small delay between tests
    });
    
    // Wrap the test function
    const originalIt = it;
    const wrappedIt = (name: string, testFn: any, timeout?: number) => {
      return originalIt(
        name,
        withMemoryCleanup(testFn, { maxHeap: options.maxHeapPerTest }),
        timeout
      );
    };
    
    // Replace 'it' in the describe block
    (global as any).it = wrappedIt;
    
    try {
      fn();
    } finally {
      // Restore original 'it'
      (global as any).it = originalIt;
    }
  });
}

/**
 * Cleanup helper for specific test patterns
 */
export const cleanupHelpers = {
  // For AST/Parser tests
  ast: () => {
    clearASTCache();
    // Clear any cached parsers
    const cache = (global as any).__parser_cache;
    if (cache) {
      cache.clear?.();
    }
  },
  
  // For AI/LLM tests  
  ai: () => {
    clearLargeMocks();
    // Clear any cached responses
    const responses = (global as any).__ai_responses;
    if (responses) {
      responses.length = 0;
    }
  },
  
  // For file system tests
  fs: () => {
    // Clear any cached file contents
    const fsCache = (global as any).__fs_cache;
    if (fsCache) {
      fsCache.clear?.();
    }
  },
  
  // For network/API tests
  network: () => {
    // Clear any response caches
    const httpCache = (global as any).__http_cache;
    if (httpCache) {
      httpCache.clear?.();
    }
  }
};

// Auto cleanup on module unload (for watch mode)
if (typeof process !== 'undefined') {
  process.on('beforeExit', () => {
    largeArrays.length = 0;
    largeObjects.length = 0;
    if (global.gc) {
      global.gc();
    }
  });
}