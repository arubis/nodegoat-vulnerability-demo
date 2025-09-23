# Claude Code Max for Development

## Overview

This document outlines how to use Claude Code Max for processing real GitHub issues during development, avoiding API costs while maintaining the same workflow as production.

## Current Status: ✅ Available

We have implemented full Claude Code Max support for local development. This allows processing real GitHub issues without consuming API tokens.

## Architecture

```
GitHub Issue → Local Runner → Claude Code Max → PR Creation
     ↑             ↓                ↓              ↓
   Labels      Clone Repo      Local Auth      Push to GitHub
```

## Pros and Cons

### Pros ✅

1. **Zero API Costs**: No token consumption during development
2. **Faster Iteration**: Direct local execution without CI/CD overhead
3. **Full Debugging**: Complete access to logs and debugging tools
4. **Same Code Paths**: Uses identical logic as production
5. **Interactive Fixes**: Can pause and inspect during execution
6. **Unlimited Usage**: Within Claude subscription limits
7. **More Secure**: No API keys in environment variables

### Cons ❌

1. **No CI/CD Automation**: Can't run in GitHub Actions
2. **Requires Local Setup**: Developer machine must be configured
3. **Manual Triggering**: No automatic webhook processing
4. **Single Developer**: Can't be shared across team without individual setups
5. **No Parallelization**: Processes issues sequentially
6. **Desktop App Required**: Must have Claude app installed and authenticated

## Available Options

### Option 1: Local Fix Runner (✅ Implemented)

**What**: Standalone script that processes issues locally using Claude Max
**When**: During development and testing
**How**: `bun run local-fix-runner.ts --repo owner/name --issue 123`

```bash
# Process specific issue
bun run local-fix-runner.ts --repo RSOLV-dev/nodegoat-vulnerability-demo --issue 432

# Monitor for new issues
bun run local-fix-runner.ts --repo RSOLV-dev/nodegoat-vulnerability-demo --monitor

# List available issues
bun run local-fix-runner.ts --repo RSOLV-dev/nodegoat-vulnerability-demo
```

### Option 2: Direct Mode Execution

**What**: Run the action directly with environment overrides
**When**: Testing specific scenarios
**How**: Set environment variables and run index.ts

```bash
export RSOLV_DEV_MODE=true
export RSOLV_USE_CLAUDE_MAX=true
export GITHUB_REPOSITORY=owner/name
export INPUT_ISSUE_NUMBER=123
bun run src/index.ts
```

### Option 3: Webhook Bridge (Future)

**What**: Local service that receives GitHub webhooks
**When**: Semi-automated development workflow
**How**: Not yet implemented

Would involve:
- ngrok or similar for webhook forwarding
- Local service monitoring webhook events
- Automatic processing with Claude Max

### Option 4: Hybrid Credential System

**What**: Fallback between Claude Max and API
**When**: Mixed development/production scenarios
**How**: Already implemented in ClaudeCodeMaxAdapter

```typescript
// Automatically uses Claude Max in dev, API in prod
const adapter = createAIAdapter(config);
```

## Setup Instructions

### Prerequisites

1. **Install Claude Desktop App**
   ```bash
   # Download from: https://claude.ai/download
   # Sign in with your account
   ```

2. **Verify CLI Access**
   ```bash
   # Should output response, not error
   echo "Hello" | claude --print
   ```

3. **Set GitHub Token**
   ```bash
   export GITHUB_TOKEN=ghp_your_token_here
   ```

### Running Local Fixes

1. **Clone RSOLV-action**
   ```bash
   git clone https://github.com/RSOLV-dev/RSOLV-action.git
   cd RSOLV-action
   bun install
   ```

2. **List Available Issues**
   ```bash
   bun run local-fix-runner.ts --repo RSOLV-dev/nodegoat-vulnerability-demo
   ```

3. **Process an Issue**
   ```bash
   bun run local-fix-runner.ts --repo RSOLV-dev/nodegoat-vulnerability-demo --issue 432
   ```

4. **Monitor Mode** (auto-process new issues)
   ```bash
   bun run local-fix-runner.ts --repo RSOLV-dev/nodegoat-vulnerability-demo --monitor
   ```

## Cost Comparison

| Method | Cost per Issue | 9 Issues | 100 Issues |
|--------|---------------|----------|------------|
| API Tokens (Sonnet) | ~$0.01 | $0.09 | $1.00 |
| API Tokens (Opus) | ~$0.05 | $0.45 | $5.00 |
| Claude Code Max | $0.00 | $0.00 | $0.00 |
| **Savings** | **100%** | **100%** | **100%** |

## Workflow Comparison

### Production Workflow
```
GitHub Issue → Label Added → GitHub Action → API Call → Fix → PR
   (0s)          (1s)           (30s)        (60s)    (10s)  (5s)
                           Total: ~106 seconds
```

### Development Workflow with Claude Max
```
GitHub Issue → Local Runner → Claude Max → Fix → PR
   (0s)          (5s)          (0s)      (10s)  (5s)
                      Total: ~20 seconds
```

**5x faster** during development!

## Security Considerations

### Advantages
- No API keys in repository
- No credentials in CI/CD logs
- Interactive authentication more secure
- Local execution reduces attack surface

### Precautions
- Keep Claude desktop app updated
- Don't share Claude session/cookies
- Use separate GitHub token for development
- Review PRs before merging

## Troubleshooting

### Claude Max Not Available

```bash
# Check if Claude CLI works
echo "test" | claude --print

# If error, ensure:
1. Claude desktop app is installed
2. You're signed in
3. CLI integration is enabled in settings
```

### Permission Denied

```bash
# Make script executable
chmod +x local-fix-runner.ts

# Or run with bun directly
bun run local-fix-runner.ts
```

### GitHub Authentication Failed

```bash
# Verify token works
curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user

# Ensure token has required scopes:
- repo (full control)
- workflow (if updating actions)
```

## Best Practices

1. **Development First**: Always test with Claude Max locally before production
2. **Batch Processing**: Process multiple issues in one session to maximize efficiency
3. **Monitor Mode**: Use monitor mode during active development sessions
4. **Dry Run**: Use `--dry-run` flag to verify setup before processing
5. **Clean Branches**: Regularly clean up test branches in your repo
6. **Document Changes**: Keep track of which issues were processed locally

## Integration with IDE

### VS Code Task

`.vscode/tasks.json`:
```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Fix Issue with Claude Max",
      "type": "shell",
      "command": "bun run ${workspaceFolder}/local-fix-runner.ts --repo ${input:repo} --issue ${input:issue}",
      "problemMatcher": []
    }
  ],
  "inputs": [
    {
      "id": "repo",
      "type": "promptString",
      "description": "Repository (owner/name)"
    },
    {
      "id": "issue",
      "type": "promptString",
      "description": "Issue number"
    }
  ]
}
```

## Future Enhancements

1. **Webhook Bridge**: Automated local processing of GitHub events
2. **Team Sharing**: Shared Claude Max pool for team development
3. **Parallel Processing**: Multiple Claude instances for faster batch processing
4. **IDE Plugin**: Direct integration with VS Code/IntelliJ
5. **Cost Tracking**: Detailed comparison metrics vs API usage

## Summary

Claude Code Max integration provides a powerful development workflow that:
- Eliminates API costs during development
- Speeds up iteration cycles by 5x
- Maintains identical code paths to production
- Provides full debugging capabilities

For production deployments, the system automatically falls back to API tokens, ensuring seamless transition from development to production environments.