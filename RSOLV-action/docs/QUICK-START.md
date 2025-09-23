# RSOLV Quick Start Guide

Get RSOLV finding and fixing vulnerabilities in your repository in under 2 minutes.

## 1. Get Your API Key
Sign up at [https://rsolv.dev](https://rsolv.dev) to get your API key.

## 2. Add the Secret
In your GitHub repository:
1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `RSOLV_API_KEY`
4. Value: Your API key (starts with `rsolv_`)

## 3. Create the Workflow
Create `.github/workflows/rsolv.yml`:

```yaml
name: RSOLV Security

on:
  push:
    branches: [ main ]
  schedule:
    - cron: '0 0 * * 1'  # Weekly scans
  workflow_dispatch:

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: RSOLV-dev/rsolv-action@main
        with:
          api_key: ${{ secrets.RSOLV_API_KEY }}
          scan_mode: scan
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  fix:
    runs-on: ubuntu-latest
    if: github.event_name == 'issues' && contains(github.event.issue.labels.*.name, 'rsolv:automate')
    steps:
      - uses: actions/checkout@v4
      - uses: RSOLV-dev/rsolv-action@main
        with:
          api_key: ${{ secrets.RSOLV_API_KEY }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## 4. Run Your First Scan
1. Go to **Actions** tab
2. Click on "RSOLV Security"
3. Click "Run workflow"
4. Check the **Issues** tab for found vulnerabilities

## What You Get

### Security Scanning
- 172+ security patterns across 6 languages
- OWASP Top 10 coverage
- Framework-specific patterns (Rails, Django, React, etc.)
- CVE detection (Log4Shell, Spring4Shell, etc.)

### Automated Fixes
- Pull requests with working fixes
- Educational explanations for each fix
- Compliance documentation (SOC2, PCI-DSS, etc.)
- Test recommendations

### Educational Content
Every fix includes:
- **What**: Clear explanation of the vulnerability
- **Why**: How it could be exploited
- **How**: Why this fix works
- **Learn**: Best practices to prevent recurrence

## Example Output

When RSOLV finds a SQL injection vulnerability:

**Issue Created:**
```markdown
🔒 SQL Injection vulnerabilities found in 2 files

Severity: HIGH
Files affected:
- app/routes/users.js (line 45)
- app/routes/products.js (line 78)
```

**Pull Request Created:**
```markdown
fix(security): Parameterize SQL queries to prevent injection

## What Changed
Replaced string concatenation with parameterized queries.

## Why This Matters
SQL injection allows attackers to execute arbitrary database commands,
potentially accessing or destroying your entire database.

## Educational Content
SQL injection occurs when user input is directly concatenated into SQL queries...
[Full explanation included]

## Compliance
This fix addresses:
- OWASP Top 10: A03:2021 – Injection
- PCI-DSS: Requirement 6.5.1
- SOC2: CC6.1
```

## Need Help?
- Documentation: [https://docs.rsolv.dev](https://docs.rsolv.dev)
- Email: support@rsolv.dev
- Examples: [https://github.com/RSOLV-dev/examples](https://github.com/RSOLV-dev/examples)