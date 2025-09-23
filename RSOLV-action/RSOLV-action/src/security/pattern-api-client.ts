import { logger } from '../utils/logger.js';
import { SecurityPattern, VulnerabilityType } from './types.js';

// RFC-032 Phase 2.2: Types for serialized regex format
interface SerializedRegex {
  __type__: 'regex';
  source: string;
  flags: string[];
}

// Type guard to check if a value is a serialized regex
function isSerializedRegex(value: any): value is SerializedRegex {
  return value && 
         typeof value === 'object' && 
         value.__type__ === 'regex' &&
         typeof value.source === 'string' &&
         Array.isArray(value.flags);
}

export interface PatternResponse {
  patterns: PatternData[];
  metadata?: {
    count?: number;
    language?: string;
    format?: string;
    enhanced?: boolean;
    access_level?: 'demo' | 'full';
  };
  // Deprecated fields for backward compatibility
  count?: number;
  language?: string;
  accessible_tiers?: string[];
  tier?: string;
}

export interface PatternData {
  id: string;
  name: string;
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  patterns?: string[] | { regex: string[] };  // Legacy field - Can be array or object with regex array
  regex_patterns?: string[];  // Current API format (some endpoints)
  regex?: string | string[];  // Enhanced format field (single pattern or array)
  languages: string[];
  frameworks?: string[];
  recommendation: string;
  cwe_id?: string;      // API returns snake_case, optional for compatibility
  cweId?: string;       // Alternative camelCase format
  owasp_category?: string;  // API returns snake_case, optional
  owaspCategory?: string;   // Alternative camelCase format
  test_cases?: {        // API returns snake_case, optional
    vulnerable: string[];
    safe: string[];
  };
  testCases?: {         // Alternative camelCase format
    vulnerable: string[];
    safe: string[];
  };
  // AST Enhancement fields
  ast_rules?: {
    node_type?: string;
    [key: string]: any;
  };
  context_rules?: {
    exclude_paths?: string[];
    safe_if_wrapped?: string[];
    [key: string]: any;
  };
  confidence_rules?: {
    base?: number;
    adjustments?: Record<string, number>;
    [key: string]: any;
  };
  min_confidence?: number;
}

export interface PatternAPIConfig {
  apiUrl?: string;
  apiKey?: string;
  cacheEnabled?: boolean;
  cacheTTL?: number; // in seconds
  fallbackToLocal?: boolean;
}

/**
 * Client for fetching security patterns from RSOLV-api
 * Implements RFC-008 Pattern Serving API
 */
export class PatternAPIClient {
  private apiUrl: string;
  private apiKey?: string;
  private cache: Map<string, { patterns: SecurityPattern[]; timestamp: number }> = new Map();
  private cacheTTL: number;
  private fallbackToLocal: boolean;

  constructor(config: PatternAPIConfig = {}) {
    const baseUrl = config.apiUrl || process.env.RSOLV_API_URL || 'https://api.rsolv.dev';
    // Ensure the base URL doesn't end with a slash
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    // Append the patterns API path if not already included
    this.apiUrl = cleanBaseUrl.includes('/api/v1/patterns') ? cleanBaseUrl : `${cleanBaseUrl}/api/v1/patterns`;
    
    this.apiKey = config.apiKey || process.env.RSOLV_API_KEY;
    this.cacheTTL = (config.cacheTTL || 3600) * 1000; // Convert to milliseconds
    this.fallbackToLocal = config.fallbackToLocal ?? true;

    if (!this.apiKey) {
      logger.warn('No RSOLV API key provided - only demo patterns available');
    } else {
      logger.debug('PatternAPIClient initialized with API key', {
        keyLength: this.apiKey.length,
        keyPrefix: this.apiKey.substring(0, 10) + '...',
        keyFromConfig: !!config.apiKey,
        keyFromEnv: !config.apiKey && !!process.env.RSOLV_API_KEY
      });
    }
  }

