#!/bin/bash
# RFC-008 - Deprecate old GitHub Action versions containing proprietary patterns

echo "RFC-008: Deprecating old GitHub Action versions"
echo "==============================================="
echo ""
echo "This script will remove tags that contain proprietary patterns"
echo ""

# List of tags to remove (versions before sanitization)
OLD_TAGS=(
  "v1"
  "v1.3.0-webhook-integration"
  "v1.4.0-vended-fix"
  "v1.4.1-timeout-fix"
  "v1.4.2-analyzer-fix"
  "v1.4.3-timeout-increase"
  "day5-demo-v1"
  "day-5-complete"
  "day-5-complete-ollama"
  "pre-public-backup"
)

echo "Tags to be removed:"
printf '%s\n' "${OLD_TAGS[@]}"
echo ""

read -p "Are you sure you want to delete these tags? (yes/no): " confirm
if [[ "$confirm" != "yes" ]]; then
    echo "Deprecation cancelled."
    exit 1
fi

echo ""
echo "Deleting local tags..."
for tag in "${OLD_TAGS[@]}"; do
    if git tag -l | grep -q "^${tag}$"; then
        git tag -d "$tag"
        echo "✓ Deleted local tag: $tag"
    else
        echo "- Local tag not found: $tag"
    fi
done

echo ""
echo "Deleting remote tags..."
for tag in "${OLD_TAGS[@]}"; do
    if git ls-remote --tags origin | grep -q "refs/tags/${tag}"; then
        git push origin --delete "refs/tags/$tag"
        echo "✓ Deleted remote tag: $tag"
    else
        echo "- Remote tag not found: $tag"
    fi
done

echo ""
echo "Creating new release notice..."
cat > RELEASE_NOTICE.md << 'EOF'
# Important Notice: Old Versions Deprecated

All versions of RSOLV-action prior to v2.0.0 have been deprecated and removed due to a security architecture update.

## Why were old versions removed?

We've transitioned from hardcoded security patterns to a dynamic API-based pattern system. This change:
- Improves security pattern management
- Enables real-time pattern updates
- Provides better protection for our intellectual property

## Migration Guide

If you were using an old version, please update to v2.0.0 or later:

```yaml
- uses: RSOLV-dev/rsolv-action@v2
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    rsolv-api-key: ${{ secrets.RSOLV_API_KEY }}
```

## What's Changed?

- Security patterns are now served via API
- Improved pattern detection with 448+ patterns
- Better performance and caching
- Enterprise-grade pattern tiers

For more information, see our [documentation](https://docs.rsolv.dev).
EOF

echo ""
echo "Deprecation complete!"
echo ""
echo "Next steps:"
echo "1. Create a new v2.0.0 release with the sanitized codebase"
echo "2. Update marketplace listing to reference v2.0.0"
echo "3. Publish RELEASE_NOTICE.md with the new release"
echo "4. Update documentation to reference new version"