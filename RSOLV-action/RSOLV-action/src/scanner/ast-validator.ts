import { RsolvApiClient } from '../external/api-client.js';
import { logger } from '../utils/logger.js';
import type { Vulnerability } from '../security/types.js';
import * as crypto from 'crypto';

/**
 * Result from AST validation for a single vulnerability
 * @example
 * ```typescript
 * const result: ValidationResult = {
 *   vulnerability: originalVuln,
 *   isValid: true,
 *   confidence: 0.95,
 *   reason: undefined
 * };
 * ```
 */
export interface ValidationResult {
  vulnerability: Vulnerability;
  isValid: boolean;
  confidence: number;
  reason?: string;
}

interface ValidationResponse {
  validated: Array<{
    id: string;
    isValid: boolean;
    confidence: number;
    reason?: string;
    astContext?: {
      inUserInputFlow: boolean;
      hasValidation: boolean;
    };
  }>;
  stats: {
    total: number;
    validated: number;
    rejected: number;
  };
}

/**
 * ASTValidator service for server-side vulnerability validation
 * 
 * This service sends detected vulnerabilities to RSOLV-api for
 * AST-based validation to reduce false positives.
 * 
 * @example
 * ```typescript
 * const validator = new ASTValidator(apiKey);
 * const validated = await validator.validateVulnerabilities(
 *   vulnerabilities,
 *   fileContents
 * );
 * console.log(`Filtered ${vulnerabilities.length - validated.length} false positives`);
 * ```
 */
export class ASTValidator {
  private apiClient: RsolvApiClient;
  private cache: Map<string, ValidationResult> = new Map();
  
  constructor(apiKey: string) {
    this.apiClient = new RsolvApiClient({
      apiKey,
      baseUrl: process.env.RSOLV_API_URL || 'https://api.rsolv.dev'
    });
  }
  
  /**
   * Validate vulnerabilities using server-side AST analysis
   * 
   * @param vulnerabilities - Array of detected vulnerabilities
   * @param fileContents - Map of file paths to their contents
   * @returns Array of validated vulnerabilities (false positives removed)
   * 
   * @example
   * ```typescript
   * const fileContents = new Map([
   *   ['app.js', 'eval(userInput); // dangerous!']
   * ]);
   * const validated = await validator.validateVulnerabilities(vulns, fileContents);
   * // Returns only real vulnerabilities, filtering out false positives
   * ```
   */
  async validateVulnerabilities(
    vulnerabilities: Vulnerability[],
    fileContents: Map<string, string>
  ): Promise<Vulnerability[]> {
    if (vulnerabilities.length === 0) {
      return [];
    }

    logger.info(`Validating ${vulnerabilities.length} vulnerabilities with AST analysis`);
    
    try {
      // Prepare request data
      const request = this.prepareValidationRequest(vulnerabilities, fileContents);
      
      // Add the validateVulnerabilities method to the API client
      const response = await this.callValidationAPI(request);
      
      // Process response and filter vulnerabilities
      return this.processValidationResponse(vulnerabilities, response);
    } catch (error) {
      logger.warn(`AST validation failed, using all vulnerabilities`, {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
      // Fail open - return all vulnerabilities if validation fails
      return vulnerabilities;
    }
  }
  
  private prepareValidationRequest(
    vulnerabilities: Vulnerability[],
    fileContents: Map<string, string>
  ) {
    // Convert vulnerabilities to API format
    const vulnsForApi = vulnerabilities.map(v => ({
      id: `${v.type}-${v.line}-${v.column || 0}`, // Generate ID from available fields
      type: v.type, // Include type field for API
      patternId: v.type, // Use type as pattern ID
      filePath: v.filePath || '',
      line: v.line,
      code: v.snippet || '', // Use snippet as code
      severity: v.severity
    }));
    
    // Build files object from map with proper structure
    const files: Record<string, { content: string }> = {};
    for (const [path, content] of fileContents) {
      files[path] = { content };
    }

    return {
      vulnerabilities: vulnsForApi,
      files
    };
  }
  
  private async callValidationAPI(request: any): Promise<ValidationResponse> {
    const response = await this.apiClient.validateVulnerabilities(request);
    if (process.env.DEBUG_AST_VALIDATION) {
      console.log('AST Validation Request:', JSON.stringify(request, null, 2));
      console.log('AST Validation Response:', JSON.stringify(response, null, 2));
    }
    return response;
  }
  
  private processValidationResponse(
    vulnerabilities: Vulnerability[],
    response: ValidationResponse
  ): Vulnerability[] {
    // Create a map for quick lookup
    const validationMap = new Map(
      response.validated.map(v => [v.id, v])
    );
    
    // Filter vulnerabilities based on validation results
    const validated = vulnerabilities.filter(vuln => {
      const vulnId = `${vuln.type}-${vuln.line}-${vuln.column || 0}`;
      const validation = validationMap.get(vulnId);
      
      if (!validation) {
        // No validation result, keep the vulnerability
        return true;
      }
      
      if (!validation.isValid) {
        logger.debug(`Filtered false positive: ${vuln.filePath}:${vuln.line} - ${validation.reason}`);
        return false;
      }
      
      return true;
    });
    
    logger.info(`AST validation complete: ${response.stats.rejected} false positives filtered out`);
    return validated;
  }
  
  /**
   * Generate a cache key for a vulnerability
   * Used internally for caching validation results
   */
  private getCacheKey(filePath: string, patternId: string, fileHash: string): string {
    return `${filePath}:${patternId}:${fileHash}`;
  }
}