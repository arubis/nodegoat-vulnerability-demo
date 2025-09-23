#!/bin/bash

echo "=== RSOLV-action Test Summary ==="
echo ""

# Run tests and capture output
timeout 120s bun test 2>&1 | tee /tmp/full-test-output.txt > /dev/null

# Get final summary
echo "Overall Results:"
grep -E "^[[:space:]]*[0-9]+ (pass|fail|skip|expect)" /tmp/full-test-output.txt | tail -5

echo ""
echo "Failed Tests:"
grep "(fail)" /tmp/full-test-output.txt | head -20

echo ""
echo "Test File Summary:"
grep "Ran [0-9]+ tests" /tmp/full-test-output.txt | tail -1