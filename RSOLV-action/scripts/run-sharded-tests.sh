#!/bin/bash

# Run tests in shards to avoid memory issues
# Using Vitest's native sharding feature

echo "🚀 Running tests in shards..."
echo "================================"

FAILED=0
PASSED=0
TOTAL_SHARDS=4

for SHARD in 1 2 3 4; do
  echo -e "\n📦 Running shard ${SHARD}/${TOTAL_SHARDS}..."
  
  if npx vitest run --shard=${SHARD}/${TOTAL_SHARDS} --reporter=verbose 2>&1 | tee shard-${SHARD}.log; then
    echo "✅ Shard ${SHARD} completed"
    # Extract test counts
    SHARD_PASSED=$(grep -E "Tests.*passed" shard-${SHARD}.log | grep -oE "[0-9]+ passed" | grep -oE "[0-9]+" | head -1)
    SHARD_FAILED=$(grep -E "Tests.*failed" shard-${SHARD}.log | grep -oE "[0-9]+ failed" | grep -oE "[0-9]+" | head -1)
    
    PASSED=$((PASSED + ${SHARD_PASSED:-0}))
    FAILED=$((FAILED + ${SHARD_FAILED:-0}))
  else
    echo "❌ Shard ${SHARD} failed"
    FAILED=$((FAILED + 1))
  fi
done

echo -e "\n================================"
echo "📊 FINAL RESULTS"
echo "================================"
echo "✅ Total Passed: ${PASSED}"
echo "❌ Total Failed: ${FAILED}"
echo "================================"

# Clean up log files
rm -f shard-*.log

if [ ${FAILED} -gt 0 ]; then
  exit 1
else
  exit 0
fi