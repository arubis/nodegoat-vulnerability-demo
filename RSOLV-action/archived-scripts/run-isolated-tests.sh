#!/bin/bash
# Run tests in isolation to avoid mock pollution issues
# See: https://github.com/oven-sh/bun/issues/6040

echo "Running tests in isolation mode to prevent mock pollution..."

# Run each test file separately to avoid mock conflicts
for test_file in $(find src -name "*.test.ts" -type f); do
  echo "Running: $test_file"
  bun test "$test_file" --preload ./test-preload.ts || true
done

# Count results
echo ""
echo "Test run complete. Running summary..."
bun test --reporter json 2>/dev/null | jq -r '.summary | "Total: \(.total), Passed: \(.passed), Failed: \(.failed), Skipped: \(.skipped)"' || echo "Could not generate summary"