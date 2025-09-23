/**
 * Static XSS Validator
 * 
 * Validates XSS fixes using static analysis instead of runtime tests.
 * This is necessary for browser-based XSS that can't be tested in Node.js.
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { logger } from '../utils/logger.js';

export interface StaticValidationResult {
  isValidFix: boolean;
  vulnerablePatterns: string[];
  safePatterns: string[];
  error?: string;
}

export class StaticXSSValidator {
  /**
   * Validate that XSS vulnerability has been fixed by checking code patterns
   */
  validateXSSFix(
    filePath: string,
    beforeCommit: string,
    afterCommit: string
  ): StaticValidationResult {
    try {
      // Get file content before and after fix
      const beforeContent = this.getFileAtCommit(filePath, beforeCommit);
      const afterContent = this.getFileAtCommit(filePath, afterCommit);
      
      // Check for vulnerable patterns
      const vulnerablePatterns = this.findVulnerablePatterns(afterContent);
      const safePatterns = this.findSafePatterns(afterContent);
      
      // Validate the fix
      const isValidFix = this.validateFix(beforeContent, afterContent);
      
      return {
        isValidFix,
        vulnerablePatterns,
        safePatterns,
        error: isValidFix ? undefined : 'Vulnerable patterns still present or safe patterns not found'
      };
    } catch (error) {
      logger.error('Static validation failed', error as Error);
      return {
        isValidFix: false,
        vulnerablePatterns: [],
        safePatterns: [],
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Get file content at a specific commit
   */
  private getFileAtCommit(filePath: string, commit: string): string {
    try {
      return execSync(`git show ${commit}:${filePath}`, {
        encoding: 'utf-8',
        stdio: 'pipe'
      });
    } catch (error) {
      logger.error(`Failed to get file ${filePath} at commit ${commit}`, error as Error);
      throw error;
    }
  }
  
  /**
   * Find vulnerable XSS patterns in code
   */
  private findVulnerablePatterns(content: string): string[] {
    const patterns: string[] = [];
    
    // Check for document.write with concatenation
    if (/document\.write\s*\([^)]*\+[^)]*\)/.test(content)) {
      patterns.push('document.write with concatenation');
    }
    
    // Check for innerHTML with concatenation
    if (/innerHTML\s*=\s*[^;]*\+/.test(content)) {
      patterns.push('innerHTML with concatenation');
    }
    
    // Check for eval with user input
    if (/eval\s*\([^)]*location\.|eval\s*\([^)]*window\./.test(content)) {
      patterns.push('eval with potential user input');
    }
    
    // Check for unsafe template literals with location/window
    if (/\$\{[^}]*location\.[^}]*\}/.test(content) && /innerHTML|document\.write/.test(content)) {
      patterns.push('template literal with location in unsafe context');
    }
    
    // Specific check for the livereload XSS pattern
    if (/document\.write.*location\.host/.test(content)) {
      patterns.push('document.write with location.host');
    }
    
    return patterns;
  }
  
  /**
   * Find safe patterns that indicate proper fix
   */
  private findSafePatterns(content: string): string[] {
    const patterns: string[] = [];
    
    // Check for createElement usage
    if (/document\.createElement\s*\(\s*['"]script['"]\s*\)/.test(content)) {
      patterns.push('createElement for script tags');
    }
    
    // Check for appendChild usage
    if (/appendChild\s*\(/.test(content)) {
      patterns.push('appendChild for DOM manipulation');
    }
    
    // Check for textContent usage (safe alternative to innerHTML)
    if (/textContent\s*=/.test(content)) {
      patterns.push('textContent for safe text insertion');
    }
    
    // Check for whitelist validation
    if (/allowedHosts|whitelist|includes\s*\(/.test(content)) {
      patterns.push('whitelist validation');
    }
    
    // Check for hardcoded safe values
    if (/localhost:35729|127\.0\.0\.1:35729/.test(content) && 
        !/location\.host/.test(content)) {
      patterns.push('hardcoded safe values');
    }
    
    return patterns;
  }
  
  /**
   * Validate that the fix properly addresses the vulnerability
   */
  private validateFix(beforeContent: string, afterContent: string): boolean {
    // Check that vulnerable patterns were removed
    const hadVulnerable = this.findVulnerablePatterns(beforeContent).length > 0;
    const hasVulnerable = this.findVulnerablePatterns(afterContent).length > 0;
    const hasSafe = this.findSafePatterns(afterContent).length > 0;
    
    // For config files with environmentalScripts
    if (beforeContent.includes('environmentalScripts') && afterContent.includes('environmentalScripts')) {
      // Special validation for the livereload XSS
      const beforeHasDocWrite = /document\.write.*location\.host/.test(beforeContent);
      const afterHasDocWrite = /document\.write.*location\.host/.test(afterContent);
      
      if (beforeHasDocWrite && !afterHasDocWrite) {
        // Check that a safe alternative was added
        const hasCreateElement = /createElement.*script/.test(afterContent);
        const hasAppendChild = /appendChild/.test(afterContent);
        const hasHardcodedHost = /localhost:35729|127\.0\.0\.1:35729/.test(afterContent);
        
        return (hasCreateElement && hasAppendChild) || hasHardcodedHost;
      }
    }
    
    // General validation
    return hadVulnerable && !hasVulnerable && hasSafe;
  }
}

/**
 * Check if a vulnerability type should use static validation
 * 
 * IMPORTANT: This is ONLY for edge cases where runtime testing is impossible.
 * Most vulnerabilities should use the default AI-powered fixing with runtime validation.
 * 
 * Static validation is a fallback for:
 * - Browser-only code that can't run in Node.js
 * - Template files that need a full render pipeline
 * - Client-side vulnerabilities with no server component
 */
export function shouldUseStaticValidation(
  vulnerabilityType: string,
  filePath: string
): boolean {
  // Only use static validation for very specific cases
  // Default is always runtime validation with AI-generated tests
  
  if (vulnerabilityType === 'XSS' || vulnerabilityType === 'Xss') {
    // Config files with browser-only code (like document.write)
    if (filePath.includes('config/') && filePath.endsWith('.js')) {
      // Check if this is actually a browser-side config
      // (not all config files need static validation)
      return filePath.includes('development.js') || 
             filePath.includes('client') ||
             filePath.includes('browser');
    }
    
    // Pure HTML files without server processing
    if (filePath.endsWith('.html') && !filePath.includes('template')) {
      return true;
    }
    
    // Frontend-only JavaScript
    if ((filePath.includes('public/') || filePath.includes('static/')) && 
        filePath.endsWith('.js')) {
      return true;
    }
  }
  
  // Everything else uses the default AI fixing with runtime validation
  return false;
}