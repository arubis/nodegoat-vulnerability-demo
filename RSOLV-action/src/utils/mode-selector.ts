/**
 * Mode selection utilities for three-phase architecture
 * Implements RFC-041 mode selection decisions
 */

export type ExecutionMode = 'scan' | 'validate' | 'mitigate' | 'full' | 'validate-only' | 'validate-and-fix' | 'fix-only';

const VALID_MODES: ExecutionMode[] = ['scan', 'validate', 'mitigate', 'full', 'validate-only', 'validate-and-fix', 'fix-only'];

export interface ModeRequirements {
  requiresIssue: boolean;
  requiresScanData: boolean;
  requiresValidation: boolean;
}

/**
 * Extract mode from command line arguments
 * Supports --mode <value> and --mode=<value> syntax
 */
export function getModeFromArgs(): string | undefined {
  const args = process.argv.slice(2);
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    // Handle --mode=value syntax
    if (arg.startsWith('--mode=')) {
      return arg.substring('--mode='.length);
    }
    
    // Handle --mode value syntax
    if (arg === '--mode' && i + 1 < args.length) {
      return args[i + 1];
    }
  }
  
  return undefined;
}

/**
 * Get execution mode with proper precedence:
 * 1. CLI args (highest priority)
 * 2. RSOLV_MODE environment variable
 * 3. Legacy RSOLV_SCAN_MODE (for backward compatibility)
 * 4. Default to 'fix' mode
 */
export function getExecutionMode(): ExecutionMode {
  // 1. Check CLI args first
  const cliMode = getModeFromArgs();
  if (cliMode && validateMode(cliMode)) {
    return cliMode as ExecutionMode;
  }
  
  // 2. Check RSOLV_MODE env var or GitHub Actions input
  const envMode = process.env.RSOLV_MODE || process.env.INPUT_MODE;
  if (envMode && validateMode(envMode)) {
    return envMode as ExecutionMode;
  }
  
  // 3. Check legacy RSOLV_SCAN_MODE for backward compatibility
  const legacyMode = process.env.RSOLV_SCAN_MODE;
  if (legacyMode === 'scan') {
    return 'scan';
  }
  
  // 4. Default to 'full' mode (all phases)
  return 'full';
}

/**
 * Validate that a mode string is valid
 */
export function validateMode(mode: string): boolean {
  return VALID_MODES.includes(mode as ExecutionMode);
}

/**
 * Get requirements for a specific mode
 */
export function getModeRequirements(mode: ExecutionMode): ModeRequirements {
  switch (mode) {
    case 'scan':
      return {
        requiresIssue: false,
        requiresScanData: false,
        requiresValidation: false
      };

    case 'validate':
    case 'validate-only':
      return {
        requiresIssue: true, // Or scan data
        requiresScanData: false, // Either/or with issue
        requiresValidation: false
      };

    case 'mitigate':
    case 'fix-only':
      return {
        requiresIssue: true,
        requiresScanData: false,
        requiresValidation: true
      };

    case 'validate-and-fix':
      return {
        requiresIssue: true,
        requiresScanData: false,
        requiresValidation: false // Will run validation then mitigation
      };

    case 'full':
      return {
        requiresIssue: false, // Full mode does everything
        requiresScanData: false,
        requiresValidation: false
      };

    default:
      throw new Error(`Unknown mode: ${mode}`);
  }
}

/**
 * Get a human-readable description of the mode
 */
export function getModeDescription(mode: ExecutionMode): string {
  switch (mode) {
    case 'scan':
      return 'Scan for vulnerabilities and create issues';
    case 'validate':
    case 'validate-only':
      return 'Validate vulnerabilities with failing tests';
    case 'mitigate':
    case 'fix-only':
      return 'Fix validated vulnerabilities';
    case 'validate-and-fix':
      return 'Validate and fix vulnerabilities for specific issues';
    case 'full':
      return 'Run all phases: scan, validate, and mitigate';
    default:
      return 'Unknown mode';
  }
}