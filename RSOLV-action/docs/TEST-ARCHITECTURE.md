# RSOLV-Action Test Architecture

## Overview
The RSOLV-Action test suite uses Vitest as the primary testing framework, organized into distinct categories for maintainability and performance optimization.

## Test Categories

### 1. AI Tests (`test:ai`)
- **Location**: `src/ai/**/*.test.ts`
- **Coverage**: AI adapters, processors, analyzers
- **Status**: 84.4% pass rate (358/424 tests passing)
- **Key Components**:
  - Claude Code adapters (SDK, CLI, Git-based)
  - Solution generation
  - Issue analysis
  - Test-driven development workflows

### 2. Security Tests (`test:security`)
- **Location**: `src/security/**/*.test.ts`
- **Coverage**: Vulnerability detection, AST analysis, pattern matching
- **Status**: Being refactored (split into smaller files)
- **Key Components**:
  - ElixirASTAnalyzer (split into core, encryption, patterns)
  - Pattern interpretation
  - CVE correlation
  - Compliance checking

### 3. Integration Tests (`test:integration`)
- **Location**: `tests/integration/**/*.test.ts`
- **Coverage**: End-to-end workflows, external systems
- **Status**: Recently migrated from Bun to Vitest
- **Key Components**:
  - GitHub integration
  - Jira/Linear workflows
  - Credential management
  - Unified processor

### 4. GitHub Tests (`test:github`)
- **Location**: `src/github/**/*.test.ts`
- **Coverage**: GitHub API interactions
- **Status**: 100% pass rate (7/7 tests)
- **Key Components**:
  - Pull request creation
  - Label management
  - Issue detection
  - File operations

### 5. Validation Tests (`test:validation`)
- **Location**: `src/validation/**/*.test.ts`
- **Coverage**: Input/output validation
- **Status**: 100% pass rate (25/25 tests)
- **Key Components**:
  - Schema validation
  - Data sanitization
  - Type checking

### 6. Modes Tests (`test:modes`)
- **Location**: `src/modes/**/*.test.ts`
- **Coverage**: Different execution modes
- **Status**: 100% pass rate (127/127 tests)
- **Key Components**:
  - Scan mode
  - Fix mode
  - Validation-only mode
  - Phase execution

### 7. Credentials Tests (`test:credentials`)
- **Location**: `src/credentials/**/*.test.ts`
- **Coverage**: Credential vending and management
- **Status**: 100% pass rate (16/16 tests)
- **Key Components**:
  - RSOLV API key exchange
  - Temporary credential management
  - Provider-specific credentials

## Architecture Patterns

### Test Organization
```
src/
├── feature/
│   ├── __tests__/           # Unit tests
│   │   └── component.test.ts
│   └── component.ts
tests/
├── integration/             # Integration tests
├── e2e/                    # End-to-end tests
└── regression/             # Regression tests
```

### Mocking Strategy

#### Vitest Mocking Best Practices
1. **Use `vi.hoisted()` for shared state**
   ```typescript
   const { mockState } = vi.hoisted(() => ({
     mockState: { value: null }
   }));
   ```

2. **Mock at module level, not instance level**
   ```typescript
   vi.mock('../module.js', () => ({
     MyClass: vi.fn()
   }));
   ```

3. **Always clean up in afterEach**
   ```typescript
   afterEach(() => {
     vi.clearAllMocks();
     vi.resetModules();
   });
   ```

### Test Splitting Strategy
Large test files (>300 lines) are split by concern:
- **Core**: Basic functionality
- **Integration**: Cross-component interaction
- **Patterns**: Detection and matching logic
- **Security**: Encryption and authentication

Example: `elixir-ast-analyzer.test.ts` → 
- `elixir-ast-analyzer-core.test.ts`
- `elixir-ast-analyzer-encryption.test.ts`
- `elixir-ast-analyzer-patterns.test.ts`

## Performance Optimization

### Memory Management
1. **Increase heap size for large suites**
   ```json
   "test": "NODE_OPTIONS='--max-old-space-size=8192' vitest run"
   ```

2. **Run tests sequentially for memory-intensive suites**
   ```json
   "test:sequential": "vitest run --pool=forks --poolOptions.forks.singleFork"
   ```

3. **Use test sharding in CI**
   ```bash
   vitest run --shard=1/4  # Split across 4 machines
   ```

### Parallel Execution
- Tests within a file run sequentially
- Test files run in parallel by default
- Use `describe.concurrent` for parallel test cases

## Common Issues & Solutions

### Issue: Mock Contamination
**Symptom**: Tests pass individually but fail when run together
**Solution**: Add `vi.resetModules()` to afterEach hooks

### Issue: ESM Module Mocking
**Symptom**: "Cannot spy on export" errors
**Solution**: Use `vi.mock()` at module level instead of `vi.spyOn()`

### Issue: Memory Leaks
**Symptom**: JavaScript heap out of memory
**Solution**: 
1. Downgrade MSW to v2.8.0 (v2.10+ has memory leaks)
2. Split large test files
3. Remove global mocks from setup files

### Issue: Undefined Mock Returns
**Symptom**: Cannot read properties of undefined
**Solution**: Provide default return values for all mocks
```typescript
execSync: vi.fn(() => '')  // Return empty string, not undefined
```

## Test Health Monitoring

### Automated Health Check Script
```bash
node scripts/test-health-monitor.js
```

Generates report with:
- Pass rates by category
- Total test counts
- Health score (0-100)
- Problem category identification

### Current Health Metrics (as of latest run)
- **Overall Pass Rate**: 84.4% (358/424 tests)
- **Perfect Categories**: 4 (GitHub, Validation, Modes, Credentials)
- **Problem Categories**: Security (needs refactoring)
- **Health Score**: 82/100 (Grade: B)

## CI/CD Integration

### GitHub Actions Configuration
```yaml
- name: Run tests
  run: |
    npm run test:sequential -- --coverage
    
- name: Upload coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/coverage-final.json
```

### Test Sharding for CI
```yaml
strategy:
  matrix:
    shard: [1, 2, 3, 4]
steps:
  - run: npm test -- --shard=${{ matrix.shard }}/4
```

## Migration Guide

### From Bun to Vitest
1. Replace imports: `bun:test` → `vitest`
2. Replace `mock` → `vi`
3. Convert `mock.module()` → `vi.mock()`
4. Add proper cleanup hooks
5. Run conversion script: `node scripts/convert-bun-to-vitest.js`

### From Jest to Vitest
1. Replace `jest` → `vi`
2. Add `vi.hoisted()` for shared state
3. Update mock paths to include `.js` extensions
4. Add explicit `vi.clearAllMocks()` in beforeEach

## Best Practices

1. **Keep tests focused**: One concept per test
2. **Use descriptive names**: Test name should explain what & why
3. **Mock at boundaries**: Mock external dependencies, not internal logic
4. **Test behavior, not implementation**: Focus on outputs, not internals
5. **Maintain test/production parity**: Use same configs and environments

## Maintenance

### Regular Tasks
- Run health monitor weekly
- Review and split large test files (>300 lines)
- Update mock patterns for new dependencies
- Monitor test execution times
- Clean up skipped tests quarterly

### Performance Targets
- Overall pass rate: >95%
- Test execution time: <60 seconds
- Memory usage: <4GB
- No crashed test categories
- All categories at >80% pass rate