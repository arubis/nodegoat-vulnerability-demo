# RSOLV Production Customer Journey Validation Guide

## Overview

This guide explains how to validate the complete RSOLV customer journey in production, from initial signup through vulnerability detection, fix generation with tests, and PR merge.

## Prerequisites

### 1. Environment Variables

You need to set these environment variables:

```bash
# Your GitHub personal access token with repo permissions
export GITHUB_TOKEN="ghp_your_token_here"

# Your RSOLV API key from https://app.rsolv.dev
export RSOLV_API_KEY="rsolv_your_api_key_here"

# Your GitHub username (optional, defaults to authenticated user)
export GITHUB_USERNAME="your-github-username"
```

### 2. Required Permissions

Your GitHub token needs:
- `repo` - Full repository access
- `workflow` - Workflow permissions
- `write:packages` - Package write (for actions)
- `delete_repo` - To clean up test repositories

### 3. RSOLV Account

1. Sign up at https://app.rsolv.dev
2. Choose a plan (Pro recommended for test generation)
3. Get your API key from the dashboard

## Validation Scripts

### 1. Full Production Validation (Recommended)

**File**: `scripts/validate-production-journey.ts`

This script performs a complete end-to-end test:
- Creates a real GitHub repository
- Adds vulnerable code (SQL injection, XSS, command injection)
- Installs RSOLV GitHub Action
- Triggers a real security scan
- Waits for PR creation
- Validates tests follow red-green-refactor pattern
- Merges the PR
- Cleans up

**Run it**:
```bash
bun run scripts/validate-production-journey.ts
```

### 2. NodeGoat Simulation

**File**: `scripts/validate-nodegoat-journey.sh`

This script simulates the journey using NodeGoat patterns:
- Simulates each step without GitHub API calls
- Good for understanding the flow
- Doesn't require API keys

**Run it**:
```bash
./scripts/validate-nodegoat-journey.sh
```

### 3. Production Health Check

**File**: `scripts/validate-production-e2e.sh`

Quick health check of production components:
- API connectivity
- Pattern API
- Component verification

**Run it**:
```bash
./scripts/validate-production-e2e.sh
```

## What Gets Validated

### Customer Journey Steps

1. **Signup & API Key**
   - Customer registration flow
   - API key procurement
   - Plan selection

2. **Repository Setup**
   - Fork/create repository
   - Add vulnerable code
   - Verify vulnerabilities exist

3. **RSOLV Integration**
   - Add GitHub Action workflow
   - Configure rsolv.yml
   - Set up secrets

4. **Security Scan**
   - Trigger workflow
   - Detect vulnerabilities
   - Generate report

5. **PR Creation**
   - Automated fix generation
   - Test generation
   - PR with description

6. **Validation (RED)**
   - Tests confirm vulnerability exists
   - Exploit demonstrated
   - Security issue validated

7. **Validation (GREEN)**
   - Tests confirm fix works
   - Vulnerability prevented
   - Functionality maintained

8. **Merge & Deploy**
   - Customer reviews PR
   - Merges changes
   - Fix deployed

### Test Generation Validation

The framework validates that generated tests follow the red-green-refactor pattern:

```javascript
// RED: Proves vulnerability exists
test('should be vulnerable to SQL injection', () => {
  const exploit = "' OR '1'='1";
  const result = authenticate(exploit, 'pass');
  expect(result).toBeTruthy(); // Bypass works
});

// GREEN: Proves fix prevents exploit
test('should prevent SQL injection', () => {
  const exploit = "' OR '1'='1";
  const result = authenticate(exploit, 'pass');
  expect(result).toBeFalsy(); // Bypass prevented
});

// REFACTOR: Ensures functionality maintained
test('should authenticate valid users', () => {
  const result = authenticate('user', 'pass');
  expect(result.username).toBe('user');
});
```

## Expected Results

### Successful Validation

```
✅ Step 1: Repository created
✅ Step 2: Vulnerable code added
✅ Step 3: RSOLV Action configured
✅ Step 4: Security scan completed
✅ Step 5: PR #123 created
✅ Step 6: Tests validated (RED/GREEN/REFACTOR)
✅ Step 7: PR merged
✅ Step 8: Deployment verified

Success Rate: 100%
Duration: ~5-10 minutes
```

### What to Look For

1. **PR Contents**
   - Security fixes for detected vulnerabilities
   - Comprehensive test suite
   - Clear description of changes

2. **Test Quality**
   - Framework-specific syntax (Jest, Mocha, etc.)
   - Red-green-refactor pattern
   - Meaningful assertions

3. **Fix Quality**
   - Parameterized queries for SQL injection
   - Output encoding for XSS
   - Input validation for command injection

## Troubleshooting

### API Key Issues
```
❌ RSOLV_API_KEY not set
```
**Solution**: Get your API key from https://app.rsolv.dev/settings

### GitHub Token Issues
```
❌ GITHUB_TOKEN not set
```
**Solution**: Create a token at https://github.com/settings/tokens

### PR Not Created
- Check workflow runs: `gh run list --repo your-repo`
- Verify RSOLV_API_KEY secret is set in repository
- Check API key has sufficient credits

### Tests Not Generated
- Verify test_generation is enabled in rsolv.yml
- Check your plan includes test generation
- Ensure vulnerable code is detectable

## Clean Up

The validation script automatically cleans up:
- Deletes test repository
- Removes local files

If cleanup fails, manually delete:
```bash
gh repo delete YOUR_USERNAME/rsolv-validation-TIMESTAMP --yes
```

## Production Metrics

After validation, check:
- GitHub Actions tab for workflow runs
- PR contents and test quality
- Merge success rate

## Next Steps

1. **Monitor Production**
   - Use `scripts/monitor-production-deployment.sh`
   - Check 24-hour metrics

2. **Expand Testing**
   - Try different vulnerability types
   - Test multiple languages
   - Validate edge cases

3. **Customer Rollout**
   - Document setup process
   - Create onboarding guides
   - Prepare support materials

## Support

- RSOLV Documentation: https://docs.rsolv.dev
- GitHub Action: https://github.com/marketplace/actions/rsolv-security
- Support: support@rsolv.dev

---

**Last Updated**: June 25, 2025  
**Version**: 1.0.0