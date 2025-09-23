# Jira Integration Guide

RSOLV now supports Jira for automatic issue resolution! This guide will help you set up and configure the Jira integration.

## Prerequisites

1. A Jira Cloud instance (e.g., `your-domain.atlassian.net`)
2. A Jira user account with appropriate permissions
3. An API token for authentication

## Setting Up API Authentication

1. **Generate an API Token**:
   - Go to [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
   - Click "Create API token"
   - Give it a descriptive name like "RSOLV Integration"
   - Copy the token immediately (you won't be able to see it again)

2. **Store Credentials Securely**:
   - In your GitHub repository, go to Settings → Secrets and variables → Actions
   - Add the following secrets:
     - `JIRA_HOST`: Your Jira domain (e.g., `your-domain.atlassian.net`)
     - `JIRA_EMAIL`: Your Jira account email
     - `JIRA_API_TOKEN`: The API token you generated

## Configuring RSOLV for Jira

Update your GitHub workflow to include Jira configuration:

```yaml
name: RSOLV Auto-Fix
on:
  schedule:
    - cron: '0 */6 * * *'  # Run every 6 hours
  workflow_dispatch:  # Allow manual triggering

jobs:
  auto-fix:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run RSOLV
        uses: rsolv-dev/rsolv-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          
          # Jira Configuration
          jira-host: ${{ secrets.JIRA_HOST }}
          jira-email: ${{ secrets.JIRA_EMAIL }}
          jira-api-token: ${{ secrets.JIRA_API_TOKEN }}
          jira-autofix-label: 'rsolv-autofix'  # Optional, defaults to 'autofix'
```

## Using RSOLV with Jira

1. **Label Issues for Automation**:
   - In Jira, add either the `rsolv` or `autofix` label to issues you want RSOLV to handle
   - RSOLV will automatically find issues with either label during its scheduled runs
   - You can customize these labels using `jira-autofix-label` and `jira-rsolv-label` in your workflow

2. **What Happens Next**:
   - RSOLV analyzes the issue description and any linked code repositories
   - It generates a solution and creates a pull request in the linked GitHub repository
   - A comment is added to the Jira issue with a link to the PR
   - The issue status can be automatically updated (e.g., moved to "In Progress")

3. **Linking Repositories**:
   - Make sure your Jira project is connected to your GitHub repositories
   - You can do this through Jira's Development panel or by including repository URLs in issue descriptions

## Example Jira Issue

Here's an example of a Jira issue that RSOLV can handle:

```
Title: Fix deprecated API usage in authentication module

Description:
The authentication module is using deprecated crypto methods that need to be updated.

Repository: https://github.com/yourorg/yourrepo
File: src/auth/crypto.js

The current implementation uses crypto.createCipher which is deprecated. 
We need to update it to use crypto.createCipheriv with proper initialization vectors.

Labels: rsolv, technical-debt, security
```

Note: You can use either `rsolv` or `autofix` as the label - RSOLV will detect both.

## Supported Issue Types

RSOLV works best with issues that:
- Have clear, specific descriptions
- Reference specific files or code areas
- Include error messages or logs when applicable
- Are labeled appropriately for automation

## Testing Your Setup

Test your Jira integration locally using our Bun script:

```bash
# Set your credentials
export JIRA_HOST='your-domain.atlassian.net'
export JIRA_EMAIL='your-email@example.com'
export JIRA_API_TOKEN='your-api-token'

# Run the test
bun test-jira-integration.ts
```

## Monitoring and Troubleshooting

1. **Check Action Logs**:
   - Go to your GitHub repository's Actions tab
   - Look for the RSOLV workflow runs
   - Check logs for any Jira connection issues

2. **Verify Permissions**:
   - Ensure your API token has permissions to:
     - Browse projects
     - Create comments
     - Create issue links
     - Transition issues (if using status updates)

3. **Common Issues**:
   - **401 Unauthorized**: Check your API token and email are correct
   - **404 Not Found**: Verify the Jira host URL and issue keys
   - **No issues found**: Ensure issues have the correct label

## Advanced Configuration

### Custom JQL Queries

Instead of using labels, you can specify a custom JQL query:

```yaml
- name: Run RSOLV
  uses: rsolv-dev/rsolv-action@v1
  with:
    jira-jql: 'project = PROJ AND status = "To Do" AND component = "Backend"'
```

### Multiple Projects

To scan multiple Jira projects:

```yaml
- name: Run RSOLV
  uses: rsolv-dev/rsolv-action@v1
  with:
    jira-jql: 'labels = "autofix" AND project in (PROJ1, PROJ2, PROJ3)'
```

## Security Best Practices

1. **Limit API Token Scope**: Create a dedicated Jira user for RSOLV with minimal necessary permissions
2. **Rotate Tokens Regularly**: Update your API tokens periodically
3. **Monitor Activity**: Review RSOLV's actions in both Jira and GitHub audit logs
4. **Test First**: Start with a test project before enabling on production issues

## Getting Help

- Check the [RSOLV Documentation](https://docs.rsolv.dev)
- Report issues on [GitHub](https://github.com/rsolv-dev/rsolv-action/issues)
- Contact support at support@rsolv.dev