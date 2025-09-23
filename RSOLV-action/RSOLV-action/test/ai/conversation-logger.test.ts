import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConversationLogger } from '../../src/ai/conversation-logger.js';
import * as fs from 'fs';
import * as path from 'path';

describe('ConversationLogger', () => {
  const testLogDir = './test-conversation-logs';
  
  beforeEach(() => {
    // Set up test environment
    process.env.AI_CONVERSATION_LOG_LEVEL = 'full';
    process.env.AI_CONVERSATION_LOG_DIR = testLogDir;
    
    // Reset singleton
    ConversationLogger['instance'] = null;
  });
  
  afterEach(() => {
    // Clean up test logs
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true, force: true });
    }
    
    // Reset environment
    delete process.env.AI_CONVERSATION_LOG_LEVEL;
    delete process.env.AI_CONVERSATION_LOG_DIR;
  });
  
  it('should create singleton instance', () => {
    const logger1 = ConversationLogger.getInstance();
    const logger2 = ConversationLogger.getInstance();
    
    expect(logger1).toBe(logger2);
  });
  
  it('should respect log level configuration', async () => {
    process.env.AI_CONVERSATION_LOG_LEVEL = 'none';
    const logger = ConversationLogger.getInstance();
    
    await logger.initialize();
    
    const logEntry = {
      issueId: 'test-123',
      timestamp: new Date().toISOString(),
      provider: 'test' as const,
      model: 'test-model',
      messages: [],
      metadata: {
        duration: 1000
      },
      result: {
        success: true
      }
    };
    
    await logger.logConversation(logEntry);
    
    // Should not create log directory when disabled
    expect(fs.existsSync(testLogDir)).toBe(false);
  });
  
  it('should create log directory when enabled', async () => {
    const logger = ConversationLogger.getInstance();
    await logger.initialize();
    
    expect(fs.existsSync(testLogDir)).toBe(true);
  });
  
  it('should log conversation to file', async () => {
    const logger = ConversationLogger.getInstance();
    await logger.initialize();
    
    const logEntry = {
      issueId: 'test-456',
      timestamp: new Date().toISOString(),
      provider: 'anthropic' as const,
      model: 'claude-3',
      messages: [
        {
          type: 'user' as const,
          content: { text: 'Test message' },
          timestamp: new Date().toISOString()
        }
      ],
      metadata: {
        duration: 2000,
        issueNumber: 456
      },
      result: {
        success: true,
        solutionGenerated: true
      }
    };
    
    await logger.logConversation(logEntry);
    
    // Check if log file was created
    const logFiles = fs.readdirSync(testLogDir);
    const issueLogFile = logFiles.find(f => f.includes('test-456'));
    
    expect(issueLogFile).toBeDefined();
    
    if (issueLogFile) {
      const logContent = fs.readFileSync(path.join(testLogDir, issueLogFile), 'utf-8');
      const parsedLog = JSON.parse(logContent);
      
      expect(parsedLog.issueId).toBe('test-456');
      expect(parsedLog.provider).toBe('anthropic');
      expect(parsedLog.messages).toHaveLength(1);
      expect(parsedLog.result.success).toBe(true);
    }
  });
  
  it('should log summary when enabled', async () => {
    process.env.AI_CONVERSATION_LOG_LEVEL = 'summary';
    const logger = ConversationLogger.getInstance();
    await logger.initialize();
    
    const summaryMessage = 'Test completed successfully';
    await logger.logSummary('test-789', summaryMessage);
    
    // Wait a bit for file to be written
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const summaryFile = path.join(testLogDir, 'summary.log');
    expect(fs.existsSync(summaryFile)).toBe(true);
    
    const content = fs.readFileSync(summaryFile, 'utf-8');
    expect(content).toContain('test-789');
    expect(content).toContain(summaryMessage);
  });
});