// Quick fix for hanging GitHub Actions
// This file contains recommended timeout values to prevent hanging

export const TIMEOUT_CONFIG = {
  // Overall workflow timeout (2 minutes for all issues)
  WORKFLOW_TIMEOUT: 120000,
  
  // Per-issue timeout (20 seconds max per issue)
  ISSUE_TIMEOUT: 20000,
  
  // Claude Code execution timeout (30 seconds instead of 5 minutes)
  CLAUDE_CODE_TIMEOUT: 30000,
  
  // API request timeouts
  API_TIMEOUT: 10000,
  
  // Credential exchange timeout
  CREDENTIAL_TIMEOUT: 15000,
  
  // Context gathering timeout
  CONTEXT_TIMEOUT: 20000
};

// Helper to create AbortSignal with timeout
export function createTimeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

// Helper to wrap promises with timeout
export async function withTimeout<T>(
  promise: Promise<T>, 
  ms: number, 
  errorMessage?: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(errorMessage || `Operation timed out after ${ms}ms`));
    }, ms);
  });
  
  return Promise.race([promise, timeoutPromise]);
}