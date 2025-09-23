#!/bin/bash
set -e

echo "=========================================="
echo "RSOLV E2E Test with Claude Code Max"
echo "Date: $(date)"
echo "=========================================="
echo ""

# Configuration for local testing with Claude Max
export RSOLV_API_KEY="internal_c9d0a3569b45597be41a44ca007abd5c"  # Updated database key
export GITHUB_TOKEN=$(gh auth token)
export GITHUB_REPOSITORY="RSOLV-dev/nodegoat-vulnerability-demo"
export GITHUB_WORKSPACE="$(pwd)"
export LOG_LEVEL="info"

# Enable Claude Code Max for development
export USE_CLAUDE_CODE_MAX="true"
export CLAUDE_MODEL="sonnet"  # Use Claude CLI with Sonnet model

# Use Extended Conversation instead of chunking
export USE_EXTENDED_CONVERSATION="true"

echo "Configuration:"
echo "- RSOLV API Key: ${RSOLV_API_KEY:0:20}... (internal key - full access)"
echo "- Repository: $GITHUB_REPOSITORY"
echo "- Claude Mode: Claude Code Max (local CLI)"
echo "- Multi-file handling: Extended Conversation"
echo ""

# Check Claude CLI is available
if ! command -v claude &> /dev/null; then
    echo "❌ Claude CLI not found. Please install Claude Code Max."
    exit 1
fi
echo "✅ Claude CLI found at: $(which claude)"
echo ""

# Phase 1: SCAN
echo "=========================================="
echo "PHASE 1: SCAN - Finding vulnerabilities"
echo "=========================================="
echo ""

export INPUT_MODE="scan"
echo "Starting scan phase..."
echo "Note: This will find 30 JavaScript patterns (full access)"
echo ""

timeout 300 bun run src/index.ts 2>&1 | tee scan-phase.log || true

echo ""
TOTAL_VULNS=$(grep "Total vulnerabilities:" scan-phase.log | tail -1 | grep -oE "[0-9]+" || echo "0")
ISSUES_CREATED=$(grep -c "Created issue #" scan-phase.log || echo "0")

echo "Scan Results:"
echo "- Vulnerabilities found: $TOTAL_VULNS"
echo "- Issues created: $ISSUES_CREATED"
echo ""

if [ "$ISSUES_CREATED" -eq "0" ]; then
    echo "No issues created. Checking existing issues..."
    gh issue list --repo $GITHUB_REPOSITORY --label "security-vulnerability" --limit 5
    echo ""
fi

# Phase 2: MITIGATE (using Claude Code Max)
echo "=========================================="
echo "PHASE 2: MITIGATE - Fix with Claude Code Max"
echo "=========================================="
echo ""

# Get the latest issue number
LATEST_ISSUE=$(gh issue list --repo $GITHUB_REPOSITORY --label "security-vulnerability" --limit 1 --json number --jq '.[0].number')

if [ -z "$LATEST_ISSUE" ]; then
    echo "❌ No security issues found to fix"
    exit 1
fi

echo "Testing fix for issue #$LATEST_ISSUE"
echo ""

# Create a test script for single issue fix
cat > test-single-fix.ts << 'EOF'
import { phaseExecutor } from './src/modes/phase-executor/index.js';
import { logger } from './src/utils/logger.js';

const issueNumber = process.argv[2];
if (!issueNumber) {
  console.error('Usage: bun run test-single-fix.ts <issue-number>');
  process.exit(1);
}

logger.info(`Testing MITIGATE phase for issue #${issueNumber}`);

// Set up config for Claude Code Max
process.env.USE_CLAUDE_CODE_MAX = 'true';
process.env.CLAUDE_MODEL = 'sonnet';

phaseExecutor({
  mode: 'mitigate',
  issueNumber: parseInt(issueNumber),
  useClaudeCodeMax: true
}).then(result => {
  logger.info('Fix result:', result);
  process.exit(result.success ? 0 : 1);
}).catch(error => {
  logger.error('Fix failed:', error);
  process.exit(1);
});
EOF

echo "Running MITIGATE with Claude Code Max for issue #$LATEST_ISSUE..."
echo "This will use your local Claude CLI (no API tokens consumed)"
echo ""

timeout 600 bun run test-single-fix.ts $LATEST_ISSUE 2>&1 | tee mitigate-phase.log || true

# Check results
if grep -q "Pull request created successfully" mitigate-phase.log; then
    echo ""
    echo "✅ Fix successful! PR created."
    PR_URL=$(grep "Pull request URL:" mitigate-phase.log | grep -oE "https://[^ ]+")
    echo "PR: $PR_URL"
else
    echo ""
    echo "⚠️ Fix may have failed. Check mitigate-phase.log for details."
fi

echo ""
echo "=========================================="
echo "E2E Test Complete"
echo "=========================================="
echo ""
echo "Summary:"
echo "1. Pattern Access: $([ "$TOTAL_VULNS" -gt "20" ] && echo "✅ Full (30 patterns)" || echo "⚠️ Limited")"
echo "2. Claude Code Max: $(grep -q "Using Claude Code CLI" mitigate-phase.log && echo "✅ Used" || echo "⚠️ Not used")"
echo "3. Extended Conversation: $(grep -q "extended conversation" mitigate-phase.log && echo "✅ Used" || echo "⚠️ Not used")"
echo ""
echo "Check the logs for details:"
echo "- scan-phase.log"
echo "- mitigate-phase.log"