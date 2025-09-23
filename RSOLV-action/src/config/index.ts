import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import { ActionConfig } from '../types/index.js';
import { logger } from '../utils/logger.js';

// Zod schema for validating configuration
const AiProviderConfigSchema = z.object({
  provider: z.string(),
  apiKey: z.string().optional(),
  model: z.string(),
  baseUrl: z.string().optional(),
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
  contextLimit: z.number().optional(),
  timeout: z.number().optional(),
  useVendedCredentials: z.boolean().optional()
});

const ContainerConfigSchema = z.object({
  enabled: z.boolean(),
  image: z.string().optional(),
  memoryLimit: z.string().optional(),
  cpuLimit: z.string().optional(),
  timeout: z.number().optional(),
  securityProfile: z.enum(['default', 'strict', 'relaxed']).optional(),
  environmentVariables: z.record(z.string(), z.string()).optional()
});

const SecuritySettingsSchema = z.object({
  disableNetworkAccess: z.boolean().optional(),
  allowedDomains: z.array(z.string()).optional(),
  scanDependencies: z.boolean().optional(),
  preventSecretLeakage: z.boolean().optional(),
  maxFileSize: z.number().optional(),
  timeoutSeconds: z.number().optional(),
  requireCodeReview: z.boolean().optional()
});

const TestGenerationConfigSchema = z.object({
  enabled: z.boolean().optional(),
  generateForVulnerabilities: z.boolean().optional(),
  includeInPR: z.boolean().optional(),
  validateFixes: z.boolean().optional(),
  languages: z.array(z.string()).optional(),
  frameworks: z.record(z.string(), z.array(z.string())).optional()
});

const FixValidationConfigSchema = z.object({
  enabled: z.boolean().optional(),
  maxIterations: z.number().optional(),
  maxIterationsByType: z.record(z.string(), z.number()).optional(),
  maxIterationsByTier: z.record(z.string(), z.number()).optional()
});

const ActionConfigSchema = z.object({
  apiKey: z.string(),
  configPath: z.string(),
  issueLabel: z.string(),
  scanLabel: z.string().optional(),  // Label for scan-detected issues
  enableSecurityAnalysis: z.boolean().optional(),
  environmentVariables: z.record(z.string(), z.string()).optional(),
  repoToken: z.string().optional(),
  aiProvider: AiProviderConfigSchema,
  containerConfig: ContainerConfigSchema,
  securitySettings: SecuritySettingsSchema,
  rsolvApiKey: z.string().optional(), // For vended credentials
  maxIssues: z.number().min(1).optional(), // Maximum number of issues to process
  useGitBasedEditing: z.boolean().optional(), // Enable git-based in-place editing (ADR-012)
  useStructuredPhases: z.boolean().optional(), // Enable structured phased prompting (ADR-019)
  testGeneration: TestGenerationConfigSchema.optional(),
  fixValidation: FixValidationConfigSchema.optional()
});

/**
 * Load configuration from various sources
 */
