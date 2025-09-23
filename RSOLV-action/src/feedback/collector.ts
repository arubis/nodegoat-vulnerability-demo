import type { FeedbackEvent, FeedbackSentiment, Modification, ActionTaken } from './types.js';
import { logger } from '../utils/logger.js';
import { FeedbackStorage } from './storage.js';

// Storage instance will be injected but defaults to the one created here
let _feedbackStorage: FeedbackStorage | null = null;

/**
 * Interface for GitHub webhook payloads
 * This is a simplified version that will need to be expanded based on actual webhook structures
 */
interface WebhookPayload {
  action?: string;
  issue?: {
    number: number;
    id: number;
    html_url: string;
  };
  pull_request?: {
    number: number;
    id: number;
    html_url: string;
    body?: string;
    title?: string;
  };
  comment?: {
    id: number;
    body: string;
    user: {
      id: number;
      login: string;
    };
  };
  review?: {
    id: number;
    body?: string;
    state: 'approved' | 'changes_requested' | 'commented';
    user: {
      id: number;
      login: string;
    };
  };
  repository?: {
    id: number;
    full_name: string;
  };
  sender?: {
    id: number;
    login: string;
    type: string;
  };
}

/**
 * Class responsible for collecting feedback from various sources
 * and storing it in the feedback system
 */
export class FeedbackCollector {
  // Storage instance (will be initialized from index.ts)
  private _storage: any;
  
  constructor(storage?: any) {
    this._storage = storage || _feedbackStorage;
  }
  
  /**
   * Process a GitHub webhook event
   */
  public async handleWebhook(payload: WebhookPayload): Promise<FeedbackEvent | null> {
    try {
      // Determine what type of event this is
      if (payload.action === 'created' && payload.comment && payload.pull_request) {
        return this.collectPRComment(payload);
      } else if (payload.action === 'submitted' && payload.review && payload.pull_request) {
        return this.collectPRReview(payload);
      } else if (payload.action === 'edited' && payload.pull_request) {
        return this.collectPREdit(payload);
      }
      
      // Not a relevant event
      logger.info('Ignoring webhook event: not relevant to feedback collection');
      return null;
    } catch (error) {
      logger.error('Error processing webhook event', error);
      return null;
    }
  }
  
  /**
   * Collect feedback from a PR comment
   */
  public async collectPRComment(payload: WebhookPayload): Promise<FeedbackEvent | null> {
    if (!payload.comment || !payload.pull_request || !payload.sender) {
      logger.error('Invalid PR comment payload');
      return null;
    }
    
    const issueId = payload.pull_request.html_url.split('/').slice(-3, -2)[0];
    const prId = payload.pull_request.number.toString();
    const reviewerId = payload.sender.id.toString();
    const reviewerName = payload.sender.login;
    const content = payload.comment.body;
    
    // Analyze sentiment
    const sentiment = this.analyzeSentiment(content);
    
    // Create feedback event
    const feedbackEvent: Omit<FeedbackEvent, 'id'> = {
      issueId,
      prId,
      reviewer: {
        id: reviewerId,
        name: reviewerName,
        role: 'contributor', // Default role, can be enhanced with GitHub API
      },
      timestamp: new Date().toISOString(),
      type: 'comment',
      content,
      context: {}, // Would need to extract file/line context if available
      sentiment,
    };
    
    return this._storage.createFeedback(feedbackEvent);
  }
  
