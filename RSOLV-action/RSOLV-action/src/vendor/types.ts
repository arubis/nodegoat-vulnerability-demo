/**
 * RFC-047: Vendor Library Detection Types
 */

export interface Library {
  name: string;
  version: string;
  packageManager?: 'npm' | 'pip' | 'gem' | 'composer' | 'maven';
  path?: string;
}

export interface Vulnerability {
  type: string;
  file: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  line?: number;
  cve?: string;
  description?: string;
}

export interface VendorVulnerability extends Vulnerability {
  library: Library;
  recommendedVersion?: string;
  updateCommand?: string;
  workaround?: string;
  advisoryUrl?: string;
}

export type VulnerabilityAction = 'fix' | 'update' | 'configure' | 'acknowledge';

export interface VulnerabilityReport {
  type: 'application' | 'vendor';
  action: VulnerabilityAction;
  library?: Library;
  report?: {
    library: string;
    currentVersion: string;
    recommendedVersion: string;
    cve?: string;
    updateCommand: string;
    alternativeFix?: string;
  };
}

export interface UpdateStrategy {
  type: 'patch' | 'minor' | 'major';
  command: string;
  risk: 'low' | 'medium' | 'high';
  notes?: string;
}

export interface UpdateRecommendation {
  severity: string;
  currentVersion: string;
  fixedVersions?: string[];
  minimumSafeVersion: string;
  breakingChanges?: boolean;
  updateStrategies: UpdateStrategy[];
}

export interface Issue {
  title: string;
  body: string;
  labels: string[];
  createsPR?: boolean;
}

export type DependencyMap = Map<string, string>;

// Export implementations
export { VendorDetector } from './vendor-detector.js';
export { DependencyAnalyzer } from './dependency-analyzer.js';
export { VendorVulnerabilityHandler } from './vulnerability-handler.js';
export { UpdateRecommender } from './update-recommender.js';
export { VendorIssueCreator } from './issue-creator.js';