export async function loadConfig(): Promise<ActionConfig> {
  try {
    logger.info('Loading configuration');
    
    // Start with default configuration
    const defaultConfig = getDefaultConfig();
    
    // Load configuration from file if available
    const configPath = process.env.RSOLV_CONFIG_PATH || '.github/rsolv.yml';
    const fileConfig = await loadConfigFromFile(configPath);
    
    // Load configuration from environment variables
    const envConfig = loadConfigFromEnv();
    
    // Merge configurations (priority: env > file > default)
    // Special handling for nested objects to preserve all properties
    const mergedConfig = {
      ...defaultConfig,
      ...fileConfig,
      ...envConfig,
      // Ensure aiProvider properties are properly merged
      aiProvider: {
        ...defaultConfig.aiProvider,
        ...fileConfig.aiProvider,
        ...envConfig.aiProvider
      },
      containerConfig: {
        ...defaultConfig.containerConfig,
        ...fileConfig.containerConfig,
        ...envConfig.containerConfig
      },
      securitySettings: {
        ...defaultConfig.securitySettings,
        ...fileConfig.securitySettings,
        ...envConfig.securitySettings
      }
    };
    
    // Validate configuration
    const validatedConfig = validateConfig(mergedConfig);
    
    // Set RSOLV_API_KEY environment variable if using vended credentials
    if (validatedConfig.aiProvider.useVendedCredentials && validatedConfig.rsolvApiKey) {
      process.env.RSOLV_API_KEY = validatedConfig.rsolvApiKey;
      logger.info('Set RSOLV_API_KEY environment variable for vended credentials (config loader)');
    }
    
    logger.debug('Configuration loaded successfully');
    logger.info(`Final config - rsolvApiKey: ${validatedConfig.rsolvApiKey ? 'present' : 'not set'}`);
    
    return validatedConfig;
  } catch (error) {
    logger.error('Failed to load configuration', error);
    throw new Error(`Configuration error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get default configuration
 */
function getDefaultConfig(): Partial<ActionConfig> {
  return {
    configPath: '.github/rsolv.yml',
    issueLabel: 'rsolv:automate',
    scanLabel: 'rsolv:detected',  // Label for issues found during scanning
    enableSecurityAnalysis: true,  // Enable security analysis by default
    maxIssues: undefined, // Process all issues by default
    useGitBasedEditing: true,  // Default to true for proper in-place editing (ADR-012)
    useStructuredPhases: true,  // Default to true - CLI approach works with structured phases
    aiProvider: {
      provider: 'claude-code',
      model: 'claude-sonnet-4-20250514',  // Claude Sonnet 4 - 64K output tokens, no truncation issues
      temperature: 0.2,
      // maxTokens intentionally omitted - resolved by token-utils based on use case
      contextLimit: 100000,
      timeout: 3600000, // 60 minutes for complex analysis, multi-LLM orchestration, and sequential thinking
      useVendedCredentials: true  // Default to using RSOLV vended credentials
    },
    containerConfig: {
      enabled: true,
      image: 'rsolv/code-analysis:latest',
      memoryLimit: '2g',
      cpuLimit: '1',
      timeout: 300,
      securityProfile: 'default'
    },
    securitySettings: {
      disableNetworkAccess: true,
      scanDependencies: true,
      preventSecretLeakage: true,
      maxFileSize: 1024 * 1024, // 1 MB
      timeoutSeconds: 300,
      requireCodeReview: true
    },
    testGeneration: {
      enabled: process.env.ENABLE_TEST_GENERATION === 'true',
      generateForVulnerabilities: true,
      includeInPR: true,
      validateFixes: process.env.ENABLE_FIX_VALIDATION === 'true',
      languages: process.env.TEST_GEN_LANGUAGES?.split(',') || ['javascript', 'typescript'],
      frameworks: {
        javascript: ['jest', 'mocha', 'vitest'],
        typescript: ['jest', 'mocha', 'vitest'],
        python: ['pytest', 'unittest'],
        ruby: ['rspec', 'minitest'],
        php: ['phpunit', 'pest'],
        java: ['junit5', 'testng']
      }
    },
    fixValidation: {
      enabled: (() => {
        const envValue = process.env.DISABLE_FIX_VALIDATION;
        const isDisabled = envValue === 'true';
        console.log(`[CONFIG DEBUG] DISABLE_FIX_VALIDATION env: "${envValue}"`);
        console.log(`[CONFIG DEBUG] Setting fixValidation.enabled to: ${!isDisabled}`);
        return !isDisabled;
      })(),
      maxIterations: 3,
      maxIterationsByType: {},
      maxIterationsByTier: {}
    }
  };
}

/**
 * Load configuration from file
 */
async function loadConfigFromFile(configPath: string): Promise<Partial<ActionConfig>> {
  try {
    // Check if file exists
    if (!fs.existsSync(configPath)) {
      logger.info(`Configuration file not found at ${configPath}, using defaults`);
      return {};
    }
    
    logger.info(`Loading configuration from ${configPath}`);
    
    // Read file content
    const fileContent = fs.readFileSync(configPath, 'utf8');
    
    // Parse YAML or JSON
    const fileConfig = yaml.load(fileContent) as Partial<ActionConfig>;
    
    logger.debug('Configuration file loaded successfully');
    
    return fileConfig || {};
  } catch (error) {
    logger.error(`Error loading configuration from file ${configPath}`, error);
    return {};
  }
}

/**
 * Load configuration from environment variables
 */
function loadConfigFromEnv(): Partial<ActionConfig> {
  logger.info('Loading configuration from environment variables');
  logger.info(`Environment RSOLV_API_KEY: ${process.env.RSOLV_API_KEY ? 'present' : 'not set'}`);
  
  // Map GitHub Actions inputs to environment variables
  // GitHub Actions sets inputs as INPUT_<UPPERCASE_NAME>
  const apiKey = process.env.RSOLV_API_KEY || 
                  process.env.INPUT_API_KEY || 
                  process.env.INPUT_RSOLVAPI_KEY || 
                  process.env.INPUT_RSOLVAPIKEY;
  
  const envConfig: Partial<ActionConfig> = {
    apiKey: apiKey,
    rsolvApiKey: apiKey, // Same key used for vended credentials
    configPath: process.env.RSOLV_CONFIG_PATH || process.env.INPUT_CONFIG_PATH,
    issueLabel: process.env.RSOLV_ISSUE_LABEL || process.env.INPUT_ISSUE_LABEL,
    repoToken: process.env.GITHUB_TOKEN
  };
  
  // Handle maxIssues separately to avoid NaN
  if (process.env.RSOLV_MAX_ISSUES) {
    const parsed = parseInt(process.env.RSOLV_MAX_ISSUES, 10);
    if (!isNaN(parsed)) {
      envConfig.maxIssues = parsed;
    }
  }
  
  // Handle useGitBasedEditing (ADR-012) - default to true
  if (process.env.RSOLV_USE_GIT_BASED_EDITING !== undefined) {
    envConfig.useGitBasedEditing = process.env.RSOLV_USE_GIT_BASED_EDITING === 'true';
  } else {
    envConfig.useGitBasedEditing = true; // Default to true for proper in-place editing
  }
  
  // Handle useStructuredPhases - default to true with CLI approach
  if (process.env.RSOLV_USE_STRUCTURED_PHASES !== undefined) {
    envConfig.useStructuredPhases = process.env.RSOLV_USE_STRUCTURED_PHASES === 'true';
  } else {
    envConfig.useStructuredPhases = true; // Default to true - CLI approach works with structured phases
  }
  
  // Parse environment variables JSON string if available
  if (process.env.RSOLV_ENVIRONMENT_VARIABLES) {
    try {
      envConfig.environmentVariables = JSON.parse(process.env.RSOLV_ENVIRONMENT_VARIABLES);
    } catch (error) {
      logger.error('Error parsing RSOLV_ENVIRONMENT_VARIABLES', error);
    }
  }
  
  // AI Provider configuration from environment
  if (process.env.RSOLV_AI_PROVIDER) {
    envConfig.aiProvider = {
      provider: process.env.RSOLV_AI_PROVIDER,
      apiKey: process.env.RSOLV_AI_API_KEY,
      model: process.env.RSOLV_AI_MODEL || 'claude-3-5-sonnet-20241022',
      baseUrl: process.env.RSOLV_AI_BASE_URL,
      // CRITICAL: Preserve useVendedCredentials flag - default to true per RFC-012
      useVendedCredentials: process.env.RSOLV_USE_VENDED_CREDENTIALS !== undefined ?
        process.env.RSOLV_USE_VENDED_CREDENTIALS === 'true' :
        true  // Default to true - vended credentials are the standard approach
    };

    if (process.env.RSOLV_AI_TEMPERATURE) {
      envConfig.aiProvider.temperature = parseFloat(process.env.RSOLV_AI_TEMPERATURE);
    }

    if (process.env.RSOLV_AI_MAX_TOKENS) {
      envConfig.aiProvider.maxTokens = parseInt(process.env.RSOLV_AI_MAX_TOKENS, 10);
    }
  }
  
  // Container configuration from environment
  if (process.env.RSOLV_CONTAINER_ENABLED !== undefined) {
    envConfig.containerConfig = {
      enabled: process.env.RSOLV_CONTAINER_ENABLED === 'true',
      image: process.env.RSOLV_CONTAINER_IMAGE,
      memoryLimit: process.env.RSOLV_CONTAINER_MEMORY_LIMIT,
      cpuLimit: process.env.RSOLV_CONTAINER_CPU_LIMIT
    };
    
    if (process.env.RSOLV_CONTAINER_TIMEOUT) {
      envConfig.containerConfig.timeout = parseInt(process.env.RSOLV_CONTAINER_TIMEOUT, 10);
    }
  }
  
  // Remove undefined values
  Object.keys(envConfig).forEach(key => {
    if (envConfig[key as keyof ActionConfig] === undefined) {
      delete envConfig[key as keyof ActionConfig];
    }
  });
  
  return envConfig;
}

/**
 * Validate configuration against schema
 */
function validateConfig(config: any): ActionConfig {
  logger.debug('Validating configuration');
  
  try {
    // Check required fields
    // When using vended credentials, rsolvApiKey is used instead of apiKey
    if (!config.apiKey && !config.rsolvApiKey) {
      throw new Error('API key or RSOLV API key is required');
    }
    
    // Validate against schema
    const validatedConfig = ActionConfigSchema.parse(config);
    
    logger.debug('Configuration validation successful');
    
    return validatedConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      logger.error(`Configuration validation failed: ${errorMessages}`);
      throw new Error(`Invalid configuration: ${errorMessages}`);
    }
    
    throw error;
  }
}