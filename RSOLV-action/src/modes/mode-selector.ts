/**
 * Mode Selection Infrastructure
 * RFC-041: Three-Phase Architecture
 */

import { logger } from '../utils/logger.js';
import { ModeConfig, OperationMode } from './types.js';

export class ModeSelector {
  /**
   * Parse mode configuration from environment and arguments
   */
  static getModeConfig(): ModeConfig {
    // Get mode from environment (required)
    const modeEnv = process.env.RSOLV_MODE;
    if (!modeEnv) {
      throw new Error('RSOLV_MODE environment variable is required. Options: scan, validate, mitigate, fix, full');
    }
    const mode = this.normalizeMode(modeEnv);
    
    // Get issue ID(s) for targeted modes
    const issueId = process.env.RSOLV_ISSUE_ID 
      ? parseInt(process.env.RSOLV_ISSUE_ID, 10)
      : undefined;
    
    const issueIds = process.env.RSOLV_ISSUE_IDS
      ? process.env.RSOLV_ISSUE_IDS.split(',').map(id => parseInt(id.trim(), 10))
      : undefined;
    
    // Get configuration options
    const maxIssues = process.env.RSOLV_MAX_ISSUES
      ? parseInt(process.env.RSOLV_MAX_ISSUES, 10)
      : undefined;
    
    const skipCache = process.env.RSOLV_SKIP_CACHE === 'true';
    
    // Validate configuration
    this.validateConfig(mode, issueId, issueIds);
    
    const config: ModeConfig = {
      mode,
      issueId,
      issueIds,
      maxIssues,
      skipCache
    };
    
    logger.info(`Mode configuration:`, {
      mode: config.mode,
      issueId: config.issueId,
      issueIds: config.issueIds,
      maxIssues: config.maxIssues,
      skipCache: config.skipCache
    });
    
    return config;
  }
  
  /**
   * Normalize mode string to OperationMode
   */
  private static normalizeMode(mode: string): OperationMode {
    const normalized = mode.toLowerCase().trim();
    
    switch (normalized) {
      case 'scan':
      case 'detect':
        return 'scan';
      
      case 'validate':
      case 'validation':
      case 'test':
        return 'validate';
      
      case 'mitigate':
      case 'mitigation':
      case 'repair':
        return 'mitigate';
      
      case 'fix':
      case 'auto':
      case 'combined':
        return 'fix';
      
      case 'full':
      case 'all':
      case 'complete':
        return 'full';
      
      default:
        throw new Error(`Unknown mode '${mode}'. Valid options: scan, validate, mitigate, fix, full`);
    }
  }
  
  /**
   * Validate mode configuration
   */
  private static validateConfig(
    mode: OperationMode, 
    issueId?: number, 
    issueIds?: number[]
  ): void {
    // All modes except scan and full require issue specification
    const requiresIssue = ['validate', 'mitigate', 'fix'];
    
    if (requiresIssue.includes(mode) && !issueId && !issueIds) {
      throw new Error(
        `Mode '${mode}' requires RSOLV_ISSUE_ID or RSOLV_ISSUE_IDS to be set`
      );
    }
    
    // Scan and full modes shouldn't have issue IDs
    if (['scan', 'full'].includes(mode) && (issueId || issueIds)) {
      logger.warn(`${mode} mode ignores issue IDs - processing entire repository`);
    }
    
    // Can't specify both single and multiple issue IDs
    if (issueId && issueIds) {
      throw new Error('Cannot specify both RSOLV_ISSUE_ID and RSOLV_ISSUE_IDS');
    }
  }
  
  /**
   * Get human-readable mode description
   */
  static getModeDescription(mode: OperationMode): string {
    switch (mode) {
      case 'scan':
        return 'Scanning repository for vulnerabilities';
      case 'validate':
        return 'Validating vulnerabilities with RED tests';
      case 'mitigate':
        return 'Mitigating proven vulnerabilities';
      case 'fix':
        return 'Validating and fixing vulnerabilities (combined mode)';
      case 'full':
        return 'Running full pipeline: scan, validate, and mitigate';
      default:
        return `Running in ${mode} mode`;
    }
  }
  
  /**
   * Check if mode requires AI capabilities
   */
  static requiresAI(mode: OperationMode): boolean {
    // All modes except pure scan require AI
    return mode !== 'scan';
  }
  
  /**
   * Check if mode requires test generation
   */
  static requiresTestGeneration(mode: OperationMode): boolean {
    // Validation and fix modes need test generation
    return ['validate', 'fix', 'full'].includes(mode);
  }
  
  /**
   * Check if mode requires fix generation
   */
  static requiresFixGeneration(mode: OperationMode): boolean {
    // Mitigation and fix modes need fix generation
    return ['mitigate', 'fix', 'full'].includes(mode);
  }
}