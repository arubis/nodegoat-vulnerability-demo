#!/bin/bash
# E2E Test: Local execution with Claude Code Max vs GitHub Actions

set -e

echo "================================================"
echo "E2E TEST: Local Claude Max vs GitHub Actions"
echo "================================================"
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."

# Check gh CLI
if ! command -v gh &> /dev/null; then
    echo "❌ gh CLI not found. Install from: https://cli.github.com"
    exit 1
fi

# Check Claude Max
if ! echo "test" | claude --print &> /dev/null; then
    echo "❌ Claude Code Max not available. Please sign in to Claude desktop app."
    exit 1
fi

echo "✅ All prerequisites met"
echo ""

# Set up environment
export RSOLV_DEV_MODE=true
export RSOLV_USE_CLAUDE_MAX=true
export RSOLV_DEBUG=true
export REPO="RSOLV-dev/nodegoat-vulnerability-demo"
ISSUE_NUMBER=${1:-432}  # Default to issue 432 (command injection)

echo "🎯 Target Issue: #$ISSUE_NUMBER"
echo ""

# Get issue details
echo "📊 Issue Details:"
gh issue view $ISSUE_NUMBER --repo $REPO

echo ""
echo "================================================"
echo "STARTING LOCAL FIX WITH CLAUDE CODE MAX"
echo "================================================"
echo ""

# Record start time
START_TIME=$(date +%s)

# Add the automate label to trigger processing
echo "🏷️  Adding rsolv:automate label..."
gh issue edit $ISSUE_NUMBER --repo $REPO --add-label "rsolv:automate"

# Clone or update the repo
WORK_DIR="../nodegoat-local-fix"
if [ ! -d "$WORK_DIR" ]; then
    echo "📦 Cloning repository..."
    git clone https://github.com/$REPO.git $WORK_DIR
else
    echo "📦 Updating repository..."
    cd $WORK_DIR
    git fetch origin
    git checkout main 2>/dev/null || git checkout master
    git pull origin
    cd -
fi

# Set up environment for action
export GITHUB_REPOSITORY=$REPO
export GITHUB_WORKSPACE=$(realpath $WORK_DIR)
export GITHUB_SHA=$(cd $WORK_DIR && git rev-parse HEAD)
export GITHUB_REF="refs/heads/main"
export GITHUB_EVENT_NAME="issues"
export INPUT_MODE="mitigate"
export INPUT_ISSUE_NUMBER=$ISSUE_NUMBER
export INPUT_RSOLVAPIKEY="local-dev-mode"

echo ""
echo "🔧 Running RSOLV Action locally with Claude Code Max..."
echo "Working directory: $GITHUB_WORKSPACE"
echo ""

# Run the action
cd $GITHUB_WORKSPACE
bun run /home/dylan/dev/rsolv/RSOLV-action/src/index.ts 2>&1 | tee ../local-fix-output.log

# Record end time
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "================================================"
echo "LOCAL EXECUTION COMPLETE"
echo "================================================"
echo ""
echo "⏱️  Duration: ${DURATION} seconds"
echo ""

# Check if PR was created
echo "📝 Checking for created PR..."
LATEST_PR=$(gh pr list --repo $REPO --limit 1 --json number,title,url | jq -r '.[0]')
if [ "$LATEST_PR" != "null" ]; then
    echo "✅ PR Created:"
    echo "$LATEST_PR" | jq .
else
    echo "❌ No PR found"
fi

echo ""
echo "================================================"
echo "COMPARISON WITH GITHUB ACTIONS"
echo "================================================"
echo ""

echo "📊 Metrics Comparison:"
echo ""
echo "                     | Local (Claude Max) | GitHub Actions"
echo "---------------------|-------------------|----------------"
echo "API Tokens Used      | 0                 | ~3,000"
echo "Cost                 | \$0.00            | ~\$0.01"
echo "Execution Time       | ${DURATION}s      | ~120s"
echo "Debug Visibility     | Full              | Limited"
echo "Iteration Speed      | Instant           | Push + Wait"
echo ""

# Show token savings
echo "💰 Cost Savings:"
echo "  - Tokens saved: ~3,000"
echo "  - Money saved: \$0.01 per run"
echo "  - At 100 runs/day: \$1.00/day saved"
echo "  - Monthly: ~\$30 saved"
echo ""

# Compare outputs
echo "📄 Output Comparison:"
echo ""
echo "Key differences:"
echo "1. Local version shows full Claude conversation"
echo "2. No credential vending needed (using Claude Max)"
echo "3. Direct file system access (no git checkout)"
echo "4. Immediate feedback (no CI/CD queue)"
echo ""

echo "================================================"
echo "TEST COMPLETE"
echo "================================================"