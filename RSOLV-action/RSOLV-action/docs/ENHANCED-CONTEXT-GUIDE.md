# Enhanced Context Gathering with Claude Code

## Overview

The enhanced context feature in RSOLV uses Claude Code to deeply understand your codebase before generating solutions. This results in:

- Better architectural consistency
- Solutions that follow existing patterns
- Proper testing that matches your conventions
- More accurate dependency usage
- Reduced need for PR revisions

## How It Works

### 1. Deep Context Gathering

Before generating a solution, RSOLV:

1. Explores the entire repository structure
2. Analyzes code patterns and conventions
3. Understands testing frameworks and patterns
4. Maps dependencies and their usage
5. Identifies related components that may need updates

### 2. Ultra-Think Mode

When enabled, the system uses the `ultrathink` keyword to:

- Take more time to analyze complex relationships
- Consider multiple approaches before deciding
- Think through edge cases and implications
- Create more comprehensive solutions

### 3. Context Caching

To improve performance, context is cached:

- Cache duration: 1 hour (configurable)
- Keyed by repository and context depth
- Shared across similar issues
- Automatically invalidated when code changes

## Configuration

### Basic Setup

```yaml
# .github/workflows/rsolv-enhanced.yml
env:
  RSOLV_AI_PROVIDER: 'claude-code'
  RSOLV_ENABLE_DEEP_CONTEXT: 'true'
  RSOLV_ENABLE_ULTRA_THINK: 'true'
  RSOLV_CONTEXT_DEPTH: 'ultra'
```

### Advanced Configuration

```yaml
env:
  RSOLV_CLAUDE_CODE_CONFIG: |
    {
      "enableDeepContext": true,
      "enableUltraThink": true,
      "contextDepth": "ultra",
      "contextGatheringTimeout": 300000,
      "analyzeArchitecture": true,
      "analyzeTestPatterns": true,
      "analyzeStyleGuide": true,
      "analyzeDependencies": true,
      "cacheContextResults": true,
      "contextCacheDuration": 3600000,
      "verboseLogging": true,
      "contextOptions": {
        "maxDepth": 10,
        "explorationBreadth": 5,
        "includeDirs": ["src", "lib", "tests"],
        "excludeDirs": ["node_modules", "dist", "build"],
        "includeFiles": ["*.ts", "*.js", "*.json"],
        "excludeFiles": ["*.test.ts", "*.spec.js"]
      }
    }
```

## Context Depth Levels

### Shallow
- Quick scan of immediate files
- Basic pattern recognition
- Minimal dependency analysis
- ~30 seconds gathering time

### Medium
- Explores related modules
- Analyzes common patterns
- Basic architecture understanding
- ~1-2 minutes gathering time

### Deep
- Comprehensive module analysis
- Full pattern recognition
- Dependency graph mapping
- Testing framework analysis
- ~2-3 minutes gathering time

### Ultra
- Complete repository analysis
- Style guide inference
- Architecture documentation
- Full dependency tree
- Cross-module relationships
- ~3-5 minutes gathering time

## Best Practices

### 1. Start with Deep Context

For most projects, `deep` context provides the best balance:

```yaml
RSOLV_CONTEXT_DEPTH: 'deep'
RSOLV_CONTEXT_TIMEOUT: '180000'  # 3 minutes
```

### 2. Use Ultra for Critical Changes

For architectural changes or complex features:

```yaml
RSOLV_CONTEXT_DEPTH: 'ultra'
RSOLV_ENABLE_ULTRA_THINK: 'true'
RSOLV_CONTEXT_TIMEOUT: '300000'  # 5 minutes
```

### 3. Optimize for Large Repositories

For very large codebases:

```yaml
RSOLV_CLAUDE_CODE_CONFIG: |
  {
    "contextOptions": {
      "maxDepth": 5,
      "explorationBreadth": 3,
      "includeDirs": ["src/core", "src/features"],
      "excludeDirs": ["test", "docs", "examples"]
    }
  }
```

