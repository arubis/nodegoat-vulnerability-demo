/**
 * Base Platform Adapter
 * Provides common functionality for all platform adapters
 */
import { PlatformAdapter, UnifiedIssue, IssueComment, IssueLink } from './types.js';
import { logger } from '../utils/logger.js';

export interface BasePlatformConfig {
  autofixLabel?: string;
  rsolvLabel?: string;
}

export abstract class BasePlatformAdapter implements PlatformAdapter {
  protected autofixLabel: string;
  protected rsolvLabel: string;

  constructor(config: BasePlatformConfig) {
    this.autofixLabel = config.autofixLabel || 'autofix';
    this.rsolvLabel = config.rsolvLabel || 'rsolv';
  }

  /**
   * Validate that required configuration is present
   */
  protected validateConfig(config: any, requiredFields: string[]): void {
    const missingFields = requiredFields.filter(field => !config[field]);
    if (missingFields.length > 0) {
      throw new Error(`Missing required configuration fields: ${missingFields.join(', ')}`);
    }
  }

  /**
   * Make an authenticated HTTP request
   */
  protected async makeRequest(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.getAuthHeaders(),
          ...options.headers
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      logger.error(`Platform API request failed: ${url}`, error);
      throw error;
    }
  }

  /**
   * Get authentication headers for the platform
   */
  protected abstract getAuthHeaders(): Record<string, string>;

  /**
   * Convert platform-specific issue to unified format
   */
  protected abstract convertToUnifiedIssue(platformIssue: any): UnifiedIssue;

  /**
   * Check if an issue has the required labels for RSOLV processing
   */
  protected hasRsolvLabels(labels: string[]): boolean {
    const normalizedLabels = labels.map(label => label.toLowerCase());
    return normalizedLabels.includes(this.autofixLabel.toLowerCase()) ||
           normalizedLabels.includes(this.rsolvLabel.toLowerCase());
  }

  /**
   * Extract issue ID from various formats
   */
  protected extractIssueId(issueReference: string): string {
    // Handle different formats: #123, PROJ-123, https://platform.com/issue/123
    const patterns = [
      /^#?(\d+)$/,                    // GitHub style: #123 or 123
      /^([A-Z]+-\d+)$/,              // Jira style: PROJ-123
      /^([A-Z]+-\d+)$/i,             // Linear style: ENG-123
      /\/(\d+)\/?$/,                 // URL ending with number
      /\/([A-Z]+-\d+)\/?$/i          // URL ending with key
    ];

    for (const pattern of patterns) {
      const match = issueReference.match(pattern);
      if (match) {
        return match[1];
      }
    }

    // If no pattern matches, return as-is
    return issueReference;
  }

  /**
   * Format error messages consistently
   */
  protected formatError(operation: string, error: any): string {
    const message = error?.message || error?.toString() || 'Unknown error';
    return `${operation} failed: ${message}`;
  }

  // Abstract methods that must be implemented by subclasses
  abstract searchRsolvIssues(): Promise<UnifiedIssue[]>;
  abstract getIssue(issueId: string): Promise<UnifiedIssue | null>;
  abstract createComment(issueId: string, body: string): Promise<IssueComment | null>;
  abstract addLink(issueId: string, url: string, title?: string): Promise<IssueLink | null>;
  abstract updateIssueStatus(issueId: string, status: string): Promise<boolean>;
  abstract addLabel(issueId: string, labelName: string): Promise<boolean>;
}