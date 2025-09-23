import { Vulnerability, VulnerabilityType, SecurityScanResult } from './types.js';
import { createPatternSource } from './pattern-source.js';
import type { PatternSource } from './pattern-source.js';
import { logger } from '../utils/logger.js';
import { ASTPatternInterpreter } from './ast-pattern-interpreter.js';

/**
 * Enhanced SecurityDetector that uses PatternSource for dynamic pattern loading
 * Implements RFC-008 pattern serving architecture
 */
export class SecurityDetectorV2 {
  private patternSource: PatternSource;
  private cachedPatterns: Map<string, any[]> = new Map();
  private astInterpreter: ASTPatternInterpreter;

  constructor(patternSource?: PatternSource) {
    this.patternSource = patternSource || createPatternSource();
    this.astInterpreter = new ASTPatternInterpreter();
  }

  async detect(code: string, language: string, filePath: string = 'unknown'): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];
    const lines = code.split('\n');
    const seen = new Set<string>(); // Track line + type combinations

    try {
      // Get patterns from source (API or local)
      const patterns = await this.patternSource.getPatternsByLanguage(language);
      logger.info(`SecurityDetectorV2: Analyzing ${language} code with ${patterns.length} patterns`);

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

      // Use regex detection for patterns without AST rules
      for (const pattern of regexPatterns) {
        if (pattern.patterns.regex) {
          for (const regex of pattern.patterns.regex) {
            let match;
            regex.lastIndex = 0; // Reset regex state
            
            while ((match = regex.exec(code)) !== null) {
              const lineNumber = this.getLineNumber(code, match.index);
              const line = lines[lineNumber - 1]?.trim() || '';
              
              // Debug logging for Ruby SQL injection
              if (pattern.id === 'ruby-sql-injection' && language === 'ruby') {
                logger.info(`Ruby SQL match found at line ${lineNumber}: "${line}"`);
              }
              
              // Skip if this looks like a safe usage
              if (this.isSafeUsage(line, pattern.type)) {
                if (pattern.id === 'ruby-sql-injection' && language === 'ruby') {
                  logger.info(`  Skipped as safe usage`);
                }
                continue;
              }

              // Deduplicate by line + type
              const key = `${lineNumber}:${pattern.type}`;
              if (seen.has(key)) {
                continue;
              }
              seen.add(key);

              const vuln = {
                type: pattern.type,
                severity: pattern.severity,
                line: lineNumber,
                message: `${pattern.name}: ${pattern.description}`,
                description: pattern.description,
                confidence: this.getConfidence(line, pattern.type),
                cweId: pattern.cweId,
                owaspCategory: pattern.owaspCategory,
                remediation: pattern.remediation
              };
              
              if (pattern.id === 'ruby-sql-injection' && language === 'ruby') {
                logger.info(`  Adding vulnerability:`, vuln);
              }
              
              vulnerabilities.push(vuln);

              // Exit after first match for non-global regex
              if (!regex.global) {
                break;
              }
            }
          }
        }
      }
    } catch (error) {
      logger.error('Error detecting vulnerabilities:', error);
      // In case of error, return empty array rather than throwing
      // This allows the analysis to continue with other checks
    }

    return vulnerabilities;
  }

  /**
   * Alternative method that accepts an object with content, filePath, and language
   * This is for compatibility with tests and other consumers
   */
  async detectIssues(params: { content: string; filePath: string; language: string }): Promise<any[]> {
    const vulnerabilities = await this.detect(params.content, params.language, params.filePath);
    
    // Transform vulnerabilities to match expected format
    return vulnerabilities.map(vuln => ({
      patternId: vuln.cweId || `${vuln.type}-001`,
      severity: vuln.severity,
      line: vuln.line,
      column: 1, // We don't track column, so default to 1
      message: vuln.message,
      description: vuln.description,
      file: params.filePath,
      type: vuln.type,
      remediation: vuln.remediation,
      confidence: vuln.confidence
    }));
  }

  async scanDirectory(directory: string): Promise<SecurityScanResult> {
    logger.info(`SecurityDetectorV2: Starting directory scan of ${directory}`);
    const results: SecurityScanResult = {
      vulnerabilities: [],
      summary: {
        total: 0,
        byType: {} as Record<VulnerabilityType, number>,
        bySeverity: {}
      },
      metadata: {
        language: 'unknown',
        linesScanned: 0,
        scanDuration: 0,
        timestamp: new Date().toISOString()
      }
    };

    // TODO: Implement directory scanning logic
    // This would use file system APIs to scan the directory
    // and call detect() on each file

    return results;
  }

  private getLineNumber(code: string, index: number): number {
    return code.substring(0, index).split('\n').length;
  }

  private isSafeUsage(line: string, type: VulnerabilityType): boolean {
    // For Ruby code, check if line contains Ruby hash syntax which is NOT safe
    // Ruby uses :symbol syntax which can look like SQL named parameters
    if (line.includes('#{') && line.includes('}')) {
      // Ruby string interpolation is definitely not safe
      return false;
    }
    
    // Check for Ruby hash access patterns like params[:id] or params[:user][:id]
    if (/params\s*\[\s*:/.test(line)) {
      // This is Ruby hash access, not a SQL named parameter
      return false;
    }
    
    // Common safe patterns to reduce false positives
    const safePatterns: Record<string, RegExp[]> = {
      [VulnerabilityType.SQL_INJECTION]: [
        /\?/,          // Parameterized query with ? placeholders
        /\$\d+/,       // Positional parameters like $1, $2
        /:\w+(?!\s*\])/, // Named parameters like :id but NOT Ruby symbols like :id]
        /prepare\s*\(/i,
        /setParameter/i,
        /bindParam/i
      ],
      [VulnerabilityType.XSS]: [
        /escape/i,
        /sanitize/i,
        /encode/i,
        /textContent/,
        /innerText/,
        /createTextNode/
      ],
      [VulnerabilityType.COMMAND_INJECTION]: [
        /escapeshellarg/i,
        /escapeshellcmd/i,
        /quote/i
      ]
    };

    const patterns = safePatterns[type] || [];
    return patterns.some(pattern => pattern.test(line));
  }

  private getConfidence(line: string, type: VulnerabilityType): number {
    // Patterns that indicate definite vulnerabilities
    const highConfidencePatterns: Record<string, RegExp[]> = {
      [VulnerabilityType.SQL_INJECTION]: [
        /\+\s*req\./,
        /\+\s*request\./,
        /\$\{.*req\./,
        /`.*\$\{.*req\./
      ],
      [VulnerabilityType.XSS]: [
        /innerHTML\s*=\s*[^'"]*req\./,
        /document\.write\s*\([^)]*req\./,
        /\$\([^)]+\)\.html\s*\([^)]*req\./
      ]
    };

    const patterns = highConfidencePatterns[type] || [];
    if (patterns.some(pattern => pattern.test(line))) {
      return 90; // high confidence
    }

    // Check for common safe patterns
    if (this.isSafeUsage(line, type)) {
      return 30; // low confidence
    }

    return 60; // medium confidence
  }
}

// Export a default instance for backward compatibility
export const securityDetector = new SecurityDetectorV2();