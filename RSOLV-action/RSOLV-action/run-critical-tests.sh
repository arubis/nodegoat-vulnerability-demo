#!/bin/bash

# Run critical test files individually to track progress
# This avoids memory issues and gives us clear status

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "RSOLV-action Critical Test Runner"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Set environment
export RSOLV_API_KEY=${RSOLV_API_KEY:-staging-master-key-123}
export RSOLV_API_URL=${RSOLV_API_URL:-https://api.rsolv-staging.com}
export NODE_OPTIONS="--max-old-space-size=2048"

# Critical test files to check
declare -A TESTS=(
    ["pattern-source"]="src/security/pattern-source.test.ts"
    ["security-analyzer"]="src/ai/__tests__/security-analyzer.test.ts"
    ["claude-code"]="src/ai/adapters/__tests__/claude-code.test.ts"
    ["ast-verification"]="src/validation/__tests__/ast-service-verification.test.ts"
    ["git-processor"]="src/ai/adapters/__tests__/git-based-processor.test.ts"
    ["two-phase"]="src/ai/adapters/__tests__/two-phase-conversation.test.ts"
    ["anthropic"]="src/ai/providers/__tests__/anthropic.test.ts"
    ["analyzer"]="src/ai/__tests__/analyzer.test.ts"
    ["client"]="src/ai/__tests__/client.test.ts"
    ["github-integration"]="tests/integration/github-integration.test.ts"
)

TOTAL=0
PASSED=0
FAILED=0

for name in "${!TESTS[@]}"; do
    file="${TESTS[$name]}"
    if [ -f "$file" ]; then
        echo -n "Testing $name... "
        
        # Run test and capture result
        if timeout 30 npx vitest run "$file" --no-coverage 2>&1 | grep -q "Test Files  1 passed"; then
            echo "✅ PASSED"
            PASSED=$((PASSED + 1))
        else
            # Get actual counts
            RESULT=$(timeout 30 npx vitest run "$file" --no-coverage 2>&1 | grep -E "Tests.*passed")
            if [ ! -z "$RESULT" ]; then
                echo "⚠️  PARTIAL: $RESULT"
            else
                echo "❌ FAILED"
            fi
            FAILED=$((FAILED + 1))
        fi
        TOTAL=$((TOTAL + 1))
    else
        echo "⚠️  $name: File not found ($file)"
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Summary:"
echo "Total: $TOTAL"
echo "Passed: $PASSED"
echo "Failed/Partial: $FAILED"
echo "Pass Rate: $([ $TOTAL -gt 0 ] && echo "scale=1; $PASSED * 100 / $TOTAL" | bc || echo 0)%"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"