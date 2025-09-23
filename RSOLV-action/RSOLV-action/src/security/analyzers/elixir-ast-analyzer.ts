/**
 * ElixirASTAnalyzer - RFC-031 Implementation
 * 
 * This analyzer sends code to the Elixir backend AST service for
 * accurate multi-language vulnerability detection using proper AST parsing.
 */

import * as crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { 
  ASTAnalysisRequest, 
  ASTAnalysisResponse,
  AnalysisFile,
  FileAnalysisResult,
  SecurityPattern,
  ASTAnalysisError,
  ErrorCode
} from './types.js';

export interface ElixirASTConfig {
  // API endpoint for the AST service
  apiUrl: string;
  
  // API key for authentication
  apiKey: string;
  
  // Optional session ID for reuse
  sessionId?: string;
  
  // Timeout in milliseconds
  timeout?: number;
  
  // Enable debug logging
  debug?: boolean;
}

export class ElixirASTAnalyzer {
  private config: ElixirASTConfig;
  private sessionId?: string;
  private encryptionKey?: Buffer;

  constructor(config: ElixirASTConfig) {
    this.config = {
      timeout: 30000, // 30 seconds default
      debug: false,
      ...config
    };
    this.sessionId = config.sessionId;
  }

  /**
   * Analyze files using the Elixir AST service
   */
  async analyze(files: Array<{ path: string; content: string }>): Promise<ASTAnalysisResponse> {
    if (files.length === 0) {
      throw new Error('No files provided for analysis');
    }

    if (files.length > 10) {
      throw new Error('Maximum 10 files allowed per analysis request');
    }

    // Prepare encrypted files
    const encryptedFiles = await this.encryptFiles(files);

    // Build request
    const request: ASTAnalysisRequest = {
      requestId: this.generateRequestId(),
      sessionId: this.sessionId,
      files: encryptedFiles,
      options: {
        patternFormat: 'enhanced',
        includeSecurityPatterns: true,
        debug: this.config.debug ? {
          includeRawAst: false,
          includeTiming: true
        } : undefined
      }
    };

    // Send request to AST service
    const response = await this.sendRequest(request);

    // Store session ID for reuse
    if (response.session?.sessionId) {
      this.sessionId = response.session.sessionId;
    }

    return response;
  }

  /**
   * Analyze a single file
   */
  async analyzeFile(path: string, content: string): Promise<FileAnalysisResult> {
    const response = await this.analyze([{ path, content }]);
    
    if (response.results.length === 0) {
      throw new Error('No analysis results returned');
    }

    return response.results[0];
  }

  /**
   * Get detected vulnerabilities from analysis response
   */
  extractVulnerabilities(response: ASTAnalysisResponse): Array<{
    file: string;
    type: string;
    severity: string;
    message: string;
    line: number;
    column: number;
    pattern: SecurityPattern;
    confidence: number;
  }> {
    const vulnerabilities: Array<any> = [];

    for (const result of response.results) {
      // Server returns 'findings' field per RFC-031
      const items = result.findings;
      if (result.status === 'success' && items) {
        for (const item of items) {
          // Handle server response format - pattern can have various shapes
          const pattern = (item as any).pattern || item;
          const location = (item as any).location || (pattern as any).location;
          
          if (!location || !location.start) {
            logger.warn('ElixirAstAnalyzer: Skipping item without location', item);
            continue;
          }
          
          vulnerabilities.push({
            file: result.path || result.file,
            type: pattern.type || (pattern as any).patternId,
            severity: pattern.severity || 'medium',
            message: pattern.message || (pattern as any).patternName || pattern.description,
            line: location.start.line || (location as any).startLine,
            column: location.start.column || (location as any).startColumn || 0,
            pattern: pattern,
            confidence: (item as any).confidence || (pattern as any).confidence || 80
          });
        }
      }
    }

    return vulnerabilities;
  }

