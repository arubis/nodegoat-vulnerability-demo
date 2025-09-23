import { UnifiedIssue, IssueComment, IssueLink } from '../types.js';
import { BasePlatformAdapter } from '../base-adapter.js';
import { logger } from '../../utils/logger.js';

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  state: {
    name: string;
    type: string;
  };
  labels: {
    nodes: Array<{
      name: string;
    }>;
  };
  assignee?: {
    name: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
  url: string;
}

interface LinearComment {
  id: string;
  body: string;
  user: {
    name: string;
    email: string;
  };
  createdAt: string;
}

interface LinearConfig {
  apiKey: string;
  teamId?: string;
  autofixLabel?: string;
  rsolvLabel?: string;
}

export class LinearAdapter extends BasePlatformAdapter {
  private apiKey: string;
  private baseUrl = 'https://api.linear.app/graphql';
  private teamId?: string;

  constructor(config: LinearConfig) {
    super(config);
    this.validateConfig(config, ['apiKey']);
    this.apiKey = config.apiKey;
    this.teamId = config.teamId;
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': this.apiKey,
      'Content-Type': 'application/json'
    };
  }

  private async graphqlRequest<T>(query: string, variables?: Record<string, any>): Promise<T> {
    try {
      const response = await this.makeRequest(this.baseUrl, {
        method: 'POST',
        body: JSON.stringify({ query, variables }),
      });

      const data = await response.json();
      if (data.errors) {
        throw new Error(`Linear GraphQL error: ${JSON.stringify(data.errors)}`);
      }

      return data.data;
    } catch (error) {
      throw new Error(this.formatError('Linear GraphQL request', error));
    }
  }

  async searchRsolvIssues(): Promise<UnifiedIssue[]> {
    const query = `
      query SearchIssues($filter: IssueFilter) {
        issues(filter: $filter) {
          nodes {
            id
            identifier
            title
            description
            state {
              name
              type
            }
            labels {
              nodes {
                name
              }
            }
            assignee {
              name
              email
            }
            createdAt
            updatedAt
            url
          }
        }
      }
    `;

    const filter: any = {
      labels: {
        or: [
          { name: { eq: this.autofixLabel } },
          { name: { eq: this.rsolvLabel } }
        ]
      }
    };

    if (this.teamId) {
      filter.team = { id: { eq: this.teamId } };
    }

    try {
      const response = await this.graphqlRequest<{ issues: { nodes: LinearIssue[] } }>(
        query,
        { filter }
      );

      return response.issues.nodes.map(issue => this.convertToUnifiedIssue(issue));
    } catch (error) {
      logger.error('Failed to search Linear issues:', error);
      throw error;
    }
  }

  async getIssue(issueId: string): Promise<UnifiedIssue | null> {
    const query = `
      query GetIssue($id: String!) {
        issue(id: $id) {
          id
          identifier
          title
          description
          state {
            name
            type
          }
          labels {
            nodes {
              name
            }
          }
          assignee {
            name
            email
          }
          createdAt
          updatedAt
          url
        }
      }
    `;

    try {
      const response = await this.graphqlRequest<{ issue: LinearIssue | null }>(
        query,
        { id: issueId }
      );

      return response.issue ? this.convertToUnifiedIssue(response.issue) : null;
    } catch (error) {
      logger.error(`Failed to get Linear issue ${issueId}:`, error);
      return null;
    }
  }

  async createComment(issueId: string, body: string): Promise<IssueComment | null> {
    const mutation = `
      mutation CreateComment($issueId: String!, $body: String!) {
        commentCreate(
          input: {
            issueId: $issueId
            body: $body
          }
        ) {
          success
          comment {
            id
            body
            user {
              name
              email
            }
            createdAt
          }
        }
      }
    `;

    try {
      const response = await this.graphqlRequest<{
        commentCreate: {
          success: boolean;
          comment: LinearComment;
        };
      }>(mutation, { issueId, body });

      if (!response.commentCreate.success) {
        throw new Error('Failed to create comment');
      }

      const comment = response.commentCreate.comment;
      return {
        id: comment.id,
        body: comment.body,
        author: comment.user.name,
        createdAt: new Date(comment.createdAt),
      };
    } catch (error) {
      logger.error(`Failed to create comment on Linear issue ${issueId}:`, error);
      return null;
    }
  }

  async addLink(issueId: string, url: string, title?: string): Promise<IssueLink | null> {
    // Linear doesn't have a direct link attachment API like Jira
    // We'll add the link as a comment
    const linkBody = title ? `[${title}](${url})` : url;
    const commentBody = `🔗 Related: ${linkBody}`;

    const comment = await this.createComment(issueId, commentBody);
    if (!comment) {
      return null;
    }

    return {
      id: comment.id,
      url,
      title: title || url,
      type: 'external',
    };
  }

  async updateIssueStatus(issueId: string, status: string): Promise<boolean> {
    // First, we need to find the state ID that matches the status name
    const stateQuery = `
      query GetStates($name: String!) {
        workflowStates(filter: { name: { eq: $name } }) {
          nodes {
            id
            name
            type
          }
        }
      }
    `;

    try {
      const stateResponse = await this.graphqlRequest<{
        workflowStates: { nodes: Array<{ id: string; name: string; type: string }> };
      }>(stateQuery, { name: status });

      if (stateResponse.workflowStates.nodes.length === 0) {
        logger.error(`No Linear state found with name: ${status}`);
        return false;
      }

      const stateId = stateResponse.workflowStates.nodes[0].id;

      // Now update the issue with the new state
      const updateMutation = `
        mutation UpdateIssue($issueId: String!, $stateId: String!) {
          issueUpdate(
            id: $issueId
            input: { stateId: $stateId }
          ) {
            success
          }
        }
      `;

      const updateResponse = await this.graphqlRequest<{
        issueUpdate: { success: boolean };
      }>(updateMutation, { issueId, stateId });

      return updateResponse.issueUpdate.success;
    } catch (error) {
      logger.error(`Failed to update Linear issue ${issueId} status:`, error);
      return false;
    }
  }

  async addLabel(issueId: string, labelName: string): Promise<boolean> {
    // First, find or create the label
    const labelQuery = `
      query GetLabel($name: String!) {
        issueLabels(filter: { name: { eq: $name } }) {
          nodes {
            id
            name
          }
        }
      }
    `;

    try {
      const labelResponse = await this.graphqlRequest<{
        issueLabels: { nodes: Array<{ id: string; name: string }> };
      }>(labelQuery, { name: labelName });

      let labelId: string;

      if (labelResponse.issueLabels.nodes.length === 0) {
        // Create the label
        const createLabelMutation = `
          mutation CreateLabel($name: String!) {
            issueLabelCreate(
              input: { name: $name }
            ) {
              success
              issueLabel {
                id
              }
            }
          }
        `;

        const createResponse = await this.graphqlRequest<{
          issueLabelCreate: { success: boolean; issueLabel: { id: string } };
        }>(createLabelMutation, { name: labelName });

        if (!createResponse.issueLabelCreate.success) {
          return false;
        }

        labelId = createResponse.issueLabelCreate.issueLabel.id;
      } else {
        labelId = labelResponse.issueLabels.nodes[0].id;
      }

      // Add the label to the issue
      const addLabelMutation = `
        mutation AddLabel($issueId: String!, $labelId: String!) {
          issueAddLabel(
            id: $issueId
            labelId: $labelId
          ) {
            success
          }
        }
      `;

      const addResponse = await this.graphqlRequest<{
        issueAddLabel: { success: boolean };
      }>(addLabelMutation, { issueId, labelId });

      return addResponse.issueAddLabel.success;
    } catch (error) {
      logger.error(`Failed to add label to Linear issue ${issueId}:`, error);
      return false;
    }
  }

  protected convertToUnifiedIssue(issue: LinearIssue): UnifiedIssue {
    return {
      id: issue.id,
      platform: 'linear',
      key: issue.identifier,
      title: issue.title,
      description: issue.description || '',
      labels: issue.labels.nodes.map(label => label.name),
      status: issue.state.name,
      statusCategory: this.mapLinearStateType(issue.state.type),
      assignee: issue.assignee?.name,
      createdAt: new Date(issue.createdAt),
      updatedAt: new Date(issue.updatedAt),
      url: issue.url,
    };
  }

  private mapLinearStateType(stateType: string): 'todo' | 'in_progress' | 'done' {
    switch (stateType.toLowerCase()) {
    case 'backlog':
    case 'unstarted':
      return 'todo';
    case 'started':
    case 'in_progress':
      return 'in_progress';
    case 'completed':
    case 'done':
    case 'canceled':
      return 'done';
    default:
      return 'todo';
    }
  }
}