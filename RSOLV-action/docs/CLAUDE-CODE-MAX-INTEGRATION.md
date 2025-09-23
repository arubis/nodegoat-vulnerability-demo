# Claude Code Max Integration for GitHub Actions

## Overview

Exploring lightweight, non-destructive ways to leverage Claude Code Max accounts in GitHub Actions instead of consuming API tokens directly.

## Current Approach vs Claude Code Max

### Current: Direct API Usage
- **Cost**: ~$0.30-0.50 per vulnerability fix
- **Rate Limits**: Subject to API rate limits
- **Context**: Limited to API context windows
- **Features**: Basic API capabilities

### Proposed: Claude Code Max Integration
- **Cost**: Fixed monthly subscription ($50/month)
- **Rate Limits**: Generous usage limits for Max accounts
- **Context**: Full Claude Code capabilities
- **Features**: Extended conversations, file operations, tool use

## Implementation Approaches

### Approach 1: Claude Code CLI Authentication Token
```bash
# In GitHub Action, use Claude Code CLI with auth token
- name: Setup Claude Code
  run: |
    bun install -g @anthropic-ai/claude-code
    # Use a secure token stored in GitHub secrets
    echo "${{ secrets.CLAUDE_CODE_AUTH_TOKEN }}" | claude auth login --token
    
- name: Fix Vulnerability
  run: |
    claude chat "Fix the vulnerability in $FILES" \
      --mode code \
      --output pr \
      --context-files $FILES
```

**Pros**:
- Uses official Claude Code CLI
- Leverages Max account benefits
- No API key exposure

**Cons**:
- Requires auth token management
- May need session handling

### Approach 2: Claude Code SDK with Session Token
```typescript
// Use Claude Code SDK with session authentication
import { ClaudeCode } from '@anthropic-ai/claude-code';

const claude = new ClaudeCode({
  authType: 'session',
  sessionToken: process.env.CLAUDE_CODE_SESSION,
  // No API key needed
});

// Use like regular SDK but with Max benefits
const result = await claude.chat({
  messages: [...],
  tools: true,
  maxTokens: 200000  // Extended context
});
```

### Approach 3: Proxy Service with Pooled Sessions
```typescript
// Create a lightweight proxy that manages Claude Code sessions
class ClaudeCodeProxy {
  private sessions: Map<string, ClaudeSession> = new Map();
  
  async getSession(): Promise<ClaudeSession> {
    // Round-robin through available sessions
    // Each session is a Claude Code Max account
    const availableSession = this.findAvailableSession();
    return availableSession;
  }
  
  async executeTask(task: Task): Promise<Result> {
    const session = await this.getSession();
    try {
      return await session.execute(task);
    } finally {
      this.releaseSession(session);
    }
  }
}
```

**Architecture**:
```
GitHub Action → Proxy Service → Claude Code Max Sessions
                     ↓
              Session Pool Manager
              /     |      \
         Session1 Session2 Session3
           (Max)   (Max)    (Max)
```

### Approach 4: GitHub App with Claude Code Integration
```yaml
# GitHub App that uses Claude Code internally
name: RSOLV Fix with Claude Code
on:
  issues:
    types: [labeled]

jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - uses: rsolv/claude-code-action@v1
        with:
          mode: fix
          # No API key needed - handled by the app
```

## Recommended Implementation: Hybrid Approach

### Phase 1: Environment Variable Switch
```typescript
// In the action, detect and use Claude Code if available
const useClaudeCode = process.env.CLAUDE_CODE_SESSION || process.env.CLAUDE_CODE_AUTH;

if (useClaudeCode) {
  // Use Claude Code Max features
  const handler = new ClaudeCodeHandler({
    auth: process.env.CLAUDE_CODE_AUTH,
    features: {
      extendedContext: true,
      fileOperations: true,
      tools: true
    }
  });
  return await handler.process(vulnerability);
} else {
  // Fall back to API
  return await processWithAPI(vulnerability);
}
```

