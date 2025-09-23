#!/bin/bash
set -e

echo "=========================================="
echo "RSOLV SCAN with Local Patterns (24 patterns)"
echo "Date: $(date)"
echo "=========================================="
echo ""

# Force local patterns by not providing API key
unset RSOLV_API_KEY
export GITHUB_TOKEN=$(gh auth token)
export GITHUB_REPOSITORY="RSOLV-dev/nodegoat-vulnerability-demo"
export GITHUB_WORKSPACE="$(pwd)"
export INPUT_MODE="scan"
export DEBUG="*"
export LOG_LEVEL="debug"

echo "Configuration:"
echo "- RSOLV API Key: NOT SET (will use local patterns)"
echo "- Repository: $GITHUB_REPOSITORY"
echo "- Expected patterns: 24 local patterns"
echo ""

echo "Starting SCAN with local patterns..."
timeout 600 bun run src/index.ts 2>&1 | tee scan-local-patterns.log

echo ""
echo "Extracting results..."
TOTAL_VULNS=$(grep "Total vulnerabilities:" scan-local-patterns.log | tail -1 | grep -oE "[0-9]+" || echo "0")
ISSUES_CREATED=$(grep -c "Created issue #" scan-local-patterns.log || echo "0")

echo ""
echo "=========================================="
echo "SCAN RESULTS"
echo "=========================================="
echo "- Vulnerabilities found: $TOTAL_VULNS"
echo "- Issues created: $ISSUES_CREATED"
echo ""

echo "To view created issues:"
echo "gh issue list -R RSOLV-dev/nodegoat-vulnerability-demo -l rsolv:detected"