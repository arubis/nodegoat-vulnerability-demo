import { IssueContext } from '../types/index.js';

export interface Reviewer {
  id: string;
  name: string;
  role: string;
}

export interface FeedbackContext {
  file?: string;
  lineNumber?: number;
  solutionPart?: string;
}

export interface Modification {
  before: string;
  after: string;
}

export type FeedbackType = 'comment' | 'review' | 'edit' | 'approve' | 'reject';
export type FeedbackSentiment = 'positive' | 'negative' | 'neutral';
export type ActionTaken = 'accepted' | 'modified' | 'rejected';

export interface FeedbackEvent {
  id: string;
  issueId: string;
  prId: string;
  reviewer: Reviewer;
  timestamp: string;
  type: FeedbackType;
  content: string;
  context: FeedbackContext;
  sentiment: FeedbackSentiment;
  actionTaken?: ActionTaken;
  modifications?: Modification;
}

export interface PromptEnhancementContext {
  relevantFeedback: FeedbackEvent[];
  issueContext: IssueContext;
  patterns: {
    positive: string[];
    negative: string[];
  };
  similarSolutions: {
    issueId: string;
    prId: string;
    feedback: FeedbackEvent[];
  }[];
}

export interface FeedbackQuery {
  issueId?: string;
  prId?: string;
  reviewerId?: string;
  type?: FeedbackType;
  sentiment?: FeedbackSentiment;
  actionTaken?: ActionTaken;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export interface FeedbackStats {
  totalFeedback: number;
  positiveFeedback: number;
  negativeFeedback: number;
  neutralFeedback: number;
  byType: Record<FeedbackType, number>;
  byAction: Record<ActionTaken, number>;
  feedbackOverTime: {
    date: string;
    count: number;
    sentiment: Record<FeedbackSentiment, number>;
  }[];
}