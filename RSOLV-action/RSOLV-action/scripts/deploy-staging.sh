#!/bin/bash
# RSOLV Test Generation - Staging Deployment Script

set -e

echo "🚀 RSOLV Test Generation - Staging Deployment"
echo "============================================"

# Check if we're on the right branch
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"

# Ensure we have the latest changes
echo "📥 Pulling latest changes..."
git pull origin $CURRENT_BRANCH

# Run tests
echo "🧪 Running test suite..."
npm test || { echo "❌ Tests failed. Aborting deployment."; exit 1; }

# Build the action
echo "🔨 Building action..."
npm run build || { echo "❌ Build failed. Aborting deployment."; exit 1; }

# Create staging tag
TIMESTAMP=$(date +%Y%m%d%H%M%S)
STAGING_TAG="v1.0.0-staging.$TIMESTAMP"
echo "🏷️  Creating staging tag: $STAGING_TAG"

# Tag the release
git tag -a $STAGING_TAG -m "Staging deployment: Test Generation Framework

Features:
- Intelligent test framework detection (15+ frameworks)
- Multi-language test generation (JS, TS, Python, Ruby, PHP, Java)
- Fix validation with iterative testing
- Coverage gap analysis
- Red-green-refactor pattern generation

Configuration:
- Enable with ENABLE_TEST_GENERATION=true
- Enable fix validation with ENABLE_FIX_VALIDATION=true
- Configure languages with TEST_GEN_LANGUAGES"

# Push the tag
echo "📤 Pushing tag to GitHub..."
git push origin $STAGING_TAG

echo "✅ Staging deployment complete!"
echo ""
echo "Next steps:"
echo "1. The staging workflow will automatically trigger"
echo "2. Monitor the workflow at: https://github.com/$GITHUB_REPOSITORY/actions"
echo "3. Test using the staging workflow: .github/workflows/staging-test-generation.yml"
echo ""
echo "To trigger a staging test:"
echo "gh workflow run staging-test-generation.yml --field test_scenario=all"