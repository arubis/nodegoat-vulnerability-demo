import { describe, it, expect, vi } from 'vitest';
import type { 
  FeedbackEvent, 
  FeedbackType, 
  FeedbackSentiment, 
  ActionTaken,
  PromptEnhancementContext
} from '../types.js';

describe('Feedback Types', () => {
  it('should allow creating a valid FeedbackEvent', () => {
    const event: FeedbackEvent = {
      id: '123',
      issueId: 'issue-1',
      prId: 'pr-1',
      reviewer: {
        id: 'user-1',
        name: 'Test User',
        role: 'developer'
      },
      timestamp: '2023-01-01T00:00:00Z',
      type: 'comment',
      content: 'This is a test comment',
      context: {
        file: 'test.ts',
        lineNumber: 42,
        solutionPart: 'function'
      },
      sentiment: 'positive',
      actionTaken: 'accepted'
    };

    // If we get here without type errors, the test passes
    expect(event).toBeDefined();
    expect(event.id).toBe('123');
  });

  it('should allow creating a valid FeedbackEvent with modifications', () => {
    const event: FeedbackEvent = {
      id: '123',
      issueId: 'issue-1',
      prId: 'pr-1',
      reviewer: {
        id: 'user-1',
        name: 'Test User',
        role: 'developer'
      },
      timestamp: '2023-01-01T00:00:00Z',
      type: 'edit',
      content: 'Made changes to the function',
      context: {
        file: 'test.ts',
        lineNumber: 42
      },
      sentiment: 'neutral',
      actionTaken: 'modified',
      modifications: {
        before: 'function oldCode() {}',
        after: 'function newCode() {}'
      }
    };

    // If we get here without type errors, the test passes
    expect(event).toBeDefined();
    expect(event.modifications?.before).toBe('function oldCode() {}');
    expect(event.modifications?.after).toBe('function newCode() {}');
  });

  it('should allow creating a valid PromptEnhancementContext', () => {
    const context: PromptEnhancementContext = {
      relevantFeedback: [
        {
          id: '123',
          issueId: 'issue-1',
          prId: 'pr-1',
          reviewer: {
            id: 'user-1',
            name: 'Test User',
            role: 'developer'
          },
          timestamp: '2023-01-01T00:00:00Z',
          type: 'comment',
          content: 'This is a test comment',
          context: {},
          sentiment: 'positive'
        }
      ],
      issueContext: {
        title: 'Test Issue',
        body: 'This is a test issue',
        number: 1,
        url: 'https://github.com/user/repo/issues/1',
        repository: {
          owner: 'user',
          name: 'repo',
          url: 'https://github.com/user/repo'
        },
        author: {
          login: 'testuser',
          id: 123
        },
        labels: []
      },
      patterns: {
        positive: ['Good pattern 1', 'Good pattern 2'],
        negative: ['Bad pattern 1']
      },
      similarSolutions: [
        {
          issueId: 'similar-issue-1',
          prId: 'similar-pr-1',
          feedback: [
            {
              id: '456',
              issueId: 'similar-issue-1',
              prId: 'similar-pr-1',
              reviewer: {
                id: 'user-2',
                name: 'Another User',
                role: 'reviewer'
              },
              timestamp: '2023-01-02T00:00:00Z',
              type: 'review',
              content: 'This is similar to your issue',
              context: {},
              sentiment: 'neutral'
            }
          ]
        }
      ]
    };

    // If we get here without type errors, the test passes
    expect(context).toBeDefined();
    expect(context.patterns.positive).toHaveLength(2);
    expect(context.similarSolutions).toHaveLength(1);
  });

  it('should enforce proper enumeration values', () => {
    const validTypes: FeedbackType[] = ['comment', 'review', 'edit', 'approve', 'reject'];
    const validSentiments: FeedbackSentiment[] = ['positive', 'negative', 'neutral'];
    const validActions: ActionTaken[] = ['accepted', 'modified', 'rejected'];

    // Test all valid types
    validTypes.forEach(type => {
      const event: Partial<FeedbackEvent> = { type };
      expect(event.type).toBeDefined();
    });

    // Test all valid sentiments
    validSentiments.forEach(sentiment => {
      const event: Partial<FeedbackEvent> = { sentiment };
      expect(event.sentiment).toBeDefined();
    });

    // Test all valid actions
    validActions.forEach(action => {
      const event: Partial<FeedbackEvent> = { actionTaken: action };
      expect(event.actionTaken).toBeDefined();
    });
  });
});