# Claude Code Vended Credentials Support

## Current Status ✅

Based on the documentation analysis and code review:

1. **Claude Code DOES support API key via environment variable**
   - Set `ANTHROPIC_API_KEY` environment variable
   - We already pass this in `claude-code.ts` (line 486)

2. **We've enhanced support for vended credentials**
   - Modified constructor to accept credential manager
   - Check for vended credentials before spawning CLI
   - Fall back to config API key if vending fails

## Implementation Details

### Code Changes Made:
```typescript
// In claude-code.ts constructor
constructor(config: AIConfig, repoPath: string = process.cwd(), credentialManager?: any) {
  this.credentialManager = credentialManager;
  // ...
}

// In runClaudeCode method
if (this.config.useVendedCredentials && this.credentialManager) {
  try {
    apiKey = this.credentialManager.getCredential('anthropic');
    logger.info('Using vended Anthropic credential for Claude Code');
  } catch (error) {
    logger.warn('Failed to get vended credential, falling back to config API key', error);
  }
}

const envVars = {
  ...process.env,
  ANTHROPIC_API_KEY: apiKey  // Pass to Claude Code CLI
};
```

## Additional Proxy Support

Claude Code also supports:
- **AWS Bedrock**: Via `CLAUDE_CODE_USE_BEDROCK=1`
- **Google Vertex AI**: Via `CLAUDE_CODE_USE_VERTEX=1`
- **Custom Proxies**: Via `ANTHROPIC_BEDROCK_BASE_URL` or `ANTHROPIC_VERTEX_BASE_URL`

## Testing Vended Credentials

To test Claude Code with vended credentials:

```bash
# 1. Ensure Claude Code CLI is installed
npm install -g @anthropic/claude-code

# 2. Run the vended credential test
VENDED_CREDENTIAL_E2E_TEST=true \
RSOLV_API_KEY=your_rsolv_key \
CLAUDE_CODE_AVAILABLE=true \
bun test src/ai/__tests__/vended-credential-e2e.test.ts

# 3. Or test Claude Code directly
CLAUDE_CODE_LIVE_TEST=true \
RSOLV_API_KEY=your_rsolv_key \
bun test src/ai/__tests__/claude-code-live.test.ts
```

## Next Steps

1. **Update AI client factory** to pass credential manager to Claude Code adapter
2. **Test the integration** with real vended credentials
3. **Add specific tests** for Claude Code + vended credentials
4. **Document** the setup process for users