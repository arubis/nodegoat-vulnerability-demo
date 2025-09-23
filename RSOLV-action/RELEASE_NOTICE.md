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
