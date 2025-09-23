# Three-Phase Architecture Documentation

## Overview

The RSOLV action now implements a three-phase architecture that separates vulnerability processing into distinct, reusable phases:

1. **SCAN** - Analyze issues and determine fixability
2. **VALIDATE** - Generate tests to prove vulnerabilities exist
3. **MITIGATE** - Apply fixes and create pull requests

Each phase can run independently or as part of a complete pipeline.

## Architecture Benefits

- **Modularity**: Each phase is independent and reusable
- **Flexibility**: Run only the phases you need
- **Persistence**: Phase data is stored and can be retrieved later
- **Testability**: Clear separation makes testing easier
- **Scalability**: Process multiple issues efficiently

## Usage Examples

### GitHub Action Usage

The three-phase architecture can be used in GitHub Actions with the `mode` input:

```yaml
name: RSOLV Security Fix
on:
  issues:
    types: [opened, labeled]

jobs:
  security-fix:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: rsolv-dev/RSOLV-action@v2
      with:
        api_key: ${{ secrets.RSOLV_API_KEY }}
        mode: 'full'  # Run all phases: scan, validate, mitigate
        issue_number: ${{ github.event.issue.number }}
```

#### Individual Phase Examples

**Scan Only** - Find vulnerabilities and create issues:
```yaml
- uses: rsolv-dev/RSOLV-action@v2
  with:
    mode: 'scan'
    api_key: ${{ secrets.RSOLV_API_KEY }}
```

**Validate Only** - Generate tests for existing issues:
```yaml
- uses: rsolv-dev/RSOLV-action@v2
  with:
    mode: 'validate'
    issue_number: ${{ github.event.issue.number }}
    api_key: ${{ secrets.RSOLV_API_KEY }}
```

**Mitigate Only** - Apply fixes using existing validation data:
```yaml
- uses: rsolv-dev/RSOLV-action@v2
  with:
    mode: 'mitigate'
    issue_number: ${{ github.event.issue.number }}
    api_key: ${{ secrets.RSOLV_API_KEY }}
```

### CLI Usage

The action also supports direct CLI invocation with mode flags:

```bash
# Run full pipeline
node dist/index.js --mode full

# Run individual phases
node dist/index.js --mode scan
node dist/index.js --mode validate --issue 123
node dist/index.js --mode mitigate --issue 123

# Alternative syntax
node dist/index.js --mode=scan
```

Environment variables are also supported:

```bash
export RSOLV_MODE=scan
export RSOLV_ISSUE_NUMBER=123
export RSOLV_API_KEY=your_key_here
node dist/index.js
```

### Programmatic Usage

### Full Pipeline Mode

Run all three phases sequentially:

```typescript
const executor = new PhaseExecutor(config);
const result = await executor.executeThreePhaseForIssue(issue);

// Result contains data from all phases
console.log(result.data.scan);      // Scan analysis
console.log(result.data.validation); // Generated tests
console.log(result.data.mitigation); // Fix and PR details
```

### Individual Phase Execution

#### Scan Phase Only

```typescript
const scanResult = await executor.executeScanForIssue(issue);

if (scanResult.data.canBeFixed) {
  console.log('Issue can be automatically fixed');
  console.log('Files to modify:', scanResult.data.analysisData.filesToModify);
}
```

#### Validate Phase Only

```typescript
// Option 1: Validate after scan
const validateResult = await executor.executeValidateForIssue(issue, scanData);

// Option 2: Standalone validation
const result = await executor.execute('validate', {
  issues: [issue1, issue2],
  runTests: true,
  postComment: true,
  format: 'markdown'
});
```

#### Mitigate Phase Only

```typescript
// Requires scan and validation data
const mitigateResult = await executor.executeMitigateForIssue(
  issue,
  scanData,
  validationData
);

console.log('PR created:', mitigateResult.data.pullRequestUrl);
```

## Mode Selection

The `execute()` method provides a unified interface for all modes:

```typescript
// Scan mode
await executor.execute('scan', { issue });

// Validate mode with multiple issues
await executor.execute('validate', {
  issues: [issue1, issue2],
  format: 'json'
});

// Mitigate mode
await executor.execute('mitigate', {
  issue,
  validationData
});

// Three-phase pipeline
await executor.execute('three-phase', { issue });
```

## Phase Data Persistence

Phase results are automatically stored using the PhaseDataClient:

```typescript
// Data is stored with a unique key
const key = `${repo}-${issueNumber}-${phase}`;

// Retrieve previous results
const phaseData = await phaseDataClient.retrievePhaseResults(
  repo,
  issueNumber,
  commitSha
);
```

## Output Formats

### Validation Reports

Validation mode supports multiple output formats:

- **Markdown**: Human-readable report with test details
- **JSON**: Structured data for programmatic processing
- **GitHub Actions**: Annotations for CI/CD integration

```typescript
// Markdown format
const result = await executor.execute('validate', {
  issues,
  format: 'markdown'
});

// JSON format for API responses
const result = await executor.execute('validate', {
  issues,
  format: 'json'
});
```

## Error Handling

Each phase includes comprehensive error handling:

```typescript
const result = await executor.executeScanForIssue(issue);

if (!result.success) {
  console.error('Scan failed:', result.error);
  
  // Check for specific error conditions
  if (result.error?.includes('Uncommitted changes')) {
    console.log('Please commit your changes first');
  }
}
```

## GitHub Action Integration

Use the three-phase architecture in GitHub Actions:

```yaml
- name: Run RSOLV Three-Phase
  uses: rsolv/action@v1
  with:
    mode: 'three-phase'
    github-token: ${{ secrets.GITHUB_TOKEN }}
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

Or run specific phases:

```yaml
- name: Validate Only
  uses: rsolv/action@v1
  with:
    mode: 'validate'
    issues: '1,2,3'
    format: 'github-actions'
```

## Configuration

### Phase-Specific Configuration

```typescript
const config: ActionConfig = {
  // Scan phase config
  enableSecurityAnalysis: true,
  
  // Validate phase config
  testGeneration: {
    enabled: true,
    framework: 'jest',
    validateFixes: true
  },
  
  // Mitigate phase config
  fixValidation: {
    enabled: true,
    maxIterations: 3,
    timeout: 600000
  }
};
```

## Best Practices

1. **Always scan first**: The scan phase determines if an issue can be fixed
2. **Validate before mitigating**: Tests ensure fixes actually work
3. **Use phase data**: Leverage stored results to avoid redundant processing
4. **Handle partial failures**: Some issues may not be fixable
5. **Monitor timeouts**: Set appropriate timeouts for long-running operations

## Troubleshooting

### Common Issues

**Issue**: "Uncommitted changes detected"
- **Solution**: Commit or stash changes before running scan

**Issue**: "Test generation failed"
- **Solution**: Check AI provider configuration and API limits

**Issue**: "Fix validation failed after max iterations"
- **Solution**: Increase `maxIterations` or review issue complexity

## Migration from Legacy Mode

If you're migrating from the legacy `fix` mode:

```typescript
// Old way (deprecated)
await processIssueWithGit(issue, config);

// New way
const executor = new PhaseExecutor(config);
await executor.executeThreePhaseForIssue(issue);
```

## Performance Considerations

- **Batch processing**: Validate multiple issues together
- **Phase caching**: Reuse scan results when possible
- **Timeout configuration**: Adjust based on repository size
- **Parallel execution**: Process independent issues concurrently

## Future Enhancements

- Platform API integration for centralized storage
- Advanced analytics and reporting
- Machine learning for pattern detection
- Cross-repository vulnerability tracking