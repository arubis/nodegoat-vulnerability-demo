# Linear Integration Guide

RSOLV supports Linear for issue tracking and management. This guide explains how to configure and use the Linear integration.

## Prerequisites

1. A Linear account with API access
2. A Linear API key (personal or service account)
3. (Optional) Your Linear team ID

## Configuration

### 1. Create a Linear API Key

1. Go to [Linear Settings > API](https://linear.app/settings/api)
2. Click "Create new API key"
3. Give it a descriptive name (e.g., "RSOLV Integration")
4. Copy the generated key (starts with `lin_api_`)

### 2. Set Environment Variables

```bash
# Required
export LINEAR_API_KEY="lin_api_YOUR_KEY_HERE"

# Optional - if you want to limit to a specific team
export LINEAR_TEAM_ID="your-team-id"

# Optional - custom label names (defaults shown)
export LINEAR_AUTOFIX_LABEL="autofix"
export LINEAR_RSOLV_LABEL="rsolv"
```

### 3. Label Your Issues

RSOLV will only process Linear issues that have either:
- The `autofix` label
- The `rsolv` label

Add these labels to issues you want RSOLV to analyze and fix.

## How It Works

1. **Issue Detection**: RSOLV searches for Linear issues with the configured labels
2. **Repository Mapping**: RSOLV looks for GitHub repository references in:
   - Issue description (GitHub URLs)
   - Custom fields (if configured)
3. **Analysis**: RSOLV analyzes the issue and generates a fix
4. **Updates**: RSOLV:
   - Adds a comment with the PR link
   - Optionally updates the issue status
   - Adds labels to track progress

## Testing the Integration

Run the test script to verify your Linear integration:

```bash
cd RSOLV-action
bun run test-linear-integration.ts
```

This will:
1. Search for issues with the configured labels
2. Test commenting on an issue
3. Test adding links and labels

## Mapping Linear Issues to GitHub Repositories

Since Linear issues don't have a direct repository association, RSOLV uses these methods:

### Method 1: GitHub URLs in Description

Include a GitHub repository URL in your Linear issue description:

```
Fix the memory leak in the user service

Repository: https://github.com/myorg/myrepo
```

### Method 2: Custom Fields (Coming Soon)

Configure custom fields in Linear to store repository information.

### Method 3: Issue Templates

Create Linear issue templates that include repository fields.

## Linear-Specific Features

### Issue States

RSOLV maps Linear workflow states to standard categories:
- **Todo**: `backlog`, `unstarted`
- **In Progress**: `started`, `in_progress`
- **Done**: `completed`, `done`, `canceled`

### Comments and Links

Since Linear doesn't have direct link attachments like Jira, RSOLV adds links as formatted comments with the 🔗 emoji.

## Troubleshooting

### Authentication Errors

If you see 401 errors:
1. Verify your API key is correct
2. Check that the key hasn't been revoked
3. Ensure you have the necessary permissions

### No Issues Found

If RSOLV doesn't find any issues:
1. Verify issues have the correct labels
2. Check your team ID (if specified)
3. Ensure the issues are not archived

### Rate Limiting

Linear's API has rate limits. If you hit them:
1. Wait a few minutes before retrying
2. Consider implementing batch operations
3. Use webhooks for real-time updates (coming soon)

## Example Workflow

1. Create a Linear issue describing a bug or feature
2. Add the `autofix` label
3. Include the GitHub repository URL in the description
4. Run RSOLV
5. RSOLV will:
   - Detect the issue
   - Analyze the repository
   - Create a PR with the fix
   - Update the Linear issue with the PR link

## Advanced Configuration

### Custom JQL-like Queries (Coming Soon)

Future versions will support custom Linear queries for more complex filtering.

### Webhook Integration (Coming Soon)

Real-time processing of Linear issues as they're created or updated.

## Security Considerations

- Store your Linear API key securely
- Use environment variables or secret management systems
- Never commit API keys to version control
- Consider using a service account for production