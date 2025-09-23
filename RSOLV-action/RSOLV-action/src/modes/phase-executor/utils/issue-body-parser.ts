/**
 * Parser for extracting file and vulnerability information from issue bodies
 * This solves the problem where validation returns "unknown.js" instead of real filenames
 */

import { logger } from '../../../utils/logger.js';
import type { ValidationData } from '../../../types/vulnerability.js';

/**
 * Represents a vulnerability found in the issue body
 */
export interface IssueBodyVulnerability {
  line: number;
  message: string;
}

/**
 * Maps a file to its vulnerabilities
 */
export interface FileVulnerabilityMapping {
  path: string;
  vulnerabilities: IssueBodyVulnerability[];
}

/**
 * Parsed structure from the issue body
 */
export interface ParsedIssueBody {
  type?: string;
  severity?: string;
  files: FileVulnerabilityMapping[];
}

/**
 * Validation vulnerability structure (what we receive)
 */
export interface ValidationVulnerability {
  file: string;
  line: number;
  type: string;
  description?: string;
  confidence?: number | string;
  [key: string]: unknown; // Allow other properties but maintain type safety
}

/**
 * Enhanced validation data structure
 */
export interface EnhancedValidationData {
  confidence?: string;
  vulnerabilities: ValidationVulnerability[];
  [key: string]: unknown; // Preserve other properties
}

/**
 * Parse issue body to extract file and vulnerability information
 * @param issueBody The markdown content of the issue
 * @returns Parsed structure with files and their vulnerabilities
 */
export function parseIssueBody(issueBody: string): ParsedIssueBody {
  const result: ParsedIssueBody = {
    files: []
  };

  if (!issueBody || typeof issueBody !== 'string') {
    logger.warn('[IssueBodyParser] Invalid issue body provided');
    return result;
  }

  // Extract type
  const typeMatch = issueBody.match(/\*\*Type\*\*:\s*(\S+)/);
  if (typeMatch) {
    result.type = typeMatch[1];
  }

  // Extract severity
  const severityMatch = issueBody.match(/\*\*Severity\*\*:\s*(\S+)/);
  if (severityMatch) {
    result.severity = severityMatch[1];
  }

  // Extract files and their vulnerabilities
  // Match pattern: #### `filepath`
  const fileRegex = /####\s*`([^`]+)`/g;
  const lines = issueBody.split('\n');
  
  let currentFile: FileVulnerabilityMapping | null = null;
  let inFileSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for file header
    const fileMatch = line.match(/####\s*`([^`]+)`/);
    if (fileMatch) {
      // Save previous file if exists
      if (currentFile) {
        result.files.push(currentFile);
      }
      
      currentFile = {
        path: fileMatch[1],
        vulnerabilities: []
      };
      inFileSection = true;
      continue;
    }

    // Parse vulnerability lines (format: - **Line X**: message)
    if (inFileSection && currentFile && line.trim().startsWith('-')) {
      const vulnMatch = line.match(/-\s*\*\*Line\s+(\d+)\*\*:\s*(.+)/);
      if (vulnMatch) {
        currentFile.vulnerabilities.push({
          line: parseInt(vulnMatch[1], 10),
          message: vulnMatch[2].trim()
        });
      }
    }

    // Check if we've left the files section
    if (line.startsWith('###') && !line.includes('Affected Files')) {
      inFileSection = false;
      if (currentFile) {
        result.files.push(currentFile);
        currentFile = null;
      }
    }
  }

  // Don't forget the last file
  if (currentFile) {
    result.files.push(currentFile);
  }

  logger.debug('[IssueBodyParser] Parsed issue body:', {
    type: result.type,
    severity: result.severity,
    filesCount: result.files.length,
    files: result.files.map(f => ({
      path: f.path,
      vulnerabilitiesCount: f.vulnerabilities.length
    }))
  });

  return result;
}

/**
 * Enhance validation data by replacing "unknown.js" with actual filenames
 * @param validationData The validation data with "unknown.js" files
 * @param parsedBody The parsed issue body with real filenames
 * @returns Enhanced validation data with correct filenames
 */
export function enhanceValidationData(
  validationData: ValidationData,
  parsedBody: ParsedIssueBody
): EnhancedValidationData {
  // Create a copy to avoid mutations
  const enhanced: EnhancedValidationData = {
    ...validationData,
    vulnerabilities: [...(validationData.vulnerabilities || [])]
  };

  // Build a line-to-file mapping for quick lookup
  const lineToFile = new Map<number, string>();
  parsedBody.files.forEach(file => {
    file.vulnerabilities.forEach(vuln => {
      // Handle potential line number collisions by checking if already mapped
      if (!lineToFile.has(vuln.line)) {
        lineToFile.set(vuln.line, file.path);
      } else {
        // Log collision for debugging
        logger.debug('[IssueBodyParser] Line number collision detected:', {
          line: vuln.line,
          existingFile: lineToFile.get(vuln.line),
          newFile: file.path
        });
      }
    });
  });

  // Enhance each vulnerability
  enhanced.vulnerabilities = enhanced.vulnerabilities.map((vuln: ValidationVulnerability) => {
    // Only replace if file is "unknown.js"
    if (vuln.file === 'unknown.js' && vuln.line && lineToFile.has(vuln.line)) {
      const actualFile = lineToFile.get(vuln.line)!;
      logger.debug(`[IssueBodyParser] Replacing unknown.js with ${actualFile} for line ${vuln.line}`);
      
      return {
        ...vuln,
        file: actualFile,
        // Also fix the type if it's UNKNOWN and we have the real type
        type: vuln.type === 'UNKNOWN' && parsedBody.type ? parsedBody.type : vuln.type
      };
    }
    
    // Return unchanged if not unknown.js or no match found
    return vuln;
  });

  logger.info('[IssueBodyParser] Enhanced validation data:', {
    originalCount: validationData.vulnerabilities?.length || 0,
    enhancedCount: enhanced.vulnerabilities.length,
    filesFixed: enhanced.vulnerabilities.filter((v: ValidationVulnerability) => 
      v.file !== 'unknown.js' && 
      validationData.vulnerabilities?.some((orig: ValidationVulnerability) => 
        orig.file === 'unknown.js' && orig.line === v.line
      )
    ).length
  });

  return enhanced;
}