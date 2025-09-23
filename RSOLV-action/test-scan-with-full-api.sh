#!/bin/bash
set -e

echo "==================================="
echo "RSOLV E2E Test - SCAN Phase"
echo "Using Master API Key for Full Access"
echo "Date: $(date)"
echo "==================================="

# Clean up any previous test artifacts
rm -f scan-output.log scan-issues.json

# Set up environment with master API key
export RSOLV_API_KEY="rsolv_master_key_984c92f8c96d95167a2cf9bc8de288bb"
export GITHUB_TOKEN=$(gh auth token)
export GITHUB_REPOSITORY="RSOLV-dev/nodegoat-vulnerability-demo"
export GITHUB_WORKSPACE="$(pwd)"
export INPUT_MODE="scan"

# Enable verbose logging
export DEBUG="*"
export LOG_LEVEL="debug"

echo ""
echo "Environment configured:"
echo "- RSOLV_API_KEY: ${RSOLV_API_KEY:0:20}..."
echo "- Repository: $GITHUB_REPOSITORY"
echo "- Mode: $INPUT_MODE"
echo ""

echo "Starting SCAN phase..."
echo "This will take several minutes due to sequential file fetching."
echo ""

# Run the scan with timeout and capture output
timeout 600 bun run src/index.ts 2>&1 | tee scan-output.log

echo ""
echo "==================================="
echo "SCAN Phase Complete"
echo "==================================="

# Extract summary from logs
echo ""
echo "Summary:"
grep -E "Total vulnerabilities:|Created issues:|Scan completed in" scan-output.log || true

# Show created issues
echo ""
echo "Created Issues:"
grep -E "Created issue #|#[0-9]+:" scan-output.log || true

echo ""
echo "Full log saved to: scan-output.log"
echo ""
echo "To view issues in the repository:"
echo "gh issue list -R RSOLV-dev/nodegoat-vulnerability-demo -L 50"