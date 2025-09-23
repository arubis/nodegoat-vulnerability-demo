/**
 * Shared utility functions for vendor file filtering across all phases
 * Implements DRY principle for vendor detection logic
 */

import { VendorDetector } from '../security/vendor-detector.js';
import { IssueContext } from '../types/index.js';
import { logger } from '../utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';

export class VendorFilterUtils {
  private vendorDetector: VendorDetector;

  constructor() {
    this.vendorDetector = new VendorDetector();
  }

  /**
   * Extract file paths from various vulnerability/issue formats
   * Supports multiple field names that different scanners might use
   */
  extractFilesFromIssue(issue: IssueContext): string[] {
    const files: string[] = [];

    // Parse issue body to extract file paths
    const bodyLines = issue.body?.split('\n') || [];

    for (const line of bodyLines) {
      // Match patterns like "**File**: app/routes/index.js"
      const fileMatch = line.match(/\*\*File\*\*:\s*(.+)/);
      if (fileMatch) {
        files.push(fileMatch[1].trim());
      }

      // Match patterns like "File: app/routes/index.js"
      const simpleFileMatch = line.match(/^File:\s*(.+)/);
      if (simpleFileMatch) {
        files.push(simpleFileMatch[1].trim());
      }

      // Match patterns in code blocks like "// File: app/routes/index.js"
      const codeFileMatch = line.match(/\/\/\s*File:\s*(.+)/);
      if (codeFileMatch) {
        files.push(codeFileMatch[1].trim());
      }
    }

    // Also check for file paths in title (some scanners include them)
    const titleFileMatch = issue.title?.match(/in\s+(.+\.(js|ts|jsx|tsx|py|java|php|rb|go))/);
    if (titleFileMatch) {
      files.push(titleFileMatch[1]);
    }

    return [...new Set(files)]; // Remove duplicates
  }

  /**
   * Check if the issue affects vendor files
   * Returns vendor status and list of affected vendor files
   */
  async checkForVendorFiles(issue: IssueContext): Promise<{ isVendor: boolean; files: string[] }> {
    const vendorFiles: string[] = [];
    const affectedFiles = this.extractFilesFromIssue(issue);

    logger.info(`Checking ${affectedFiles.length} files for vendor status in issue #${issue.number}`);

    for (const file of affectedFiles) {
      const isVendor = await this.vendorDetector.isVendorFile(file);
      if (isVendor) {
        vendorFiles.push(file);
        logger.info(`Detected vendor file: ${file}`);
      }
    }

    return {
      isVendor: vendorFiles.length > 0,
      files: vendorFiles
    };
  }

  /**
   * Check vendor status from validation results
   * Used by mitigation phase to check if validation already marked as vendor
   */
  checkVendorStatusFromValidation(repoPath: string, issueNumber: number): { isVendor: boolean; files: string[] } {
    try {
      const validationPath = path.join(repoPath, '.rsolv', 'validation', `issue-${issueNumber}.json`);

      if (!fs.existsSync(validationPath)) {
        logger.debug(`No validation results found for issue #${issueNumber}`);
        return { isVendor: false, files: [] };
      }

      const validationData = JSON.parse(fs.readFileSync(validationPath, 'utf-8'));

      if (validationData.vendoredFile) {
        logger.info(`Issue #${issueNumber} marked as vendor file in validation`);
        return {
          isVendor: true,
          files: validationData.affectedVendorFiles || []
        };
      }

      return { isVendor: false, files: [] };
    } catch (error) {
      logger.warn(`Error reading validation status for issue #${issueNumber}:`, error);
      return { isVendor: false, files: [] };
    }
  }

  /**
   * Format vendor file message for logs and issue comments
   */
  formatVendorMessage(vendorFiles: string[]): string {
    if (vendorFiles.length === 0) {
      return '';
    }

    const fileList = vendorFiles.map(f => `  - ${f}`).join('\n');
    return `Vendor/third-party files detected:\n${fileList}\n\nThese files cannot be directly patched. Library update required.`;
  }

  /**
   * Check if a single file is a vendor file
   * Convenience method for simple checks
   */
  async isVendorFile(filePath: string): Promise<boolean> {
    return await this.vendorDetector.isVendorFile(filePath);
  }
}

// Export singleton instance for consistent usage
export const vendorFilterUtils = new VendorFilterUtils();