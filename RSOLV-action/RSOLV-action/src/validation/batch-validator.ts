import { createHash } from 'crypto';
import { logger } from '../utils/logger.js';

export interface BatchValidationRequest {
  repository: string;
  vulnerabilities: Array<{
    id: string;
    type: string;
    filePath: string;
    line: number;
    code: string;
  }>;
  files: Record<string, {
    content: string;
    hash: string;
  }>;
}

export interface BatchValidationResponse {
  validated: Array<{
    id: string;
    type: string;
    filePath: string;
    line: number;
    isVulnerable: boolean;
    falsePositive: boolean;
    reason?: string;
  }>;
  stats: {
    total: number;
    truePositives: number;
    falsePositives: number;
    cacheHits?: number;
    cacheMisses?: number;
  };
  cache_stats?: {
    hits: number;
    misses: number;
    invalidated: number;
  };
}

/**
 * Batch validator for AST-based vulnerability validation
 * Sends all vulnerabilities in a single request to the API
 */
export class BatchValidator {
  private apiKey: string;
  private apiUrl: string;
  
  constructor(apiKey: string, apiUrl: string = 'https://api.rsolv.dev') {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl;
  }
  
  /**
   * Validate a batch of vulnerabilities with the AST validation API
   */
  async validateBatch(
    repository: string,
    vulnerabilities: Array<{
      file: string;
      line: number;
      endLine: number;
      code: string;
      type: string;
    }>,
    files: Record<string, string>
  ): Promise<BatchValidationResponse | null> {
    try {
      // Transform vulnerabilities to API format
      const apiVulnerabilities = vulnerabilities.map((vuln, index) => ({
        id: `vuln-${index + 1}`,
        type: this.normalizeVulnerabilityType(vuln.type),
        filePath: vuln.file,
        line: vuln.line,
        code: vuln.code
      }));
      
      // Transform files to API format with hashes
      const apiFiles: Record<string, { content: string; hash: string }> = {};
      for (const [path, content] of Object.entries(files)) {
        apiFiles[path] = {
          content,
          hash: `sha256:${createHash('sha256').update(content).digest('hex')}`
        };
      }
      
      // Build request payload
      const payload: BatchValidationRequest = {
        repository,
        vulnerabilities: apiVulnerabilities,
        files: apiFiles
      };
      
      logger.info(`[VALIDATE] Sending batch validation request for ${vulnerabilities.length} vulnerabilities`);
      
      // Send request to API
      const response = await fetch(`${this.apiUrl}/api/v1/ast/validate`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        logger.warn(`[VALIDATE] Batch validation failed: ${response.statusText}`);
        return null;
      }
      
      const result = await response.json() as BatchValidationResponse;
      
      logger.info(`[VALIDATE] Batch validation complete: ${result.stats.truePositives} true positives, ${result.stats.falsePositives} false positives`);
      
      return result;
    } catch (error) {
      logger.error('[VALIDATE] Batch validation error:', error);
      return null;
    }
  }
  
  /**
   * Normalize vulnerability type to match API expectations
   */
  private normalizeVulnerabilityType(type: string): string {
    const typeMap: Record<string, string> = {
      'sql-injection': 'SqlInjection',
      'xss': 'Xss',
      'command-injection': 'CommandInjection',
      'path-traversal': 'PathTraversal',
      'nosql-injection': 'NoSqlInjection',
      'xxe': 'Xxe',
      'ssrf': 'Ssrf',
      'ssjs-injection': 'SsjsInjection',
      'javascript-injection': 'SsjsInjection',
      'eval': 'SsjsInjection',
      'generic': 'Generic'
    };
    
    return typeMap[type.toLowerCase()] || 'Generic';
  }
}