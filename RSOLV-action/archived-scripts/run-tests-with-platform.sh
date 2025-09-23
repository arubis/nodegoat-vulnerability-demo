#!/bin/bash
# Run RSOLV-action tests with platform integration

# Export environment variables
export RSOLV_API_URL=http://localhost:4002
export RSOLV_API_KEY=rsolv_test_suite_key

echo "Testing with platform integration:"
echo "  RSOLV_API_URL=$RSOLV_API_URL"
echo "  RSOLV_API_KEY=$RSOLV_API_KEY"
echo ""

# Verify platform is running
if curl -s $RSOLV_API_URL/api/health > /dev/null; then
    echo "✅ Platform is running"
else
    echo "❌ Platform is not running. Start it with:"
    echo "  cd ../RSOLV-platform && docker-compose up -d"
    exit 1
fi

# Run specific test categories
echo ""
echo "Running tests..."

# Run unit tests first (fast)
echo "1. Unit tests..."
bun test test/unit --timeout 30000 2>&1 | tee unit-test-results.log | tail -5

# Run integration tests (slower)
echo ""
echo "2. Integration tests..."
bun test test/integration --timeout 60000 2>&1 | tee integration-test-results.log | tail -5

# Run AST-specific tests
echo ""
echo "3. AST service tests..."
bun test test/ast-service-verification.test.ts --timeout 60000 2>&1 | tee ast-test-results.log

# Run all other tests
echo ""
echo "4. Other tests..."
bun test --timeout 60000 2>&1 | tee all-test-results.log | grep -E "pass|fail" | tail -10

echo ""
echo "Test run complete. Check *-test-results.log files for details."