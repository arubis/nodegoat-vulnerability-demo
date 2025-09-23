# RSOLV Test Generation Framework - Staging Deployment Plan

**Date**: 2025-06-24  
**Phase**: 8A - Deploy test generation to staging environment

## Overview

This plan outlines the deployment of the intelligent test generation framework to staging environment for validation before production release.

## Deployment Architecture

### Components to Deploy
1. **Test Generation Core**
   - `test-generator.ts` - Base test generation engine
   - `adaptive-test-generator.ts` - Framework-specific generation
   - Test templates for all supported languages

2. **Framework Detection**
   - `test-framework-detector.ts` - Detects 15+ test frameworks
   - Language-specific detection patterns

3. **Coverage Analysis**
   - `coverage-analyzer.ts` - Analyzes test coverage gaps
   - Multiple coverage format support

4. **Issue Interpretation**
   - `issue-interpreter.ts` - Extracts vulnerability context
   - Natural language processing for issues

5. **Fix Validation Integration**
   - `git-based-processor.ts` - Enhanced with test validation
   - `git-based-test-validator.ts` - Validates fixes with tests
   - Iterative fix generation with test feedback

## Configuration

### action.yml Enhancement
```yaml
inputs:
  enable_test_generation:
    description: 'Enable intelligent test generation for vulnerabilities'
    required: false
    default: 'false'
  test_generation_config:
    description: 'JSON configuration for test generation'
    required: false
    default: '{}'
```

### rsolv.yml Configuration
```yaml
# .github/rsolv-staging.yml
apiKey: ${{ secrets.RSOLV_STAGING_API_KEY }}
issueLabel: 'rsolv:staging-test'
enableSecurityAnalysis: true
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
testGeneration:
  enabled: true
  frameworks:
    javascript: ['jest', 'mocha', 'vitest', 'cypress']
    typescript: ['jest', 'mocha', 'vitest', 'cypress']
    python: ['pytest', 'unittest']
    ruby: ['rspec', 'minitest']
    php: ['phpunit', 'pest']
    java: ['junit5', 'testng']
  generateForVulnerabilities: true
  includeInPR: true
  validateFixes: true
```

## Staging Validation Test Cases

### 1. JavaScript/TypeScript Validation
- **Test Case**: SQL injection in Express app
- **Expected**: Jest tests generated with red-green-refactor pattern
- **Validation**: Tests run successfully, fix passes all tests

### 2. Python Validation
- **Test Case**: Command injection in Django app
- **Expected**: pytest tests with proper assertions
- **Validation**: Python-specific syntax, proper test structure

### 3. Ruby Validation
- **Test Case**: XSS in Rails app
- **Expected**: RSpec tests with Rails helpers
- **Validation**: Ruby idioms, proper expectations

### 4. PHP Validation
- **Test Case**: Path traversal in Laravel app
- **Expected**: PHPUnit tests with Laravel TestCase
- **Validation**: PHP 8 attributes, proper assertions

### 5. Java Validation
- **Test Case**: XXE in Spring Boot app
- **Expected**: JUnit 5 parameterized tests
- **Validation**: Java annotations, MockMvc usage

### 6. Fix Iteration Validation
- **Test Case**: Intentionally failing fix
- **Expected**: System retries with test feedback
- **Validation**: Max 5 iterations, proper test context in prompts

## Monitoring & Metrics

### Key Metrics to Track
1. **Test Generation Success Rate**
   - Percentage of issues with tests generated
   - Framework detection accuracy
   - Language coverage

2. **Fix Validation Metrics**
   - Number of iterations needed
   - Success rate by vulnerability type
   - Time to successful fix

3. **Performance Metrics**
   - Test generation time
   - Memory usage
   - API call volume

