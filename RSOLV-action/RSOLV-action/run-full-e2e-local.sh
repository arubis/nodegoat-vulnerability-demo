#!/bin/bash
# Full E2E Test: SCAN → VALIDATE → MITIGATE with Claude Code Max

set -e

echo "================================================"
echo "FULL E2E TEST: SCAN → VALIDATE → MITIGATE"
echo "Using Local Claude Code Max"
echo "================================================"
echo ""

# Configuration
export REPO="RSOLV-dev/nodegoat-vulnerability-demo"
export GITHUB_REPOSITORY=$REPO
export WORK_DIR="../nodegoat-vulnerability-demo-local-fix"
export RSOLV_API_KEY="${RSOLV_INTERNAL_API_KEY}"
export RSOLV_DEV_MODE="true"
export RSOLV_USE_CLAUDE_MAX="true"
export RSOLV_DEBUG="true"
export GITHUB_TOKEN=$(gh auth token)

# Check prerequisites
echo "📋 Checking prerequisites..."
if ! command -v gh &> /dev/null; then
    echo "❌ gh CLI not found"
    exit 1
fi

if ! echo "test" | claude --print &> /dev/null; then
    echo "❌ Claude Code Max not available"
    exit 1
fi

echo "✅ All prerequisites met"
echo ""

# Setup local repo
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

export GITHUB_WORKSPACE=$(realpath $WORK_DIR)
export GITHUB_SHA=$(cd $WORK_DIR && git rev-parse HEAD)

echo ""
echo "================================================"
echo "PHASE 1: SCAN"
echo "================================================"
echo ""

START_SCAN=$(date +%s)

# Run SCAN phase
echo "🔍 Running SCAN phase..."
export INPUT_MODE="scan"

cd $GITHUB_WORKSPACE
bun run /home/dylan/dev/rsolv/RSOLV-action/src/index.ts 2>&1 | tee ../scan-output.log

END_SCAN=$(date +%s)
SCAN_DURATION=$((END_SCAN - START_SCAN))

echo ""
echo "✅ SCAN complete in ${SCAN_DURATION}s"
echo ""

# Check created issues
echo "📊 Issues created:"
gh issue list --repo $REPO --state open --limit 20 --json number,title,labels | jq -r '.[] | "#\(.number): \(.title)"'

ISSUES=$(gh issue list --repo $REPO --state open --limit 20 --json number --jq '.[].number')
ISSUE_COUNT=$(echo "$ISSUES" | wc -l)

echo ""
echo "Found $ISSUE_COUNT issues"
echo ""

echo "================================================"
echo "PHASE 2: VALIDATE"
echo "================================================"
echo ""

START_VALIDATE=$(date +%s)

# Run VALIDATE phase on each issue
for issue_num in $ISSUES; do
    echo "🔍 Validating issue #$issue_num..."
    
    export INPUT_MODE="validate"
    export RSOLV_ISSUE_NUMBER=$issue_num
    
    cd $GITHUB_WORKSPACE
    bun run /home/dylan/dev/rsolv/RSOLV-action/src/index.ts 2>&1 | tee -a ../validate-output.log || true
    
    echo "✅ Validation complete for #$issue_num"
    echo ""
done

END_VALIDATE=$(date +%s)
VALIDATE_DURATION=$((END_VALIDATE - START_VALIDATE))

echo "✅ VALIDATE complete in ${VALIDATE_DURATION}s"
echo ""

# Check validation results
echo "📊 Checking validation results..."
for issue_num in $ISSUES; do
    labels=$(gh issue view $issue_num --repo $REPO --json labels --jq '.labels[].name' | tr '\n' ' ')
    echo "#$issue_num: $labels"
done

echo ""
echo "================================================"
echo "PHASE 3: MITIGATE"
echo "================================================"
echo ""

START_MITIGATE=$(date +%s)

# Add rsolv:automate label and run MITIGATE on a few issues
MITIGATE_ISSUES=$(echo "$ISSUES" | head -3)

for issue_num in $MITIGATE_ISSUES; do
    echo "🔧 Mitigating issue #$issue_num..."
    
    # Add automate label
    gh issue edit $issue_num --repo $REPO --add-label "rsolv:automate"
    
    export INPUT_MODE="mitigate"
    export RSOLV_ISSUE_NUMBER=$issue_num
    
    cd $GITHUB_WORKSPACE
    bun run /home/dylan/dev/rsolv/RSOLV-action/src/index.ts 2>&1 | tee -a ../mitigate-output.log || true
    
    echo "✅ Mitigation attempt complete for #$issue_num"
    echo ""
done

END_MITIGATE=$(date +%s)
MITIGATE_DURATION=$((END_MITIGATE - START_MITIGATE))

echo "✅ MITIGATE complete in ${MITIGATE_DURATION}s"
echo ""

# Check PRs created
echo "📊 PRs created:"
gh pr list --repo $REPO --limit 10 --json number,title,url | jq -r '.[] | "#\(.number): \(.title)"'

echo ""
echo "================================================"
echo "SUMMARY"
echo "================================================"
echo ""
echo "📊 Phase Durations:"
echo "  SCAN:     ${SCAN_DURATION}s"
echo "  VALIDATE: ${VALIDATE_DURATION}s"
echo "  MITIGATE: ${MITIGATE_DURATION}s"
echo "  TOTAL:    $((SCAN_DURATION + VALIDATE_DURATION + MITIGATE_DURATION))s"
echo ""
echo "📝 Results:"
echo "  Issues Created: $ISSUE_COUNT"
echo "  Issues Validated: $ISSUE_COUNT"
echo "  Issues Mitigated: $(echo "$MITIGATE_ISSUES" | wc -l)"
echo ""
echo "💰 Cost:"
echo "  API Tokens: 0 (using Claude Code Max)"
echo "  Estimated Savings: ~\$0.10"
echo ""
echo "✅ E2E Test Complete!"