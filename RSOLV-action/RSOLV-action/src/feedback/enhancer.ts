import type { 
  PromptEnhancementContext, 
  FeedbackEvent 
} from './types.js';
import type { IssueContext } from '../types/index.js';
import { logger } from '../utils/logger.js';

// Import storage directly to avoid circular dependencies
import { FeedbackStorage } from './storage.js';

/**
 * Enhancer for AI prompts based on historical feedback
 * This class is responsible for analyzing feedback and enhancing prompts
 * to improve future AI solution generation
 */
export class PromptEnhancer {
  // Storage instance (can be overridden in tests)
  private _storage: FeedbackStorage;
  
  constructor(storage?: FeedbackStorage) {
    this._storage = storage || new FeedbackStorage();
  }
  
  /**
   * Generate enhancement context for a given issue
   * This context will be used to modify the prompt for better AI solutions
   */
  public async generateEnhancementContext(
    issue: IssueContext,
    limit: number = 10
  ): Promise<PromptEnhancementContext> {
    try {
      // Find similar issues based on labels and repository
      const similarIssues = await this.findSimilarIssues(issue);
      
      // Get feedback for similar issues
      const relevantFeedback = await this.getRelevantFeedback(
        similarIssues, 
        limit
      );
      
      // Extract patterns from feedback
      const patterns = this.extractPatternsFromFeedback(relevantFeedback);
      
      // Create similar solutions array
      const similarSolutions = await this.buildSimilarSolutionsContext(
        similarIssues
      );
      
      // Construct the enhancement context
      const enhancementContext: PromptEnhancementContext = {
        relevantFeedback,
        issueContext: issue,
        patterns,
        similarSolutions
      };
      
      return enhancementContext;
    } catch (error) {
      logger.error('Error generating enhancement context', error);
      // Return a minimal context to avoid breaking the flow
      return {
        relevantFeedback: [],
        issueContext: issue,
        patterns: {
          positive: [],
          negative: []
        },
        similarSolutions: []
      };
    }
  }
  
  /**
   * Enhance a base prompt with feedback context
   */
  public enhancePrompt(
    basePrompt: string, 
    enhancementContext: PromptEnhancementContext
  ): string {
    try {
      // Start with the base prompt
      let enhancedPrompt = basePrompt;
      
      // Add information about patterns to avoid (from negative feedback)
      if (enhancementContext.patterns.negative.length > 0) {
        enhancedPrompt += '\n\n### Patterns to Avoid\n';
        enhancedPrompt += 'Based on previous feedback, avoid these patterns:\n';
        enhancementContext.patterns.negative.forEach(pattern => {
          enhancedPrompt += `- ${pattern}\n`;
        });
      }
      
      // Add information about patterns to follow (from positive feedback)
      if (enhancementContext.patterns.positive.length > 0) {
        enhancedPrompt += '\n\n### Recommended Approaches\n';
        enhancedPrompt += 'Based on previous successful solutions, consider these approaches:\n';
        enhancementContext.patterns.positive.forEach(pattern => {
          enhancedPrompt += `- ${pattern}\n`;
        });
      }
      
      // Add examples of similar solutions that received positive feedback
      const positiveSolutions = enhancementContext.similarSolutions.filter(
        solution => this.hasPositiveFeedback(solution.feedback)
      );
      
      if (positiveSolutions.length > 0) {
        enhancedPrompt += '\n\n### Successful Solution Examples\n';
        enhancedPrompt += 'These approaches worked well for similar issues:\n';
        
        // Limit to 3 examples to avoid overly long prompts
        positiveSolutions.slice(0, 3).forEach(solution => {
          const positiveFeedback = solution.feedback.filter(
            f => f.sentiment === 'positive'
          );
          
          enhancedPrompt += `\nIssue: ${solution.issueId}\n`;
          enhancedPrompt += `What worked: ${positiveFeedback[0]?.content || 'Approved solution'}\n`;
        });
      }
      
      return enhancedPrompt;
    } catch (error) {
      logger.error('Error enhancing prompt', error);
      // Return the original prompt if there's an error
      return basePrompt;
    }
  }
  
  /**
   * Find issues similar to the current one
   * Similarity is based on labels, repository, and potentially content
   */
  private async findSimilarIssues(
    issue: IssueContext, 
    limit: number = 5
  ): Promise<string[]> {
    // In a real implementation, this would involve more sophisticated
    // similarity analysis, potentially using embeddings or other ML techniques
    
    // For now, we'll simply look for issues with similar labels in the same repo
    const allFeedback = await this._storage.queryFeedback();
    
    // Get unique issue IDs
    const issueIds = new Set<string>();
    allFeedback.forEach(feedback => {
      issueIds.add(feedback.issueId);
    });
    
    // Filter out the current issue
    return Array.from(issueIds).filter(id => id !== issue.id).slice(0, limit);
  }
  
