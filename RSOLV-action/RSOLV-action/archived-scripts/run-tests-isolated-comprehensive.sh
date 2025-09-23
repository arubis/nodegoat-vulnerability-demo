#!/bin/bash
# Run tests in complete isolation to avoid Bun mock pollution issues
# This script runs each test file in a separate process

echo "Running comprehensive isolated test suite..."
echo "====================================="

# Initialize counters
total_pass=0
total_fail=0
total_files=0
failed_files=()

# Find all test files
test_files=$(find src -name "*.test.ts" -type f | sort)

# Create a temporary file to store results
results_file=$(mktemp)

for test_file in $test_files; do
  echo -n "Running: $test_file ... "
  
  # Run test in isolation and capture output
  output=$(bun test "$test_file" --preload ./test-preload.ts 2>&1)
  exit_code=$?
  
  # Extract test counts from output
  pass_count=$(echo "$output" | grep -E "^\s*[0-9]+ pass" | awk '{print $1}' | tail -1)
  fail_count=$(echo "$output" | grep -E "^\s*[0-9]+ fail" | awk '{print $1}' | tail -1)
  
  # Default to 0 if not found
  pass_count=${pass_count:-0}
  fail_count=${fail_count:-0}
  
  # Update totals
  total_pass=$((total_pass + pass_count))
  total_fail=$((total_fail + fail_count))
  total_files=$((total_files + 1))
  
  # Print result
  if [ "$fail_count" -eq 0 ] && [ "$pass_count" -gt 0 ]; then
    echo "✓ ($pass_count tests passed)"
  else
    echo "✗ ($fail_count failed, $pass_count passed)"
    failed_files+=("$test_file")
    
    # Save failing test details
    echo "=== $test_file ===" >> "$results_file"
    echo "$output" | grep -E "^\(fail\)|Error:|error:" >> "$results_file"
    echo "" >> "$results_file"
  fi
done

echo ""
echo "====================================="
echo "Summary:"
echo "Total test files: $total_files"
echo "Total tests passed: $total_pass"
echo "Total tests failed: $total_fail"
echo "Success rate: $(( total_pass * 100 / (total_pass + total_fail) ))%"

if [ ${#failed_files[@]} -gt 0 ]; then
  echo ""
  echo "Failed test files:"
  for file in "${failed_files[@]}"; do
    echo "  - $file"
  done
  
  echo ""
  echo "To see failure details, check: $results_file"
else
  echo ""
  echo "All tests passed! 🎉"
  rm -f "$results_file"
fi