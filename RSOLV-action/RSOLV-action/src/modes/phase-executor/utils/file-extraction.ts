/**
 * Utility functions for extracting file paths from vulnerability data
 * Handles multiple possible data structures to ensure robustness
 */

import { logger } from '../../../utils/logger.js';

/**
 * Possible vulnerability structures we might encounter
 */
interface VulnerabilityWithFile {
  file: string;
  [key: string]: unknown;
}

interface VulnerabilityWithFiles {
  files: string[];
  [key: string]: unknown;
}

interface VulnerabilityWithPath {
  path: string;
  [key: string]: unknown;
}

interface VulnerabilityWithLocation {
  location: {
    file?: string;
    path?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

type PossibleVulnerability = 
  | VulnerabilityWithFile 
  | VulnerabilityWithFiles 
  | VulnerabilityWithPath 
  | VulnerabilityWithLocation
  | Record<string, unknown>;

/**
 * Extract file paths from vulnerabilities, handling multiple possible structures
 * This function is defensive and logs warnings when it can't extract files
 */
export function extractFilesFromVulnerabilities(
  vulnerabilities: unknown[], 
  context: string = 'unknown'
): string[] {
  if (!Array.isArray(vulnerabilities) || vulnerabilities.length === 0) {
    logger.debug(`[${context}] No vulnerabilities to extract files from`);
    return [];
  }
  
  const allFiles: string[] = [];
  
  vulnerabilities.forEach((vuln, index) => {
    const files = extractFilesFromSingleVulnerability(vuln as PossibleVulnerability);
    
    if (files.length === 0) {
      logger.warn(`[${context}] Could not extract files from vulnerability ${index}:`, {
        vulnerabilityKeys: Object.keys(vuln as object),
        vulnerabilityType: (vuln as any)?.type,
        vulnerabilityString: JSON.stringify(vuln).substring(0, 200)
      });
    } else {
      logger.debug(`[${context}] Extracted ${files.length} files from vulnerability ${index}:`, files);
    }
    
    allFiles.push(...files);
  });
  
  // Remove duplicates
  const uniqueFiles = [...new Set(allFiles)];
  
  logger.info(`[${context}] Total files extracted from ${vulnerabilities.length} vulnerabilities:`, {
    totalFiles: uniqueFiles.length,
    files: uniqueFiles
  });
  
  return uniqueFiles;
}

/**
 * Extract files from a single vulnerability object
 */
function extractFilesFromSingleVulnerability(vuln: PossibleVulnerability): string[] {
  if (!vuln || typeof vuln !== 'object') {
    return [];
  }
  
  // Try 'file' property (singular)
  if ('file' in vuln && typeof vuln.file === 'string') {
    return [vuln.file];
  }
  
  // Try 'files' property (plural)
  if ('files' in vuln && Array.isArray((vuln as VulnerabilityWithFiles).files)) {
    return (vuln as VulnerabilityWithFiles).files.filter(f => typeof f === 'string');
  }
  
  // Try 'path' property
  if ('path' in vuln && typeof (vuln as VulnerabilityWithPath).path === 'string') {
    return [(vuln as VulnerabilityWithPath).path];
  }
  
  // Try 'filePath' property
  if ('filePath' in vuln && typeof (vuln as any).filePath === 'string') {
    return [(vuln as any).filePath];
  }
  
  // Try nested 'location.file' or 'location.path'
  if ('location' in vuln && typeof (vuln as VulnerabilityWithLocation).location === 'object') {
    const location = (vuln as VulnerabilityWithLocation).location;
    if (location.file && typeof location.file === 'string') {
      return [location.file];
    }
    if (location.path && typeof location.path === 'string') {
      return [location.path];
    }
  }
  
  // Try 'filename' property
  if ('filename' in vuln && typeof (vuln as any).filename === 'string') {
    return [(vuln as any).filename];
  }
  
  // Try 'fileName' property (camelCase)
  if ('fileName' in vuln && typeof (vuln as any).fileName === 'string') {
    return [(vuln as any).fileName];
  }
  
  // No file information found
  return [];
}

/**
 * Type guard to check if object has file information
 */
export function hasFileInformation(vuln: unknown): boolean {
  if (!vuln || typeof vuln !== 'object') {
    return false;
  }
  
  const files = extractFilesFromSingleVulnerability(vuln as PossibleVulnerability);
  return files.length > 0;
}