### Phase 2: Dockerfile Enhancement
```dockerfile
# Add Claude Code to the action container
FROM oven/bun:latest

# Install Claude Code CLI
RUN bun install -g @anthropic-ai/claude-code

# Setup auth script
COPY scripts/setup-claude-auth.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/setup-claude-auth.sh

# Action entrypoint checks for Claude Code availability
ENTRYPOINT ["/usr/local/bin/action-entrypoint.sh"]
```

### Phase 3: GitHub Secret Configuration
```yaml
# In repository settings, add:
secrets:
  CLAUDE_CODE_AUTH: ${{ secrets.CLAUDE_CODE_AUTH_TOKEN }}
  # OR use a service account approach
  CLAUDE_SERVICE_ENDPOINT: https://claude-proxy.rsolv.dev
```

## Security Considerations

1. **Token Management**
   - Store auth tokens in GitHub secrets
   - Rotate tokens regularly
   - Use separate accounts for production

2. **Rate Limiting**
   - Implement queuing for concurrent workflows
   - Add backoff strategies
   - Monitor usage against Max limits

3. **Isolation**
   - Each workflow gets isolated session
   - No cross-contamination between fixes
   - Clean session state after use

## Cost-Benefit Analysis

### Current API Costs (Monthly)
- 100 vulnerabilities/month × $0.40 = $40
- 500 vulnerabilities/month × $0.40 = $200
- 1000 vulnerabilities/month × $0.40 = $400

### Claude Code Max Approach
- 1-2 Max accounts = $50-100/month
- Unlimited fixes within rate limits
- Better quality with extended context
- Additional features (tools, file ops)

### Break-even Point
- **125 vulnerabilities/month** with single Max account
- **250 vulnerabilities/month** with two Max accounts

## Migration Strategy

### Step 1: Add Optional Support
```typescript
// Make it optional via environment variable
const AI_MODE = process.env.AI_MODE || 'api';

switch (AI_MODE) {
  case 'claude-code':
    return new ClaudeCodeProcessor();
  case 'api':
  default:
    return new APIProcessor();
}
```

### Step 2: Test in Staging
- Set up Claude Code auth in staging environment
- Run parallel tests comparing both approaches
- Measure quality and performance differences

### Step 3: Gradual Rollout
- Start with 10% of workflows using Claude Code
- Monitor success rates and costs
- Increase percentage based on results

### Step 4: Full Migration
- Switch default to Claude Code
- Keep API as fallback
- Document the new approach

## Implementation Checklist

- [ ] Create Claude Code service account
- [ ] Implement authentication handler
- [ ] Add session management logic
- [ ] Update Dockerfile with Claude Code CLI
- [ ] Create environment variable switches
- [ ] Add monitoring for usage limits
- [ ] Document setup process
- [ ] Test in staging environment
- [ ] Create rollback plan

## Example: Extended Conversation with Claude Code

```typescript
// This would replace the current API-based approach
async function fixWithClaudeCode(vulnerability: Vulnerability) {
  const claude = new ClaudeCodeSession({
    auth: process.env.CLAUDE_CODE_AUTH
  });
  
  // Start extended conversation with full context
  const conversation = await claude.startConversation({
    mode: 'code',
    context: {
      files: vulnerability.files,
      repository: process.env.GITHUB_REPOSITORY,
      issue: vulnerability.issueNumber
    }
  });
  
  // Process all files in single conversation
  const result = await conversation.chat(`
    Fix the ${vulnerability.type} vulnerability across these files:
    ${vulnerability.files.join('\n')}
    
    Create a single comprehensive PR with all changes.
    Use extended context to maintain consistency.
  `);
  
  // Claude Code can directly create the PR
  const pr = await result.createPullRequest({
    title: `Fix ${vulnerability.type} vulnerability`,
    branch: `fix-${vulnerability.issueNumber}`
  });
  
  return pr;
}
```

## Conclusion

Using Claude Code Max for GitHub Actions is feasible and could provide:
1. **Cost savings** at scale (>125 vulnerabilities/month)
2. **Better quality** fixes with extended context
3. **Additional features** not available via API
4. **Simpler architecture** for multi-file vulnerabilities

The hybrid approach allows testing without disrupting current workflows, making it a low-risk enhancement to explore.