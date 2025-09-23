import { AiProviderConfig } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { RSOLVCredentialManager } from '../credentials/manager.js';
import { CredentialManagerSingleton } from '../credentials/singleton.js';
import { sanitizeErrorMessage } from '../utils/error-sanitizer.js';
import { resolveMaxTokens } from './token-utils.js';

/**
 * Interface for AI client implementations
 */
export interface AiClient {
  complete(prompt: string, options?: CompletionOptions): Promise<string>;
  streamComplete?(prompt: string, callback: (chunk: string) => void, options?: CompletionOptions): Promise<void>;
}

/**
 * Options for AI completions
 */
export interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

/**
 * Factory function to create an appropriate AI client based on provider config
 */
export async function getAiClient(config: AiProviderConfig): Promise<AiClient> {
  // Initialize credential manager if using vended credentials
  let credentialManager: RSOLVCredentialManager | null = null;
  
  if (config.useVendedCredentials) {
    try {
      const rsolvApiKey = process.env.RSOLV_API_KEY;
      if (!rsolvApiKey) {
        throw new Error('RSOLV_API_KEY environment variable not set for vended credentials');
      }
      
      logger.info('Getting credential manager singleton for vended credentials');
      credentialManager = await CredentialManagerSingleton.getInstance(rsolvApiKey);
      logger.info('Credential manager singleton retrieved successfully');
    } catch (error) {
      logger.error('Failed to get credential manager singleton', error);
      // Don't fall back - let the error propagate when trying to use the credentials
      // This preserves the intent to use vended credentials
      throw error; // Re-throw to prevent creating clients with null credential manager
    }
  }
  
  switch (config.provider.toLowerCase()) {
  case 'openai':
    return new OpenAiClient(config, credentialManager);
  case 'anthropic':
  case 'claude-code':
    // Claude Code uses Anthropic Claude models under the hood
    return new AnthropicClient(config, credentialManager);
  case 'mistral':
    return new MistralClient(config, credentialManager);
  case 'ollama':
    return new OllamaClient(config, credentialManager);
  default:
    throw new Error(`Unsupported AI provider: ${config.provider}`);
  }
}

/**
 * OpenAI client implementation
 */
class OpenAiClient implements AiClient {
  private config: AiProviderConfig;
  private credentialManager?: RSOLVCredentialManager | null;
  
  constructor(config: AiProviderConfig, credentialManager?: RSOLVCredentialManager | null) {
    this.config = config;
    this.credentialManager = credentialManager;
    
    if (!config.useVendedCredentials && !config.apiKey) {
      throw new Error('AI provider API key is required');
    }
  }
  
