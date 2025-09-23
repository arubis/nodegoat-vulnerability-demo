/**
 * Sanitizes error messages to remove provider-specific information
 */
export function sanitizeErrorMessage(message: string): string {
  let sanitized = message;
  
  // First pass: Replace API URLs
  sanitized = sanitized.replace(/https?:\/\/api\.[a-zA-Z0-9.-]+\.(com|ai|dev|io)(\/[a-zA-Z0-9/\-._~:/?#[\]@!$&'()*+,;=]*)?/gi, 'API endpoint');
  
  // Second pass: Replace API keys and credentials (must be before provider names)
  // Match various key patterns
  sanitized = sanitized.replace(/\b(sk-proj-|sk-|ant_|key[:\s]+)[a-zA-Z0-9_\-]{8,}/gi, 'API credential');
  sanitized = sanitized.replace(/\b(api[_-]?key|token|secret|credential)([:\s]+)[a-zA-Z0-9_\-]{8,}/gi, '$1$2[REDACTED]');
  sanitized = sanitized.replace(/\b[A-Z][A-Z0-9_]*_API_KEY\b/g, 'API_KEY');
  
  // Third pass: Replace model names (before provider names to avoid partial replacements)
  sanitized = sanitized.replace(/\b(claude-[0-9a-z\-\.]+|gpt-[0-9a-z\-\.]+|text-davinci-[0-9]+)\b/gi, 'AI model');
  
  // Fourth pass: Replace provider names
  const providerNames = [
    'anthropic', 'claude', 'openai', 'gpt', 'mistral', 'ollama', 'gemini', 'bard'
  ];
  
  // Create a case-insensitive pattern for all provider names
  const providerPattern = new RegExp(`\\b(${providerNames.join('|')})\\b`, 'gi');
  sanitized = sanitized.replace(providerPattern, 'AI provider');
  
  // Fifth pass: Clean up specific patterns
  // Handle "Failed to connect to X API" pattern
  if (sanitized.includes('Failed to connect to')) {
    sanitized = sanitized.replace(/Failed to connect to .+ API/g, 'Failed to connect to AI provider API');
  }
  
  // Handle API endpoints
  sanitized = sanitized.replace(/\/v\d+\/[a-zA-Z]+/g, '/api/endpoint');
  sanitized = sanitized.replace(/\/chat\/completions/g, '/api/endpoint');
  
  // Clean up any double spaces or awkward formatting
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  
  // Fix common awkward replacements
  sanitized = sanitized.replace(/AI provider provider/gi, 'AI provider');
  sanitized = sanitized.replace(/API credential credential/gi, 'API credential');
  
  return sanitized;
}

/**
 * Sanitizes an entire error object
 */
export function sanitizeError(error: unknown): Error {
  if (error instanceof Error) {
    const sanitizedMessage = sanitizeErrorMessage(error.message);
    const sanitizedError = new Error(sanitizedMessage);
    sanitizedError.name = error.name;
    // Don't copy stack trace as it might contain sensitive information
    return sanitizedError;
  }
  
  // For non-Error objects, convert to string and sanitize
  const message = String(error);
  return new Error(sanitizeErrorMessage(message));
}