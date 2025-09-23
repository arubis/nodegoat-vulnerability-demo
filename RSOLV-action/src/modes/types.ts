/**
 * Three-Phase Architecture Mode Types
 * RFC-041: Scan, Validate, Mitigate
 */

export type OperationMode = 
  | 'scan'      // Detect vulnerabilities (batch)
  | 'validate'  // Prove vulnerabilities exist with RED tests
  | 'mitigate'  // Fix proven vulnerabilities with GREEN+REFACTOR
  | 'fix'       // Combined validate+mitigate (legacy/default)
  | 'full';     // All phases: scan+validate+mitigate

export interface ModeConfig {
  mode: OperationMode;
  issueId?: number;  // Required for validate/mitigate/fix modes
  issueIds?: number[]; // For batch validation
  maxIssues?: number;  // Limit processing
  skipCache?: boolean; // Bypass false positive cache
}

export interface ValidationResult {
  issueId: number;
  validated: boolean;
  vendoredFile?: boolean; // True if vulnerability is in vendor/third-party code
  affectedVendorFiles?: string[]; // List of vendor files affected
  branchName?: string;
  redTests?: any; // VulnerabilityTestSuite
  testResults?: any; // TestResults
  falsePositiveReason?: string;
  testingMode?: boolean; // RFC-059: Indicates testing mode is enabled
  testingModeNote?: string; // RFC-059: Explanation when testing mode overrides validation
  timestamp: string;
  commitHash: string;
}

export interface MitigationResult {
  issueId: number;
  success: boolean;
  prUrl?: string;
  fixCommit?: string;
  reason?: string;
  timestamp: string;
}

export interface PhaseData {
  scan?: {
    vulnerabilities: any[]; // Vulnerability[]
    timestamp: string;
    commitHash: string;
  };
  
  validation?: {
    [issueId: string]: ValidationResult;
  };
  
  mitigation?: {
    [issueId: string]: MitigationResult;
  };
}

export interface FalsePositiveEntry {
  pattern: string;
  file: string;
  reason: string;
  timestamp: string;
  expiresAt?: string;
}

export interface FalsePositiveCache {
  entries: FalsePositiveEntry[];
  version: string;
}