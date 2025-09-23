import { Vulnerability, VulnerabilityType, SecurityScanResult } from './types.js';
import { createPatternSource } from './pattern-source.js';
import type { PatternSource } from './pattern-source.js';
import { logger } from '../utils/logger.js';
import { ElixirASTAnalyzer } from './analyzers/elixir-ast-analyzer.js';
import { ASTPatternInterpreter } from './ast-pattern-interpreter.js';

export interface DetectorConfig {
  patternSource?: PatternSource;
  useServerAST?: boolean;
  apiKey?: string;
  apiUrl?: string;
}

/**
 * Enhanced SecurityDetector V3 that uses server-side AST for multi-language support
 * Implements RFC-031 server-side AST analysis
 */
export class SecurityDetectorV3 {
  private patternSource: PatternSource;
  private cachedPatterns: Map<string, any[]> = new Map();
  private useServerAST: boolean;
  private astAnalyzer?: ElixirASTAnalyzer;
  private astInterpreter?: ASTPatternInterpreter;

  constructor(config: DetectorConfig = {}) {
    this.patternSource = config.patternSource || createPatternSource();
    
    // Determine if we should use server-side AST
    const apiKey = config.apiKey || process.env.RSOLV_API_KEY;
    const apiUrl = config.apiUrl || process.env.RSOLV_API_URL || 'https://api.rsolv.dev';
    
    this.useServerAST = config.useServerAST !== false && !!apiKey;
    
    if (this.useServerAST && apiKey) {
      logger.info('SecurityDetectorV3: Using server-side AST analysis');
      this.astAnalyzer = new ElixirASTAnalyzer({ apiUrl, apiKey });
    } else {
      logger.info('SecurityDetectorV3: Using client-side AST analysis (JS/TS only)');
      this.astInterpreter = new ASTPatternInterpreter();
    }
  }

  /**
   * Get supported languages based on AST analyzer
   */
  getSupportedLanguages(): string[] {
    if (this.useServerAST) {
      // Server supports many languages
      return ['javascript', 'typescript', 'python', 'ruby', 'php', 'java', 'go', 'elixir'];
    } else {
      // Client-side only supports JS/TS
      return ['javascript', 'typescript'];
    }
  }