  async complete(prompt: string, options: CompletionOptions = {}): Promise<string> {
    try {
      logger.debug('Sending request to AI provider', { prompt: prompt.substring(0, 100) + '...' });
      
      // Make actual API call to OpenAI
      const response = await this.makeApiCall(prompt, options);
      
      return response;
    } catch (error) {
      logger.error('AI provider API error', error);
      throw new Error(sanitizeErrorMessage(`AI provider error: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
  
  // Make real API call to OpenAI
  private async makeApiCall(prompt: string, options: CompletionOptions): Promise<string> {
    try {
      const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';
      const model = options.model || this.config.model || 'gpt-4';
      const temperature = options.temperature ?? this.config.temperature ?? 0.2;
      const maxTokens = resolveMaxTokens(options, this.config, 'STANDARD');
      
      // If in test mode, fall back to mock response
      if (process.env.NODE_ENV === 'test' && !process.env.FORCE_REAL_AI) {
        logger.warn('Using mock response in test mode');
        return this.getMockResponse(prompt);
      }
      
      // Prepare the request body
      const requestBody = {
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens,
        top_p: options.topP ?? 1,
        frequency_penalty: options.frequencyPenalty ?? 0,
        presence_penalty: options.presencePenalty ?? 0
      };
      
      // Get API key (vended or direct)
      let apiKey: string | undefined;
      
      try {
        apiKey = this.config.useVendedCredentials 
          ? await this.credentialManager?.getCredential('openai')
          : this.config.apiKey;
      } catch (error) {
        throw new Error('Failed to retrieve API key');
      }
      
      if (!apiKey) {
        throw new Error('Failed to retrieve API key');
      }
      
      // Make the API call
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
      });
      
      // Handle errors
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(sanitizeErrorMessage(`AI provider error (${response.status}): ${errorData.error?.message || response.statusText}`));
      }
      
      // Parse the response
      const data = await response.json();
      
      // Extract the completion text
      const result = data.choices[0]?.message?.content || '';
      
      // Report usage if using vended credentials
      if (this.config.useVendedCredentials && this.credentialManager) {
        const tokensUsed = data.usage?.total_tokens || 0;
        await this.credentialManager.reportUsage('openai', {
          tokensUsed,
          requestCount: 1
        });
      }
      
      return result;
    } catch (error) {
      logger.error('Error calling AI provider API', error);
      
      // In development, fall back to mock response if API call fails
      // Disabled for E2E testing - we want real errors
      // if (process.env.NODE_ENV === 'development') {
      //   logger.warn('Using mock response due to API error');
      //   return this.getMockResponse(prompt);
      // }
      
      throw error;
    }
  }
  
  // Get mock response for testing and development fallback
  private getMockResponse(_prompt: string): string {
    return `Analysis of the issue:

This appears to be a bug in the authentication system where token validation is failing for valid tokens that contain special characters. The issue is likely in the token parsing logic.

Files to modify:
- \`src/auth/tokenValidator.js\`
- \`src/utils/stringEscaping.js\`

Suggested Approach:
The token validator is not properly handling URL-encoded characters. We need to update the validation function to properly decode tokens before validation, and ensure that special characters are correctly handled throughout the authentication flow.`;
  }
}

/**
 * Anthropic client implementation
 */
class AnthropicClient implements AiClient {
  private config: AiProviderConfig;
  private credentialManager?: RSOLVCredentialManager | null;
  
  constructor(config: AiProviderConfig, credentialManager?: RSOLVCredentialManager | null) {
    this.config = config;
    this.credentialManager = credentialManager;
    
    // Only throw if we're not using vended credentials AND no API key is provided
    // If using vended credentials, we'll check for the credential manager later when making API calls
    if (!config.useVendedCredentials && !config.apiKey) {
      throw new Error('AI provider API key is required');
    }
  }
  
  async complete(prompt: string, options: CompletionOptions = {}): Promise<string> {
    try {
      logger.debug('Sending request to AI provider', { prompt: prompt.substring(0, 100) + '...' });
      
      // Make actual API call to Anthropic
      const response = await this.makeApiCall(prompt, options);
      
      return response;
    } catch (error) {
      logger.error('AI provider API error', error);
      throw new Error(sanitizeErrorMessage(`AI provider error: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
  
  // Make real API call to Anthropic
  private async makeApiCall(prompt: string, options: CompletionOptions): Promise<string> {
    try {
      const baseUrl = this.config.baseUrl || 'https://api.anthropic.com';
      const model = options.model || this.config.model || 'claude-3-sonnet-20240229';
      const temperature = options.temperature ?? this.config.temperature ?? 0.2;
      const maxTokens = resolveMaxTokens(options, this.config, 'STANDARD');
      
      // If in test mode, fall back to mock response
      if (process.env.NODE_ENV === 'test' && !process.env.FORCE_REAL_AI) {
        logger.warn('Using mock response in test mode');
        return this.getMockResponse(prompt);
      }
      
      // Prepare the request body
      const requestBody = {
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens,
        top_p: options.topP ?? 1
      };

      // Log request details for debugging
      logger.info(`[API Request Debug] Model: ${model}, Temperature: ${temperature}, MaxTokens: ${maxTokens}`);
      logger.info(`[API Request Debug] Prompt length: ${prompt.length} characters`);
      logger.debug(`[API Request Debug] Prompt preview (first 500 chars): ${prompt.substring(0, 500)}`);
      logger.debug(`[API Request Debug] Using vended credentials: ${this.config.useVendedCredentials}`);
      
      // Get API key (vended or direct)
      let apiKey: string | undefined;
      
      try {
        if (this.config.useVendedCredentials) {
          logger.debug(`Attempting to get vended credential - credentialManager exists: ${!!this.credentialManager}`);
          if (!this.credentialManager) {
            throw new Error('Credential manager not initialized for vended credentials');
          }
          apiKey = await this.credentialManager.getCredential('anthropic');
        } else {
          apiKey = this.config.apiKey;
        }
      } catch (error) {
        logger.error('Failed to get API key', { 
          useVended: this.config.useVendedCredentials,
          hasCredentialManager: !!this.credentialManager,
          error: error instanceof Error ? error.message : String(error)
        });
        throw new Error(`Failed to retrieve API key: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      if (!apiKey) {
        throw new Error('Failed to retrieve API key - key is empty');
      }
      
      // Make the API call
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(requestBody)
      });
      
      // Handle errors
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(sanitizeErrorMessage(`AI provider error (${response.status}): ${errorData.error?.message || response.statusText}`));
      }
      
      // Parse the response
      const data = await response.json();

      // Extract the completion text
      const result = data.content?.[0]?.text || '';

      // Enhanced debugging for truncation investigation
      logger.info(`[API Response Debug] Status: ${response.status}, Model: ${model}`);
      logger.info(`[API Response Debug] Requested maxTokens: ${maxTokens}`);
      logger.info(`[API Response Debug] Response usage - input: ${data.usage?.input_tokens}, output: ${data.usage?.output_tokens}, total: ${data.usage?.total_tokens}`);
      logger.info(`[API Response Debug] Response length: ${result.length} characters`);
      logger.info(`[API Response Debug] Stop reason: ${data.stop_reason}`);

      // Check if response was truncated by the model
      if (data.stop_reason === 'max_tokens') {
        logger.warn(`[API Response Debug] Response truncated at max_tokens limit! Output tokens: ${data.usage?.output_tokens}`);
      }

      // Log the tail of the response to see truncation point
      if (result.length > 200) {
        logger.debug(`[API Response Debug] Response tail: ${result.substring(result.length - 200)}`);
      }

      // Report usage if using vended credentials
      if (this.config.useVendedCredentials && this.credentialManager) {
        const tokensUsed = data.usage?.total_tokens || 0;
        await this.credentialManager.reportUsage('anthropic', {
          tokensUsed,
          requestCount: 1
        });
      }

      return result;
    } catch (error) {
      logger.error('Error calling AI provider API', error);
      
      // In development, fall back to mock response if API call fails
      // Disabled for E2E testing - we want real errors
      // if (process.env.NODE_ENV === 'development') {
      //   logger.warn('Using mock response due to API error');
      //   return this.getMockResponse(prompt);
      // }
      
      throw error;
    }
  }
  
  // Get mock response for testing and development fallback
  private getMockResponse(_prompt: string): string {
    return `Based on my analysis, this is a performance issue in the data processing pipeline.

The main bottleneck appears to be in the file processing function that's not properly streaming large files, leading to excessive memory usage.

Files that need modification:
- \`src/services/fileProcessor.js\`
- \`src/utils/streamHandler.js\`

This is a medium complexity issue that will require implementing proper stream processing instead of loading the entire file into memory. The fix should significantly reduce memory usage and improve processing speed.`;
  }
}

/**
 * Mistral client implementation
 */
class MistralClient implements AiClient {
  private config: AiProviderConfig;
  private credentialManager?: RSOLVCredentialManager | null;
  
  constructor(config: AiProviderConfig, credentialManager?: RSOLVCredentialManager | null) {
    this.config = config;
    this.credentialManager = credentialManager;
    
    if (!config.useVendedCredentials && !config.apiKey) {
      throw new Error('AI provider API key is required');
    }
  }
  
  async complete(prompt: string, options: CompletionOptions = {}): Promise<string> {
    try {
      logger.debug('Sending request to AI provider', { prompt: prompt.substring(0, 100) + '...' });
      
      // Simulate API call for development purposes
      const response = await this.simulateApiCall(prompt, options);
      
      return response;
    } catch (error) {
      logger.error('AI provider API error', error);
      throw new Error(sanitizeErrorMessage(`AI provider error: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
  
  // Simulate API call for development
  private async simulateApiCall(_prompt: string, _options: CompletionOptions): Promise<string> {
    // Add a small delay to simulate network latency
    await new Promise(resolve => setTimeout(resolve, 550));
    
    // Return a mock response
    return `This is a documentation issue where the installation instructions are unclear for Windows users.

The documentation needs to be updated to include Windows-specific commands and requirements.

Files to modify:
- \`docs/installation.md\`
- \`README.md\`

This is a simple fix that involves adding a new section for Windows installation instructions, including how to set up the environment variables correctly and handle path differences.`;
  }
}

/**
 * Ollama client implementation (for local model deployment)
 */
class OllamaClient implements AiClient {
  private config: AiProviderConfig;
  private credentialManager?: RSOLVCredentialManager | null;
  
  constructor(config: AiProviderConfig, credentialManager?: RSOLVCredentialManager | null) {
    this.config = config;
    this.credentialManager = credentialManager;
  }
  
  async complete(prompt: string, options: CompletionOptions = {}): Promise<string> {
    try {
      logger.debug('Sending request to AI provider', { prompt: prompt.substring(0, 100) + '...' });
      
      // Simulate API call for development purposes
      const response = await this.simulateApiCall(prompt, options);
      
      return response;
    } catch (error) {
      logger.error('AI provider API error', error);
      throw new Error(sanitizeErrorMessage(`AI provider error: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
  
  // Simulate API call for development
  private async simulateApiCall(_prompt: string, _options: CompletionOptions): Promise<string> {
    // Add a small delay to simulate inference time
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Return a mock response
    return `I've analyzed the feature request for adding pagination to the API endpoints.

This is a medium complexity task that will require modifying multiple files:
- \`src/controllers/userController.js\`
- \`src/services/queryService.js\`
- \`src/middleware/pagination.js\` (new file needed)

The approach should be to create a reusable pagination middleware that can be applied to all list endpoints. This will require updating the query service to support limit and offset parameters, and updating the controllers to use the new middleware.`;
  }
}