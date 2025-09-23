/**
 * RFC-046: Multi-file Vulnerability Chunking Types
 */

export interface ChunkingConfig {
  enabled: boolean;
  maxFilesPerChunk: number;
  maxLinesPerChunk: number;
  maxContextTokens: number;
  strategies?: string[];
  multiPR?: {
    enabled: boolean;
    delayBetweenPRs: number;
  };
}

export interface VulnerabilityFile {
  path: string;
  lines: number[];
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  imports?: string[];
  content?: string;
}

export interface MultiFileVulnerability {
  type: string;
  issueNumber: number;
  files: VulnerabilityFile[];
  requiresConfigChange?: boolean;
  requiresNewDependencies?: boolean;
}

export interface Chunk {
  index: number;
  files: VulnerabilityFile[];
  estimatedTokens: number;
  vulnerabilityType: string;
  strategy?: string;
  dependencies?: number[]; // Indices of chunks this depends on
}

export interface ChunkingStrategy {
  name: string;
  group(files: VulnerabilityFile[]): Promise<VulnerabilityFile[][]>;
  prioritize?(groups: VulnerabilityFile[][]): VulnerabilityFile[][];
}

export enum FixComplexity {
  SIMPLE = 'simple',       // Direct replacement, 1-2 files
  MODERATE = 'moderate',   // Requires refactoring, 3-5 files
  COMPLEX = 'complex',     // Architectural changes, 6+ files
  MANUAL = 'manual'        // Requires human intervention
}

export interface ComplexityFactors {
  fileCount: number;
  requiresConfigChange: boolean;
  requiresNewDependencies: boolean;
  crossFileReferences: number;
  testImpact: number;
}

export interface PR {
  number?: number;
  title: string;
  body: string;
  branch: string;
  files: VulnerabilityFile[];
  dependencies?: number[];
}

export interface FixResult {
  success: boolean;
  pr?: PR;
  codeFix?: string;
  setupGuide?: string;
  instructions?: string;
  validationSteps?: string[];
  approach?: 'automated' | 'manual_guide';
  guide?: {
    steps: number;
    content: string;
  };
}

export interface HardcodedSecret {
  type: 'HARDCODED_SECRETS';
  file: string;
  line: number;
  secret: string;
  secretType: 'api_key' | 'password' | 'token' | 'certificate' | 'other';
  context?: string;
}

// Token estimation constants
export const TOKENS_PER_LINE = 10; // Average tokens per line of code
export const TOKENS_PER_FILE_OVERHEAD = 100; // File path, imports, etc.
export const MAX_SAFE_TOKENS = 7500; // Leave buffer for response

// VulnerabilityChunker is implemented in vulnerability-chunker.ts
export { VulnerabilityChunker } from './vulnerability-chunker.js';