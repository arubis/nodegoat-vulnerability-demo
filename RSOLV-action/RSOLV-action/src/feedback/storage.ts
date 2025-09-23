import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { FeedbackEvent, FeedbackQuery, FeedbackStats } from './types.js';
import { logger } from '../utils/logger.js';

export class FeedbackStorage {
  private storagePath: string;
  private feedbackData: FeedbackEvent[] = [];
  private initialized = false;

  constructor(storagePath?: string) {
    this.storagePath = storagePath || path.join(process.cwd(), 'data', 'feedback.json');
  }

  /**
   * Initialize the storage system
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure directory exists
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Load existing data if file exists
      if (fs.existsSync(this.storagePath)) {
        const data = await fs.promises.readFile(this.storagePath, 'utf8');
        this.feedbackData = JSON.parse(data);
      } else {
        // Create empty feedback store
        await this.save();
      }

      this.initialized = true;
      logger.info(`Feedback storage initialized: ${this.storagePath}`);
    } catch (error) {
      logger.error('Failed to initialize feedback storage', error);
      throw new Error(`Failed to initialize feedback storage: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Save feedback data to storage
   */
  private async save(): Promise<void> {
    try {
      await fs.promises.writeFile(
        this.storagePath,
        JSON.stringify(this.feedbackData, null, 2),
        'utf8'
      );
    } catch (error) {
      logger.error('Failed to save feedback data', error);
      throw new Error(`Failed to save feedback data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a new feedback event
   */
  public async createFeedback(feedback: Omit<FeedbackEvent, 'id'>): Promise<FeedbackEvent> {
    await this.ensureInitialized();

    const newFeedback: FeedbackEvent = {
      ...feedback,
      id: uuidv4(),
    };

    this.feedbackData.push(newFeedback);
    await this.save();

    return newFeedback;
  }

  /**
   * Get a feedback event by ID
   */
  public async getFeedback(id: string): Promise<FeedbackEvent | null> {
    await this.ensureInitialized();
    return this.feedbackData.find(feedback => feedback.id === id) || null;
  }

  /**
   * Update an existing feedback event
   */
  public async updateFeedback(id: string, updates: Partial<Omit<FeedbackEvent, 'id'>>): Promise<FeedbackEvent | null> {
    await this.ensureInitialized();
    
    const index = this.feedbackData.findIndex(feedback => feedback.id === id);
    if (index === -1) return null;

    const updatedFeedback = {
      ...this.feedbackData[index],
      ...updates,
    };

    this.feedbackData[index] = updatedFeedback;
    await this.save();

    return updatedFeedback;
  }

  /**
   * Delete a feedback event
   */
  public async deleteFeedback(id: string): Promise<boolean> {
    await this.ensureInitialized();
    
    const initialLength = this.feedbackData.length;
    this.feedbackData = this.feedbackData.filter(feedback => feedback.id !== id);
    
    if (this.feedbackData.length === initialLength) {
      return false;
    }
    
    await this.save();
    return true;
  }

  /**
   * Query feedback events based on criteria
   */
  public async queryFeedback(query: FeedbackQuery = {}): Promise<FeedbackEvent[]> {
    await this.ensureInitialized();
    
    let results = [...this.feedbackData];

    // Apply filters
    if (query.issueId) {
      results = results.filter(feedback => feedback.issueId === query.issueId);
    }
    
    if (query.prId) {
      results = results.filter(feedback => feedback.prId === query.prId);
    }
    
    if (query.reviewerId) {
      results = results.filter(feedback => feedback.reviewer.id === query.reviewerId);
    }
    
    if (query.type) {
      results = results.filter(feedback => feedback.type === query.type);
    }
    
    if (query.sentiment) {
      results = results.filter(feedback => feedback.sentiment === query.sentiment);
    }
    
    if (query.actionTaken) {
      results = results.filter(feedback => feedback.actionTaken === query.actionTaken);
    }
    
    if (query.startDate) {
      const startDate = new Date(query.startDate).getTime();
      results = results.filter(feedback => new Date(feedback.timestamp).getTime() >= startDate);
    }
    
    if (query.endDate) {
      const endDate = new Date(query.endDate).getTime();
      results = results.filter(feedback => new Date(feedback.timestamp).getTime() <= endDate);
    }
    
    // Sort by timestamp desc
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    // Apply limit
    if (query.limit && query.limit > 0) {
      results = results.slice(0, query.limit);
    }
    
    return results;
  }

  /**
   * Get feedback related to an issue
   */
  public async getFeedbackForIssue(issueId: string): Promise<FeedbackEvent[]> {
    return this.queryFeedback({ issueId });
  }

  /**
   * Get feedback related to a PR
   */
  public async getFeedbackForPR(prId: string): Promise<FeedbackEvent[]> {
    return this.queryFeedback({ prId });
  }

  /**
   * Get statistics about feedback
   */
  public async getStats(): Promise<FeedbackStats> {
    await this.ensureInitialized();
    
    const stats: FeedbackStats = {
      totalFeedback: this.feedbackData.length,
      positiveFeedback: 0,
      negativeFeedback: 0,
      neutralFeedback: 0,
      byType: {
        comment: 0,
        review: 0,
        edit: 0,
        approve: 0,
        reject: 0
      },
      byAction: {
        accepted: 0,
        modified: 0,
        rejected: 0
      },
      feedbackOverTime: []
    };
    
    // Group by date for timeline
    const feedbackByDate = new Map<string, { 
      count: number;
      sentiment: Record<FeedbackEvent['sentiment'], number>;
    }>();
    
    for (const feedback of this.feedbackData) {
      // Count by sentiment
      if (feedback.sentiment === 'positive') stats.positiveFeedback++;
      if (feedback.sentiment === 'negative') stats.negativeFeedback++;
      if (feedback.sentiment === 'neutral') stats.neutralFeedback++;
      
      // Count by type
      if (stats.byType[feedback.type] !== undefined) {
        stats.byType[feedback.type]++;
      }
      
      // Count by action
      if (feedback.actionTaken && stats.byAction[feedback.actionTaken] !== undefined) {
        stats.byAction[feedback.actionTaken]++;
      }
      
      // Group by date
      const date = new Date(feedback.timestamp).toISOString().split('T')[0];
      if (!feedbackByDate.has(date)) {
        feedbackByDate.set(date, { 
          count: 0, 
          sentiment: { positive: 0, negative: 0, neutral: 0 } 
        });
      }
      
      const dateStats = feedbackByDate.get(date)!;
      dateStats.count++;
      dateStats.sentiment[feedback.sentiment]++;
    }
    
    // Convert date map to array
    stats.feedbackOverTime = Array.from(feedbackByDate.entries())
      .map(([date, data]) => ({ date, count: data.count, sentiment: data.sentiment }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    return stats;
  }

  /**
   * Ensure storage is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}