  /**
   * Get feedback relevant to the current issue
   * This includes feedback for similar issues
   */
  private async getRelevantFeedback(
    similarIssueIds: string[], 
    limit: number
  ): Promise<FeedbackEvent[]> {
    if (similarIssueIds.length === 0) {
      return [];
    }
    
    const allFeedback: FeedbackEvent[] = [];
    
    // Get feedback for each similar issue
    for (const issueId of similarIssueIds) {
      const feedback = await this._storage.queryFeedback({ issueId });
      allFeedback.push(...feedback);
    }
    
    // Sort by sentiment (positive first) and then by timestamp (newest first)
    return allFeedback
      .sort((a, b) => {
        // First by sentiment (positive > neutral > negative)
        const sentimentOrder = {
          'positive': 0,
          'neutral': 1,
          'negative': 2
        };
        
        const sentimentDiff = 
          sentimentOrder[a.sentiment] - sentimentOrder[b.sentiment];
          
        if (sentimentDiff !== 0) {
          return sentimentDiff;
        }
        
        // Then by timestamp (newest first)
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      })
      .slice(0, limit);
  }
  
  /**
   * Extract patterns from feedback
   * This identifies common themes in positive and negative feedback
   */
  private extractPatternsFromFeedback(
    feedback: FeedbackEvent[]
  ): { positive: string[], negative: string[] } {
    const positiveFeedback = feedback.filter(f => f.sentiment === 'positive');
    const negativeFeedback = feedback.filter(f => f.sentiment === 'negative');
    
    // In a production system, this would use NLP techniques
    // For now, we'll extract key phrases based on simple heuristics
    
    // Extract positive patterns (what was liked in solutions)
    const positivePatterns = this.extractKeyPhrases(
      positiveFeedback.map(f => f.content)
    );
    
    // Extract negative patterns (what to avoid)
    const negativePatterns = this.extractKeyPhrases(
      negativeFeedback.map(f => f.content)
    );
    
    return {
      positive: positivePatterns,
      negative: negativePatterns
    };
  }
  
  /**
   * Simple key phrase extraction from text
   * In a production system, this would use NLP or ML techniques
   */
  private extractKeyPhrases(texts: string[]): string[] {
    if (texts.length === 0) {
      return [];
    }
    
    // Combine all texts
    const combinedText = texts.join(' ');
    
    // Simple extraction based on common patterns in feedback
    const phrases: string[] = [];
    
    // Look for phrases after "I like", "Good", etc.
    const positiveRegexes = [
      /I\s+like\s+(how|that|the)\s+(.+?)(\.|\n|$)/i,
      /Good\s+(.+?)(\.|\n|$)/i,
      /Great\s+(.+?)(\.|\n|$)/i,
      /Works\s+well\s+(.+?)(\.|\n|$)/i
    ];
    
    // Look for phrases after "I don't like", "Issue with", etc.
    const negativeRegexes = [
      /I\s+don'?t\s+like\s+(how|that|the)\s+(.+?)(\.|\n|$)/i,
      /Issue\s+with\s+(.+?)(\.|\n|$)/i,
      /Problem\s+(.+?)(\.|\n|$)/i,
      /Not\s+working\s+(.+?)(\.|\n|$)/i,
      /Could\s+be\s+better\s+(.+?)(\.|\n|$)/i
    ];
    
    // Extract using all regex patterns
    const allRegexes = [...positiveRegexes, ...negativeRegexes];
    
    for (const regex of allRegexes) {
      const matches = combinedText.match(new RegExp(regex, 'g'));
      if (matches) {
        for (const match of matches) {
          const phraseMatch = match.match(regex);
          if (phraseMatch && phraseMatch.length > 1) {
            // Get the captured phrase (could be in group 1 or 2 depending on regex)
            const phrase = phraseMatch[2] || phraseMatch[1];
            if (phrase && phrase.length > 3) {
              phrases.push(phrase.trim());
            }
          }
        }
      }
    }
    
    // Deduplicate and return
    return [...new Set(phrases)];
  }
  
  /**
   * Build context for similar solutions
   */
  private async buildSimilarSolutionsContext(
    similarIssueIds: string[]
  ): Promise<Array<{
    issueId: string,
    prId: string,
    feedback: FeedbackEvent[]
  }>> {
    const result = [];
    
    for (const issueId of similarIssueIds) {
      // Get all feedback for this issue
      const feedback = await this._storage.queryFeedback({ issueId });
      
      if (feedback.length === 0) {
        continue;
      }
      
      // Get unique PR IDs for this issue
      const prIds = new Set<string>();
      feedback.forEach(f => prIds.add(f.prId));
      
      // Use the first PR (usually there's only one PR per issue)
      const prId = Array.from(prIds)[0];
      
      if (prId) {
        result.push({
          issueId,
          prId,
          feedback
        });
      }
    }
    
    return result;
  }
  
  /**
   * Check if a collection of feedback is mostly positive
   */
  private hasPositiveFeedback(feedback: FeedbackEvent[]): boolean {
    if (feedback.length === 0) {
      return false;
    }
    
    const positiveCount = feedback.filter(
      f => f.sentiment === 'positive'
    ).length;
    
    return positiveCount > feedback.length / 2;
  }
}

// Create a singleton instance
export const promptEnhancer = new PromptEnhancer();