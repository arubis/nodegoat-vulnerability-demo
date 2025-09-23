# RSOLV Proactive Security Scanning

RSOLV can now proactively scan your repository for security vulnerabilities and automatically create issues for discovered problems. This enables a complete find-and-fix workflow.

## How It Works

1. **Scan Mode**: RSOLV scans your entire repository for security vulnerabilities
2. **Issue Creation**: Vulnerabilities are grouped by type and GitHub issues are created
3. **Fix Mode**: RSOLV processes the created issues and generates fix PRs

## Usage

### Basic Scan Workflow

```yaml
name: Security Scan and Fix

on:
  schedule:
    - cron: '0 0 * * 1'  # Weekly on Mondays
  workflow_dispatch:

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run Security Scan
        uses: RSOLV-dev/rsolv-action@main
        with:
          api_key: ${{ secrets.RSOLV_API_KEY }}
          scan_mode: scan
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Complete Scan and Fix Workflow

```yaml
name: Complete Security Workflow

on:
  workflow_dispatch:

jobs:
  scan-and-create-issues:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Scan for Vulnerabilities
        id: scan
        uses: RSOLV-dev/rsolv-action@main
        with:
          api_key: ${{ secrets.RSOLV_API_KEY }}
          scan_mode: scan
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          
      - name: Display Results
        run: |
          echo "Found vulnerabilities: ${{ steps.scan.outputs.scan_results }}"
          echo "Created issues: ${{ steps.scan.outputs.created_issues }}"
  
  fix-vulnerabilities:
    needs: scan-and-create-issues
    runs-on: ubuntu-latest
    if: success()
    steps:
      - uses: actions/checkout@v3
      
      - name: Fix Security Issues
        uses: RSOLV-dev/rsolv-action@main
        with:
          api_key: ${{ secrets.RSOLV_API_KEY }}
          scan_mode: fix
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Configuration Options

### Action Inputs

- `scan_mode`: Set to `scan` for vulnerability detection or `fix` for processing issues (default: `fix`)
- `api_key`: Your RSOLV API key (required)
- `issue_label`: Label to apply to created issues (default: `rsolv:automate`)

### Outputs

When in scan mode:
- `scan_results`: JSON object containing all discovered vulnerabilities
- `created_issues`: Array of GitHub issues created from the scan

## Supported Vulnerabilities

RSOLV scans for 170+ security patterns across 6 languages:

### Languages
- JavaScript/TypeScript
- Python
- Ruby
- Java
- PHP
- Elixir

### Vulnerability Types
- SQL Injection
- Cross-Site Scripting (XSS)
- Command Injection
- Path Traversal
- Weak Cryptography
- Hardcoded Secrets
- Insecure Random Number Generation
- XML External Entity (XXE)
- Server-Side Request Forgery (SSRF)
- And many more...

## Best Practices

1. **Regular Scanning**: Set up a weekly or monthly schedule
2. **Review Before Fixing**: Always review created issues before running fix mode
3. **Gradual Rollout**: Start with a small repository to understand the process
4. **Custom Labels**: Use custom labels to organize security issues

## Example: Testing with NodeGoat

NodeGoat is OWASP's deliberately vulnerable Node.js application, perfect for testing:

```yaml
name: Test RSOLV with NodeGoat

on:
  workflow_dispatch:

jobs:
  test-scan:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout NodeGoat
        uses: actions/checkout@v3
        with:
          repository: OWASP/NodeGoat
          
      - name: Run RSOLV Scan
        uses: RSOLV-dev/rsolv-action@main
        with:
          api_key: ${{ secrets.RSOLV_API_KEY }}
          scan_mode: scan
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Limitations

- **Phase 1**: Uses regex-based pattern matching (170 patterns)
- **Phase 2** (Coming Soon): Semgrep integration for semantic analysis (20,000+ rules)
- Large repositories may take several minutes to scan
- Binary files and files over 1MB are skipped

## Security Considerations

- Issues created contain vulnerability details but not exploit code
- Sensitive findings (like hardcoded secrets) are masked in issue descriptions
- All created issues are labeled for easy identification
- Review created issues before running fix mode in production