### Logging & Debugging
```typescript
// Enhanced logging for staging
logger.info('[TEST_GENERATION] Framework detected', {
  issue: issue.number,
  framework: detectedFramework,
  language: language,
  confidence: confidence
});

logger.info('[FIX_VALIDATION] Iteration result', {
  issue: issue.number,
  iteration: currentIteration,
  maxIterations: maxIterations,
  testsPassed: {
    red: redTestPassed,
    green: greenTestPassed,
    refactor: refactorTestPassed
  }
});
```

## Staging Workflow

### 1. Initial Deployment
```bash
# Tag staging release
git tag v1.0.0-staging.1
git push origin v1.0.0-staging.1

# Deploy to staging environment
# This happens automatically via GitHub Actions
```

### 2. Create Test Issues
```markdown
# Issue 1: SQL Injection Test
**Title**: [STAGING] Fix SQL injection in user authentication
**Labels**: rsolv:staging-test, security, sql-injection
**Body**: 
There's a SQL injection vulnerability in the login function at auth.js:45.
The user input is directly concatenated into the SQL query.

# Issue 2: Test Fix Iteration
**Title**: [STAGING] Complex XSS requiring multiple attempts
**Labels**: rsolv:staging-test, security, xss, fix-validation-max-5
**Body**:
Complex XSS vulnerability that might need multiple fix attempts.
Located in renderer.js:123 where user content is rendered.
```

### 3. Monitor Execution
- Watch GitHub Actions logs
- Monitor generated PRs
- Verify test quality
- Check fix iteration behavior

### 4. Validation Checklist
- [ ] Test generation works for all supported languages
- [ ] Framework detection accuracy > 90%
- [ ] Fix validation iterates correctly
- [ ] Test context appears in Claude Code prompts
- [ ] Generated tests follow red-green-refactor pattern
- [ ] Performance within acceptable limits
- [ ] No errors in production workflows

## Rollback Plan

If issues are discovered:

1. **Immediate Rollback**
   ```yaml
   # Disable test generation in config
   testGeneration:
     enabled: false
   ```

2. **Feature Flag Override**
   ```typescript
   // Emergency override in code
   if (process.env.DISABLE_TEST_GENERATION === 'true') {
     return skipTestGeneration();
   }
   ```

3. **Revert to Previous Version**
   ```bash
   # Use previous stable tag
   git checkout v0.9.0
   ```

## Success Criteria

### Technical Success
- ✅ All test cases pass in staging
- ✅ No performance degradation
- ✅ Error rate < 1%
- ✅ Test generation time < 5 seconds

### Business Success
- ✅ Generated tests are meaningful and runnable
- ✅ Fix validation reduces failed PRs by 50%
- ✅ Developer feedback positive
- ✅ No increase in support tickets

## Timeline

### Week 1 (Current)
- Day 1-2: Deploy to staging
- Day 3-4: Run validation test cases
- Day 5: Analyze metrics and logs

### Week 2
- Day 1-2: Fix any discovered issues
- Day 3-4: Re-run validation
- Day 5: Prepare production deployment plan

### Week 3
- Production deployment (Phase 8C)

## Next Steps

1. **Create staging environment configuration**
2. **Deploy current build to staging**
3. **Create test issues in staging repo**
4. **Monitor and collect metrics**
5. **Document any issues found**
6. **Iterate based on findings**

## Appendix: Feature Flags

```typescript
// Feature flags for gradual rollout
export const TEST_GENERATION_FLAGS = {
  // Enable test generation
  ENABLE_TEST_GENERATION: process.env.ENABLE_TEST_GENERATION === 'true',
  
  // Enable fix validation
  ENABLE_FIX_VALIDATION: process.env.ENABLE_FIX_VALIDATION === 'true',
  
  // Languages to enable
  ENABLED_LANGUAGES: process.env.TEST_GEN_LANGUAGES?.split(',') || ['javascript'],
  
  // Max iterations override
  MAX_ITERATIONS_OVERRIDE: process.env.MAX_FIX_ITERATIONS ? 
    parseInt(process.env.MAX_FIX_ITERATIONS) : undefined
};
```