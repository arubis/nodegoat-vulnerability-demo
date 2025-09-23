#!/bin/bash
set -e

echo "=========================================="
echo "RSOLV Full E2E Test - SCAN → VALIDATE → MITIGATE"
echo "Date: $(date)"
echo "=========================================="
echo ""

# Configuration
export RSOLV_API_KEY="rsolv_master_key_984c92f8c96d95167a2cf9bc8de288bb"
export GITHUB_TOKEN=$(gh auth token)
export GITHUB_REPOSITORY="RSOLV-dev/nodegoat-vulnerability-demo"
export GITHUB_WORKSPACE="$(pwd)"
export DEBUG="*"
export LOG_LEVEL="debug"

echo "Configuration:"
echo "- RSOLV API Key: ${RSOLV_API_KEY:0:20}... (master key for full patterns)"
echo "- Repository: $GITHUB_REPOSITORY"
echo "- Claude Model: claude-sonnet-4-20250514"
echo ""

# Phase 1: SCAN
echo "=========================================="
echo "PHASE 1: SCAN - Finding vulnerabilities"
echo "=========================================="
echo ""

export INPUT_MODE="scan"
echo "Starting scan phase (this will take 2-3 minutes)..."
timeout 600 bun run src/index.ts 2>&1 | tee scan-phase.log

echo ""
echo "Scan complete. Extracting results..."
TOTAL_VULNS=$(grep "Total vulnerabilities:" scan-phase.log | tail -1 | grep -oE "[0-9]+")
ISSUES_CREATED=$(grep -c "Created issue #" scan-phase.log || echo "0")

echo "- Vulnerabilities found: $TOTAL_VULNS"
echo "- Issues created: $ISSUES_CREATED"
echo ""

# Phase 2: VALIDATE
echo "=========================================="
echo "PHASE 2: VALIDATE - Using AST to eliminate false positives"
echo "=========================================="
echo ""

echo "AST validation is integrated into the scan phase."
FILTERED=$(grep "false positives filtered out" scan-phase.log | tail -1 | grep -oE "[0-9]+" || echo "0")
echo "- False positives filtered: $FILTERED"
echo ""

# Get list of created issues
echo "Fetching created issues..."
ISSUES=$(gh issue list -R RSOLV-dev/nodegoat-vulnerability-demo -l "rsolv:detected" --state open --json number,title | jq -r '.[] | "#\(.number): \(.title)"')
echo "$ISSUES"
echo ""

# Phase 3: MITIGATE (using Claude Code Max for one issue)
echo "=========================================="
echo "PHASE 3: MITIGATE - Fixing vulnerabilities"
echo "=========================================="
echo ""

# Get first issue number
FIRST_ISSUE=$(echo "$ISSUES" | head -1 | grep -oE "#[0-9]+" | grep -oE "[0-9]+")

if [ -n "$FIRST_ISSUE" ]; then
    echo "Processing issue #$FIRST_ISSUE with Claude Code Max..."
    echo ""
    
    # Set up for Claude Max
    export RSOLV_DEV_MODE="true"
    export RSOLV_USE_CLAUDE_MAX="true"
    export CLAUDE_MODEL="sonnet"
    
    # Run the local fix runner
    bun run local-fix-runner.ts --repo RSOLV-dev/nodegoat-vulnerability-demo --issue "$FIRST_ISSUE" --model sonnet 2>&1 | tee "mitigate-issue-$FIRST_ISSUE.log"
    
    echo ""
    echo "Mitigation complete for issue #$FIRST_ISSUE"
else
    echo "No issues found to mitigate. Run scan first if needed."
fi

echo ""
echo "=========================================="
echo "E2E TEST SUMMARY"
echo "=========================================="
echo ""

# Summary
echo "SCAN Phase:"
echo "- Total vulnerabilities detected: $TOTAL_VULNS"
echo "- Issues created: $ISSUES_CREATED"
echo ""

echo "VALIDATE Phase:"
echo "- False positives eliminated: $FILTERED"
echo "- Effective vulnerabilities: $((TOTAL_VULNS - FILTERED))"
echo ""

echo "MITIGATE Phase:"
if [ -n "$FIRST_ISSUE" ]; then
    echo "- Processed issue #$FIRST_ISSUE"
    echo "- Check PR: gh pr list -R RSOLV-dev/nodegoat-vulnerability-demo"
else
    echo "- No issues to process"
fi
echo ""

echo "Logs saved:"
echo "- scan-phase.log"
[ -n "$FIRST_ISSUE" ] && echo "- mitigate-issue-$FIRST_ISSUE.log"
echo ""

echo "Next steps:"
echo "1. Review created issues: gh issue list -R RSOLV-dev/nodegoat-vulnerability-demo -l rsolv:detected"
echo "2. Check pull requests: gh pr list -R RSOLV-dev/nodegoat-vulnerability-demo"
echo "3. Compare with documented vulnerabilities in nodegoat-vulnerability-demo/VULNERABILITIES.md"