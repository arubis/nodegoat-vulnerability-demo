import { SecurityPattern, VulnerabilityType } from './types.js';
import { PatternAPIClient } from './pattern-api-client.js';
import { getMinimalPatterns, getMinimalPatternsByLanguage } from './minimal-patterns.js';
import { logger } from '../utils/logger.js';

/**
 * Interface for pattern sources
 * Implements RFC-008 Pattern Source abstraction
 */
export interface PatternSource {
  getPatternsByLanguage(language: string): Promise<SecurityPattern[]>;
  getPatternsByType(type: VulnerabilityType): Promise<SecurityPattern[]>;
  getAllPatterns(): Promise<SecurityPattern[]>;
}

/**
 * Local pattern source using minimal fallback patterns
 * Used as fallback when API is unavailable
 * Intentionally limited to protect proprietary patterns
 */
export class LocalPatternSource implements PatternSource {
  private patterns: SecurityPattern[] = [];
  private static readonly MINIMUM_PATTERNS_PER_LANGUAGE = 25;
  private static readonly CRITICAL_PATTERN_TYPES = [
    'sql_injection', 'command_injection', 'xss', 'path_traversal', 'insecure_deserialization'
  ];

  constructor() {
    this.initializePatterns();
  }

  private initializePatterns(): void {
    // Use factory function to get fresh patterns with working RegExp objects
    this.patterns = getMinimalPatterns();
    
    // Only log error if this is the primary source, not when used as fallback
    const isUsedAsStandalone = !process.env.RSOLV_API_KEY;
    
    if (isUsedAsStandalone) {
      // Log critical error only when no API key is available
      logger.error('🚨 CRITICAL: Using minimal patterns only', {
        reason: 'No RSOLV_API_KEY provided',
        patternCount: this.patterns.length,
        impact: 'Detection capability severely limited - will miss most vulnerabilities',
        recommendation: 'Set RSOLV_API_KEY environment variable'
      });
      
      logger.warn('Using minimal fallback patterns - API connection recommended for full pattern coverage');
    } else {
      // This is being used as fallback in HybridPatternSource
      logger.debug('LocalPatternSource initialized as fallback', {
        patternCount: this.patterns.length,
        mode: 'fallback'
      });
    }
    
    // Check for critical pattern types
    this.validateCriticalPatternCoverage();
  }
  
  private validateCriticalPatternCoverage(): void {
    const typesCovered = new Set(this.patterns.map(p => p.type));
    const missingTypes = LocalPatternSource.CRITICAL_PATTERN_TYPES.filter(
      type => !typesCovered.has(type as VulnerabilityType)
    );
    
    if (missingTypes.length > 0) {
      logger.error('🚨 MISSING CRITICAL PATTERN TYPES', {
        missing: missingTypes,
        impact: 'Cannot detect these vulnerability types'
      });
    }
  }

  async getPatternsByLanguage(language: string): Promise<SecurityPattern[]> {
    const patterns = getMinimalPatternsByLanguage(language);
    
    // Log warning with metrics
    const coveragePercentage = Math.round(
      (patterns.length / LocalPatternSource.MINIMUM_PATTERNS_PER_LANGUAGE) * 100
    );
    
    logger.warn('📊 PATTERN SOURCE METRICS', {
      source: 'local',
      language,
      patternCount: patterns.length,
      expectedMinimum: LocalPatternSource.MINIMUM_PATTERNS_PER_LANGUAGE,
      coveragePercentage: `${coveragePercentage}%`
    });
    
    // Log error if below threshold
    if (patterns.length < LocalPatternSource.MINIMUM_PATTERNS_PER_LANGUAGE) {
      logger.error(`🚨 INSUFFICIENT PATTERNS for ${language}`, {
        language,
        actual: patterns.length,
        required: LocalPatternSource.MINIMUM_PATTERNS_PER_LANGUAGE,
        deficit: LocalPatternSource.MINIMUM_PATTERNS_PER_LANGUAGE - patterns.length
      });
    }
    
    logger.info(`LocalPatternSource: Returning ${patterns.length} minimal ${language} patterns`);
    return patterns;
  }

  async getPatternsByType(type: VulnerabilityType): Promise<SecurityPattern[]> {
    const patterns = this.patterns.filter(p => p.type === type);
    logger.info(`LocalPatternSource: Returning ${patterns.length} minimal patterns of type ${type}`);
    return patterns;
  }

  async getAllPatterns(): Promise<SecurityPattern[]> {
    logger.info(`LocalPatternSource: Returning ${this.patterns.length} minimal patterns total`);
    return this.patterns;
  }
}

/**
 * API-based pattern source
 * Fetches patterns from RSOLV-api with caching
 */
export class ApiPatternSource implements PatternSource {
  private client: PatternAPIClient;
  private supportedLanguages = [
    'javascript', 'typescript', 'python', 'ruby', 'java', 'php', 'elixir'
  ];

  constructor(apiKey?: string, apiUrl?: string) {
    this.client = new PatternAPIClient({
      apiKey,
      apiUrl,
      cacheEnabled: true,
      cacheTTL: 3600, // 1 hour cache
      fallbackToLocal: false // We'll handle fallback at a higher level
    });
  }

