/**
 * Enhanced logging utility for the RSOLV action
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogOptions {
  level?: LogLevel;
  timestamp?: boolean;
  metadata?: Record<string, any>;
}

class Logger {
  private minLevel: LogLevel;
  private defaultOptions: LogOptions;
  
  constructor(options: LogOptions = {}) {
    this.minLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel || 'info';
    this.defaultOptions = {
      timestamp: true,
      ...options
    };
  }
  
  /**
   * Log a message at the debug level
   */
  debug(message: string, metadata?: any): void {
    this.log('debug', message, metadata);
  }
  
  /**
   * Log a message at the info level
   */
  info(message: string, metadata?: any): void {
    this.log('info', message, metadata);
  }
  
  /**
   * Log a message at the warn level
   */
  warn(message: string, metadata?: any): void {
    this.log('warn', message, metadata);
  }
  
  /**
   * Log a message at the error level
   */
  error(message: string, error?: any): void {
    let metadata: Record<string, any> | undefined;
    
    if (error) {
      metadata = {
        error: error instanceof Error 
          ? { message: error.message, stack: error.stack } 
          : error
      };
    }
    
    this.log('error', message, metadata);
  }
  
  /**
   * Internal method to log a message with the specified level
   */
  private log(level: LogLevel, message: string, metadata?: any): void {
    // Skip logging if the level is below the minimum level
    if (!this.shouldLog(level)) {
      return;
    }
    
    const logEntry = this.formatLogEntry(level, message, metadata);
    
    switch (level) {
    case 'debug':
      console.debug(logEntry);
      break;
    case 'info':
      console.info(logEntry);
      break;
    case 'warn':
      console.warn(logEntry);
      break;
    case 'error':
      console.error(logEntry);
      break;
    }
  }
  
  /**
   * Check if a message with the given level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const minLevelIndex = levels.indexOf(this.minLevel);
    const currentLevelIndex = levels.indexOf(level);
    
    return currentLevelIndex >= minLevelIndex;
  }
  
  /**
   * Format a log entry with timestamp and metadata
   */
  private formatLogEntry(level: LogLevel, message: string, metadata?: any): string {
    const timestamp = this.defaultOptions.timestamp 
      ? `[${new Date().toISOString()}]` 
      : '';
    
    const levelStr = `[${level.toUpperCase()}]`;
    
    let logMessage = `${timestamp}${levelStr} ${message}`;
    
    // Add metadata if available
    if (metadata) {
      try {
        const metadataStr = JSON.stringify(metadata, null, 2);
        logMessage += `\n${metadataStr}`;
      } catch (error) {
        logMessage += '\n[Error serializing metadata]';
      }
    }
    
    return logMessage;
  }
  
  /**
   * Set the minimum log level
   */
  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }
  
  /**
   * Get the current minimum log level
   */
  getMinLevel(): LogLevel {
    return this.minLevel;
  }
}

// Create and export a singleton instance
export const logger = new Logger();

// Export the Logger class for testing and custom instances
export { Logger };