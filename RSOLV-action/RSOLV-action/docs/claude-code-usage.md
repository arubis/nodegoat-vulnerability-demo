# Claude Code Integration Guide

This guide helps you get the most out of the Claude Code integration in RSOLV, with advanced configuration options for optimizing context gathering and solution generation.

## Getting Started

To use Claude Code with RSOLV:

1. Install Claude Code CLI:
   ```bash
   # Visit https://claude.ai/console/claude-code for installation instructions
   # Verify installation
   claude -v
   ```

2. Configure your ANTHROPIC_API_KEY:
   ```bash
   export ANTHROPIC_API_KEY=your_api_key_here
   ```

3. Run RSOLV with Claude Code:
   ```bash
   # Enable Claude Code integration
   export RSOLV_USE_CLAUDE_CODE=true
   
   # Run with Claude Code
   cd RSOLV-action && bun run demo-env
   ```

## Advanced Configuration

RSOLV supports advanced configuration options for Claude Code integration. You can customize these settings by:

1. Creating a `claude-code-config.js` file (see example in `claude-code-config.example.js`)
2. Setting environment variables
3. Modifying configuration in code

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `executablePath` | Path to Claude Code executable | `'claude'` |
| `outputFormat` | Output format | `'stream-json'` |
| `contextOptions.maxDepth` | Maximum depth for context exploration (1-5) | `3` |
| `contextOptions.explorationBreadth` | Controls breadth of context exploration (1-5) | `3` |
| `contextOptions.includeDirs` | Directories to include in context gathering | `[]` |
| `contextOptions.excludeDirs` | Directories to exclude from context gathering | `[]` |
| `contextOptions.includeFiles` | File patterns to include in context gathering | `[]` |
| `contextOptions.excludeFiles` | File patterns to exclude from context gathering | `[]` |
| `retryOptions.maxRetries` | Maximum number of retries | `2` |
| `retryOptions.baseDelay` | Base delay for exponential backoff in ms | `1000` |
| `timeout` | Timeout in milliseconds | `300000` (5 min) |
| `tempDir` | Path for temporary files | `'./temp'` |
| `verboseLogging` | Enable detailed logging | `false` |
| `trackUsage` | Enable usage tracking and analytics | `true` |

### Example Configuration

```javascript
// claude-code-config.js
module.exports = {
  useClaudeCode: true,
  claudeCodeConfig: {
    executablePath: 'claude',
    contextOptions: {
      maxDepth: 3,
      includeDirs: ['src', 'lib'],
      excludeDirs: ['node_modules', 'dist'],
      includeFiles: ['*.ts', '*.js'],
      excludeFiles: ['*.test.ts']
    },
    timeout: 300000,
    verboseLogging: true
  }
};
```

### Environment Variables

You can also configure Claude Code using environment variables:

```bash
# Enable Claude Code
export RSOLV_USE_CLAUDE_CODE=true

# Configure context options
export RSOLV_CLAUDE_CODE_MAX_DEPTH=3
export RSOLV_CLAUDE_CODE_INCLUDE_DIRS="src,lib"
export RSOLV_CLAUDE_CODE_EXCLUDE_DIRS="node_modules,dist"

# Enable verbose logging
export RSOLV_CLAUDE_CODE_VERBOSE=true
```

## Optimizing Context Gathering

Claude Code's effectiveness depends on gathering the right context. Here are tips for optimizing context gathering:

### For Small Repositories

For small repositories, default settings work well:

```javascript
contextOptions: {
  maxDepth: 3,
  explorationBreadth: 3
}
```

### For Large Repositories

For large repositories, be more selective:

```javascript
contextOptions: {
  maxDepth: 2,
  explorationBreadth: 2,
  includeDirs: ['src/relevant-module'],
  excludeDirs: ['src/unrelated-module', 'node_modules'],
  includeFiles: ['*.ts', '*.js'],
  excludeFiles: ['*.test.ts', '*.spec.js', '*.d.ts']
}
```

### For Specific Issue Types

Tailor context for specific issue types:

**Frontend UI Issues:**
```javascript
contextOptions: {
  includeDirs: ['src/components', 'src/styles'],
  includeFiles: ['*.tsx', '*.css', '*.scss']
}
```

**Backend API Issues:**
```javascript
contextOptions: {
  includeDirs: ['src/api', 'src/models'],
  includeFiles: ['*.ts', '*.js']
}
```

## Usage Analytics

The Claude Code integration tracks usage analytics to help optimize performance:

1. **View analytics in the logs** when `verboseLogging` is enabled
2. **Access analytics programmatically** with the adapter's `getAnalyticsSummary()` method
3. **Analytics data is stored** in the `tempDir` directory as `claude-code-analytics.json`

Analytics include:
- Success rate
- Average duration
- Context gathering time
- Solution generation time
- API costs
- Error types and frequency

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Claude Code not found | Ensure Claude Code is installed and in your PATH |
| API key errors | Check your ANTHROPIC_API_KEY environment variable |
| Timeout errors | Increase the timeout value or reduce context scope |
| Context gathering failures | Decrease maxDepth or focus on specific directories |
| High API costs | Use more targeted context gathering options |

### Error Messages

The Claude Code integration provides detailed error messages and troubleshooting steps when something goes wrong. Each error message includes:

1. Description of the error
2. Possible causes
3. Recommended actions to fix the issue
4. Fallback behavior explanation

## Best Practices

1. **Start with defaults** for most repositories
2. **Use verbose logging** during setup to understand context gathering
3. **Track costs** to optimize your configuration
4. **Use targeted include/exclude patterns** for large repositories
5. **Adjust depth and breadth** based on repository size and complexity

## Getting Help

For more assistance with Claude Code integration:

1. Check the logs with verbose logging enabled
2. Review the analytics data
3. Refer to the Claude Code documentation
4. Contact support with details from your analytics