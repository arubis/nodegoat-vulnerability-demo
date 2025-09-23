import { logger } from '../utils/logger.js';

export interface ProviderCredential {
  api_key: string;
  expires_at: string;
}

export interface CredentialExchangeResponse {
  credentials: Record<string, ProviderCredential>;
  usage: {
    remaining_fixes: number;
    reset_at: string;
  };
}

export interface UsageReport {
  tokensUsed: number;
  requestCount: number;
}

export class RSOLVCredentialManager {
  private credentials: Map<string, ProviderCredential> = new Map();
  private apiKey: string | null = null;
  private refreshTimers: Map<string, NodeJS.Timeout> = new Map();
  private rsolvApiUrl: string = process.env.RSOLV_API_URL || 'https://api.rsolv.ai';

  async initialize(apiKey: string): Promise<void> {
    this.apiKey = apiKey;
    logger.info('Initializing RSOLV credential manager');

    try {
      const requestBody = {
        api_key: apiKey,
        providers: ['anthropic', 'openai', 'openrouter'],
        ttl_minutes: 60
      };
      
      logger.info(`Requesting credential exchange from ${this.rsolvApiUrl}/api/v1/credentials/exchange`);
      
      const response = await fetch(`${this.rsolvApiUrl}/api/v1/credentials/exchange`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'X-GitHub-Job': process.env.GITHUB_JOB || '',
          'X-GitHub-Run': process.env.GITHUB_RUN_ID || ''
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(15000) // 15 second timeout to prevent hanging
      });

      if (!response.ok) {
        const error = await response.json();
        logger.error(`Credential exchange failed - Status: ${response.status}, Body:`, error);
        throw new Error(`Failed to exchange credentials: ${error.error || response.statusText}`);
      }

      const data: CredentialExchangeResponse = await response.json();
      
      // Check if response has expected structure
      if (!data || !data.credentials) {
        logger.error('Invalid credential exchange response:', data);
        throw new Error('Invalid response from credential exchange API');
      }
      
      // Store credentials
      Object.entries(data.credentials).forEach(([provider, credential]) => {
        logger.debug(`Storing credential for ${provider}`, { 
          hasApiKey: !!credential.api_key,
          apiKeyLength: credential.api_key?.length || 0,
          expiresAt: credential.expires_at 
        });
        this.credentials.set(provider, credential);
      });

      // Log remaining fixes if available
      if (data.usage?.remaining_fixes !== undefined) {
        logger.info(`Credentials initialized. Remaining fixes: ${data.usage.remaining_fixes}`);
      } else {
        logger.info('Credentials initialized');
      }
    } catch (error) {
      logger.error('Failed to initialize credentials', error);
      throw error;
    }
  }

  async getCredential(provider: string): Promise<string> {
    const credential = this.credentials.get(provider);
    
    logger.debug(`Getting credential for ${provider}`, {
      hasCredential: !!credential,
      hasApiKey: !!credential?.api_key,
      apiKeyLength: credential?.api_key?.length || 0
    });
    
    if (!credential) {
      throw new Error(`No valid credential for ${provider}`);
    }

    // Check if expired and refresh if needed
    const expiresAt = new Date(credential.expires_at);
    if (expiresAt < new Date()) {
      logger.info(`Credential for ${provider} expired, refreshing...`);
      await this.refreshCredentials();
      const refreshedCredential = this.credentials.get(provider);
      if (!refreshedCredential || !refreshedCredential.api_key) {
        throw new Error(`Failed to refresh credential for ${provider}`);
      }
      return refreshedCredential.api_key;
    }
    
    if (!credential.api_key) {
      throw new Error(`Credential for ${provider} has no API key`);
    }

    return credential.api_key;
  }

  private async refreshCredentials(): Promise<void> {
    if (!this.apiKey) {
      throw new Error('Cannot refresh credentials: API key not set');
    }
    
    logger.info('Refreshing expired credentials');
    
    try {
      const requestBody = {
        api_key: this.apiKey,
        providers: ['anthropic', 'openai', 'openrouter'],
        ttl_minutes: 60
      };
      
      const response = await fetch(`${this.rsolvApiUrl}/api/v1/credentials/exchange`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
          'X-GitHub-Job': process.env.GITHUB_JOB || '',
          'X-GitHub-Run': process.env.GITHUB_RUN_ID || ''
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) {
        const error = await response.json();
        logger.error(`Credential refresh failed - Status: ${response.status}, Body:`, error);
        throw new Error(`Failed to refresh credentials: ${error.error || response.statusText}`);
      }

      const data: CredentialExchangeResponse = await response.json();
      
      if (!data || !data.credentials) {
        logger.error('Invalid credential refresh response:', data);
        throw new Error('Invalid response from credential refresh API');
      }
      
      // Update stored credentials
      Object.entries(data.credentials).forEach(([provider, credential]) => {
        logger.debug(`Refreshed credential for ${provider}`, { 
          hasApiKey: !!credential.api_key,
          apiKeyLength: credential.api_key?.length || 0,
          expiresAt: credential.expires_at 
        });
        this.credentials.set(provider, credential);
      });
      
      logger.info('Successfully refreshed credentials');
    } catch (error) {
      logger.error('Failed to refresh credentials:', error);
      throw error;
    }
  }

  async reportUsage(provider: string, usage: UsageReport): Promise<void> {
    try {
      const response = await fetch(`${this.rsolvApiUrl}/api/v1/usage/report`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey || '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: provider,
          tokens_used: usage.tokensUsed,
          request_count: usage.requestCount,
          job_id: process.env.GITHUB_JOB
        }),
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (!response.ok) {
        logger.warn(`Failed to report usage for ${provider}: ${response.statusText}`);
      }
    } catch (error) {
      // Don't fail the operation if usage reporting fails
      logger.warn(`Error reporting usage for ${provider}:`, error);
    }
  }

  cleanup(): void {
    // Clear any scheduled refreshes
    this.refreshTimers.forEach(timer => clearTimeout(timer));
    this.refreshTimers.clear();
    
    // Clear stored credentials
    this.credentials.clear();
    
    logger.info('Credential manager cleaned up');
  }
}