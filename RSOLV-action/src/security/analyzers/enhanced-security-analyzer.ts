/**
 * Enhanced Security Analyzer with AST + Regex Fallback
 * 
 * This analyzer combines the ElixirASTAnalyzer with regex-based fallback
 * to ensure vulnerabilities are detected even when AST parsing fails.
 */

import { logger } from '../../utils/logger.js';
import { ElixirASTAnalyzer, ElixirASTConfig } from './elixir-ast-analyzer.js';
import { SecurityDetectorV2 } from '../detector-v2.js';
import { createPatternSource } from '../pattern-source.js';
import { FileSelector } from './file-selector.js';
import { FileSelectionOptions, ASTAnalysisResponse, FileAnalysisResult } from './types.js';
import { Vulnerability } from '../types.js';

export interface EnhancedAnalyzerConfig extends ElixirASTConfig {
  // Whether to use AST service (can be disabled for testing)
  useAST?: boolean;
  
  // File selection options
  fileSelection?: Partial<FileSelectionOptions>;
  
  // Confidence penalty for regex-only detection
  regexConfidencePenalty?: number;
}

export interface AnalysisResult {
  // Combined vulnerabilities from AST and regex
  vulnerabilities: Vulnerability[];
  
  // Analysis metadata
  metadata: {
    filesAnalyzed: number;
    astSuccessful: number;
    astFailed: number;
    regexFallbacks: number;
    totalFindings: number;
    performance: {
      astTimeMs?: number;
      regexTimeMs?: number;
      totalTimeMs: number;
    };
  };
  
  // Original AST response if available
  astResponse?: ASTAnalysisResponse;
}

export class EnhancedSecurityAnalyzer {
  private astAnalyzer: ElixirASTAnalyzer;
  private regexDetector: SecurityDetectorV2;
  private config: EnhancedAnalyzerConfig;

  constructor(config: EnhancedAnalyzerConfig) {
    this.config = {
      useAST: true,
      regexConfidencePenalty: 0.3,
      ...config
    };
    
    this.astAnalyzer = new ElixirASTAnalyzer(config);
    const patternSource = createPatternSource();
    this.regexDetector = new SecurityDetectorV2(patternSource);
  }

  /**
   * Analyze files with AST + fallback strategy
   */
  async analyze(files: Map<string, string>, changedFiles?: string[]): Promise<AnalysisResult> {
    const startTime = Date.now();
    
    // Select files for analysis
    const selectedFiles = this.selectFiles(files, changedFiles);
    
    logger.info(`Analyzing ${selectedFiles.length} files with enhanced analyzer`);
    
    // Initialize result
    const result: AnalysisResult = {
      vulnerabilities: [],
      metadata: {
        filesAnalyzed: selectedFiles.length,
        astSuccessful: 0,
        astFailed: 0,
        regexFallbacks: 0,
        totalFindings: 0,
        performance: {
          totalTimeMs: 0
        }
      }
    };

    // Try AST analysis if enabled and service is healthy
    if (this.config.useAST) {
      const astResult = await this.tryASTAnalysis(selectedFiles, result);
      if (astResult) {
        result.astResponse = astResult;
      }
    }

    // Process files with regex fallback
    for (const file of selectedFiles) {
      await this.analyzeFileWithFallback(file, result);
    }

    // Calculate total time
    result.metadata.performance.totalTimeMs = Date.now() - startTime;
    result.metadata.totalFindings = result.vulnerabilities.length;

    return result;
  }

  /**
   * Check if AST service is available
   */
  async isASTAvailable(): Promise<boolean> {
    if (!this.config.useAST) return false;
    
    try {
      return await this.astAnalyzer.healthCheck();
    } catch (error) {
      logger.warn('AST service health check failed:', error);
      return false;
    }
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    await this.astAnalyzer.cleanup();
  }

  // Private methods

  private selectFiles(files: Map<string, string>, changedFiles?: string[]): Array<{
    path: string;
    content: string;
    language: string;
  }> {
    const options: FileSelectionOptions = {
      maxFiles: 10,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      prioritizeChanges: true,
      ...this.config.fileSelection
    };

    return FileSelector.selectFiles(files, options, changedFiles);
  }

