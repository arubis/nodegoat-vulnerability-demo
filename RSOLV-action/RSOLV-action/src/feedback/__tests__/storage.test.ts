import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FeedbackStorage } from '../storage.js';
import type { FeedbackEvent } from '../types.js';
import fs from 'fs';
import path from 'path';

// Use a real file for tests
const TEST_DIR = path.join(process.cwd(), 'test-data');
const TEST_FILE = path.join(TEST_DIR, 'test-feedback.json');

describe('FeedbackStorage', () => {
  let storage: FeedbackStorage;
  
  // Setup and teardown
  beforeEach(async () => {
    // Create test directory if it doesn't exist
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
    
    // Delete test file if it exists
    if (fs.existsSync(TEST_FILE)) {
      fs.unlinkSync(TEST_FILE);
    }
    
    storage = new FeedbackStorage(TEST_FILE);
  });
  
  afterEach(() => {
    // Clean up test file
    if (fs.existsSync(TEST_FILE)) {
      fs.unlinkSync(TEST_FILE);
    }
  });
  
  describe('initialize', () => {
    it('should create empty feedback store if file does not exist', async () => {
      // Act
      await storage.initialize();
      
      // Assert
      expect(fs.existsSync(TEST_FILE)).toBe(true);
      
      const fileContent = await fs.promises.readFile(TEST_FILE, 'utf8');
      const data = JSON.parse(fileContent);
      expect(data).toEqual([]);
    });
    
    it('should load existing data if file exists', async () => {
      // Setup
      const initialData: FeedbackEvent[] = [
        {
          id: 'test-id',
          issueId: 'issue-1',
          prId: 'pr-1',
          reviewer: { id: 'user-1', name: 'Test User', role: 'developer' },
          timestamp: '2023-01-01T00:00:00Z',
          type: 'comment',
          content: 'Test comment',
          context: {},
          sentiment: 'positive',
        },
      ];
      
      await fs.promises.writeFile(TEST_FILE, JSON.stringify(initialData), 'utf8');
      
      // Act
      await storage.initialize();
      
      // Assert
      const feedback = await storage.getFeedback('test-id');
      expect(feedback).not.toBeNull();
      expect(feedback?.id).toBe('test-id');
    });
  });
  
  describe('CRUD operations', () => {
    beforeEach(async () => {
      await storage.initialize();
    });
    
    it('should create feedback with generated ID', async () => {
      // Setup
      const feedbackData = {
        issueId: 'issue-1',
        prId: 'pr-1',
        reviewer: { id: 'user-1', name: 'User 1', role: 'developer' },
        timestamp: '2023-01-01T00:00:00Z',
        type: 'comment' as const,
        content: 'This looks good',
        context: {},
        sentiment: 'positive' as const,
      };
      
      // Act
      const result = await storage.createFeedback(feedbackData);
      
      // Assert
      expect(result.id).toBeDefined();
      expect(result.issueId).toBe('issue-1');
      
      // Check file was updated
      const fileContent = await fs.promises.readFile(TEST_FILE, 'utf8');
      const data = JSON.parse(fileContent);
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe(result.id);
    });
    
    it('should get feedback by ID', async () => {
      // Setup
      const feedbackData = {
        issueId: 'issue-1',
        prId: 'pr-1',
        reviewer: { id: 'user-1', name: 'User 1', role: 'developer' },
        timestamp: '2023-01-01T00:00:00Z',
        type: 'comment' as const,
        content: 'This looks good',
        context: {},
        sentiment: 'positive' as const,
      };
      
      const created = await storage.createFeedback(feedbackData);
      
      // Act
      const result = await storage.getFeedback(created.id);
      
      // Assert
      expect(result).not.toBeNull();
      expect(result?.id).toBe(created.id);
      expect(result?.content).toBe('This looks good');
    });
    
    it('should return null when getting non-existent feedback', async () => {
      // Act
      const result = await storage.getFeedback('non-existent');
      
      // Assert
      expect(result).toBeNull();
    });
    
    it('should update feedback', async () => {
      // Setup
      const feedbackData = {
        issueId: 'issue-1',
        prId: 'pr-1',
        reviewer: { id: 'user-1', name: 'User 1', role: 'developer' },
        timestamp: '2023-01-01T00:00:00Z',
        type: 'comment' as const,
        content: 'This looks good',
        context: {},
        sentiment: 'positive' as const,
      };
      
      const created = await storage.createFeedback(feedbackData);
      
      // Act
      const updates = {
        content: 'Updated comment',
        sentiment: 'negative' as const,
      };
      
      const result = await storage.updateFeedback(created.id, updates);
      
      // Assert
      expect(result).not.toBeNull();
      expect(result?.content).toBe('Updated comment');
      expect(result?.sentiment).toBe('negative');
      
      // Check file was updated
      const fileContent = await fs.promises.readFile(TEST_FILE, 'utf8');
      const data = JSON.parse(fileContent);
      expect(data).toHaveLength(1);
      expect(data[0].content).toBe('Updated comment');
      expect(data[0].sentiment).toBe('negative');
    });
    
    it('should return null when updating non-existent feedback', async () => {
      // Act
      const result = await storage.updateFeedback('non-existent', { content: 'Updated' });
      
      // Assert
      expect(result).toBeNull();
    });
    
    it('should delete feedback', async () => {
      // Setup
      const feedbackData = {
        issueId: 'issue-1',
        prId: 'pr-1',
        reviewer: { id: 'user-1', name: 'User 1', role: 'developer' },
        timestamp: '2023-01-01T00:00:00Z',
        type: 'comment' as const,
        content: 'This looks good',
        context: {},
        sentiment: 'positive' as const,
      };
      
      const created = await storage.createFeedback(feedbackData);
      
      // Act
      const result = await storage.deleteFeedback(created.id);
      
      // Assert
      expect(result).toBe(true);
      
      // Check feedback was removed
      const feedback = await storage.getFeedback(created.id);
      expect(feedback).toBeNull();
      
      // Check file was updated
      const fileContent = await fs.promises.readFile(TEST_FILE, 'utf8');
      const data = JSON.parse(fileContent);
      expect(data).toHaveLength(0);
    });
    
    it('should return false when deleting non-existent feedback', async () => {
      // Act
      const result = await storage.deleteFeedback('non-existent');
      
      // Assert
      expect(result).toBe(false);
    });
  });
  
  describe('Query operations', () => {
    beforeEach(async () => {
      await storage.initialize();
      
      // Create test data
      await Promise.all([
        storage.createFeedback({
          issueId: 'issue-1',
          prId: 'pr-1',
          reviewer: { id: 'user-1', name: 'User 1', role: 'developer' },
          timestamp: '2023-01-01T00:00:00Z',
          type: 'comment',
          content: 'Comment 1',
          context: {},
          sentiment: 'positive',
          actionTaken: 'accepted',
        }),
        storage.createFeedback({
          issueId: 'issue-1',
          prId: 'pr-1',
          reviewer: { id: 'user-2', name: 'User 2', role: 'reviewer' },
          timestamp: '2023-01-02T00:00:00Z',
          type: 'review',
          content: 'Review 1',
          context: {},
          sentiment: 'negative',
          actionTaken: 'modified',
        }),
        storage.createFeedback({
          issueId: 'issue-2',
          prId: 'pr-2',
          reviewer: { id: 'user-1', name: 'User 1', role: 'developer' },
          timestamp: '2023-01-03T00:00:00Z',
          type: 'edit',
          content: 'Edit 1',
          context: {},
          sentiment: 'neutral',
          actionTaken: 'rejected',
        }),
      ]);
    });
    
    it('should query feedback by issueId', async () => {
      // Act
      const results = await storage.queryFeedback({ issueId: 'issue-1' });
      
      // Assert
      expect(results).toHaveLength(2);
      results.forEach(item => {
        expect(item.issueId).toBe('issue-1');
      });
    });
    
    it('should query feedback by prId', async () => {
      // Act
      const results = await storage.queryFeedback({ prId: 'pr-2' });
      
      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].issueId).toBe('issue-2');
    });
    
    it('should query feedback by reviewerId', async () => {
      // Act
      const results = await storage.queryFeedback({ reviewerId: 'user-1' });
      
      // Assert
      expect(results).toHaveLength(2);
      results.forEach(item => {
        expect(item.reviewer.id).toBe('user-1');
      });
    });
    
    it('should query feedback by type', async () => {
      // Act
      const results = await storage.queryFeedback({ type: 'review' });
      
      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('review');
    });
    
    it('should query feedback by sentiment', async () => {
      // Act
      const results = await storage.queryFeedback({ sentiment: 'positive' });
      
      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].sentiment).toBe('positive');
    });
    
    it('should query feedback by actionTaken', async () => {
      // Act
      const results = await storage.queryFeedback({ actionTaken: 'modified' });
      
      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].actionTaken).toBe('modified');
    });
    
    it('should query feedback by date range', async () => {
      // Act
      const results = await storage.queryFeedback({
        startDate: '2023-01-02T00:00:00Z',
        endDate: '2023-01-02T23:59:59Z',
      });
      
      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].timestamp).toBe('2023-01-02T00:00:00Z');
    });
    
    it('should limit query results', async () => {
      // Act
      const results = await storage.queryFeedback({ limit: 1 });
      
      // Assert
      expect(results).toHaveLength(1);
      // Should be most recent first (sorted by timestamp)
      expect(results[0].timestamp).toBe('2023-01-03T00:00:00Z');
    });
    
    it('should combine multiple query parameters', async () => {
      // Act
      const results = await storage.queryFeedback({
        issueId: 'issue-1',
        reviewerId: 'user-1',
      });
      
      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].issueId).toBe('issue-1');
      expect(results[0].reviewer.id).toBe('user-1');
    });
    
    it('should get feedback for an issue', async () => {
      // Act
      const results = await storage.getFeedbackForIssue('issue-2');
      
      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].issueId).toBe('issue-2');
    });
    
    it('should get feedback for a PR', async () => {
      // Act
      const results = await storage.getFeedbackForPR('pr-1');
      
      // Assert
      expect(results).toHaveLength(2);
      results.forEach(item => {
        expect(item.prId).toBe('pr-1');
      });
    });
  });
  
  describe('Stats', () => {
    beforeEach(async () => {
      await storage.initialize();
      
      // Create test data
      await Promise.all([
        storage.createFeedback({
          issueId: 'issue-1',
          prId: 'pr-1',
          reviewer: { id: 'user-1', name: 'User 1', role: 'developer' },
          timestamp: '2023-01-01T00:00:00Z',
          type: 'comment',
          content: 'Comment 1',
          context: {},
          sentiment: 'positive',
          actionTaken: 'accepted',
        }),
        storage.createFeedback({
          issueId: 'issue-1',
          prId: 'pr-1',
          reviewer: { id: 'user-2', name: 'User 2', role: 'reviewer' },
          timestamp: '2023-01-01T12:00:00Z',
          type: 'review',
          content: 'Review 1',
          context: {},
          sentiment: 'negative',
          actionTaken: 'modified',
        }),
        storage.createFeedback({
          issueId: 'issue-2',
          prId: 'pr-2',
          reviewer: { id: 'user-1', name: 'User 1', role: 'developer' },
          timestamp: '2023-01-02T00:00:00Z',
          type: 'edit',
          content: 'Edit 1',
          context: {},
          sentiment: 'neutral',
          actionTaken: 'rejected',
        }),
        storage.createFeedback({
          issueId: 'issue-2',
          prId: 'pr-2',
          reviewer: { id: 'user-3', name: 'User 3', role: 'maintainer' },
          timestamp: '2023-01-02T12:00:00Z',
          type: 'approve',
          content: 'Approve 1',
          context: {},
          sentiment: 'positive',
          actionTaken: 'accepted',
        }),
      ]);
    });
    
    it('should generate correct statistics', async () => {
      // Act
      const stats = await storage.getStats();
      
      // Assert
      expect(stats.totalFeedback).toBe(4);
      expect(stats.positiveFeedback).toBe(2);
      expect(stats.negativeFeedback).toBe(1);
      expect(stats.neutralFeedback).toBe(1);
      
      expect(stats.byType).toEqual({
        comment: 1,
        review: 1,
        edit: 1,
        approve: 1,
        reject: 0,
      });
      
      expect(stats.byAction).toEqual({
        accepted: 2,
        modified: 1,
        rejected: 1,
      });
      
      expect(stats.feedbackOverTime).toHaveLength(2);
      
      // Find date entries
      const day1 = stats.feedbackOverTime.find(d => d.date === '2023-01-01');
      const day2 = stats.feedbackOverTime.find(d => d.date === '2023-01-02');
      
      expect(day1).toBeDefined();
      expect(day2).toBeDefined();
      
      if (day1 && day2) {
        expect(day1.count).toBe(2);
        expect(day1.sentiment.positive).toBe(1);
        expect(day1.sentiment.negative).toBe(1);
        
        expect(day2.count).toBe(2);
        expect(day2.sentiment.positive).toBe(1);
        expect(day2.sentiment.neutral).toBe(1);
      }
    });
  });
});