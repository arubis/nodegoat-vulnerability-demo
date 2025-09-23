/**
 * Example Claude Code configuration
 * 
 * This demonstrates the available configuration options for Claude Code integration.
 * Copy this file to claude-code-config.js and customize as needed.
 */
module.exports = {
  // Enable Claude Code integration
  useClaudeCode: true,
  
  // Claude Code specific configuration
  claudeCodeConfig: {
    // Path to Claude Code executable (defaults to 'claude')
    executablePath: 'claude',
    
    // Output format (defaults to 'stream-json')
    outputFormat: 'stream-json',
    
    // Context gathering configuration
    contextOptions: {
      // Maximum depth for context exploration (1-5, defaults to 3)
      maxDepth: 3,
      
      // Controls breadth of context exploration (1-5, defaults to 3)
      explorationBreadth: 3,
      
      // Include specific directories in context gathering
      includeDirs: ['src', 'lib'],
      
      // Exclude specific directories from context gathering
      excludeDirs: ['node_modules', 'dist', 'build'],
      
      // Include specific file patterns in context gathering
      includeFiles: ['*.ts', '*.js', '*.json'],
      
      // Exclude specific file patterns from context gathering
      excludeFiles: ['*.test.ts', '*.spec.js', '*.min.js']
    },
    
    // Retry configuration
    retryOptions: {
      // Maximum number of retries (defaults to 2)
      maxRetries: 2,
      
      // Base delay for exponential backoff in ms (defaults to 1000)
      baseDelay: 1000
    },
    
    // Timeout in milliseconds (defaults to 300000 - 5 minutes)
    timeout: 300000,
    
    // Path for temporary files (defaults to './temp')
    tempDir: './temp',
    
    // Enable detailed logging (defaults to false)
    verboseLogging: false,
    
    // Enable usage tracking and analytics (defaults to true)
    trackUsage: true
  }
};