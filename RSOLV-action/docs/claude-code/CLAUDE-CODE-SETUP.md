# Claude Code Setup Guide

This guide provides detailed steps for setting up and configuring Claude Code integration with RSOLV.

## Prerequisites

- Node.js v18+ and npm
- Bun runtime
- Anthropic API key with Claude access
- GitHub token (if using GitHub functionality)

## Installation Steps

### 1. Install Claude Code CLI

The Claude Code integration requires the Claude Code CLI to be installed globally:

```bash
# Install globally
npm install -g @anthropic-ai/claude-code

# Verify installation
claude -v
```

You should see output showing the Claude CLI version number.

### 2. Set Up Environment Variables

```bash
# Required for Claude Code
export ANTHROPIC_API_KEY=your_anthropic_api_key

# Optional but recommended for GitHub functionality
export GITHUB_TOKEN=your_github_token
```

For permanent configuration, add these to your shell profile (.bashrc, .zshrc, etc.) or use a .env file if supported by your deployment method.

### 3. Configure RSOLV to Use Claude Code

#### Via GitHub Action

```yaml
name: RSOLV AI Fix

on:
  issues:
    types: [opened, labeled]

jobs:
  fix-issue:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: RSOLV AI Fix
        uses: rsolv-dev/rsolv-action@main
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          ai_provider: anthropic
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          use_claude_code: true  # Enable Claude Code integration
```

#### Via Demo Environment

```bash
# Start demo environment
bun run demo-env

# Select 'claude-code' as the provider when prompted
```

## Troubleshooting

### Common Issues

1. **Claude CLI Not Found**
   - Error: `Claude Code CLI not available`
   - Solution: Verify installation with `claude -v` and ensure it's in your PATH

2. **Authentication Errors**
   - Error: `Claude Code exited with error: Authentication failed`
   - Solution: Check your ANTHROPIC_API_KEY is correct and has Claude access

3. **Timeouts**
   - Error: `Claude Code execution timed out`
   - Solution: Increase the timeout setting or check network connectivity

4. **Solution Parsing Errors**
   - Error: `Error parsing Claude Code output`
   - Solution: Enable debug logging to see raw output and check for format changes

### Debug Mode

To enable debug logging:

```bash
export DEBUG=rsolv:*
bun run demo-env
```

## Testing Claude Code Integration

### Basic Verification

After installation, run this command to verify Claude Code works properly:

```bash
# Quick test
claude -v && echo "Claude Code installed correctly"

# Interactive test
claude "What version of Claude am I using?"
```

### Integration Test

Use the demo environment to test the complete integration:

```bash
# Run demo
bun run demo-env

# Select the context evaluation option from the menu
```

## Claude Code Configuration

### Advanced Configuration Options

The Claude Code adapter supports these configuration options:

- **Path Customization**: Override default executable path
- **Retry Behavior**: Customize retry counts and backoff
- **Context Handling**: Tune repository exploration depth

Example in code:

```typescript
const adapter = new ClaudeCodeAdapter({
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY,
  useClaudeCode: true,
  // Advanced options
  claudeCodeOptions: {
    executablePath: '/custom/path/to/claude',
    maxRetries: 3,
    contextDepth: 'high'
  }
});
```

## Security Considerations

- API keys are never stored in files, only used in memory
- Temporary prompt files are cleaned up after use
- No sensitive repository data is transmitted outside approved channels

## Next Steps

After setup, try these next steps:

1. Run a complete demo session with a real issue
2. Compare solution quality with and without Claude Code
3. Integrate with your CI/CD pipeline
4. Set up feedback collection for continuous improvement