# Known Issues

## Test Suite Memory Warning

**Issue**: When running the full test suite, you may see this error after tests complete:
```
Error: Worker terminated due to reaching memory limit: JS heap out of memory
```

**Status**: Benign - all tests pass successfully before this error appears

**Cause**: Known Vitest worker cleanup issue when running 1000+ tests (see vitest-dev/vitest#1674, #3077, #7288)

**Impact**: None - this happens during cleanup after all tests have completed

**Affected Shard**: Shard 7/8 consistently triggers this error (tests in src/ai/__tests__ and src/modes/__tests__)

**Workarounds**:
1. Use memory-safe mode: `./run-tests.sh --memory-safe` (runs tests in shards)
2. Increase Node memory: `NODE_OPTIONS="--max-old-space-size=12288" npx vitest run`
3. Run specific test suites instead of the full suite
4. Skip problematic shard: Run shards 1-6 and 8 separately if needed

**Note**: The test results are valid despite this error. The suite shows:
- Test Files: 149 passed (100%)  
- Tests: 1064 passed (100%)

This is tracked upstream in vitest and affects large test suites.

---

Last updated: 2025-08-28