// Core action types

export interface ActionConfig {
  apiKey: string;
  configPath: string;
  issueLabel: string;
  scanLabel?: string;  // Label for scan-detected issues (default: 'rsolv:detected')
  environmentVariables?: Record<string, string>;
  repoToken?: string;
  aiProvider: AiProviderConfig;
  containerConfig: ContainerConfig;
  securitySettings: SecuritySettings;
  enableSecurityAnalysis?: boolean;
  rsolvApiKey?: string;
  maxIssues?: number; // Maximum number of issues to process in a single run
  fixValidation?: FixValidationConfig;
  customerTier?: string;
  testGeneration?: TestGenerationConfig;
  useGitBasedEditing?: boolean; // Enable git-based in-place editing (ADR-012)
  useStructuredPhases?: boolean; // Enable structured phased prompting for Claude Code
  claudeCodeConfig?: any; // Claude Code specific configuration
}

export interface FixValidationConfig {
  enabled?: boolean;
  maxIterations?: number;
  maxIterationsByType?: Record<string, number>;
  maxIterationsByTier?: Record<string, number>;
}

export interface TestGenerationConfig {
  enabled?: boolean;
  frameworks?: Record<string, string[]>;
  generateForVulnerabilities?: boolean;
  includeInPR?: boolean;
  validateFixes?: boolean;
  languages?: string[];
}

export interface ActionStatus {
  success: boolean;
  message: string;
  data?: any;
}

// Issue types

export interface IssueContext {
  id: string;
  number: number;
  title: string;
  body: string;
  labels: string[];
  assignees: string[];
  repository: {
    owner: string;
    name: string;
    fullName: string; // owner/name
    defaultBranch: string;
    language?: string;
  };
  source: 'github' | 'jira' | 'linear' | string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
  specificVulnerabilities?: Array<{
    file: string;
    line: number;
    type: string;
    severity: string;
    description: string;
  }>;
}

export interface IssueProcessingResult {
  issueId: string;
  success: boolean;
  message: string;
  pullRequestUrl?: string;
  error?: string;
  analysisData?: AnalysisData;
}

// AI types

export interface AiProviderConfig {
  provider: 'openai' | 'anthropic' | 'mistral' | 'ollama' | string;
  apiKey?: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  contextLimit?: number;
  timeout?: number;
  useVendedCredentials?: boolean;
}

export interface AnalysisData {
  issueType: IssueType;
  filesToModify: string[];
  estimatedComplexity: 'simple' | 'medium' | 'complex';
  requiredContext: string[];
  suggestedApproach: string;
  codeSnippets?: Record<string, string>;
  confidenceScore?: number;
  canBeFixed?: boolean;
  vulnerabilityType?: string;
  severity?: string;
  cwe?: string;
  isAiGenerated?: boolean;
  cannotFixReason?: string;
}

export type IssueType = 
  | 'bug' 
  | 'feature' 
  | 'refactoring' 
  | 'performance' 
  | 'security' 
  | 'documentation'
  | 'dependency'
  | 'test'
  | 'other';

// Container types

export interface ContainerConfig {
  enabled: boolean;
  image?: string;
  memoryLimit?: string;
  cpuLimit?: string;
  timeout?: number;
  securityProfile?: 'default' | 'strict' | 'relaxed';
  environmentVariables?: Record<string, string>;
}

// Security types

export interface SecuritySettings {
  disableNetworkAccess?: boolean;
  allowedDomains?: string[];
  scanDependencies?: boolean;
  preventSecretLeakage?: boolean;
  maxFileSize?: number;
  timeoutSeconds?: number;
  requireCodeReview?: boolean;
}

// API response types

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  timestamp: string;
}