  /**
   * Collect feedback from a PR review
   */
  public async collectPRReview(payload: WebhookPayload): Promise<FeedbackEvent | null> {
    if (!payload.review || !payload.pull_request || !payload.sender) {
      logger.error('Invalid PR review payload');
      return null;
    }
    
    const issueId = payload.pull_request.html_url.split('/').slice(-3, -2)[0];
    const prId = payload.pull_request.number.toString();
    const reviewerId = payload.sender.id.toString();
    const reviewerName = payload.sender.login;
    const content = payload.review.body || '';
    const reviewState = payload.review.state;
    
    // Determine action taken based on review state
    let actionTaken: ActionTaken | undefined;
    if (reviewState === 'approved') {
      actionTaken = 'accepted';
    } else if (reviewState === 'changes_requested') {
      actionTaken = 'modified';
    }
    
    // Analyze sentiment using both review state and content
    const sentiment = this.analyzeSentimentFromReview(reviewState, content);
    
    // Create feedback event
    const feedbackEvent: Omit<FeedbackEvent, 'id'> = {
      issueId,
      prId,
      reviewer: {
        id: reviewerId,
        name: reviewerName,
        role: 'reviewer', // Role is more specific for reviews
      },
      timestamp: new Date().toISOString(),
      type: 'review',
      content,
      context: {}, // Would need to extract context from review comments
      sentiment,
      actionTaken,
    };
    
    return this._storage.createFeedback(feedbackEvent);
  }
  
  /**
   * Collect feedback from a PR edit
   */
  public async collectPREdit(payload: WebhookPayload): Promise<FeedbackEvent | null> {
    if (!payload.pull_request || !payload.sender) {
      logger.error('Invalid PR edit payload');
      return null;
    }
    
    // For edits, we would need to have the previous state of the PR
    // This is a simplified version assuming we have access to it
    const issueId = payload.pull_request.html_url.split('/').slice(-3, -2)[0];
    const prId = payload.pull_request.number.toString();
    const reviewerId = payload.sender.id.toString();
    const reviewerName = payload.sender.login;
    
    // For real implementation, we'd need to extract actual changes
    const modifications: Modification = {
      before: 'Previous content', // Would be extracted from payload or API
      after: payload.pull_request.body || '',
    };
    
    // Create feedback event
    const feedbackEvent: Omit<FeedbackEvent, 'id'> = {
      issueId,
      prId,
      reviewer: {
        id: reviewerId,
        name: reviewerName,
        role: 'contributor',
      },
      timestamp: new Date().toISOString(),
      type: 'edit',
      content: 'PR edited', // Summary of the edit
      context: {}, // Context would depend on what was edited
      sentiment: 'neutral', // Default for edits
      modifications,
    };
    
    return this._storage.createFeedback(feedbackEvent);
  }
  
  /**
   * Simple sentiment analysis based on content
   */
  public analyzeSentiment(content: string): FeedbackSentiment {
    // This is a very simple implementation that would be enhanced
    // with more sophisticated analysis or AI in a real implementation
    
    const lowerContent = content.toLowerCase();
    
    // Look for positive indicators
    const positiveTerms = [
      'good', 'great', 'excellent', 'nice', 'awesome',
      'works', 'perfect', 'thank', 'thanks', 'lgtm', '👍', '✅'
    ];
    
    // Look for negative indicators
    const negativeTerms = [
      'bad', 'issue', 'problem', 'error', 'wrong',
      'fix', 'bug', 'doesn\'t work', 'not working', '👎', '❌'
    ];
    
    // Count positive and negative markers
    let positiveCount = 0;
    let negativeCount = 0;
    
    for (const term of positiveTerms) {
      if (lowerContent.includes(term)) {
        positiveCount++;
      }
    }
    
    for (const term of negativeTerms) {
      if (lowerContent.includes(term)) {
        negativeCount++;
      }
    }
    
    // Determine sentiment based on counts
    if (positiveCount > negativeCount) {
      return 'positive';
    } else if (negativeCount > positiveCount) {
      return 'negative';
    } else {
      return 'neutral';
    }
  }
  
  /**
   * Analyze sentiment from review state and content
   */
  public analyzeSentimentFromReview(
    reviewState: 'approved' | 'changes_requested' | 'commented',
    content: string
  ): FeedbackSentiment {
    // First, consider the review state
    if (reviewState === 'approved') {
      return 'positive';
    } else if (reviewState === 'changes_requested') {
      return 'negative';
    }
    
    // If just a comment, analyze the content
    return this.analyzeSentiment(content);
  }
}

// Initialize the storage (will be set in index.ts)
export function initializeStorage(storage: FeedbackStorage) {
  _feedbackStorage = storage;
}