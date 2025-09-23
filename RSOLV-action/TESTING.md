# RSOLV-action Testing Guide

## 📋 Test Suite Overview

### Current Status (June 19, 2025)
- **Total Tests**: 356
- **Passing**: ~80% when run with proper isolation
- **Known Issues**: Test interference when run in parallel
- **Mitigation**: Consolidated test runner with pollution prevention

### Test Organization
```
src/
├── __tests__/           # Integration tests for main modules
├── ai/
│   └── __tests__/       # AI provider and adapter tests
├── security/
│   └── *.test.ts        # Security pattern tests
├── containers/
│   └── __tests__/       # Container abstraction tests
└── credentials/
    └── __tests__/       # Credential manager tests

tests/
├── integration/         # Cross-module integration tests
├── e2e/                # End-to-end tests
└── platforms/          # Platform adapter tests
```

## 🔧 Running Tests

### Consolidated Test Runner

We use a single comprehensive test runner (`test-runner.sh`) that addresses Bun test pollution issues:

```bash
# Run all tests (default mode)
npm test
# or
./test-runner.sh all

# Run tests sequentially by category (recommended for CI)
npm run test:sequential
# or
./test-runner.sh sequential

# Run tests in complete isolation (slowest but most reliable)
npm run test:isolated
# or
./test-runner.sh isolated

# Run specific category
npm run test:security
npm run test:integration
npm run test:platforms
npm run test:ai
npm run test:github
npm run test:core
# or
./test-runner.sh category security

# Run single test or pattern
./test-runner.sh single pattern-api
./test-runner.sh single "analyzer"

# With custom timeout
./test-runner.sh -t 20000 sequential

# Verbose output
./test-runner.sh -v isolated

# Skip cleanup between tests (faster but less isolation)
./test-runner.sh --no-cleanup sequential
```

### Test Categories

| Category | Description | Paths |
|----------|-------------|-------|
| security | Security pattern detection tests | `src/security/` |
| integration | Cross-module integration tests | `tests/integration/`, `src/__tests__/integration/` |
| platforms | Platform adapter tests (GitHub, Jira, etc.) | `tests/platforms/` |
| github | GitHub-specific functionality | `tests/github/` |
| e2e | End-to-end workflow tests | `tests/e2e/`, `src/__tests__/pattern-api-e2e.test.ts` |
| ai | AI provider and adapter tests | `src/__tests__/ai/`, `src/ai/__tests__/` |
| core | Core functionality tests | Main test files in `src/__tests__/` |

### Legacy Commands (still available)
```bash
# Direct Bun test commands
bun test                              # All tests (may have interference)
bun test --watch                      # Watch mode
bun test src/ai/__tests__/analyzer.test.ts  # Specific file
bun test --grep "should detect"       # Pattern matching
```

## ⚠️ Known Issues & Solutions

### 1. Bun Test Pollution
**Problem**: Tests pass individually but fail when run together due to:
- Global state pollution
- Module cache pollution  
- Mock state leakage
- Environment variable interference

**Solution**: Our consolidated test runner addresses these issues with:
- Proper cleanup between test runs using `test-sync-utils.ts`
- Module cache clearing
- Environment isolation
- Sequential execution options
- Enhanced preload system (`test-preload.ts`)

### 2. Synchronization Instead of Sleep
**Old Approach**: Used `sleep` delays between tests
**New Approach**: Proper synchronization using:
- `waitForPendingTasks()` - Wait for microtasks/macrotasks
- `waitForModuleStability()` - Wait for module cache stability
- `performCompleteCleanup()` - Comprehensive async cleanup
- Process monitoring to wait for background tasks

### 3. Module Import Issues
Bun requires `.js` extensions for ES module imports:
```typescript
// ❌ Wrong
import { Something } from './module';

// ✅ Correct
import { Something } from './module.js';
```

### 4. TypeScript Interface Exports
Export interfaces as types to avoid runtime errors:
```typescript
// ❌ Wrong - causes runtime error
export { PatternSource } from './pattern-source.js';

// ✅ Correct
export type { PatternSource } from './pattern-source.js';
```

## 🧪 Testing Configuration

### Test Preload System
The `test-preload.ts` file provides:
- Global test utilities (`__RSOLV_TEST_UTILS__`)
- Consistent logger mocks
- Fetch mocking utilities
- Enhanced cleanup functions
- Environment isolation

### Bunfig Configuration
```toml
[test]
preload = ["./test-preload.ts"]
timeout = 30000
hot = false       # Disable hot reloading
smol = true       # Reduce memory usage
```

### Synchronization Utilities
`test-sync-utils.ts` provides pollution-free cleanup:
- `performCompleteCleanup()` - Full async cleanup
- `waitForPendingTasks()` - Wait for async operations
- `forceGarbageCollection()` - Memory cleanup
- `cleanupTestArtifacts()` - Remove test globals

## 🧪 Testing Patterns

### Container Testing
```typescript
const docker = new MockDockerClient();
docker.setAvailable(true);
docker.setPullSucceeds(false);
await setupContainer(config, docker);
```

### AI Provider Testing
```typescript
// Use test utilities for fetch mocking
const { setupFetchMock } = (globalThis as any).__RSOLV_TEST_UTILS__;
setupFetchMock({
  ok: true,
  json: () => Promise.resolve({ content: [{ text: 'AI response' }] })
});
```

