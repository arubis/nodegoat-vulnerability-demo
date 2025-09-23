// Bun has built-in fetch, no import needed

interface RsolvApiClientConfig {
  baseUrl: string;
  apiKey: string;
}

interface FixAttemptData {
  github_org: string;
  repo_name: string;
  issue_number?: number;
  pr_number: number;
  pr_title: string;
  pr_url: string;
  issue_title?: string;
  issue_url?: string;
  api_key_used: string;
  metadata?: {
    branch?: string;
    labels?: string[];
    created_by?: string;
    [key: string]: any;
  };
}

interface FixAttemptResponse {
  id: number;
  status: string;
  github_org: string;
  repo_name: string;
  pr_number: number;
  billing_status?: string;
}

interface VulnerabilityValidationRequest {
  vulnerabilities: Array<{
    id: string;
    patternId: string;
    filePath: string;
    line: number;
    code: string;
    severity: string;
  }>;
  files: Record<string, string>;
}

interface VulnerabilityValidationResponse {
  validated: Array<{
    id: string;
    isValid: boolean;
    confidence: number;
    reason?: string;
    astContext?: {
      inUserInputFlow: boolean;
      hasValidation: boolean;
    };
  }>;
  stats: {
    total: number;
    validated: number;
    rejected: number;
  };
}

interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class RsolvApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKeyOrConfig: string | RsolvApiClientConfig) {
    if (typeof apiKeyOrConfig === 'string') {
      // Support legacy string-only constructor
      this.apiKey = apiKeyOrConfig;
      this.baseUrl = process.env.RSOLV_API_URL || 'https://api.rsolv.dev';
    } else {
      this.baseUrl = apiKeyOrConfig.baseUrl;
      this.apiKey = apiKeyOrConfig.apiKey;
    }
  }

  // Alias for backward compatibility
  async createFixAttempt(fixAttempt: any): Promise<ApiResult<FixAttemptResponse>> {
    // Transform the test format to the expected API format
    const apiData: FixAttemptData = {
      github_org: fixAttempt.repository_full_name?.split('/')[0] || 'unknown',
      repo_name: fixAttempt.repository_full_name?.split('/')[1] || 'unknown',
      issue_number: fixAttempt.issue_number,
      pr_number: parseInt(fixAttempt.github_pr_url?.split('/').pop() || '0'),
      pr_title: fixAttempt.issue_title || 'RSOLV Fix',
      pr_url: fixAttempt.github_pr_url,
      issue_title: fixAttempt.issue_title,
      issue_url: fixAttempt.github_issue_url,
      api_key_used: this.apiKey,
      metadata: {
        ai_provider: fixAttempt.ai_provider,
        ai_model: fixAttempt.ai_model,
        security_vulnerabilities_found: fixAttempt.security_vulnerabilities_found,
        estimated_time_saved_hours: fixAttempt.estimated_time_saved_hours
      }
    };
    return this.recordFixAttempt(apiData);
  }

  async recordFixAttempt(fixAttempt: FixAttemptData): Promise<ApiResult<FixAttemptResponse>> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/fix-attempts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey
        },
        body: JSON.stringify(fixAttempt)
      });

      if (response.ok) {
        const data = await response.json() as FixAttemptResponse;
        return {
          success: true,
          data
        };
      } else {
        const errorData = await response.json();
        return {
          success: false,
          error: `API Error: ${response.status} - ${JSON.stringify(errorData)}`
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Validate vulnerabilities using server-side AST analysis
   * 
   * @param request - Vulnerabilities and file contents to validate
   * @returns Validation results with confidence scores
   * 
   * @example
   * ```typescript
   * const response = await client.validateVulnerabilities({
   *   vulnerabilities: [{ id: 'v1', patternId: 'eval', ... }],
   *   files: { 'app.js': 'eval(userInput);' }
   * });
   * ```
   */
  async validateVulnerabilities(
    request: VulnerabilityValidationRequest
  ): Promise<VulnerabilityValidationResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/vulnerabilities/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Validation API error: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<VulnerabilityValidationResponse>;
  }
}