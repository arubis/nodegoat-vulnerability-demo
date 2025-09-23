# RSOLV Test Generation - Staging Test Guide

## Overview

This guide explains how to test the RSOLV intelligent test generation framework in staging environment.

## Prerequisites

- Access to the RSOLV-action repository
- GitHub CLI (`gh`) installed
- Staging API key configured as `RSOLV_STAGING_API_KEY` secret

## Quick Start

### 1. Deploy to Staging

```bash
# From the repository root
./scripts/deploy-staging.sh
```

### 2. Run All Test Scenarios

```bash
gh workflow run staging-test-generation.yml \
  --field test_scenario=all \
  --field enable_test_generation=true \
  --field enable_fix_validation=true
```

### 3. Run Specific Test Scenario

```bash
# JavaScript SQL Injection
gh workflow run staging-test-generation.yml \
  --field test_scenario=javascript-sql-injection

# Python Command Injection
gh workflow run staging-test-generation.yml \
  --field test_scenario=python-command-injection

# Ruby XSS
gh workflow run staging-test-generation.yml \
  --field test_scenario=ruby-xss

# PHP Path Traversal
gh workflow run staging-test-generation.yml \
  --field test_scenario=php-path-traversal

# Java XXE
gh workflow run staging-test-generation.yml \
  --field test_scenario=java-xxe

# Fix Iteration Test
gh workflow run staging-test-generation.yml \
  --field test_scenario=fix-iteration
```

## Test Scenarios

### 1. JavaScript SQL Injection
- **Purpose**: Validate Jest/Mocha test generation
- **Expected Output**: 
  - Red test showing vulnerability
  - Green test proving fix
  - Parameterized query implementation

### 2. Python Command Injection
- **Purpose**: Validate pytest generation
- **Expected Output**:
  - Python-specific test syntax
  - Subprocess mocking
  - Security assertions

### 3. Ruby XSS
- **Purpose**: Validate RSpec generation
- **Expected Output**:
  - RSpec expectations
  - Rails-specific helpers
  - HTML escaping tests

### 4. PHP Path Traversal
- **Purpose**: Validate PHPUnit/Pest generation
- **Expected Output**:
  - PHP 8 attributes
  - Path validation tests
  - Security assertions

### 5. Java XXE
- **Purpose**: Validate JUnit 5/TestNG generation
- **Expected Output**:
  - Parameterized tests
  - XML parser configuration tests
  - Spring MockMvc if applicable

### 6. Fix Iteration
- **Purpose**: Validate iterative fix generation
- **Expected Output**:
  - Multiple fix attempts (max 5)
  - Test feedback in prompts
  - Successful fix after iterations

## Configuration Options

### Environment Variables

```yaml
ENABLE_TEST_GENERATION: 'true'     # Enable test generation
ENABLE_FIX_VALIDATION: 'true'      # Enable fix validation
TEST_GEN_LANGUAGES: 'javascript,typescript,python,ruby,php,java'
RSOLV_DEBUG: 'true'                # Enable debug logging
```

### Configuration File

Create `.github/rsolv-staging.yml`:

```yaml
testGeneration:
  enabled: true
  frameworks:
    javascript: ['jest', 'mocha', 'vitest']
    typescript: ['jest', 'mocha', 'vitest']
    python: ['pytest', 'unittest']
    ruby: ['rspec', 'minitest']
    php: ['phpunit', 'pest']
    java: ['junit5', 'testng']
  generateForVulnerabilities: true
  includeInPR: true
  validateFixes: true

fixValidation:
  enabled: true
  maxIterations: 5
  maxIterationsByType:
    sql-injection: 5
    xss: 4
    command-injection: 5
  maxIterationsByTier:
    enterprise: 10
    pro: 5
    free: 3
```

## Monitoring & Validation

### 1. Check Workflow Logs

```bash
# List recent workflow runs
gh run list --workflow=staging-test-generation.yml

# View specific run
gh run view <run-id>

# Watch live logs
gh run watch <run-id>
```

### 2. Verify Generated PRs

Look for PRs with:
- `[STAGING]` prefix in title
- Test files included
- Test validation results in description
- Proper fix implementation

### 3. Check Test Quality

Generated tests should include:
- Red test (demonstrates vulnerability)
- Green test (proves fix works)
- Refactor test (ensures functionality)
- Framework-specific patterns
- Proper assertions

### 4. Validate Fix Iteration

For fix iteration tests:
- Check iteration count in logs
- Verify test feedback in prompts
- Ensure rollback on max iterations
- Confirm final fix passes tests

## Troubleshooting

### Common Issues

1. **No test files generated**
   - Check `ENABLE_TEST_GENERATION` is true
   - Verify language is supported
   - Check logs for framework detection

2. **Fix validation not running**
   - Check `ENABLE_FIX_VALIDATION` is true
   - Ensure tests were generated successfully
   - Verify git operations in logs

3. **Framework not detected**
   - Check repo structure includes package files
   - Verify framework is in supported list
   - Check detection confidence in logs

4. **Iteration limit reached**
   - Check vulnerability complexity
   - Review test failure reasons
   - Consider adjusting max iterations

### Debug Commands

```bash
# Check action logs
docker logs <container-id>

# View generated test files
gh pr view <pr-number> --json files

# Check test execution
gh pr checks <pr-number>
```

## Success Metrics

### Test Generation
- ✅ 90%+ framework detection accuracy
- ✅ All supported languages generate tests
- ✅ Tests follow framework conventions
- ✅ < 5 second generation time

### Fix Validation
- ✅ 80%+ fixes pass on first attempt
- ✅ Complex fixes succeed within 5 iterations
- ✅ Proper rollback on failure
- ✅ Test context in retry prompts

### Overall Quality
- ✅ Generated tests are runnable
- ✅ Tests catch real vulnerabilities
- ✅ No false positives in validation
- ✅ Clear feedback on failures

## Reporting Issues

If you encounter issues:

1. Capture workflow run ID
2. Save relevant logs
3. Note the test scenario
4. Document expected vs actual behavior
5. Report in team channel or create issue

## Next Steps

After successful staging validation:

1. Review all test results
2. Analyze performance metrics
3. Gather team feedback
4. Plan production rollout
5. Update documentation