### Pattern API Testing
```typescript
// Use local patterns for testing
const patternSource = new LocalPatternSource();
const detector = new SecurityDetectorV2(patternSource);
```

### Proper Mock Structure
```typescript
// Use consistent logger mock from test utilities
const { createLoggerMock } = (globalThis as any).__RSOLV_TEST_UTILS__;
const loggerMock = createLoggerMock();
```

## 🚀 Integration Testing Strategy

### 1. Local Testing with `act`
```bash
# Install act
brew install act

# Test the action locally
./test-local.sh

# Test with specific issue
./test-local.sh 123
```

### 2. Staging Environment
```bash
# Run against staging
export RSOLV_API_URL="https://api.rsolv-staging.com"
./test-runner.sh category e2e
```

### 3. Production Deployment
```bash
# Full test suite before release
./test-runner.sh sequential

# Create release if tests pass
git tag v1.0.x && git push origin v1.0.x
```

## 🔧 Test Maintenance

### Adding New Tests
1. Use `.js` extensions for all imports
2. Use type-only exports for interfaces
3. Leverage `test-preload.ts` utilities
4. Test in isolation first: `./test-runner.sh single yourtest`
5. Test with full suite: `./test-runner.sh sequential`

### Debugging Test Failures
```bash
# Run single failing test
./test-runner.sh single failing-test

# Run with verbose output
./test-runner.sh -v category integration

# Check for pollution between specific tests
bun test test1.test.ts test2.test.ts

# Run without cleanup to see pollution effects
./test-runner.sh --no-cleanup sequential
```

### Common Issues & Fixes

1. **"logger.debug is not a function"**
   ```typescript
   // Use test utilities
   const { createLoggerMock } = (globalThis as any).__RSOLV_TEST_UTILS__;
   const logger = createLoggerMock().logger;
   ```

2. **Test pollution between runs**
   ```bash
   # Use sequential mode
   ./test-runner.sh sequential
   ```

3. **"export 'X' not found"** 
   ```typescript
   // Use type-only exports for interfaces
   export type { InterfaceName } from './module.js';
   ```

4. **Fetch mocking issues**
   ```typescript
   // Use test utilities
   const { setupFetchMock, restoreFetch } = (globalThis as any).__RSOLV_TEST_UTILS__;
   beforeEach(() => setupFetchMock());
   afterEach(() => restoreFetch());
   ```

## 🌐 E2E Test Runner

For end-to-end testing without global mocks, use the dedicated E2E test runner:

### Purpose
The E2E test runner is designed for integration testing with real services:
- **No Global Mocks**: Tests run against real APIs and services
- **Real Network Calls**: Actual HTTP requests to staging/production
- **Authentic Environment**: Real file system, timers, and async operations
- **Service Integration**: Test complete workflows end-to-end

### Usage
```bash
# Run all E2E tests against staging
./e2e-test-runner.sh

# Run against production (with warning)
./e2e-test-runner.sh -e production

# Run specific category
./e2e-test-runner.sh api
./e2e-test-runner.sh workflow
./e2e-test-runner.sh integration

# Run single test
./e2e-test-runner.sh single pattern-api

# Verbose output with artifact preservation
./e2e-test-runner.sh -v -p all
```

### Environment Requirements
```bash
export RSOLV_API_KEY="sk-your-api-key"
export GITHUB_TOKEN="ghp_your-token"
export RSOLV_API_URL="https://api.rsolv-staging.com"  # Optional
```

### E2E vs Unit Tests

| Aspect | Unit Tests | E2E Tests |
|--------|------------|-----------|
| **Mocking** | Global mocks via `test-preload.ts` | No global mocks |
| **Network** | Mocked fetch responses | Real API calls |
| **Authentication** | Mock credentials | Real API keys |
| **File System** | Mocked where needed | Real file operations |
| **Environment** | Controlled test environment | Real staging/production |
| **Speed** | Fast (< 2 minutes) | Slower (5-10 minutes) |
| **Purpose** | Verify code logic | Verify service integration |

### E2E Test Structure
```typescript
// E2E tests use real utilities
const e2eUtils = (globalThis as any).__E2E_TEST_UTILS__;

test('real API integration', async () => {
  // Real HTTP client - no mocking
  const client = e2eUtils.createHttpClient();
  
  // Actual API call
  const response = await client.get('/api/v1/patterns/public/javascript');
  
  expect(response.patterns).toBeDefined();
});
```

## 📊 Test Runner Benefits

1. **Pollution Prevention**: Proper cleanup between test runs
2. **Better Synchronization**: No arbitrary sleep delays
3. **Flexible Execution**: Multiple modes (all, sequential, isolated, category)
4. **Comprehensive Logging**: Detailed output with color coding
5. **Consistent Environment**: Clean state for each test run
6. **Category Organization**: Logical grouping of related tests
7. **E2E Isolation**: Separate runner for real integration testing

## 🔍 Legacy Test Scripts (Archived)

The following scripts have been consolidated into `test-runner.sh`:
- `test-sequential.sh` ✅ Replaced by `./test-runner.sh sequential`
- `test-isolated-enhanced.sh` ✅ Replaced by `./test-runner.sh isolated`
- `test-with-sync.sh` ✅ Replaced by `./test-runner.sh` with proper sync
- Multiple category-specific scripts ✅ Replaced by `./test-runner.sh category X`

Use the new consolidated runner for all testing needs.