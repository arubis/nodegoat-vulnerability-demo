#!/bin/bash
# Run fixed integration tests in isolation to avoid Bun mock pollution

echo "Running fixed integration tests in isolation..."

tests=(
  "tests/integration/ai-integration.test.ts"
  "tests/integration/github-integration.test.ts"
  "tests/integration/unified-processor.test.ts"
  "tests/integration/config.test.ts"
  "tests/integration/container.test.ts"
  "tests/integration/error-sanitization.test.ts"
  "tests/integration/vended-credentials.test.ts"
)

total_pass=0
total_fail=0

for test in "${tests[@]}"; do
  echo "=== Running $test ==="
  output=$(bun test "$test" 2>&1)
  
  # Extract pass/fail counts
  pass=$(echo "$output" | grep -E "^[[:space:]]*[0-9]+ pass" | awk '{print $1}')
  fail=$(echo "$output" | grep -E "^[[:space:]]*[0-9]+ fail" | awk '{print $1}')
  
  if [ -z "$pass" ]; then pass=0; fi
  if [ -z "$fail" ]; then fail=0; fi
  
  total_pass=$((total_pass + pass))
  total_fail=$((total_fail + fail))
  
  echo "  Pass: $pass, Fail: $fail"
done

echo ""
echo "=== TOTAL ==="
echo "Pass: $total_pass"
echo "Fail: $total_fail"
echo "Total: $((total_pass + total_fail))"