  async getPatternsByLanguage(language: string): Promise<SecurityPattern[]> {
    try {
      const patterns = await this.client.fetchPatterns(language.toLowerCase());
      
      // Log success with detailed metrics
      logger.info(`✅ ApiPatternSource: Fetched ${patterns.length} ${language} patterns from API`);
      logger.info('PATTERN FETCH SUCCESS', {
        source: 'api',
        language,
        patternCount: patterns.length,
        coverageLevel: patterns.length >= 25 ? 'full' : 'partial'
      });
      
      return patterns;
    } catch (error) {
      logger.error(`❌ ApiPatternSource: Failed to fetch ${language} patterns`, error);
      logger.error('PATTERN FETCH FAILURE', {
        source: 'api',
        language,
        error: error instanceof Error ? error.message : String(error),
        impact: 'Will fall back to minimal patterns if hybrid mode'
      });
      throw error;
    }
  }

  async getPatternsByType(type: VulnerabilityType): Promise<SecurityPattern[]> {
    // Fetch all patterns and filter by type
    // In a future optimization, we could add a type-specific endpoint
    const allPatterns = await this.getAllPatterns();
    const filtered = allPatterns.filter(p => p.type === type);
    logger.info(`ApiPatternSource: Returning ${filtered.length} patterns of type ${type}`);
    return filtered;
  }

  async getAllPatterns(): Promise<SecurityPattern[]> {
    const allPatterns: SecurityPattern[] = [];
    
    // Fetch patterns for all supported languages
    for (const language of this.supportedLanguages) {
      try {
        const patterns = await this.client.fetchPatterns(language);
        allPatterns.push(...patterns);
      } catch (error) {
        logger.warn(`Failed to fetch ${language} patterns, continuing...`, error);
      }
    }
    
    logger.info(`ApiPatternSource: Fetched ${allPatterns.length} total patterns from API`);
    return allPatterns;
  }
}

/**
 * Hybrid pattern source with API primary and local fallback
 * Implements RFC-008 graceful degradation strategy
 */
export class HybridPatternSource implements PatternSource {
  private apiSource: ApiPatternSource;
  private localSource: LocalPatternSource;

  constructor(apiKey?: string, apiUrl?: string) {
    this.apiSource = new ApiPatternSource(apiKey, apiUrl);
    this.localSource = new LocalPatternSource();
  }

  async getPatternsByLanguage(language: string): Promise<SecurityPattern[]> {
    try {
      // Try API first
      return await this.apiSource.getPatternsByLanguage(language);
    } catch (error) {
      // Fall back to local patterns
      logger.warn(`Falling back to local patterns for ${language} due to API error`, error);
      return await this.localSource.getPatternsByLanguage(language);
    }
  }

  async getPatternsByType(type: VulnerabilityType): Promise<SecurityPattern[]> {
    try {
      // Try API first
      return await this.apiSource.getPatternsByType(type);
    } catch (error) {
      // Fall back to local patterns
      logger.warn(`Falling back to local patterns for type ${type} due to API error`, error);
      return await this.localSource.getPatternsByType(type);
    }
  }

  async getAllPatterns(): Promise<SecurityPattern[]> {
    try {
      // Try API first
      return await this.apiSource.getAllPatterns();
    } catch (error) {
      // Fall back to local patterns
      logger.warn('Falling back to local patterns due to API error', error);
      return await this.localSource.getAllPatterns();
    }
  }
}

/**
 * Factory function to create the appropriate pattern source
 * based on configuration and environment
 */
export function createPatternSource(): PatternSource {
  const apiKey = process.env.RSOLV_API_KEY;
  const apiUrl = process.env.RSOLV_API_URL;
  const useLocalPatterns = process.env.USE_LOCAL_PATTERNS === 'true';
  const failOnMinimal = process.env.USE_FAIL_ON_MINIMAL_PATTERNS === 'true';

  if (useLocalPatterns) {
    logger.error('🚨 FORCED LOCAL PATTERNS', {
      reason: 'USE_LOCAL_PATTERNS=true',
      impact: 'Using minimal patterns instead of API patterns',
      recommendation: 'Remove USE_LOCAL_PATTERNS environment variable'
    });
    
    if (failOnMinimal) {
      throw new Error(
        'Cannot proceed with minimal patterns when USE_FAIL_ON_MINIMAL_PATTERNS is set. ' +
        'Either provide RSOLV_API_KEY or unset USE_FAIL_ON_MINIMAL_PATTERNS.'
      );
    }
    
    logger.info('Using local pattern source (USE_LOCAL_PATTERNS=true)');
    return new LocalPatternSource();
  }

  if (apiKey) {
    logger.info('✅ Using hybrid pattern source with API key');
    logger.info('PATTERN SOURCE SUCCESS', {
      source: 'api',
      mode: 'hybrid',
      fallbackAvailable: true,
      apiKeyLength: apiKey.length,
      apiKeyPrefix: apiKey.substring(0, 10) + '...'
    });
    return new HybridPatternSource(apiKey, apiUrl);
  }

  // No API key - this is a critical configuration issue
  logger.error('🚨 CRITICAL CONFIGURATION ERROR', {
    problem: 'No RSOLV_API_KEY provided',
    impact: 'Scanner will use minimal patterns and miss most vulnerabilities',
    detectionRate: 'Approximately 10-20% of vulnerabilities will be detected',
    recommendation: 'Set RSOLV_API_KEY environment variable or rsolvApiKey in workflow'
  });
  
  if (failOnMinimal) {
    throw new Error(
      'Cannot proceed with minimal patterns when USE_FAIL_ON_MINIMAL_PATTERNS is set. ' +
      'Provide RSOLV_API_KEY to use API patterns.'
    );
  }
  
  logger.warn('No API key provided, using local pattern source only');
  return new LocalPatternSource();
}