### 4. Enable Caching for Multiple Issues

When processing multiple similar issues:

```yaml
RSOLV_CACHE_CONTEXT: 'true'
RSOLV_CONTEXT_CACHE_DURATION: '7200000'  # 2 hours
```

## Performance Considerations

### Context Gathering Time

| Depth | Small Repo | Medium Repo | Large Repo |
|-------|------------|-------------|------------|
| Shallow | 15-30s | 30-60s | 60-90s |
| Medium | 30-60s | 60-120s | 120-180s |
| Deep | 60-120s | 120-180s | 180-240s |
| Ultra | 120-180s | 180-300s | 300-600s |

### Memory Usage

- Small repos: ~100-200MB
- Medium repos: ~200-500MB
- Large repos: ~500MB-1GB

### Optimization Tips

1. **Use include/exclude patterns** to focus on relevant code
2. **Enable caching** for similar issues
3. **Set appropriate timeouts** to prevent hanging
4. **Start with lower depth** and increase if needed

## Troubleshooting

### Context Gathering Timeout

If context gathering times out:

```yaml
# Increase timeout
RSOLV_CONTEXT_TIMEOUT: '600000'  # 10 minutes

# Or reduce depth
RSOLV_CONTEXT_DEPTH: 'medium'
```

### Memory Issues

For large repositories:

```yaml
# Limit exploration breadth
RSOLV_CLAUDE_CODE_CONFIG: |
  {
    "contextOptions": {
      "maxDepth": 3,
      "explorationBreadth": 2
    }
  }
```

### Cache Issues

To force fresh context:

```yaml
# Disable caching temporarily
RSOLV_CACHE_CONTEXT: 'false'

# Or reduce cache duration
RSOLV_CONTEXT_CACHE_DURATION: '300000'  # 5 minutes
```

## Example Outputs

### Architecture Analysis

```json
{
  "architecture": {
    "patterns": ["MVC", "Repository Pattern", "Dependency Injection"],
    "structure": "Domain-Driven Design",
    "mainComponents": ["controllers", "services", "repositories", "models"]
  }
}
```

### Testing Patterns

```json
{
  "testingPatterns": {
    "framework": "Jest",
    "structure": "Parallel to source",
    "conventions": [
      "describe blocks for classes",
      "it blocks for methods",
      "beforeEach for setup",
      "mock external dependencies"
    ]
  }
}
```

### Code Conventions

```json
{
  "codeConventions": {
    "namingPatterns": ["camelCase for functions", "PascalCase for classes"],
    "fileOrganization": "Feature-based",
    "importPatterns": ["Absolute imports for external", "Relative for internal"]
  }
}
```

## Monitoring and Analytics

### Context Gathering Metrics

The system tracks:

- Context gathering time
- Cache hit/miss rates
- Memory usage
- Exploration depth reached

### Viewing Metrics

Check workflow logs for:

```
[INFO] Deep context gathering completed in 145000ms
[INFO] Context cache hit for repository owner/repo-ultra
[INFO] Context gathering metrics: {...}
```

## Future Enhancements

1. **Incremental Context Updates**: Only re-analyze changed files
2. **Context Sharing**: Share context across repositories
3. **Pattern Learning**: Learn from successful PRs
4. **Custom Context Rules**: Define project-specific patterns

## FAQ

### Q: When should I disable deep context?

A: Only for very simple issues or when testing. Deep context significantly improves solution quality.

### Q: How much does it impact performance?

A: Initial runs take 2-5 minutes longer, but subsequent issues use cached context.

### Q: Can I customize what gets analyzed?

A: Yes, use the `contextOptions` configuration to include/exclude specific paths and patterns.

### Q: Does it work with all languages?

A: Best support for JavaScript, TypeScript, Python, and Java. Other languages have basic support.

### Q: How accurate is the analysis?

A: Very accurate for well-structured codebases. Accuracy decreases with unconventional patterns.