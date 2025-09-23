/**
 * Unified issue model for cross-platform support
 */
export interface UnifiedIssue {
  id: string;
  platform: 'github' | 'jira' | 'linear' | 'gitlab';
  key?: string; // Platform-specific key (e.g., PROJ-123 for Jira, ENG-123 for Linear)
  title: string;
  description: string;
  labels: string[];
  status: string;
  statusCategory?: 'todo' | 'in_progress' | 'done';
  url: string;
  createdAt: Date;
  updatedAt: Date;
  assignee?: string | {
    id: string;
    name: string;
    email?: string;
  };
  reporter?: {
    id: string;
    name: string;
    email?: string;
  };
  repository?: {
    owner: string;
    name: string;
    url: string;
  };
  customFields?: Record<string, any>;
}

export interface IssueComment {
  id: string;
  body: string;
  author: string;
  createdAt: Date;
}

export interface IssueLink {
  id: string;
  url: string;
  title: string;
  type: string;
}

/**
 * Platform adapter interface
 */
export interface PlatformAdapter {
  /**
   * Search for issues with rsolv/autofix labels
   */
  searchRsolvIssues(): Promise<UnifiedIssue[]>;

  /**
   * Get a single issue by ID
   */
  getIssue(issueId: string): Promise<UnifiedIssue | null>;

  /**
   * Add a comment to an issue
   */
  createComment(issueId: string, body: string): Promise<IssueComment | null>;

  /**
   * Add a link to an issue
   */
  addLink(issueId: string, url: string, title?: string): Promise<IssueLink | null>;

  /**
   * Update issue status
   */
  updateIssueStatus(issueId: string, status: string): Promise<boolean>;

  /**
   * Add a label to an issue
   */
  addLabel(issueId: string, labelName: string): Promise<boolean>;
}

/**
 * Platform configuration
 */
export interface PlatformConfig {
  jira?: {
    host: string; // e.g., 'your-domain.atlassian.net'
    email: string;
    apiToken: string;
    autofixLabel?: string; // Default: 'autofix'
    rsolvLabel?: string; // Default: 'rsolv'
  };
  linear?: {
    apiKey: string;
    teamId?: string;
    autofixLabel?: string;
    rsolvLabel?: string;
  };
  gitlab?: {
    host?: string; // Default: 'gitlab.com'
    token: string;
    autofixLabel?: string;
    rsolvLabel?: string;
  };
}