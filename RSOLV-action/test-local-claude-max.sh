#!/bin/bash
set -e

echo "==================================="
echo "RSOLV E2E Test - Local Claude Code Max"
echo "Processing Issues with Local Development Setup"
echo "Date: $(date)"
echo "==================================="

# Ensure we're using the master API key for pattern access
export RSOLV_API_KEY="rsolv_master_key_984c92f8c96d95167a2cf9bc8de288bb"
export GITHUB_TOKEN=$(gh auth token)
export RSOLV_DEV_MODE="true"
export RSOLV_USE_CLAUDE_MAX="true"

echo ""
echo "Environment configured:"
echo "- RSOLV_API_KEY: ${RSOLV_API_KEY:0:20}... (for patterns)"
echo "- Dev Mode: $RSOLV_DEV_MODE"
echo "- Claude Max: $RSOLV_USE_CLAUDE_MAX"
echo "- Claude Model: sonnet (latest)"
echo ""

# Check for existing issues
echo "Checking for existing RSOLV issues..."
ISSUES=$(gh issue list -R RSOLV-dev/nodegoat-vulnerability-demo -l "rsolv:detected" --json number,title,state)
echo "$ISSUES" | jq -r '.[] | "#\(.number): \(.title) [\(.state)]"'

# Get first open issue
ISSUE_NUMBER=$(echo "$ISSUES" | jq -r '.[] | select(.state == "OPEN") | .number' | head -1)

if [ -z "$ISSUE_NUMBER" ]; then
    echo ""
    echo "No open issues found. Run the scan first:"
    echo "./test-scan-with-full-api.sh"
    exit 1
fi

echo ""
echo "Processing issue #$ISSUE_NUMBER with Claude Code Max..."
echo ""

# Run the local fix runner
bun run local-fix-runner.ts --repo RSOLV-dev/nodegoat-vulnerability-demo --issue "$ISSUE_NUMBER" --model sonnet 2>&1 | tee "fix-issue-$ISSUE_NUMBER.log"

echo ""
echo "==================================="
echo "Local Claude Max Processing Complete"
echo "==================================="

echo ""
echo "Check the results:"
echo "- Log file: fix-issue-$ISSUE_NUMBER.log"
echo "- Pull request: gh pr list -R RSOLV-dev/nodegoat-vulnerability-demo"
echo "- Issue status: gh issue view $ISSUE_NUMBER -R RSOLV-dev/nodegoat-vulnerability-demo"