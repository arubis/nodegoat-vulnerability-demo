#!/bin/bash

echo "Running comprehensive test suite..."
echo ""

# Run all tests with timeout
timeout 180s bun test 2>&1 > /tmp/test-output.txt

# Extract summary
echo "=== TEST SUMMARY ==="
grep -E "^[[:space:]]*[0-9]+ (pass|fail|skip)" /tmp/test-output.txt | tail -5

echo ""
echo "=== FAILURES ==="
grep "(fail)" /tmp/test-output.txt | wc -l
echo " failing tests found"

echo ""
echo "=== TOP FAILURES ==="
grep "(fail)" /tmp/test-output.txt | head -10

echo ""
echo "=== OVERALL ==="
grep "Ran [0-9]+ tests" /tmp/test-output.txt | tail -1