#!/bin/bash
# Run all tests in isolation to avoid Bun mock pollution issues
# This script runs each test file separately and aggregates results

echo "Running all tests in isolation to avoid Bun mock pollution..."
echo "=================================================="

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Find all test files excluding node_modules and specific patterns
test_files=$(find . -name "*.test.ts" -o -name "*.test.js" | \
  grep -v node_modules | \
  grep -v ".git" | \
  grep -v "jira-adapter.test.ts" | \
  grep -v "e2e/full-demo-flow.test.ts" | \
  grep -v "e2e/example-e2e.test.ts" | \
  sort)

total_files=0
total_pass=0
total_fail=0
total_skip=0
failed_files=()

# Run each test file individually
for test_file in $test_files; do
  total_files=$((total_files + 1))
  echo -n "Running $test_file... "
  
  # Run the test and capture output
  output=$(bun test "$test_file" 2>&1)
  
  # Extract pass/fail/skip counts
  pass=$(echo "$output" | grep -E "^[[:space:]]*[0-9]+ pass" | awk '{print $1}')
  fail=$(echo "$output" | grep -E "^[[:space:]]*[0-9]+ fail" | awk '{print $1}')
  skip=$(echo "$output" | grep -E "^[[:space:]]*[0-9]+ skip" | awk '{print $1}')
  
  # Handle cases where counts aren't found
  if [ -z "$pass" ]; then pass=0; fi
  if [ -z "$fail" ]; then fail=0; fi
  if [ -z "$skip" ]; then skip=0; fi
  
  # Update totals
  total_pass=$((total_pass + pass))
  total_fail=$((total_fail + fail))
  total_skip=$((total_skip + skip))
  
  # Display result for this file
  if [ "$fail" -eq 0 ]; then
    echo -e "${GREEN}✓${NC} ($pass pass, $skip skip)"
  else
    echo -e "${RED}✗${NC} ($pass pass, $fail fail, $skip skip)"
    failed_files+=("$test_file")
  fi
done

echo "=================================================="
echo -e "${YELLOW}SUMMARY${NC}"
echo "Total test files: $total_files"
echo -e "Total tests: $((total_pass + total_fail + total_skip))"
echo -e "${GREEN}Pass: $total_pass${NC}"
echo -e "${RED}Fail: $total_fail${NC}"
echo -e "${YELLOW}Skip: $total_skip${NC}"

if [ ${#failed_files[@]} -gt 0 ]; then
  echo ""
  echo -e "${RED}Failed test files:${NC}"
  for file in "${failed_files[@]}"; do
    echo "  - $file"
  done
fi

echo ""
echo "Note: Tests are run in isolation due to Bun mock pollution issues."
echo "See: https://github.com/oven-sh/bun/issues/6040"

# Exit with appropriate code
if [ "$total_fail" -eq 0 ]; then
  exit 0
else
  exit 1
fi