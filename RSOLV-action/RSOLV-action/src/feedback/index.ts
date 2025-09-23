import { FeedbackStorage } from './storage.js';
import { FeedbackCollector, initializeStorage } from './collector.js';
import { PromptEnhancer } from './enhancer.js';
import type { 
  FeedbackEvent, 
  FeedbackQuery, 
  FeedbackStats, 
  FeedbackType,
  FeedbackSentiment,
  ActionTaken,
  PromptEnhancementContext,
  Reviewer,
  FeedbackContext,
  Modification
} from './types.js';

// Create singleton instances
const feedbackStorage = new FeedbackStorage();
initializeStorage(feedbackStorage);
const feedbackCollector = new FeedbackCollector(feedbackStorage);
const promptEnhancer = new PromptEnhancer();

export {
  feedbackStorage,
  feedbackCollector,
  promptEnhancer,
  FeedbackStorage,
  FeedbackCollector,
  PromptEnhancer,
  FeedbackEvent,
  FeedbackQuery,
  FeedbackStats,
  FeedbackType,
  FeedbackSentiment,
  ActionTaken,
  PromptEnhancementContext,
  Reviewer,
  FeedbackContext,
  Modification
};