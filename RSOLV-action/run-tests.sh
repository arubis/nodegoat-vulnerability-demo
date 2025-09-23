#!/bin/bash

# Unified test runner with memory safety and proper reporting
# Usage: ./run-tests.sh [options]
#   Options:
#     --memory-safe  Run with memory constraints (default in CI)
#     --live-api     Run live API tests
#     --e2e          Include E2E tests
#     --coverage     Generate coverage report
#     --json         Output JSON report
#     --watch        Run in watch mode

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Initialize exit code
TEST_EXIT_CODE=0

echo -e "${GREEN}🧪 RSOLV-Action Test Suite${NC}"
echo "================================"

# Parse arguments
MEMORY_SAFE=""
LIVE_API=""
RUN_E2E=""
COVERAGE=""
JSON_OUTPUT=""
WATCH_MODE=""
EXTRA_ARGS=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --memory-safe)
      MEMORY_SAFE="TEST_MEMORY_SAFE=true"
      echo "✓ Memory-safe mode enabled"
      shift
      ;;
    --live-api)
      LIVE_API="TEST_LIVE_API=true"
      echo "✓ Live API tests enabled"
      shift
      ;;
    --e2e)
      RUN_E2E="RUN_E2E=true"
      echo "✓ E2E tests included"
      shift
      ;;
    --coverage)
      COVERAGE="--coverage"
      echo "✓ Coverage reporting enabled"
      shift
      ;;
    --json)
      JSON_OUTPUT="TEST_REPORTER=json TEST_OUTPUT_FILE=test-report.json"
      EXTRA_ARGS="--reporter=json --outputFile=test-report.json"
      echo "✓ JSON output to test-report.json"
      shift
      ;;
    --watch)
      WATCH_MODE="--watch"
      echo "✓ Watch mode enabled"
      shift
      ;;
    --shard=*)
      SHARD_SPEC="${1#*=}"
      EXTRA_ARGS="$EXTRA_ARGS --shard=$SHARD_SPEC"
      echo "✓ Running shard $SHARD_SPEC"
      shift
      ;;
    --reporter=*)
      REPORTER="${1#*=}"
      EXTRA_ARGS="$EXTRA_ARGS --reporter=$REPORTER"
      echo "✓ Using reporter: $REPORTER"
      shift
      ;;
    --outputFile=*)
      OUTPUT_FILE="${1#*=}"
      EXTRA_ARGS="$EXTRA_ARGS --outputFile=$OUTPUT_FILE"
      echo "✓ Output file: $OUTPUT_FILE"
      shift
      ;;
    *)
      echo -e "${YELLOW}Unknown option: $1${NC}"
      shift
      ;;
  esac
done

# Default to memory-safe in CI or if system has less than 8GB RAM
if [[ -z "$MEMORY_SAFE" ]]; then
  if [[ "$CI" == "true" ]]; then
    MEMORY_SAFE="TEST_MEMORY_SAFE=true"
    echo "✓ CI detected - using memory-safe mode"
  else
    # Check available memory (works on Linux and macOS)
    if command -v free &> /dev/null; then
      # Linux
      TOTAL_MEM=$(free -m | awk 'NR==2{print $2}')
    elif command -v sysctl &> /dev/null; then
      # macOS
      TOTAL_MEM=$(($(sysctl -n hw.memsize) / 1024 / 1024))
    else
      TOTAL_MEM=8192 # Default assumption
    fi
    
    if [[ $TOTAL_MEM -lt 8192 ]]; then
      MEMORY_SAFE="TEST_MEMORY_SAFE=true"
      echo -e "${YELLOW}⚠ Less than 8GB RAM detected - using memory-safe mode${NC}"
    fi
  fi
fi

# Set Node.js memory limit based on mode
if [[ -n "$MEMORY_SAFE" ]]; then
  export NODE_OPTIONS="--max-old-space-size=4096"
  echo "✓ Node.js memory limit set to 4GB"
else
  export NODE_OPTIONS="--max-old-space-size=8192"
  echo "✓ Node.js memory limit set to 8GB"
fi

# Build the command
if [[ -n "$MEMORY_SAFE" ]]; then
  # Use sharding for memory-safe mode
  echo "✓ Using sharded execution (8 shards run serially)"
  
  # Create temporary directory for shard reports
  SHARD_DIR=".vitest-shards"
  mkdir -p $SHARD_DIR
  rm -f $SHARD_DIR/*.json
  
  # Run 8 shards serially to avoid memory exhaustion
  for i in 1 2 3 4 5 6 7 8; do
    echo ""
    echo -e "${YELLOW}Running shard $i/8...${NC}"
    
    if [[ -n "$JSON_OUTPUT" ]]; then
      SHARD_CMD="$MEMORY_SAFE $LIVE_API $RUN_E2E npx vitest run --shard=$i/8 --reporter=json --outputFile=$SHARD_DIR/shard-$i.json $COVERAGE"
    else
      SHARD_CMD="$MEMORY_SAFE $LIVE_API $RUN_E2E npx vitest run --shard=$i/8 $COVERAGE"
    fi
    
    eval $SHARD_CMD
    SHARD_EXIT_CODE=$?
    
    if [[ $SHARD_EXIT_CODE -ne 0 ]]; then
      TEST_EXIT_CODE=$SHARD_EXIT_CODE
    fi
  done
  
  # Merge JSON reports if needed
  if [[ -n "$JSON_OUTPUT" ]] && [[ -f "$SHARD_DIR/shard-1.json" ]]; then
    echo ""
    echo "Merging shard reports..."
    node merge-shard-results.cjs
  fi
else
  # Regular single run
  CMD="$MEMORY_SAFE $LIVE_API $RUN_E2E $JSON_OUTPUT npx vitest run $COVERAGE $WATCH_MODE $EXTRA_ARGS"
  echo ""
  echo "Running command:"
  echo -e "${YELLOW}$CMD${NC}"
  echo ""
  eval $CMD
  TEST_EXIT_CODE=$?
fi

# Report results
echo ""
if [[ $TEST_EXIT_CODE -eq 0 ]]; then
  echo -e "${GREEN}✅ All tests passed!${NC}"
else
  echo -e "${RED}❌ Some tests failed${NC}"
  
  # If JSON output, parse and show summary
  if [[ -n "$JSON_OUTPUT" ]] && [[ -f "test-report.json" ]]; then
    echo ""
    echo "Test Summary:"
    cat test-report.json | jq '{
      total: .numTotalTests,
      passed: .numPassedTests,
      failed: .numFailedTests,
      skipped: (.numPendingTests + .numTodoTests),
      passRate: ((.numPassedTests / .numTotalTests) * 100 | tostring + "%")
    }' 2>/dev/null || echo "(Unable to parse JSON report)"
  fi
fi

exit $TEST_EXIT_CODE