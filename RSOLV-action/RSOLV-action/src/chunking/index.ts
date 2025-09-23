/**
 * RFC-046: Multi-file Vulnerability Chunking - Main Export
 */

export { VulnerabilityChunker } from './vulnerability-chunker.js';
export { MultiPRGenerator } from './multi-pr-generator.js';
export { ComplexityAnalyzer, ComplexityRouter, FixComplexity } from './complexity-analyzer.js';
export { HardcodedSecretsHandler } from './handlers/hardcoded-secrets.js';

export * from './types.js';

import { 
  VulnerabilityChunker,
  MultiPRGenerator,
  ComplexityAnalyzer,
  ChunkingConfig,
  MultiFileVulnerability,
  FixComplexity
} from './index.js';

/**
 * Main integration point for chunking functionality
 */
export class ChunkingIntegration {
  private chunker: VulnerabilityChunker;
  private prGenerator: MultiPRGenerator;
  private complexityAnalyzer: ComplexityAnalyzer;
  
  constructor(config?: ChunkingConfig) {
    const defaultConfig: ChunkingConfig = {
      enabled: true,
      maxFilesPerChunk: 3,
      maxLinesPerChunk: 500,
      maxContextTokens: 8000,
      multiPR: {
        enabled: true,
        delayBetweenPRs: 2000
      }
    };
    
    this.chunker = new VulnerabilityChunker(config || defaultConfig);
    this.prGenerator = new MultiPRGenerator();
    this.complexityAnalyzer = new ComplexityAnalyzer();
  }
  
  /**
   * Check if a vulnerability should be chunked
   */
  shouldChunk(vulnerability: any): boolean {
    // Check file count
    const fileCount = vulnerability.files?.length || 
                     vulnerability.filesToModify?.length || 
                     1;
    
    // Chunk if more than 3 files or marked as complex
    return fileCount > 3 || 
           vulnerability.requiresChunking === true ||
           this.isComplexVulnerability(vulnerability);
  }
  
  /**
   * Check if vulnerability is complex
   */
  isComplexVulnerability(vulnerability: any): boolean {
    const complexity = this.complexityAnalyzer.analyze(vulnerability);
    return complexity === FixComplexity.COMPLEX || 
           complexity === FixComplexity.MANUAL;
  }
  
  /**
   * Process a multi-file vulnerability with chunking
   */
  async processWithChunking(vulnerability: any, issueNumber: number): Promise<any> {
    console.log(`[ChunkingIntegration] Processing ${vulnerability.type} with chunking`);
    
    // Convert to our format
    const multiFileVuln: MultiFileVulnerability = this.convertToMultiFile(vulnerability, issueNumber);
    
    // Analyze complexity
    const complexity = this.complexityAnalyzer.analyze(multiFileVuln);
    console.log(`[ChunkingIntegration] Complexity: ${complexity}`);
    
    // If too complex, generate manual guide
    if (complexity === FixComplexity.MANUAL) {
      return {
        success: false,
        requiresManual: true,
        guide: await this.generateManualGuide(multiFileVuln),
        message: 'This vulnerability requires manual intervention'
      };
    }
    
    // Chunk the vulnerability
    const chunks = await this.chunker.chunkVulnerability(multiFileVuln);
    console.log(`[ChunkingIntegration] Created ${chunks.length} chunks`);
    
    // Generate PR series
    const prs = await this.prGenerator.generatePRSeries(chunks, issueNumber);
    console.log(`[ChunkingIntegration] Generated ${prs.length} PRs`);
    
    return {
      success: true,
      chunked: true,
      chunks: chunks.length,
      prs: prs,
      complexity: complexity
    };
  }
  
  /**
   * Convert vulnerability to multi-file format
   */
  private convertToMultiFile(vulnerability: any, issueNumber: number): MultiFileVulnerability {
    const files = vulnerability.files || 
                 vulnerability.filesToModify?.map((path: string) => ({
                   path,
                   lines: [],
                   severity: vulnerability.severity || 'MEDIUM'
                 })) || 
                 [];
    
    return {
      type: vulnerability.type || 'UNKNOWN',
      issueNumber,
      files,
      requiresConfigChange: vulnerability.requiresConfigChange,
      requiresNewDependencies: vulnerability.requiresNewDependencies
    };
  }
  
  /**
   * Generate manual intervention guide
   */
  private async generateManualGuide(vulnerability: MultiFileVulnerability): Promise<string> {
    const lines: string[] = [];
    
    lines.push('## Manual Intervention Required');
    lines.push('');
    lines.push(`This ${vulnerability.type} vulnerability is too complex for automated fixing.`);
    lines.push('');
    lines.push('### Affected Files');
    for (const file of vulnerability.files) {
      lines.push(`- ${file.path}`);
    }
    lines.push('');
    lines.push('### Recommended Steps');
    lines.push('1. Review all affected files for the vulnerability pattern');
    lines.push('2. Identify the root cause of the vulnerability');
    lines.push('3. Plan a comprehensive fix that addresses all instances');
    lines.push('4. Test thoroughly to ensure no functionality is broken');
    lines.push('5. Verify the vulnerability is fully resolved');
    
    return lines.join('\n');
  }
}