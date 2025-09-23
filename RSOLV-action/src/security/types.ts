export enum VulnerabilityType {
  SQL_INJECTION = 'sql_injection',
  XSS = 'xss',
  BROKEN_AUTHENTICATION = 'broken_authentication',
  SENSITIVE_DATA_EXPOSURE = 'sensitive_data_exposure',
  XML_EXTERNAL_ENTITIES = 'xml_external_entities',
  BROKEN_ACCESS_CONTROL = 'broken_access_control',
  SECURITY_MISCONFIGURATION = 'security_misconfiguration',
  INSECURE_DESERIALIZATION = 'insecure_deserialization',
  VULNERABLE_COMPONENTS = 'vulnerable_components',
  INSUFFICIENT_LOGGING = 'insufficient_logging',
  COMMAND_INJECTION = 'command_injection',
  PATH_TRAVERSAL = 'path_traversal',
  WEAK_CRYPTOGRAPHY = 'weak_cryptography',
  DEBUG_MODE = 'debug_mode',
  MASS_ASSIGNMENT = 'mass_assignment',
  OPEN_REDIRECT = 'open_redirect',
  HARDCODED_SECRETS = 'hardcoded_secrets',
  XPATH_INJECTION = 'xpath_injection',
  LDAP_INJECTION = 'ldap_injection',
  INSECURE_TRANSPORT = 'insecure_transport',
  UNVALIDATED_REDIRECT = 'unvalidated_redirect',
  PROTOTYPE_POLLUTION = 'prototype_pollution',
  SSRF = 'server_side_request_forgery',
  TYPE_CONFUSION = 'type_confusion',
  NULL_POINTER_DEREFERENCE = 'null_pointer_dereference',
  CSRF = 'cross_site_request_forgery',
  DENIAL_OF_SERVICE = 'denial_of_service',
  NOSQL_INJECTION = 'nosql_injection',
  INFORMATION_DISCLOSURE = 'information_disclosure',
  IMPROPER_INPUT_VALIDATION = 'improper_input_validation',
  TEMPLATE_INJECTION = 'template_injection',
  LOG_INJECTION = 'log_injection',
  CRLF_INJECTION = 'crlf_injection'
}

export interface Vulnerability {
  type: VulnerabilityType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  line: number;
  column?: number;
  message: string;
  description: string;
  cweId?: string;
  owaspCategory?: string;
  remediation?: string;
  confidence: number; // 0-100
  filePath?: string;
  snippet?: string;
  isVendor?: boolean; // True if vulnerability is in vendor/third-party code
}

export interface SecurityScanResult {
  vulnerabilities: Vulnerability[];
  summary: {
    total: number;
    byType: Record<VulnerabilityType, number>;
    bySeverity: Record<string, number>;
  };
  metadata: {
    language: string;
    linesScanned: number;
    scanDuration: number;
    timestamp: string;
  };
}

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface SecurityPattern {
  id: string;
  type: VulnerabilityType;
  name: string;
  description: string;
  patterns: {
    regex?: RegExp[];
    ast?: string[]; // AST node types to match
  };
  severity: 'low' | 'medium' | 'high' | 'critical';
  cweId: string;
  owaspCategory: string;
  languages: string[];
  remediation: string;
  examples: {
    vulnerable: string;
    secure: string;
  };
  // AST Enhancement fields
  astRules?: {
    nodeType?: string;
    [key: string]: any;
  };
  contextRules?: {
    excludePaths?: RegExp[];
    safeIfWrapped?: string[];
    [key: string]: any;
  };
  confidenceRules?: {
    base?: number;
    adjustments?: Record<string, number>;
    [key: string]: any;
  };
  minConfidence?: number;
}

export interface ComplianceDocumentationTemplate {
  framework: string;
  controlMapping: Record<string, string>;
  evidenceTemplate: string;
  remediationSteps: string[];
}

export interface Library {
  name: string;
  version: string;
}