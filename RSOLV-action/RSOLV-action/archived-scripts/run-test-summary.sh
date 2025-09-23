#!/bin/bash

echo "RSOLV-action Test Summary"
echo "========================="
echo ""

total_pass=0
total_fail=0

for dir in src/*/; do
  if [ -d "$dir/__tests__" ]; then
    echo "Testing $dir:"
    result=$(timeout 30 bun test "$dir"__tests__/*.test.ts 2>&1 | tail -50 | grep -E "[0-9]+ pass" | tail -1)
    if [ -n "$result" ]; then
      echo "  $result"
      pass=$(echo "$result" | grep -oE "[0-9]+" | head -1)
      total_pass=$((total_pass + ${pass:-0}))
    fi
    
    result=$(timeout 30 bun test "$dir"__tests__/*.test.ts 2>&1 | tail -50 | grep -E "[0-9]+ fail" | tail -1)
    if [ -n "$result" ]; then
      echo "  $result"
      fail=$(echo "$result" | grep -oE "[0-9]+" | head -1)
      total_fail=$((total_fail + ${fail:-0}))
    fi
    
    if [ -z "$pass" ] && [ -z "$fail" ]; then
      echo "  No test results or timeout"
    fi
  fi
done

echo ""
echo "Overall Summary:"
echo "================"
echo "Total Pass: $total_pass"
echo "Total Fail: $total_fail"
echo "Pass Rate: $(echo "scale=2; $total_pass * 100 / ($total_pass + $total_fail)" | bc)%"