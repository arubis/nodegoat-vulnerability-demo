#!/bin/bash
# Update demo repository workflows to v3.5.0 for phase data persistence

set -e

REPO="RSOLV-dev/nodegoat-vulnerability-demo"
echo "=== Updating $REPO workflows to v3.5.0 ==="

# Clone the repository
TEMP_DIR=$(mktemp -d)
cd $TEMP_DIR
gh repo clone $REPO . -- --depth=1

# Update all workflow files
for workflow in .github/workflows/rsolv-*.yml; do
  if [ -f "$workflow" ]; then
    echo "Updating $workflow..."
    sed -i 's/RSOLV-dev\/rsolv-action@v[0-9]\+\.[0-9]\+\.[0-9]\+/RSOLV-dev\/rsolv-action@v3.5.0/g' "$workflow"
    
    # Also ensure rsolvApiKey is used instead of api_key
    sed -i 's/api_key: /rsolvApiKey: /g' "$workflow"
  fi
done

# Show the changes
echo -e "\n=== Changes made ==="
git diff

# Commit and push
git add .github/workflows/
git commit -m "chore: Update RSOLV workflows to v3.5.0 for phase data persistence

- Update all workflows to use RSOLV-action v3.5.0
- Change api_key to rsolvApiKey for platform integration
- Enable phase data persistence across workflow runs" || echo "No changes needed"

git push || echo "Push failed - may need manual intervention"

cd -
rm -rf $TEMP_DIR

echo "✅ Workflows updated to v3.5.0"