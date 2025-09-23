/**
 * Mock logger for testing
 */
export class Logger {
  debug(_message: string): void {
    // Do nothing in tests
  }

  info(_message: string): void {
    // Do nothing in tests
  }

  warning(_message: string): void {
    // Do nothing in tests
  }

  error(_message: string, _error?: Error): void {
    // Do nothing in tests
  }

  setDebugMode(_enabled: boolean): void {
    // Do nothing in tests
  }
}

// Create a default logger instance
export const logger = new Logger();