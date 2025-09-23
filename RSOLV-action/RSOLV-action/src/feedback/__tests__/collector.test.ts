import { describe, it, expect, beforeEach, vi, Mock, vi } from 'vitest';
import { FeedbackCollector } from '../collector.js';
import type { FeedbackEvent } from '../types.js';

describe('FeedbackCollector', () => {
  let collector: FeedbackCollector;
  let mockCreateFeedback: Mock<(data: Omit<FeedbackEvent, 'id'>) => Promise<FeedbackEvent>>;
  
  beforeEach(() => {
    // Create a mock for storage.createFeedback
    mockCreateFeedback = vi.fn((data: Omit<FeedbackEvent, 'id'>) => {
      return Promise.resolve({
        ...data,
        id: 'mock-feedback-id',
      });
    });
    
    // Create a mock storage object
    const mockStorage = {
      createFeedback: mockCreateFeedback,
    };
    
    // Create a new collector for each test
    collector = new FeedbackCollector();
    
    // Inject our mock storage
    (collector as any)._storage = mockStorage;
  });
  
  describe('analyzeSentiment', () => {
    it('classifies positive sentiment correctly', () => {
      const positiveTexts = [
        'This looks good, nice work!',
        'Great job, thank you!',
        'LGTM 👍',
        'Works perfectly, thanks!',
      ];
      
      positiveTexts.forEach(text => {
        expect(collector.analyzeSentiment(text)).toBe('positive' as FeedbackSentiment);
      });
    });
    
    it('classifies negative sentiment correctly', () => {
      const negativeTexts = [
        'This doesn\'t work, please fix',
        'There\'s a bug in this code',
        'I found an issue with this PR',
        'This is wrong 👎',
      ];
      
      negativeTexts.forEach(text => {
        expect(collector.analyzeSentiment(text)).toBe('negative' as FeedbackSentiment);
      });
    });
    
    it('defaults to neutral sentiment when text is ambiguous', () => {
      const neutralTexts = [
        'I have a question about this',
        'Just a comment',
        'Made some changes',
        'Updated the code',
      ];
      
      neutralTexts.forEach(text => {
        expect(collector.analyzeSentiment(text)).toBe('neutral' as FeedbackSentiment);
      });
    });
  });
  
  describe('analyzeSentimentFromReview', () => {
    it('returns positive sentiment for approved reviews regardless of content', () => {
      expect(collector.analyzeSentimentFromReview('approved', 'This has issues')).toBe('positive');
    });
    
    it('returns negative sentiment for change requests regardless of content', () => {
      expect(collector.analyzeSentimentFromReview('changes_requested', 'Great work!')).toBe('negative');
    });
    
    it('analyzes comment content when review state is commented', () => {
      expect(collector.analyzeSentimentFromReview('commented', 'Looks good!')).toBe('positive');
      expect(collector.analyzeSentimentFromReview('commented', 'This has bugs')).toBe('negative');
    });
  });
  
  describe('handleWebhook', () => {
    it('processes PR comment events correctly', async () => {
      const payload = {
        action: 'created',
        comment: { 
          id: 123, 
          body: 'Great work!',
          user: { id: 456, login: 'reviewer' }
        },
        pull_request: { 
          number: 789, 
          id: 101112, 
          html_url: 'https://github.com/owner/repo/pull/789' 
        },
        sender: { id: 456, login: 'reviewer', type: 'User' }
      };
      
      // Mock collectPRComment
      const originalCollectPRComment = collector.collectPRComment;
      collector.collectPRComment = vi.fn(() => {
        return Promise.resolve({
          id: 'mock-id',
          issueId: 'mock-issue',
          prId: '789',
          reviewer: { id: '456', name: 'reviewer', role: 'contributor' },
          timestamp: new Date().toISOString(),
          type: 'comment',
          content: 'Great work!',
          context: {},
          sentiment: 'positive'
        });
      });
      
      const result = await collector.handleWebhook(payload);
      
      expect(result).not.toBeNull();
      expect(result?.type).toBe('comment');
      expect(result?.sentiment).toBe('positive');
      expect(result?.prId).toBe('789');
      
      // Restore original method
      collector.collectPRComment = originalCollectPRComment;
    });
    
    it('returns null for irrelevant webhook events', async () => {
      const payload = { action: 'labeled' };
      const result = await collector.handleWebhook(payload);
      expect(result).toBeNull();
    });
  });
});