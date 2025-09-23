/**
 * Logger for AI conversations - useful for debugging and development
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../utils/logger.js';

export interface ConversationLogEntry {
  issueId: string;
  timestamp: string;
  provider: string;
  model: string;
  messages: any[];
  metadata: {
    workflowRun?: string;
    workflowJob?: string;
    repository?: string;
    issueNumber?: number;
    duration?: number;
    tokenUsage?: {
      prompt: number;
      completion: number;
      total: number;
    };
  };
  result?: {
    success: boolean;
    error?: string;
    solutionGenerated?: boolean;
  };
}

export class ConversationLogger {
  private static logger = new Logger();
  private static instance: ConversationLogger | null = null;
  
  private logDir: string;
  private enabled: boolean;
  private logLevel: 'full' | 'summary' | 'none';
  
  private constructor() {
    this.logLevel = (process.env.AI_CONVERSATION_LOG_LEVEL || 'none') as 'full' | 'summary' | 'none';
    this.enabled = this.logLevel !== 'none';
    this.logDir = process.env.AI_CONVERSATION_LOG_DIR || './ai-conversation-logs';
  }
  
  static getInstance(): ConversationLogger {
    if (!this.instance) {
      this.instance = new ConversationLogger();
    }
    return this.instance;
  }
  
  async initialize(): Promise<void> {
    if (!this.enabled) return;
    
    try {
      await fs.mkdir(this.logDir, { recursive: true });
      ConversationLogger.logger.info(`Conversation logging initialized (level: ${this.logLevel}, dir: ${this.logDir})`);
    } catch (error) {
      ConversationLogger.logger.error(`Failed to create log directory: ${error}`);
      this.enabled = false;
    }
  }
  
  async logConversation(entry: ConversationLogEntry): Promise<void> {
    if (!this.enabled) return;
    
    try {
      // Create filename with timestamp and issue ID
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${timestamp}_${entry.issueId}_${entry.provider}.json`;
      const filepath = path.join(this.logDir, filename);
      
      // Prepare log data based on level
      let logData: any;
      if (this.logLevel === 'full') {
        logData = entry; // Log everything
      } else if (this.logLevel === 'summary') {
        // Log without full message content
        logData = {
          ...entry,
          messages: entry.messages.map(msg => ({
            role: msg.role,
            contentLength: msg.content?.length || 0,
            toolUse: msg.tool_use?.map((t: any) => t.name) || [],
            timestamp: msg.timestamp
          }))
        };
      }
      
      // Write to file
      await fs.writeFile(filepath, JSON.stringify(logData, null, 2));
      ConversationLogger.logger.debug(`Logged conversation to ${filename}`);
      
      // Also create a latest symlink for easy access
      const latestPath = path.join(this.logDir, 'latest.json');
      try {
        await fs.unlink(latestPath).catch(() => {}); // Ignore if doesn't exist
        await fs.symlink(filename, latestPath);
      } catch {
        // Symlinks might not work on all systems
      }
    } catch (error) {
      ConversationLogger.logger.error(`Failed to log conversation: ${error}`);
    }
  }
  
  /**
   * Log a quick summary for debugging
   */
  async logSummary(issueId: string, summary: string): Promise<void> {
    if (!this.enabled) return;
    
    try {
      const summaryFile = path.join(this.logDir, 'summary.log');
      const timestamp = new Date().toISOString();
      const logLine = `${timestamp} [${issueId}] ${summary}\n`;
      
      await fs.appendFile(summaryFile, logLine);
    } catch (error) {
      ConversationLogger.logger.error(`Failed to log summary: ${error}`);
    }
  }
  
  /**
   * Get the log directory path (for artifact collection)
   */
  getLogDirectory(): string {
    return this.logDir;
  }
  
  /**
   * Check if logging is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}