  /**
   * Check if the service is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.apiUrl}/health`, {
        headers: {
          'x-api-key': this.config.apiKey
        },
        signal: AbortSignal.timeout(5000)
      });

      return response.ok;
    } catch (error) {
      logger.error('AST service health check failed:', error);
      return false;
    }
  }

  /**
   * Clean up session when done
   */
  async cleanup(): Promise<void> {
    if (this.sessionId) {
      try {
        await fetch(`${this.config.apiUrl}/api/v1/ast/sessions/${this.sessionId}`, {
          method: 'DELETE',
          headers: {
            'x-api-key': this.config.apiKey
          }
        });
      } catch (error) {
        logger.warn('Failed to cleanup AST session:', error);
      }
    }
  }

  // Private methods

  private async encryptFiles(files: Array<{ path: string; content: string }>): Promise<AnalysisFile[]> {
    // Generate session key if not exists
    if (!this.encryptionKey) {
      this.encryptionKey = crypto.randomBytes(32);
    }

    return files.map(file => {
      // Generate IV for this file
      const iv = crypto.randomBytes(16);
      
      // Create cipher
      const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey!, iv);
      
      // Encrypt content
      const encrypted = Buffer.concat([
        cipher.update(file.content, 'utf8'),
        cipher.final()
      ]);
      
      // Get auth tag
      const authTag = cipher.getAuthTag();
      
      // Calculate content hash
      const contentHash = crypto.createHash('sha256').update(file.content).digest('hex');
      
      return {
        path: file.path,
        encryptedContent: encrypted.toString('base64'),
        encryption: {
          iv: iv.toString('base64'),
          algorithm: 'aes-256-gcm' as const,
          authTag: authTag.toString('base64')
        },
        metadata: {
          language: this.detectLanguage(file.path),
          size: Buffer.byteLength(file.content, 'utf8'),
          contentHash
        }
      };
    });
  }

  private detectLanguage(path: string): AnalysisFile['metadata']['language'] | undefined {
    const ext = path.split('.').pop()?.toLowerCase();
    
    switch (ext) {
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'ts': 
    case 'tsx':
      return 'typescript';
    case 'py':
      return 'python';
    case 'rb':
      return 'ruby';
    case 'php':
      return 'php';
    case 'java':
      return 'java';
    case 'ex':
    case 'exs':
      return 'elixir';
    default:
      return undefined;
    }
  }

  private generateRequestId(): string {
    return `ast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async sendRequest(request: ASTAnalysisRequest): Promise<ASTAnalysisResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout!);

    try {
      // Construct the full AST endpoint URL
      const astEndpoint = `${this.config.apiUrl}/api/v1/ast/analyze`;
      const response = await fetch(astEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'X-Encryption-Key': this.encryptionKey!.toString('base64')
        },
        body: JSON.stringify(request),
        signal: controller.signal
      });

      if (!response.ok) {
        const error = await this.parseErrorResponse(response);
        throw error;
      }

      const data = await response.json() as ASTAnalysisResponse;
      
      // Validate response
      if (!data.requestId || data.requestId !== request.requestId) {
        throw new Error('Invalid response: request ID mismatch');
      }

      return data;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new ASTAnalysisError(
          'Request timeout',
          ErrorCode.TIMEOUT,
          { timeout: this.config.timeout }
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async parseErrorResponse(response: Response): Promise<ASTAnalysisError> {
    try {
      const errorData = await response.json();
      // Handle both error.message and direct message
      const message = errorData.error?.message || errorData.message || 'Unknown error';
      const code = errorData.error?.code || errorData.code || ErrorCode.UNKNOWN_ERROR;
      return new ASTAnalysisError(
        message,
        code as ErrorCode,
        errorData.details || errorData.error?.details
      );
    } catch {
      return new ASTAnalysisError(
        `HTTP ${response.status}: ${response.statusText}`,
        ErrorCode.UNKNOWN_ERROR
      );
    }
  }
}

// Re-export the error class for convenience
export { ASTAnalysisError } from './types.js';