  /**
   * Fetch patterns for a specific language
   * Returns all patterns with API key, or demo patterns without
   */
  async fetchPatterns(language: string): Promise<SecurityPattern[]> {
    const cacheKey = `${language}-${this.apiKey || 'demo'}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      logger.info(`Using cached patterns for ${language} (${cached.patterns.length} patterns)`);
      return cached.patterns;
    }

    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (this.apiKey) {
        // Use x-api-key header as per unified API authentication (ADR-027)
        headers['x-api-key'] = this.apiKey;
      }

      // Use the new tier-less endpoint with enhanced format
      const response = await fetch(`${this.apiUrl}?language=${language}&format=enhanced`, { headers });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch patterns: ${response.status} ${response.statusText}`);
      }

      const data: PatternResponse = await response.json();
      const count = data.metadata?.count || data.count || data.patterns.length;
      logger.info(`Fetched ${count} ${language} patterns from API`);
      
      // Convert API patterns to SecurityPattern format
      const patterns = data.patterns.map(p => this.convertToSecurityPattern(p));
      
      // Cache the results
      this.cache.set(cacheKey, { patterns, timestamp: Date.now() });
      
      return patterns;
    } catch (error) {
      logger.error(`Failed to fetch ${language} patterns from API:`, error);
      
      if (this.fallbackToLocal) {
        logger.warn(`Falling back to local patterns for ${language}`);
        // TODO: Return basic local patterns as fallback
        return [];
      }
      
      throw error;
    }
  }

  /**
   * @deprecated Tier system has been removed. Use fetchPatterns() instead.
   * All patterns are now available with a valid API key.
   * This method is kept for backward compatibility only.
   */
  async fetchPatternsByTier(tier: 'public' | 'protected' | 'ai' | 'enterprise', language?: string): Promise<SecurityPattern[]> {
    logger.warn(`fetchPatternsByTier is deprecated. Tier '${tier}' is ignored. Use fetchPatterns() instead.`);
    
    // For backward compatibility, just call fetchPatterns
    if (language) {
      return this.fetchPatterns(language);
    }

    try {
      // Without language, we can't fetch patterns in the new API
      // Return empty array for backward compatibility
      logger.warn('fetchPatternsByTier called without language parameter. Returning empty array.');
      return [];
    } catch (error) {
      logger.error('Failed to fetch patterns from API:', error);
      throw error;
    }
  }


  /**
   * Convert API pattern format to RSOLV-action SecurityPattern format
   */
  private convertToSecurityPattern(apiPattern: PatternData): SecurityPattern {
    // RFC-032: First reconstruct any serialized regex objects in the pattern
    const reconstructedPattern = this.reconstructPattern(apiPattern);
    
    // Handle different API response formats
    let patternData: any[] = [];
    
    // Check for regex field (enhanced format - can be string or array)
    if ((reconstructedPattern as any).regex) {
      const regexField = (reconstructedPattern as any).regex;
      if (typeof regexField === 'string') {
        patternData = [regexField];
      } else if (Array.isArray(regexField)) {
        patternData = regexField;
      }
    }
    // Check for regex_patterns field (current API format)
    else if (Array.isArray((reconstructedPattern as any).regex_patterns)) {
      patternData = (reconstructedPattern as any).regex_patterns;
    }
    // Check if patterns is an array (legacy language endpoint format)
    else if (Array.isArray(reconstructedPattern.patterns)) {
      patternData = reconstructedPattern.patterns;
    } 
    // Check if patterns is an object with regex array (legacy tier endpoint format)
    else if (reconstructedPattern.patterns && typeof reconstructedPattern.patterns === 'object' && 
             'regex' in reconstructedPattern.patterns && Array.isArray((reconstructedPattern.patterns as any).regex)) {
      patternData = (reconstructedPattern.patterns as any).regex;
    }
    // Fallback for unexpected format
    else {
      // Only warn if we didn't find any pattern data
      logger.warn(`No regex patterns found for ${reconstructedPattern.id}`);
      patternData = [];
    }
    
    // Compile regex patterns from strings or use already-reconstructed RegExp objects
    const regexPatterns = patternData.map(item => {
      try {
        // If it's already a RegExp (from reconstruction), use it directly
        if (item instanceof RegExp) {
          return item;
        }
        
        // Otherwise, handle string patterns
        if (typeof item === 'string') {
          // Handle both simple patterns and patterns with flags
          const match = item.match(/^\/(.*)\/([gimsuvy]*)$/);
          if (match) {
            return new RegExp(match[1], match[2]);
          }
          return new RegExp(item);
        }
        
        logger.warn(`Unexpected pattern type for ${reconstructedPattern.id}:`, item);
        return null;
      } catch (error) {
        logger.warn(`Failed to compile regex for pattern ${reconstructedPattern.id}: ${item}`);
        logger.error(String(error));
        return null;
      }
    }).filter(Boolean) as RegExp[];

    // Convert context rules if present (already reconstructed)
    const contextRules = reconstructedPattern.context_rules || undefined;

    return {
      id: reconstructedPattern.id,
      name: reconstructedPattern.name,
      type: this.mapVulnerabilityType(reconstructedPattern.type),
      severity: reconstructedPattern.severity,
      description: reconstructedPattern.description,
      patterns: {
        regex: regexPatterns,
        // Add AST rules to patterns object if present (already reconstructed)
        ast: reconstructedPattern.ast_rules ? [JSON.stringify(reconstructedPattern.ast_rules)] : undefined
      },
      languages: reconstructedPattern.languages,
      cweId: reconstructedPattern.cwe_id || reconstructedPattern.cweId || '',
      owaspCategory: reconstructedPattern.owasp_category || reconstructedPattern.owaspCategory || '',
      remediation: reconstructedPattern.recommendation,
      examples: {
        vulnerable: reconstructedPattern.test_cases?.vulnerable?.[0] || reconstructedPattern.testCases?.vulnerable?.[0] || '',
        secure: reconstructedPattern.test_cases?.safe?.[0] || reconstructedPattern.testCases?.safe?.[0] || ''
      },
      // AST Enhancement fields (already reconstructed, may contain RegExp)
      astRules: reconstructedPattern.ast_rules,
      contextRules,
      confidenceRules: reconstructedPattern.confidence_rules,
      minConfidence: reconstructedPattern.min_confidence
    };
  }

  /**
   * Map API vulnerability types to RSOLV-action VulnerabilityType enum
   */
  private mapVulnerabilityType(type: string): VulnerabilityType {
    const typeMap: Record<string, VulnerabilityType> = {
      'sql_injection': VulnerabilityType.SQL_INJECTION,
      'xss': VulnerabilityType.XSS,
      'command_injection': VulnerabilityType.COMMAND_INJECTION,
      'path_traversal': VulnerabilityType.PATH_TRAVERSAL,
      'xxe': VulnerabilityType.XML_EXTERNAL_ENTITIES,
      'ssrf': VulnerabilityType.SSRF,
      'insecure_deserialization': VulnerabilityType.INSECURE_DESERIALIZATION,
      'deserialization': VulnerabilityType.INSECURE_DESERIALIZATION,
      'weak_crypto': VulnerabilityType.WEAK_CRYPTOGRAPHY,
      'hardcoded_secret': VulnerabilityType.HARDCODED_SECRETS,
      'insecure_random': VulnerabilityType.WEAK_CRYPTOGRAPHY,
      'open_redirect': VulnerabilityType.OPEN_REDIRECT,
      'ldap_injection': VulnerabilityType.LDAP_INJECTION,
      'xpath_injection': VulnerabilityType.XPATH_INJECTION,
      'nosql_injection': VulnerabilityType.NOSQL_INJECTION,
      'rce': VulnerabilityType.COMMAND_INJECTION,
      'dos': VulnerabilityType.DENIAL_OF_SERVICE,
      'denial_of_service': VulnerabilityType.DENIAL_OF_SERVICE,
      'timing_attack': VulnerabilityType.INFORMATION_DISCLOSURE,
      'csrf': VulnerabilityType.CSRF,
      'jwt': VulnerabilityType.BROKEN_AUTHENTICATION,
      'authentication': VulnerabilityType.BROKEN_AUTHENTICATION,
      'debug': VulnerabilityType.INFORMATION_DISCLOSURE,
      'information_disclosure': VulnerabilityType.INFORMATION_DISCLOSURE,
      'cve': VulnerabilityType.VULNERABLE_COMPONENTS,
      'file_upload': VulnerabilityType.PATH_TRAVERSAL,
      'input_validation': VulnerabilityType.XSS,
      'session_management': VulnerabilityType.CSRF,
      'resource_exhaustion': VulnerabilityType.DENIAL_OF_SERVICE,
    };
    
    return typeMap[type] || VulnerabilityType.IMPROPER_INPUT_VALIDATION;
  }

  /**
   * Clear the pattern cache
   * Useful when patterns might have been updated on the server
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('Pattern cache cleared');
  }

  /**
   * RFC-032 Phase 2.2: Convert Elixir regex flags array to JavaScript flags string
   */
  private convertRegexFlags(flags: string[]): string {
    const flagMap: Record<string, string> = {
      'i': 'i',  // case insensitive
      'm': 'm',  // multiline
      's': 's',  // dotAll (. matches newlines)
      'u': 'u',  // unicode
      'g': 'g',  // global
      'y': 'y',  // sticky
      'd': 'd',  // hasIndices
    };

    return flags
      .map(flag => flagMap[flag] || '')
      .filter(Boolean)
      .join('');
  }

  /**
   * RFC-032 Phase 2.2: Reconstruct a regex from serialized format
   */
  private reconstructRegex(serialized: SerializedRegex): RegExp {
    const flags = this.convertRegexFlags(serialized.flags);
    return new RegExp(serialized.source, flags);
  }

  /**
   * RFC-032 Phase 2.2: Recursively reconstruct patterns in any data structure
   */
  private reconstructPattern(data: any): any {
    // Handle null/undefined
    if (data === null || data === undefined) {
      return data;
    }

    // Check if it's a serialized regex
    if (isSerializedRegex(data)) {
      return this.reconstructRegex(data);
    }

    // Handle arrays
    if (Array.isArray(data)) {
      return data.map(item => this.reconstructPattern(item));
    }

    // Handle objects
    if (typeof data === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(data)) {
        result[key] = this.reconstructPattern(value);
      }
      return result;
    }

    // Return primitives as-is
    return data;
  }

  /**
   * Check the health of the Pattern API
   * @returns Health status object
   */
  async checkHealth(): Promise<{ status: string; message?: string }> {
    try {
      const response = await fetch(`${this.apiUrl}/health`, {
        method: 'GET',
        headers: {
          'User-Agent': 'RSOLV-Action/1.0'
        }
      });

      if (response.ok) {
        return { status: 'healthy' };
      } else {
        return { 
          status: 'unhealthy', 
          message: `API returned status ${response.status}` 
        };
      }
    } catch (error) {
      return { 
        status: 'unhealthy', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}