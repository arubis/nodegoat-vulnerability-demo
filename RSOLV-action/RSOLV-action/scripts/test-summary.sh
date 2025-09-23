#!/bin/bash

# Test Summary Script
# Runs tests by module and provides a comprehensive summary

echo "===================================="
echo "RSOLV-action Test Suite Summary"
echo "===================================="
echo "Date: $(date)"
echo ""

# Array of test directories
declare -A test_results
modules=(
  "src/validation"
  "src/external"
  "src/github"
  "src/git"
  "src/credentials"
  "src/ai/adapters"
  "src/ai/__tests__"
  "test/credentials"
  "test/regression"
  "test/security"
)

total_tests=0
total_passed=0
total_failed=0
total_skipped=0

echo "Running tests by module..."
echo ""

for module in "${modules[@]}"; do
  echo "Testing $module..."
  
  # Run tests for this module and capture the output
  output=$(npm test -- "$module" 2>&1 | tail -5)
  
  # Extract test counts using grep and awk
  if echo "$output" | grep -q "Test Files"; then
    # Parse the summary line
    summary=$(echo "$output" | grep "Tests")
    
    if [ ! -z "$summary" ]; then
      # Extract numbers from summary
      failed=$(echo "$summary" | grep -o "[0-9]* failed" | grep -o "[0-9]*" || echo "0")
      passed=$(echo "$summary" | grep -o "[0-9]* passed" | grep -o "[0-9]*" || echo "0")
      skipped=$(echo "$summary" | grep -o "[0-9]* skipped" | grep -o "[0-9]*" || echo "0")
      
      # Handle cases where counts might be missing
      failed=${failed:-0}
      passed=${passed:-0}
      skipped=${skipped:-0}
      
      # Calculate module total
      module_total=$((failed + passed + skipped))
      
      # Update totals
      total_tests=$((total_tests + module_total))
      total_passed=$((total_passed + passed))
      total_failed=$((total_failed + failed))
      total_skipped=$((total_skipped + skipped))
      
      # Store results
      test_results["$module"]="Tests: $module_total | ✓ $passed | ✗ $failed | ⊘ $skipped"
      
      # Print module result
      printf "  %-30s: Tests: %3d | ✓ %3d | ✗ %3d | ⊘ %3d\n" "$module" "$module_total" "$passed" "$failed" "$skipped"
    else
      echo "  $module: No tests found"
      test_results["$module"]="No tests found"
    fi
  else
    echo "  $module: Error running tests"
    test_results["$module"]="Error"
  fi
  
  # Small delay to prevent memory issues
  sleep 1
done

echo ""
echo "===================================="
echo "OVERALL SUMMARY"
echo "===================================="
echo "Total Tests:    $total_tests"
echo "Passed:         $total_passed ($(awk "BEGIN {printf \"%.1f\", $total_passed*100/$total_tests}")%)"
echo "Failed:         $total_failed ($(awk "BEGIN {printf \"%.1f\", $total_failed*100/$total_tests}")%)"
echo "Skipped:        $total_skipped ($(awk "BEGIN {printf \"%.1f\", $total_skipped*100/$total_tests}")%)"
echo ""

if [ $total_failed -eq 0 ]; then
  echo "🎉 All tests are passing!"
else
  echo "⚠️  $total_failed tests still need to be fixed"
fi

echo ""
echo "===================================="

# Calculate success rate
success_rate=$(awk "BEGIN {printf \"%.1f\", $total_passed*100/($total_passed+$total_failed)}")
echo "Success Rate: $success_rate% (excluding skipped tests)"