  async detect(code: string, language: string, filePath: string = 'unknown'): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];
    const lines = code.split('\n');
    const seen = new Set<string>(); // Track line + type combinations

    try {
      // Check if language is supported
      const supportedLanguages = this.getSupportedLanguages();
      if (!supportedLanguages.includes(language.toLowerCase())) {
        logger.warn(`SecurityDetectorV3: Language '${language}' not supported. Supported: ${supportedLanguages.join(', ')}`);
        return [];
      }

      // Get patterns from source (API or local)
      const patterns = await this.patternSource.getPatternsByLanguage(language);
      logger.info(`SecurityDetectorV3: Analyzing ${language} code with ${patterns.length} patterns`);

      if (this.useServerAST && this.astAnalyzer) {
        // Use server-side AST analysis for all languages
        logger.info(`SecurityDetectorV3: Sending ${language} code to server for AST analysis`);
        
        const result = await this.astAnalyzer.analyzeFile(filePath, code);
        
        // Convert server results to vulnerabilities
        // Server returns 'findings' field per RFC-031
        const findings = result.findings || [];
        if (findings.length > 0) {
          for (const finding of findings) {
            // Handle both old format (with nested pattern) and new format (direct properties)
            const pattern = finding.pattern || finding;
            const location = (finding as any).location || (pattern as any).location;
            
            // Handle different location formats
            let line: number;
            if (location?.start?.line) {
              line = location.start.line;
            } else if ((location as any)?.startLine) {
              line = (location as any).startLine;
            } else if (typeof location === 'object' && location !== null) {
              // Try to extract line from various formats
              line = (location as any).line || (location as any).start_line || 0;
            } else {
              logger.warn('SecurityDetectorV3: Skipping finding without valid location', finding);
              continue;
            }
            
            const key = `${line}:${pattern.type || (pattern as any).patternId}`;
            if (!seen.has(key)) {
              seen.add(key);
              
              vulnerabilities.push({
                type: (pattern.type || (pattern as any).patternId) as VulnerabilityType,
                severity: (pattern.severity || 'medium') as 'low' | 'medium' | 'high' | 'critical',
                line: line,
                message: pattern.message || (pattern as any).patternName || pattern.name || '',
                description: pattern.description || pattern.recommendation || pattern.message || '',
                confidence: finding.confidence || 80,
                cweId: (finding.pattern as any).cweId || (finding.pattern as any).cwe,
                owaspCategory: (finding.pattern as any).owaspCategory || (finding.pattern as any).owasp,
                remediation: (finding.pattern as any).remediation || (finding.pattern as any).recommendation || ''
              });
            }
          }
        }
      } else if (this.astInterpreter) {
        // Use client-side AST only for JS/TS
        if (language === 'javascript' || language === 'typescript') {
          // Separate patterns into AST-enhanced and regex-only
          const astPatterns = patterns.filter(p => p.astRules);
          const regexPatterns = patterns.filter(p => !p.astRules);

          // Use AST interpreter for patterns with AST rules
          if (astPatterns.length > 0) {
            const astFindings = await this.astInterpreter.scanFile(filePath, code, astPatterns);
            
            for (const finding of astFindings) {
              const key = `${finding.line}:${finding.pattern.type}`;
              if (!seen.has(key)) {
                seen.add(key);
                
                // Convert confidence from 0-1 to 0-100 scale for AST findings
                const confidenceNumber = finding.confidence <= 1 
                  ? Math.round(finding.confidence * 100)
                  : Math.round(finding.confidence);
                
                vulnerabilities.push({
                  type: finding.pattern.type,
                  severity: finding.pattern.severity,
                  line: finding.line,
                  message: `${finding.pattern.name}: ${finding.pattern.description}`,
                  description: finding.pattern.description,
                  confidence: confidenceNumber,
                  cweId: finding.pattern.cweId,
                  owaspCategory: finding.pattern.owaspCategory,
                  remediation: finding.pattern.remediation
                });
              }
            }
          }

          // Also run regex patterns
          vulnerabilities.push(...await this.detectWithRegex(code, regexPatterns, lines, seen));
        } else {
          logger.error(`SecurityDetectorV3: Cannot analyze ${language} without server-side AST`);
        }
      }

      return vulnerabilities;
    } catch (error) {
      logger.error(`SecurityDetectorV3: Error during detection`, error);
      return vulnerabilities;
    }
  }

  private async detectWithRegex(
    code: string, 
    patterns: any[], 
    lines: string[], 
    seen: Set<string>
  ): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];
    
    // Implementation would be similar to detector-v2's regex detection
    // For brevity, returning empty array
    return vulnerabilities;
  }

  /**
   * Batch analyze multiple files using server-side AST
   */
  async analyzeFiles(files: Array<{ path: string; content: string }>): Promise<Map<string, Vulnerability[]>> {
    const results = new Map<string, Vulnerability[]>();
    
    if (!this.useServerAST || !this.astAnalyzer) {
      logger.warn('SecurityDetectorV3: Batch analysis requires server-side AST');
      return results;
    }

    // Server can handle batch analysis efficiently
    const analysisResult = await this.astAnalyzer.analyze(files);
    
    // Convert results to vulnerability format
    for (const [filePath, fileResult] of Object.entries(analysisResult.results || {})) {
      const vulnerabilities: Vulnerability[] = [];
      
      if ((fileResult as any).findings) {
        for (const finding of (fileResult as any).findings) {
          vulnerabilities.push({
            type: finding.pattern_type as VulnerabilityType,
            severity: finding.severity,
            line: finding.line,
            message: finding.message,
            description: finding.description || finding.message,
            confidence: finding.confidence,
            cweId: finding.cwe_id,
            owaspCategory: finding.owasp_category,
            remediation: finding.remediation
          });
        }
      }
      
      results.set(filePath, vulnerabilities);
    }
    
    return results;
  }
}

// Export a singleton instance for backward compatibility
export const securityDetectorV3 = new SecurityDetectorV3();