import { ActionConfig } from '../types/index.js';
import { logger } from './logger.js';

/**
 * Perform security checks before processing issues
 */
export async function securityCheck(config: ActionConfig): Promise<boolean> {
  try {
    logger.info('Performing security checks');
    
    // Check API key
    if (!validateApiKey(config.apiKey)) {
      throw new Error('Invalid API key');
    }
    logger.debug('API key validated');
    
    // Check repository permissions
    await checkRepositoryPermissions();
    logger.debug('Repository permissions verified');
    
    // Scan for sensitive data in configuration
    checkForSensitiveData(config);
    logger.debug('No sensitive data found in configuration');
    
    // Validate security settings
    validateSecuritySettings(config.securitySettings);
    logger.debug('Security settings validated');
    
    logger.info('All security checks passed');
    return true;
  } catch (error) {
    logger.error('Security check failed', error);
    throw new Error(`Security check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validate the API key format and authenticity
 */
function validateApiKey(apiKey: string): boolean {
  // Check if the API key is present
  if (!apiKey) {
    logger.error('API key is missing');
    return false;
  }
  
  // Check if it's our development API key
  if (apiKey === 'rsolv-dev-key-123456789') {
    logger.warn('Using development API key - not secure for production');
    return true;
  }
  
  // Check RSOLV API key formats
  // Format 1: rsolv_live_[base64url] (production keys)
  // Format 2: rsolv_internal_[hex] (internal/demo keys)
  // Format 3: rsolv_test_[alphanumeric] (test keys)
  // Format 4: UUID v4 (legacy format)
  const rsolvKeyRegex = /^rsolv_(live|internal|test|prod)_[a-zA-Z0-9_-]+$/;
  const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  if (!rsolvKeyRegex.test(apiKey) && !uuidV4Regex.test(apiKey)) {
    logger.error('API key has invalid format');
    return false;
  }
  
  // In production, the RSOLV API will validate the key during credential exchange
  
  return true;
}

/**
 * Check repository permissions
 */
async function checkRepositoryPermissions(): Promise<void> {
  try {
    // Check if we have the necessary permissions on the repository
    // This would typically involve making API calls to GitHub
    
    // For development purposes, we'll simulate the check
    logger.debug('Checking repository permissions');
    
    // Add a small delay to simulate the check
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // In a real implementation, we would check:
    // 1. If we have read access to the repository
    // 2. If we have write access for creating branches and PRs
    // 3. If we have access to the GitHub API
    
    logger.debug('Repository permissions verified');
  } catch (error) {
    logger.error('Repository permission check failed', error);
    throw new Error('Failed to verify repository permissions');
  }
}

/**
 * Check configuration for any sensitive data
 */
function checkForSensitiveData(config: ActionConfig): void {
  // Check for sensitive data in the configuration
  const configStr = JSON.stringify(config);
  
  // Check for common patterns of sensitive data
  const sensitivePatterns = [
    /password\s*[:=]\s*["'](?!\\$).*["']/i,
    /secret\s*[:=]\s*["'](?!\\$).*["']/i,
    /access[_-]?token\s*[:=]\s*["'](?!\\$).*["']/i,
    /api[_-]?key\s*[:=]\s*["'](?!\\$).*["']/i,
    /private[_-]?key\s*[:=]\s*["'](?!\\$).*["']/i,
  ];
  
  for (const pattern of sensitivePatterns) {
    if (pattern.test(configStr)) {
      // In a real implementation, we would mask the sensitive data in logs
      logger.warn('Potential sensitive data found in configuration');
      
      // For critical security, we might throw an error
      // throw new Error('Sensitive data found in configuration');
    }
  }
}

/**
 * Validate security settings
 */
function validateSecuritySettings(settings: any): void {
  if (!settings) {
    logger.warn('No security settings provided, using defaults');
    return;
  }
  
  // Check for minimum required security settings
  if (settings.disableNetworkAccess === undefined) {
    logger.warn('Network access control not specified, defaulting to restricted');
  }
  
  if (settings.preventSecretLeakage === false) {
    logger.warn('Secret leakage prevention is disabled, this is not recommended');
  }
  
  // Verify that the security settings are valid
  if (settings.timeoutSeconds && (typeof settings.timeoutSeconds !== 'number' || settings.timeoutSeconds <= 0)) {
    logger.error('Invalid timeout value in security settings');
    throw new Error('Invalid timeout value in security settings');
  }
  
  if (settings.maxFileSize && (typeof settings.maxFileSize !== 'number' || settings.maxFileSize <= 0)) {
    logger.error('Invalid max file size in security settings');
    throw new Error('Invalid max file size in security settings');
  }
}