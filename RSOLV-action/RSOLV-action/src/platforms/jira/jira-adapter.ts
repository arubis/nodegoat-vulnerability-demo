import type { UnifiedIssue, IssueComment, IssueLink } from '../types.js';
import { BasePlatformAdapter } from '../base-adapter.js';
import { logger } from '../../utils/logger.js';

export interface JiraConfig {
  host: string;
  email: string;
  apiToken: string;
  autofixLabel?: string;
  rsolvLabel?: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: string;
    labels?: string[];
    status: { name: string };
    created: string;
    updated: string;
    assignee?: {
      accountId: string;
      displayName: string;
      emailAddress?: string;
    };
    reporter?: {
      accountId: string;
      displayName: string;
      emailAddress?: string;
    };
  };
}

export class JiraAdapter extends BasePlatformAdapter {
  private baseUrl: string;
  private authHeader: string;

  constructor(private config: JiraConfig) {
    super(config);
    this.validateConfig(config, ['host', 'email', 'apiToken']);
    this.baseUrl = `https://${config.host}/rest/api/3`;
    this.authHeader = `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')}`;
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': this.authHeader,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
  }

  async authenticate(): Promise<void> {
    try {
      await this.makeRequest(`${this.baseUrl}/myself`);
      logger.info('Successfully authenticated with Jira');
    } catch (error) {
      throw new Error(this.formatError('Jira authentication', error));
    }
  }

  async searchIssues(query: string): Promise<UnifiedIssue[]> {
    try {
      const response = await this.makeRequest(`${this.baseUrl}/search`, {
        method: 'POST',
        body: JSON.stringify({
          jql: query,
          fields: ['summary', 'description', 'labels', 'status', 'created', 'updated', 'assignee', 'reporter']
        })
      });

      const data = await response.json();
      return data.issues.map((issue: JiraIssue) => this.convertToUnifiedIssue(issue));
    } catch (error) {
      throw new Error(this.formatError('Jira issue search', error));
    }
  }

  async getIssue(issueId: string): Promise<UnifiedIssue | null> {
    try {
      const extractedId = this.extractIssueId(issueId);
      const response = await this.makeRequest(`${this.baseUrl}/issue/${extractedId}`);
      const issue = await response.json();
      return this.convertToUnifiedIssue(issue);
    } catch (error: any) {
      if (error.message?.includes('404')) {
        return null;
      }
      throw new Error(this.formatError('Get Jira issue', error));
    }
  }

  async createComment(issueId: string, body: string): Promise<IssueComment | null> {
    try {
      const extractedId = this.extractIssueId(issueId);
      const response = await this.makeRequest(`${this.baseUrl}/issue/${extractedId}/comment`, {
        method: 'POST',
        body: JSON.stringify({
          body: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: body
                  }
                ]
              }
            ]
          }
        })
      });

      const comment = await response.json();
      return {
        id: comment.id,
        body: body,
        author: comment.author?.displayName || 'Unknown',
        createdAt: new Date(comment.created)
      };
    } catch (error) {
      logger.error('Failed to create Jira comment', error);
      return null;
    }
  }

  async updateIssueStatus(issueId: string, status: string): Promise<boolean> {
    try {
      const extractedId = this.extractIssueId(issueId);
      
      // First, get available transitions
      const transitionsResponse = await this.makeRequest(`${this.baseUrl}/issue/${extractedId}/transitions`);
      const { transitions } = await transitionsResponse.json();
      const transition = transitions.find((t: any) => t.name === status);

      if (!transition) {
        logger.warn(`Status '${status}' not available for issue ${issueId}`);
        return false;
      }

      // Update the status
      await this.makeRequest(`${this.baseUrl}/issue/${extractedId}/transitions`, {
        method: 'POST',
        body: JSON.stringify({
          transition: { id: transition.id }
        })
      });

      return true;
    } catch (error) {
      logger.error('Failed to update Jira issue status', error);
      return false;
    }
  }

  async addLink(issueId: string, url: string, title?: string): Promise<IssueLink | null> {
    try {
      const extractedId = this.extractIssueId(issueId);
      const linkTitle = title || url;
      
      const response = await this.makeRequest(`${this.baseUrl}/issue/${extractedId}/remotelink`, {
        method: 'POST',
        body: JSON.stringify({
          object: {
            url,
            title: linkTitle,
            icon: {
              url16x16: url.includes('github.com') ? 'https://github.com/favicon.ico' : undefined,
              title: url.includes('github.com') ? 'GitHub Pull Request' : 'External Link'
            }
          }
        })
      });

      const link = await response.json();
      return {
        id: link.id,
        url: url,
        title: linkTitle,
        type: 'external'
      };
    } catch (error) {
      logger.error('Failed to add link to Jira issue', error);
      return null;
    }
  }

  async addLabel(issueId: string, labelName: string): Promise<boolean> {
    try {
      const extractedId = this.extractIssueId(issueId);
      
      // First get the current issue to preserve existing labels
      const issueResponse = await this.makeRequest(`${this.baseUrl}/issue/${extractedId}?fields=labels`);
      const issue = await issueResponse.json();
      const currentLabels = issue.fields.labels || [];
      
      // Add the new label if it doesn't exist
      if (!currentLabels.includes(labelName)) {
        await this.makeRequest(`${this.baseUrl}/issue/${extractedId}`, {
          method: 'PUT',
          body: JSON.stringify({
            fields: {
              labels: [...currentLabels, labelName]
            }
          })
        });
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to add label to Jira issue', error);
      return false;
    }
  }

  protected convertToUnifiedIssue(jiraIssue: JiraIssue): UnifiedIssue {
    return {
      id: jiraIssue.id,
      platform: 'jira',
      key: jiraIssue.key,
      title: jiraIssue.fields.summary,
      description: jiraIssue.fields.description || '',
      labels: jiraIssue.fields.labels || [],
      status: jiraIssue.fields.status.name,
      url: `https://${this.config.host}/browse/${jiraIssue.key}`,
      createdAt: new Date(jiraIssue.fields.created),
      updatedAt: new Date(jiraIssue.fields.updated),
      assignee: jiraIssue.fields.assignee ? {
        id: jiraIssue.fields.assignee.accountId,
        name: jiraIssue.fields.assignee.displayName,
        email: jiraIssue.fields.assignee.emailAddress
      } : undefined,
      reporter: jiraIssue.fields.reporter ? {
        id: jiraIssue.fields.reporter.accountId,
        name: jiraIssue.fields.reporter.displayName,
        email: jiraIssue.fields.reporter.emailAddress
      } : undefined
    };
  }

  /**
   * Helper method to search for issues with the autofix label
   */
  async searchAutofixIssues(): Promise<UnifiedIssue[]> {
    return this.searchIssues(`labels = "${this.autofixLabel}"`);
  }

  /**
   * Helper method to search for issues with either autofix or rsolv labels
   */
  async searchRsolvIssues(): Promise<UnifiedIssue[]> {
    // JQL to find issues with either label
    const jql = `labels in ("${this.autofixLabel}", "${this.rsolvLabel}")`;
    return this.searchIssues(jql);
  }
}