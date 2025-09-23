# E2E Tests

## Pattern API Integration Tests

The pattern API integration tests are currently disabled due to a conflict with the global fetch mock in the test framework.

### Running E2E Tests Manually

1. Start the RSOLV API:
   ```bash
   cd RSOLV-api
   mix phx.server
   ```

2. Run the standalone E2E test:
   ```bash
   cd RSOLV-action
   bun run test-pattern-api-real.ts
   ```

### Test Coverage

The pattern API integration is tested through:

1. **Unit Tests (RSOLV-api)** - 15 tests, 0 failures:
   - `tier_access_test.exs` - Tests cumulative tier access
   - `tier_determination_test.exs` - Tests string/atom handling
   - `accounts_test.exs` - Tests customer configuration

2. **E2E Tests (manual)** - 35 tests passed:
   - Pattern fetching with authentication
   - Multiple pattern tier access
   - Language-specific pattern fetching
   - AST-enhanced pattern retrieval
   - Tier-specific access validation

### Known Issues

The global fetch mock in `setup-tests.ts` returns empty objects for all JSON responses, which breaks real API calls. This affects all tests that need to make actual HTTP requests.

### Future Improvements

1. Create a separate test configuration for E2E tests without the fetch mock
2. Use environment detection to disable mocking for E2E tests
3. Implement a more sophisticated mock that can pass through certain URLs