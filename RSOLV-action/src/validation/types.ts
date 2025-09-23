/**
 * RFC-045: Validation Confidence Scoring Types
 */

export enum ConfidenceLevel {
  HIGH = 'high',       // 80-100% - Pattern + AST validation confirm
  MEDIUM = 'medium',   // 50-79% - Pattern matches, AST uncertain
  LOW = 'low',         // 20-49% - Weak pattern match
  REVIEW = 'review'    // 0-19% - Requires manual verification
}

export interface ValidationMetadata {
  patternMatchScore: number;      // 0-1
  astValidationScore: number;      // 0-1
  contextualScore: number;         // 0-1
  dataFlowScore?: number;          // 0-1
  weights?: {
    pattern: number;
    ast: number;
    dataFlow: number;
    context: number;
  };
}

export interface VulnerabilityWithConfidence {
  type: string;
  file: string;
  line: number;
  confidence: ConfidenceLevel;
  description?: string;
  severity?: string;
  cwe?: string;
  owasp?: string;
}

export interface ValidationResult {
  hasSpecificVulnerabilities: boolean;
  vulnerabilities: VulnerabilityWithConfidence[];
  overallConfidence: ConfidenceLevel;
  validationMetadata: ValidationMetadata;
  validationWarning?: string;
  issueNumber?: number;
  validationTimestamp?: Date;
}

export interface ValidationStrategy {
  weights: {
    pattern: number;
    ast: number;
    dataFlow: number;
    context: number;
  };
  requiredMethods: string[];
  minConfidenceThreshold: number;
}

export const VALIDATION_STRATEGIES: Record<string, ValidationStrategy> = {
  COMMAND_INJECTION: {
    weights: { pattern: 0.3, ast: 0.4, dataFlow: 0.3, context: 0 },
    requiredMethods: ['pattern', 'dataFlow'],
    minConfidenceThreshold: 0.5
  },
  XSS: {
    weights: { pattern: 0.4, ast: 0.3, dataFlow: 0, context: 0.3 },
    requiredMethods: ['pattern', 'context'],
    minConfidenceThreshold: 0.6
  },
  CROSS_SITE_SCRIPTING: {
    weights: { pattern: 0.4, ast: 0.3, dataFlow: 0, context: 0.3 },
    requiredMethods: ['pattern', 'context'],
    minConfidenceThreshold: 0.6
  },
  SQL_INJECTION: {
    weights: { pattern: 0.25, ast: 0.25, dataFlow: 0.5, context: 0 },
    requiredMethods: ['dataFlow'],
    minConfidenceThreshold: 0.7
  },
  PATH_TRAVERSAL: {
    weights: { pattern: 0.3, ast: 0.3, dataFlow: 0.4, context: 0 },
    requiredMethods: ['pattern', 'dataFlow'],
    minConfidenceThreshold: 0.6
  },
  XXE: {
    weights: { pattern: 0.5, ast: 0.3, dataFlow: 0, context: 0.2 },
    requiredMethods: ['pattern'],
    minConfidenceThreshold: 0.7
  },
  XML_EXTERNAL_ENTITIES: {
    weights: { pattern: 0.5, ast: 0.3, dataFlow: 0, context: 0.2 },
    requiredMethods: ['pattern'],
    minConfidenceThreshold: 0.7
  },
  INSECURE_DESERIALIZATION: {
    weights: { pattern: 0.4, ast: 0.3, dataFlow: 0.3, context: 0 },
    requiredMethods: ['pattern', 'dataFlow'],
    minConfidenceThreshold: 0.65
  },
  WEAK_CRYPTOGRAPHY: {
    weights: { pattern: 0.6, ast: 0.2, dataFlow: 0, context: 0.2 },
    requiredMethods: ['pattern'],
    minConfidenceThreshold: 0.5
  },
  HARDCODED_SECRETS: {
    weights: { pattern: 0.7, ast: 0.1, dataFlow: 0, context: 0.2 },
    requiredMethods: ['pattern'],
    minConfidenceThreshold: 0.6
  },
  DEFAULT: {
    weights: { pattern: 0.4, ast: 0.3, dataFlow: 0.2, context: 0.1 },
    requiredMethods: ['pattern'],
    minConfidenceThreshold: 0.5
  }
};

export interface ValidationMethod {
  name: string;
  score: number;
  vulnerabilities: VulnerabilityWithConfidence[];
  metadata?: Record<string, any>;
}

export function calculateConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.8) return ConfidenceLevel.HIGH;
  if (score >= 0.5) return ConfidenceLevel.MEDIUM;
  if (score >= 0.2) return ConfidenceLevel.LOW;
  return ConfidenceLevel.REVIEW;
}

export function getValidationStrategy(vulnerabilityType: string): ValidationStrategy {
  const upperType = vulnerabilityType.toUpperCase().replace(/-/g, '_');
  return VALIDATION_STRATEGIES[upperType] || VALIDATION_STRATEGIES.DEFAULT;
}