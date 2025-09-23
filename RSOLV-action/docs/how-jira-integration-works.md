# How RSOLV Jira Integration Works

## Overview

RSOLV now supports Jira as a source for issues to automatically fix. This document explains exactly how the integration works from end to end.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    Jira     │     │   GitHub    │     │    RSOLV    │
│   Issues    │────▶│   Issues    │────▶│   Action    │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│     AI      │     │   GitHub    │     │    Jira     │
│  Analysis   │────▶│     PR      │────▶│   Update    │
└─────────────┘     └─────────────┘     └─────────────┘
```

## Step-by-Step Flow

### 1. Configuration

In your GitHub workflow (`.github/workflows/rsolv.yml`):

```yaml
- name: Run RSOLV
  uses: rsolv-dev/rsolv-action@v1
  with:
    # Standard RSOLV configuration
    api_key: ${{ secrets.RSOLV_API_KEY }}
    
    # Jira configuration
    jira_host: ${{ secrets.JIRA_HOST }}
    jira_email: ${{ secrets.JIRA_EMAIL }}
    jira_api_token: ${{ secrets.JIRA_API_TOKEN }}
    jira_autofix_label: 'autofix'  # Optional
```

### 2. Issue Detection

When RSOLV runs, it:

1. **Checks for configured platforms** in `src/platforms/issue-detector.ts`:
   ```typescript
   // Always check GitHub
   const githubIssues = await detectGitHubIssues(config);
   
   // Check Jira if configured
   if (process.env.JIRA_HOST && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN) {
     const jiraIssues = await detectJiraIssues(config);
   }
   ```

2. **Authenticates with Jira** using Basic Auth:
   ```typescript
   const adapter = new JiraAdapter({
     host: process.env.JIRA_HOST,
     email: process.env.JIRA_EMAIL,
     apiToken: process.env.JIRA_API_TOKEN
   });
   await adapter.authenticate();
   ```

3. **Searches for labeled issues** using JQL:
   ```typescript
   // Default search - looks for BOTH labels
   const issues = await adapter.searchRsolvIssues();
   // This searches: labels in ("autofix", "rsolv")
   
   // Or custom JQL if provided
   const issues = await adapter.searchIssues(process.env.JIRA_JQL);
   ```

   **Note**: RSOLV automatically searches for issues with either `rsolv` OR `autofix` labels across all platforms!

### 3. Issue Transformation

Jira issues are converted to RSOLV's unified format:

```typescript
// From Jira format
{
  key: "PROJ-123",
  fields: {
    summary: "Fix deprecated API",
    description: "Repository: https://github.com/myorg/myapp...",
    labels: ["autofix", "security"]
  }
}

// To unified format
{
  id: "jira-10001",
  platform: "jira",
  key: "PROJ-123",
  title: "Fix deprecated API",
  description: "Repository: https://github.com/myorg/myapp...",
  labels: ["autofix", "security"],
  repository: {
    owner: "myorg",
    name: "myapp"
  }
}
```

### 4. Repository Extraction

RSOLV extracts GitHub repository info from Jira issues:

1. **From description text**:
   ```typescript
   const pattern = /https?:\/\/github\.com\/([^\/]+)\/([^\/\s]+)/g;
   const match = pattern.exec(issue.description);
   ```

2. **From custom fields** (if configured in Jira):
   ```typescript
   if (issue.customFields?.githubRepository) {
     const [owner, name] = issue.customFields.githubRepository.split('/');
   }
   ```

### 5. AI Processing

Issues from all platforms are processed the same way:

```typescript
// In src/index.ts
const issues = await detectIssuesFromAllPlatforms(config);
const results = await processIssues(issues, config);
```

### 6. Pull Request Creation

After generating a fix, RSOLV creates a PR in the linked GitHub repository:

```typescript
// PR title includes Jira key for traceability
const prTitle = `Fix: ${issue.title} (${issue.metadata.platformKey})`;
```

### 7. Jira Updates

After creating the PR, RSOLV updates the Jira issue:

```typescript
// Add comment with PR link
await adapter.addComment(
  issue.key,
  `RSOLV has created a pull request: ${prUrl}`
);

// Link the PR
await adapter.linkExternalResource(
  issue.key,
  prUrl,
  prTitle
);

// Update status (if workflow configured)
await adapter.updateStatus(issue.key, 'In Progress');
```

## Data Flow Example

```
1. Jira Issue PROJ-123
   Title: "Fix SQL injection vulnerability"
   Description: "Found in https://github.com/myorg/api file: src/db/queries.js"
   Labels: ["autofix", "security", "critical"]
   
2. Detected by RSOLV
   Platform: jira
   Repository extracted: myorg/api
   
3. AI Analysis
   Identifies SQL injection pattern
   Generates parameterized query fix
   
4. GitHub PR #456
   Title: "Fix: SQL injection vulnerability (PROJ-123)"
   Branch: fix/proj-123-sql-injection
   
5. Jira Updated
   Comment: "RSOLV created PR: github.com/myorg/api/pull/456"
   Status: To Do → In Progress
   Link: PR #456 attached
```

## Platform Adapter Pattern

The integration uses an adapter pattern for extensibility:

```typescript
interface PlatformAdapter {
  authenticate(): Promise<void>;
  searchIssues(query: string): Promise<UnifiedIssue[]>;
  addComment(issueId: string, comment: string): Promise<void>;
  linkExternalResource(issueId: string, url: string, title: string): Promise<void>;
  updateStatus(issueId: string, status: string): Promise<void>;
}
```

This makes it easy to add new platforms (Linear, GitLab, etc.) following the same pattern.

## Security Considerations

1. **API Token Storage**: Jira API tokens are stored as GitHub secrets
2. **Minimal Permissions**: Only requires:
   - Browse projects
   - Create comments
   - Create issue links
   - (Optional) Transition issues
3. **No Write Access**: RSOLV never modifies issue content, only adds metadata

## Testing

Run the integration test to verify setup:

```bash
# Set credentials
export JIRA_HOST='your-domain.atlassian.net'
export JIRA_EMAIL='your-email@example.com'
export JIRA_API_TOKEN='your-token'

# Run test
bun test-jira-integration.ts
```

## Troubleshooting

Common issues:

1. **No issues found**: Check that issues have the correct label
2. **Repository not detected**: Include GitHub URL in issue description
3. **Authentication fails**: Verify API token has correct permissions
4. **Status update fails**: Check workflow transition permissions

## Future Enhancements

- Custom field mapping for repository info
- Webhook support for real-time processing
- Bulk operations for large backlogs
- Smart repository detection using project metadata