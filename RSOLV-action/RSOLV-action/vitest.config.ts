import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

/**
 * Unified Vitest Configuration
 * Consolidates all test configurations with environment-based options
 */

const isCI = process.env.CI === 'true';
const isMemoryConstrained = process.env.TEST_MEMORY_SAFE === 'true' || isCI;
const isLiveAPI = process.env.TEST_LIVE_API === 'true';

export default defineConfig({
  test: {
    // Use 'node' environment for all tests (not jsdom/happy-dom)
    environment: 'node',
    
    // Global setup
    globals: true,
    setupFiles: ['./test/setup.ts'],
    
    // Performance settings based on environment
    pool: isMemoryConstrained ? 'forks' : 'threads',
    poolOptions: isMemoryConstrained 
      ? {
          forks: {
            singleFork: true,  // Run all tests in single process
          }
        }
      : {
          threads: {
            maxThreads: 4,
            minThreads: 1,
          }
        },
    
    // Timeout settings
    testTimeout: isLiveAPI ? 60000 : 10000,
    hookTimeout: 5000,
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'test/**',
        'tests/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/types.ts',
        '**/*.d.ts',
        'vitest.*.ts',
        'scripts/**',
        '*.config.ts'
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70
      }
    },
    
    // Reporter configuration
    reporters: process.env.TEST_REPORTER === 'json' 
      ? ['json'] 
      : ['default'],
    outputFile: process.env.TEST_OUTPUT_FILE || undefined,
    
    // Exclude patterns
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.{idea,git,cache,output,temp}/**',
      // Skip broken/experimental tests
      '**/*.broken.ts',
      '**/*.skip.ts',
      // Skip e2e tests unless explicitly running them
      ...(process.env.RUN_E2E !== 'true' ? ['**/e2e/**', '**/*e2e*.test.ts'] : []),
      // Skip live API tests unless explicitly enabled  
      ...(isLiveAPI ? [] : ['**/*live-api*.test.ts', '**/*staging*.test.ts'])
    ],
    
    // Include patterns
    include: [
      'src/**/*.test.ts',
      'test/**/*.test.ts', 
      'tests/**/*.test.ts'
    ],
    
    // Retry flaky tests (useful for API tests)
    retry: isLiveAPI ? 2 : 0,
    
    // Logging
    logHeapUsage: isMemoryConstrained,
    
    // Isolation settings
    isolate: true,
    fileParallelism: !isMemoryConstrained,
  },
  
  // Resolve configuration
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@test': resolve(__dirname, './test')
    },
    extensions: ['.ts', '.js', '.json']
  },
  
  // Build optimizations
  optimizeDeps: {
    include: ['vitest', '@vitest/ui']
  },
  
  // ESBuild for faster transforms
  esbuild: {
    target: 'node20',
    format: 'esm'
  }
});