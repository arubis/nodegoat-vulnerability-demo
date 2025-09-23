import { describe, it, expect, mock, beforeEach, vi } from 'vitest';
import { PromptEnhancer } from '../enhancer.js';
import type { IssueContext } from '../../types.js';
import type { 
  FeedbackEvent
} from '../types.js';

describe('PromptEnhancer', () => {
  let enhancer: PromptEnhancer;
  let mockStorage: any;
  let mockFeedback: FeedbackEvent[];
  
  beforeEach(() => {
    // Create sample feedback data
    mockFeedback = [
      {
        id: 'feedback-1',
        issueId: 'issue-1',
        prId: 'pr-1',
        reviewer: { id: 'reviewer-1', name: 'Reviewer 1', role: 'expert' },
        timestamp: '2025-04-29T10:00:00Z',
        type: 'review',
        content: 'I like how the solution uses async/await properly. Good error handling too.',
        context: {},
        sentiment: 'positive',
        actionTaken: 'accepted'
      },
      {
        id: 'feedback-2',
        issueId: 'issue-2',
        prId: 'pr-2',
        reviewer: { id: 'reviewer-2', name: 'Reviewer 2', role: 'expert' },
        timestamp: '2025-04-28T09:00:00Z',
        type: 'review',
        content: 'Issue with the error handling. Could be better with try/catch blocks.',
        context: {},
        sentiment: 'negative',
        actionTaken: 'modified'
      },
      {
        id: 'feedback-3',
        issueId: 'issue-3',
        prId: 'pr-3',
        reviewer: { id: 'reviewer-1', name: 'Reviewer 1', role: 'expert' },
        timestamp: '2025-04-27T08:00:00Z',
        type: 'comment',
        content: 'Good implementation of the interface.',
        context: {},
        sentiment: 'positive'
      }
    ];
    
    // Create mock storage
    mockStorage = {
      queryFeedback: vi.fn((query: any = {}) => {
        if (query.issueId) {
          return Promise.resolve(
            mockFeedback.filter(f => f.issueId === query.issueId)
          );
        }
        return Promise.resolve(mockFeedback);
      })
    };
    
    // Create a new enhancer for each test
    enhancer = new PromptEnhancer();
    
    // Inject our mock storage
    (enhancer as any)._storage = mockStorage;
  });
  
  describe('enhancePrompt', () => {
    it('adds patterns to avoid from negative feedback', () => {
      const basePrompt = 'Generate a solution for this issue:';
      const enhancementContext = {
        relevantFeedback: mockFeedback,
        issueContext: {
          id: 'test-issue',
          source: 'github',
          title: 'Test Issue',
          body: 'This is a test issue',
          labels: ['bug'],
          repository: {
            owner: 'test-owner',
            name: 'test-repo'
          },
          metadata: {}
        } as IssueContext,
        patterns: {
          positive: ['async/await properly', 'good implementation'],
          negative: ['poor error handling', 'missing try/catch']
        },
        similarSolutions: [
          {
            issueId: 'issue-1',
            prId: 'pr-1',
            feedback: [mockFeedback[0]]
          }
        ]
      };
      
      const enhanced = enhancer.enhancePrompt(basePrompt, enhancementContext);
      
      expect(enhanced).toContain('Generate a solution for this issue:');
      expect(enhanced).toContain('### Patterns to Avoid');
      expect(enhanced).toContain('poor error handling');
      expect(enhanced).toContain('missing try/catch');
      expect(enhanced).toContain('### Recommended Approaches');
      expect(enhanced).toContain('async/await properly');
      expect(enhanced).toContain('good implementation');
    });
    
    it('returns the original prompt when there are no patterns', () => {
      const basePrompt = 'Generate a solution for this issue:';
      const enhancementContext = {
        relevantFeedback: [],
        issueContext: {
          id: 'test-issue',
          source: 'github',
          title: 'Test Issue',
          body: 'This is a test issue',
          labels: ['bug'],
          repository: {
            owner: 'test-owner',
            name: 'test-repo'
          },
          metadata: {}
        } as IssueContext,
        patterns: {
          positive: [],
          negative: []
        },
        similarSolutions: []
      };
      
      const enhanced = enhancer.enhancePrompt(basePrompt, enhancementContext);
      
      // Should just contain the original prompt without enhancements
      expect(enhanced).toBe(basePrompt);
    });
    
    it('includes examples of successful solutions', () => {
      const basePrompt = 'Generate a solution for this issue:';
      const enhancementContext = {
        relevantFeedback: mockFeedback,
        issueContext: {
          id: 'test-issue',
          source: 'github',
          title: 'Test Issue',
          body: 'This is a test issue',
          labels: ['bug'],
          repository: {
            owner: 'test-owner',
            name: 'test-repo'
          },
          metadata: {}
        } as IssueContext,
        patterns: {
          positive: ['async/await properly'],
          negative: []
        },
        similarSolutions: [
          {
            issueId: 'issue-1',
            prId: 'pr-1',
            feedback: [mockFeedback[0]] // Positive feedback
          }
        ]
      };
      
      const enhanced = enhancer.enhancePrompt(basePrompt, enhancementContext);
      
      expect(enhanced).toContain('### Successful Solution Examples');
      expect(enhanced).toContain('Issue: issue-1');
      expect(enhanced).toContain('I like how the solution uses async/await properly');
    });
  });
  
  describe('generateEnhancementContext', () => {
    it('returns a valid enhancement context for a given issue', async () => {
      const issue = {
        id: 'test-issue',
        source: 'github',
        title: 'Test Issue',
        body: 'This is a test issue',
        labels: ['bug'],
        repository: {
          owner: 'test-owner',
          name: 'test-repo'
        },
        metadata: {}
      } as IssueContext;
      
      const context = await enhancer.generateEnhancementContext(issue);
      
      expect(context).toBeDefined();
      expect(context.issueContext).toBe(issue);
      expect(context.patterns).toBeDefined();
      expect(Array.isArray(context.patterns.positive)).toBe(true);
      expect(Array.isArray(context.patterns.negative)).toBe(true);
      expect(Array.isArray(context.similarSolutions)).toBe(true);
    });
    
    it('handles errors gracefully', async () => {
      // Make the storage throw an error
      (enhancer as any)._storage.queryFeedback = vi.fn(() => {
        throw new Error('Storage error');
      });
      
      const issue = {
        id: 'test-issue',
        source: 'github',
        title: 'Test Issue',
        body: 'This is a test issue',
        labels: ['bug'],
        repository: {
          owner: 'test-owner',
          name: 'test-repo'
        },
        metadata: {}
      } as IssueContext;
      
      // Should not throw but return an empty context
      const context = await enhancer.generateEnhancementContext(issue);
      
      expect(context).toBeDefined();
      expect(Array.isArray(context.relevantFeedback)).toBe(true);
      expect(context.relevantFeedback.length).toBe(0);
      expect(context.patterns.positive.length).toBe(0);
      expect(context.patterns.negative.length).toBe(0);
    });
  });
});