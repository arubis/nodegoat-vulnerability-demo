import { Vulnerability } from '../security/types.js';

export type ScanMode = 'fix' | 'scan';

export interface ScanConfig {
  mode?: ScanMode;
  repository: {
    owner: string;
    name: string;
    defaultBranch: string;
  };
  createIssues: boolean;
  batchSimilar?: boolean;
  issueLabel: string;
  enableASTValidation?: boolean;
  astValidationBatchSize?: number;
  rsolvApiKey?: string; // Needed for validation API
  maxIssues?: number; // Limit number of issues to create
}

export interface ScanResult {
  repository: string;
  branch: string;
  scanDate: string;
  totalFiles: number;
  scannedFiles: number;
  vulnerabilities: Vulnerability[];
  groupedVulnerabilities: VulnerabilityGroup[];
  createdIssues: CreatedIssue[];
}

export interface VulnerabilityGroup {
  type: string;
  severity: string;
  count: number;
  files: string[];
  vulnerabilities: Vulnerability[];
  isVendor?: boolean; // True if all vulnerabilities in group are from vendor files
}

export interface CreatedIssue {
  number: number;
  title: string;
  url: string;
  vulnerabilityType: string;
  fileCount: number;
}

export interface FileToScan {
  path: string;
  content: string;
  language: string;
}