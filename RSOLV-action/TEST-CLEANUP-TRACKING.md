# RSOLV-action Test Suite Cleanup Tracking

## Progress Timeline

### Initial State (Session Start)
- **Total Tests**: 784
- **Passing**: 595 (~75%)
- **Failing**: 189

### Session High Point
- **Pass Rate**: ~88% (mentioned by user)
- **Status**: We've regressed from this point

### Current State (2025-08-27 02:20)
- **Critical Test Files Status** (33.3% fully passing):
  - ✅ pattern-source.test.ts: 17/17 passing
  - ✅ analyzer.test.ts: All passing
  - ✅ client.test.ts: All passing
  - ⚠️ security-analyzer.test.ts: 4/8 passing
  - ⚠️ claude-code.test.ts: 6/18 passing
  - ⚠️ git-processor.test.ts: 1/4 passing
  - ⚠️ two-phase.test.ts: 6/8 passing
  - ⚠️ github-integration.test.ts: 3/5 passing
  - ❌ anthropic.test.ts: 0/? passing
- **Status**: Memory issues prevent full test runs, using isolated testing

## Key Issues Fixed

### API/Integration Issues
- ✅ Removed hardcoded `format=enhanced` parameter causing 404s
- ✅ Fixed GitHub integration parameter order (getRepositoryFiles)
- ✅ Fixed environment variable propagation
- ✅ Understood staging confidence scoring (test file penalty of 0.3x)

### TypeScript/Import Issues
- ✅ Replaced all `as any` with proper `Response` types
- ✅ Removed jest imports from vitest tests
- ✅ Fixed vi.vi.spyOn typos (should be vi.spyOn)
- ✅ Fixed duplicate logger debug keys in mocks

### Test Framework Issues
- ⚠️ claude-code.test.ts: vi.mock/vi.hoisted not working with Bun runtime
- ⚠️ Need to use `npx vitest` not `bun test`
- ⚠️ Memory issues require test sharding

## Major Test Failure Categories

### AI Adapter Tests (57 failures)
- `src/ai/adapters/__tests__/claude-code.test.ts`: 32 failures
  - Issue: Test expects messages API, implementation uses query/prompt API
  - Status: In progress - updating expectations

### Security Tests (improving)  
- `src/ai/__tests__/security-analyzer.test.ts`: 4/8 tests passing
  - Issue: Local patterns only have 10 JS patterns, tests expect 25+
  - Tests pass individually but fail in batch
- `src/security/pattern-source.test.ts`: ✅ 17/17 passing!
- Various detector tests: Still to investigate

### Scanner Tests (9 failures)
- AST validation and service verification issues

### Other Notable Failures
- `src/validation/__tests__/ast-service-verification.test.ts`: 14 failures
- Various credential and GitHub tests

## Critical Discoveries

1. **Test Runner**: Must use `vitest` not `bun test` - Bun doesn't support vi.mock properly
2. **Confidence Scoring**: Test files get 0.3x confidence penalty, explaining low detection rates
3. **API Changes**: Platform API doesn't support `format=enhanced` parameter
4. **Test Isolation**: claude-code.test.ts passes alone but fails with others

## Next Steps

1. Fix anthropic.test.ts (currently fully failing)
2. Fix claude-code.test.ts expectations (6/18 passing)
3. Fix git-processor.test.ts (1/4 passing)
4. Fix security analyzer pattern count requirements
5. Create proper vitest runner that doesn't OOM

## Scripts Cleanup Done
- Archived all bun test scripts to archived-scripts/
- Updated scripts/run-tests-isolated.sh to use vitest
- Created run-critical-tests.sh for focused testing

## Test Commands

```bash
# Run critical tests summary
./run-critical-tests.sh

# Run with sharding (for memory issues)
./scripts/run-tests-isolated.sh

# Check TypeScript
npx tsc --noEmit

# Run specific test file
npx vitest run src/ai/adapters/__tests__/claude-code.test.ts --no-coverage

# Run tests by directory (avoid full runs due to OOM)
timeout 60 npx vitest run src/ai --no-coverage
```

## Key Reminders

- Always run `npx tsc --noEmit` after TypeScript changes
- Use `vitest` not `bun test`
- Test sharding helps with memory issues
- Watch for test isolation problems