  private async tryASTAnalysis(
    files: Array<{ path: string; content: string }>,
    result: AnalysisResult
  ): Promise<ASTAnalysisResponse | null> {
    const astStartTime = Date.now();

    try {
      const astResponse = await this.astAnalyzer.analyze(files);
      result.metadata.performance.astTimeMs = Date.now() - astStartTime;

      // Extract vulnerabilities from AST results
      const astVulns = this.astAnalyzer.extractVulnerabilities(astResponse);
      
      // Convert to our Vulnerability format and add to results
      for (const vuln of astVulns) {
        result.vulnerabilities.push({
          type: vuln.type as any,
          severity: vuln.severity as any,
          message: vuln.message,
          file: vuln.file,
          line: vuln.line,
          column: vuln.column,
          confidence: Math.round(vuln.confidence * 100 || 90), // AST confidence is 0-1, convert to 0-100
          remediation: vuln.pattern.recommendation,
          cwe: vuln.pattern.cwe,
          owasp: vuln.pattern.owasp,
          source: 'ast' // Mark as AST-detected
        } as any);
      }

      // Count successful/failed AST analyses
      for (const fileResult of astResponse.results) {
        if (fileResult.status === 'success') {
          result.metadata.astSuccessful++;
        } else {
          result.metadata.astFailed++;
        }
      }

      return astResponse;
    } catch (error) {
      logger.error('AST analysis failed:', error);
      result.metadata.astFailed = files.length;
      return null;
    }
  }

  private async analyzeFileWithFallback(
    file: { path: string; content: string; language: string },
    result: AnalysisResult
  ): Promise<void> {
    // Check if AST already handled this file successfully
    const astHandled = result.astResponse?.results.some(
      r => r.file === file.path && r.status === 'success'
    );

    if (astHandled) {
      // AST succeeded, no need for regex fallback
      return;
    }

    // Use regex detection as fallback
    logger.debug(`Using regex fallback for ${file.path}`);
    result.metadata.regexFallbacks++;

    const regexStartTime = Date.now();
    
    try {
      const regexVulns = await this.regexDetector.detect(file.content, file.language);
      
      if (!result.metadata.performance.regexTimeMs) {
        result.metadata.performance.regexTimeMs = 0;
      }
      result.metadata.performance.regexTimeMs += Date.now() - regexStartTime;

      // Add regex-detected vulnerabilities with confidence penalty
      for (const vuln of regexVulns) {
        // Check if this vulnerability was already found by AST
        const isDuplicate = result.vulnerabilities.some(
          v => v.filePath === file.path && 
               v.type === vuln.type &&
               Math.abs(v.line - vuln.line) < 3 // Within 3 lines
        );

        if (!isDuplicate) {
          // Apply penalty (regexConfidencePenalty is in 0-1 scale, convert to 0-100)
          const penaltyInPercent = this.config.regexConfidencePenalty! * 100;
          const penalizedConfidence = Math.max(10, vuln.confidence - penaltyInPercent);
          
          result.vulnerabilities.push({
            ...vuln,
            file: file.path,
            confidence: Math.round(penalizedConfidence),
            source: 'regex' // Mark as regex-detected
          } as any);
        }
      }
    } catch (error) {
      logger.error(`Regex detection failed for ${file.path}:`, error);
    }
  }

  /**
   * Get a summary of detection methods used
   */
  getDetectionSummary(result: AnalysisResult): {
    astOnly: number;
    regexOnly: number;
    both: number;
  } {
    const astVulns = result.vulnerabilities.filter((v: any) => v.source === 'ast');
    const regexVulns = result.vulnerabilities.filter((v: any) => v.source === 'regex');
    
    // Count unique vulnerabilities by file + type + line
    const astSet = new Set(astVulns.map((v: any) => `${v.file}:${v.type}:${v.line}`));
    const regexSet = new Set(regexVulns.map((v: any) => `${v.file}:${v.type}:${v.line}`));
    
    const both = [...astSet].filter(k => regexSet.has(k)).length;
    const astOnly = astSet.size - both;
    const regexOnly = regexSet.size - both;

    return { astOnly, regexOnly, both };
  }
}