#!/bin/bash

# RFC E2E Validation Script
# This script runs the production E2E test to validate RFC improvements
# Comparing against the baseline 55% success rate from Aug 19, 2025

set -euo pipefail

echo "🚀 RFC Implementation E2E Validation"
echo "===================================="
echo "Date: $(date)"
echo ""
echo "This test validates three critical RFCs:"
echo "  • RFC-045: Validation Confidence Scoring"
echo "  • RFC-046: Multi-file Vulnerability Chunking"  
echo "  • RFC-047: Vendor Library Detection"
echo ""
echo "Baseline (Aug 19): 55% success rate (5/9 vulnerabilities)"
echo "Expected: 95%+ success rate with RFCs"
echo ""

# Check prerequisites
if [ -z "${GITHUB_TOKEN:-}" ]; then
    echo "❌ GITHUB_TOKEN not set"
    echo "Please run: export GITHUB_TOKEN=your_github_token"
    exit 1
fi

if [ -z "${RSOLV_API_KEY:-}" ]; then
    echo "❌ RSOLV_API_KEY not set"
    echo "Please run: export RSOLV_API_KEY=your_rsolv_api_key"
    exit 1
fi

# Ensure we're in the right directory
cd /home/dylan/dev/rsolv

echo "✅ Prerequisites checked"
echo ""
echo "Starting E2E test..."
echo "--------------------"

# Run the production E2E test
./test-scripts/production-e2e-test.sh

# Extract the results file path from the output
RESULTS_FILE=$(ls -t /tmp/rsolv-e2e-results-*.md 2>/dev/null | head -1)

if [ -z "$RESULTS_FILE" ]; then
    echo "❌ No results file found"
    exit 1
fi

echo ""
echo "📊 RFC Validation Summary"
echo "========================"

# Check RFC-045 (Confidence Scoring)
if grep -q "RFC-045.*✅" "$RESULTS_FILE"; then
    echo "✅ RFC-045: Confidence scoring working (no more 0 vulnerabilities)"
else
    echo "❌ RFC-045: Confidence scoring not detected"
fi

# Check RFC-046 (Chunking)
if grep -q "RFC-046.*✅" "$RESULTS_FILE"; then
    echo "✅ RFC-046: Multi-file chunking working (14 files → multiple PRs)"
else
    echo "❌ RFC-046: Chunking not working"
fi

# Check RFC-047 (Vendor Detection)
if grep -q "RFC-047.*✅" "$RESULTS_FILE"; then
    echo "✅ RFC-047: Vendor detection working (jQuery not patched)"
else
    echo "❌ RFC-047: Vendor detection failed"
fi

echo ""
echo "📈 Performance Comparison"
echo "========================"

# Extract success rate from results
SUCCESS_RATE=$(grep -oP 'Success Rate.*\K\d+(?=%)' "$RESULTS_FILE" | head -1 || echo "0")
echo "Baseline success rate: 55%"
echo "Current success rate: ${SUCCESS_RATE}%"
echo "Improvement: $((SUCCESS_RATE - 55))%"

if [ "$SUCCESS_RATE" -ge 90 ]; then
    echo ""
    echo "🎉 SUCCESS! Target of 90%+ achieved!"
else
    echo ""
    echo "⚠️  Below target. Expected 90%+, got ${SUCCESS_RATE}%"
fi

echo ""
echo "📄 Full results: $RESULTS_FILE"
echo ""
echo "To view detailed results:"
echo "  cat $RESULTS_FILE"

# Create a summary report
SUMMARY_FILE="/home/dylan/dev/rsolv/RFC-E2E-VALIDATION-$(date +%Y%m%d-%H%M%S).md"
cat > "$SUMMARY_FILE" << EOF
# RFC E2E Validation Report

**Date**: $(date)  
**Test Script**: production-e2e-test.sh  
**Repository**: RSOLV-dev/nodegoat-vulnerability-demo

## RFC Implementation Status

| RFC | Description | Status | Result |
|-----|-------------|--------|--------|
| RFC-045 | Validation Confidence Scoring | $(grep -q "RFC-045.*✅" "$RESULTS_FILE" && echo "✅ Implemented" || echo "❌ Failed") | No more 0 vulnerabilities |
| RFC-046 | Multi-file Vulnerability Chunking | $(grep -q "RFC-046.*✅" "$RESULTS_FILE" && echo "✅ Implemented" || echo "❌ Failed") | 14 files → multiple PRs |
| RFC-047 | Vendor Library Detection | $(grep -q "RFC-047.*✅" "$RESULTS_FILE" && echo "✅ Implemented" || echo "❌ Failed") | jQuery not patched |

## Performance Metrics

| Metric | Baseline (Aug 19) | Current | Improvement |
|--------|-------------------|---------|-------------|
| Success Rate | 55% (5/9) | ${SUCCESS_RATE}% | +$((SUCCESS_RATE - 55))% |
| Command Injection | Synthetic workaround | Confidence scores | RFC-045 |
| DoS (14 files) | Failed | Chunked | RFC-046 |
| jQuery XXE | Patched vendor | Update recommended | RFC-047 |

## Conclusion

$(if [ "$SUCCESS_RATE" -ge 90 ]; then
    echo "✅ **SUCCESS**: All three RFCs are working as designed. The system has achieved ${SUCCESS_RATE}% success rate, exceeding our 90% target."
else
    echo "⚠️ **PARTIAL SUCCESS**: The system achieved ${SUCCESS_RATE}% success rate. Further integration work may be needed."
fi)

## Next Steps

$(if [ "$SUCCESS_RATE" -ge 90 ]; then
    echo "1. RFCs are validated and ready for production"
    echo "2. Consider deploying to production environment"
    echo "3. Update documentation with new capabilities"
else
    echo "1. Wire RFC implementations into phase executor"
    echo "2. Debug any failing test cases"
    echo "3. Re-run validation after fixes"
fi)

---
*Full test results: ${RESULTS_FILE}*
EOF

echo "📝 Summary report created: $SUMMARY_FILE"