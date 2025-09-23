#!/bin/bash
# RSOLV Test Generation - Staging Monitoring Script

set -e

echo "📊 RSOLV Test Generation - Staging Monitor"
echo "=========================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to check workflow status
check_workflow_status() {
    echo -e "\n${YELLOW}Recent Staging Test Runs:${NC}"
    gh run list --workflow=staging-test-generation.yml --limit 5 | while read -r line; do
        if [[ $line == *"completed"* ]] && [[ $line == *"success"* ]]; then
            echo -e "${GREEN}✅ $line${NC}"
        elif [[ $line == *"completed"* ]] && [[ $line == *"failure"* ]]; then
            echo -e "${RED}❌ $line${NC}"
        else
            echo -e "${YELLOW}🔄 $line${NC}"
        fi
    done
}

# Function to check test generation metrics
check_test_metrics() {
    echo -e "\n${YELLOW}Test Generation Metrics:${NC}"
    
    # Get the latest successful run
    LATEST_RUN=$(gh run list --workflow=staging-test-generation.yml --status success --limit 1 --json databaseId --jq '.[0].databaseId')
    
    if [ -n "$LATEST_RUN" ]; then
        echo "Analyzing run #$LATEST_RUN..."
        
        # Download logs
        gh run download $LATEST_RUN -n logs 2>/dev/null || true
        
        # Extract metrics from logs
        if [ -d "logs" ]; then
            echo -e "\n${GREEN}Framework Detection:${NC}"
            grep -h "Framework detected" logs/*.txt 2>/dev/null | tail -5 || echo "No framework detection logs found"
            
            echo -e "\n${GREEN}Test Generation Success:${NC}"
            grep -h "Generated test code" logs/*.txt 2>/dev/null | wc -l | xargs echo "Total tests generated:"
            
            echo -e "\n${GREEN}Fix Validation:${NC}"
            grep -h "Fix validated successfully" logs/*.txt 2>/dev/null | wc -l | xargs echo "Successful validations:"
            grep -h "Fix validation failed" logs/*.txt 2>/dev/null | wc -l | xargs echo "Failed validations:"
            
            echo -e "\n${GREEN}Iteration Counts:${NC}"
            grep -h "attempt [0-9]*/[0-9]*" logs/*.txt 2>/dev/null | tail -5 || echo "No iteration logs found"
            
            # Clean up
            rm -rf logs
        fi
    else
        echo -e "${RED}No successful runs found${NC}"
    fi
}

# Function to check generated PRs
check_generated_prs() {
    echo -e "\n${YELLOW}Generated PRs (last 24h):${NC}"
    
    # List PRs created in last 24 hours with STAGING prefix
    gh pr list --search "created:>$(date -d '24 hours ago' '+%Y-%m-%d') [STAGING]" --json number,title,state,files --jq '.[] | "\(.state) PR #\(.number): \(.title) (\(.files | length) files)"'
}

# Function to show test quality summary
check_test_quality() {
    echo -e "\n${YELLOW}Test Quality Check:${NC}"
    
    # Get latest staging PR
    LATEST_PR=$(gh pr list --search "[STAGING]" --limit 1 --json number --jq '.[0].number')
    
    if [ -n "$LATEST_PR" ]; then
        echo "Analyzing PR #$LATEST_PR..."
        
        # Check PR files
        FILES=$(gh pr view $LATEST_PR --json files --jq '.files[].path')
        
        TEST_FILES=$(echo "$FILES" | grep -E "(test|spec)\." | wc -l)
        TOTAL_FILES=$(echo "$FILES" | wc -l)
        
        echo "Test files: $TEST_FILES / $TOTAL_FILES"
        
        # Check PR body for test results
        if gh pr view $LATEST_PR --json body --jq '.body' | grep -q "Test Results:"; then
            echo -e "${GREEN}✅ PR includes test validation results${NC}"
        else
            echo -e "${YELLOW}⚠️  PR missing test validation results${NC}"
        fi
    else
        echo -e "${RED}No staging PRs found${NC}"
    fi
}

# Function to show performance metrics
check_performance() {
    echo -e "\n${YELLOW}Performance Metrics:${NC}"
    
    LATEST_RUN=$(gh run list --workflow=staging-test-generation.yml --status success --limit 1 --json databaseId,duration --jq '.[0]')
    
    if [ -n "$LATEST_RUN" ]; then
        DURATION=$(echo $LATEST_RUN | jq -r '.duration')
        echo "Latest run duration: ${DURATION}ms"
        
        # Calculate average from last 5 runs
        AVG_DURATION=$(gh run list --workflow=staging-test-generation.yml --status success --limit 5 --json duration --jq '[.[].duration] | add / length')
        echo "Average duration (last 5): ${AVG_DURATION}ms"
    fi
}

# Main monitoring loop
main() {
    while true; do
        clear
        echo "📊 RSOLV Test Generation - Staging Monitor"
        echo "=========================================="
        echo "Last updated: $(date)"
        
        check_workflow_status
        check_test_metrics
        check_generated_prs
        check_test_quality
        check_performance
        
        echo -e "\n${YELLOW}Press Ctrl+C to exit, refreshing in 30 seconds...${NC}"
        sleep 30
    done
}

# Handle command line arguments
case "${1:-}" in
    "once")
        # Run once and exit
        check_workflow_status
        check_test_metrics
        check_generated_prs
        check_test_quality
        check_performance
        ;;
    "metrics")
        # Just show metrics
        check_test_metrics
        ;;
    "prs")
        # Just show PRs
        check_generated_prs
        ;;
    "quality")
        # Just show quality
        check_test_quality
        ;;
    *)
        # Run continuous monitoring
        main
        ;;
esac