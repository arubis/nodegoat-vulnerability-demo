#!/bin/bash
# Run tests in isolation to avoid mock pollution issues
# Updated to use vitest instead of bun test

echo "Running tests in isolation mode with vitest..."
echo "This avoids mock pollution issues between test files"
echo ""

FAILED=0
PASSED=0
TOTAL=0

# Set environment for staging API
export RSOLV_API_KEY=${RSOLV_API_KEY:-staging-master-key-123}
export RSOLV_API_URL=${RSOLV_API_URL:-https://api.rsolv-staging.com}
export NODE_OPTIONS="--max-old-space-size=4096"

# Find all test files
TEST_FILES=$(find . -name "*.test.ts" -not -path "./node_modules/*" -not -path "./archived/*" | sort)

for test_file in $TEST_FILES; do
    TOTAL=$((TOTAL + 1))
    echo -n "Running $test_file... "
    
    # Run the test with vitest and capture output
    if timeout 30 npx vitest run "$test_file" --no-coverage > /tmp/test-output.txt 2>&1; then
        PASSED=$((PASSED + 1))
        echo "✅ PASSED"
    else
        FAILED=$((FAILED + 1))
        echo "❌ FAILED"
        echo "Error output:"
        cat /tmp/test-output.txt | grep -E "(FAIL|Error|AssertionError)" | head -5
        echo ""
    fi
done

echo ""
echo "========================================="
echo "Test Summary:"
echo "Total test files: $TOTAL"
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo "Pass rate: $([ $TOTAL -gt 0 ] && echo "scale=1; $PASSED * 100 / $TOTAL" | bc || echo 0)%"
echo "========================================="

if [ $FAILED -eq 0 ]; then
    echo "✅ All tests passed in isolation!"
    exit 0
else
    echo "❌ Some tests failed"
    exit 1
fi