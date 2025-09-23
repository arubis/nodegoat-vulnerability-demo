/**
 * Tests for RetryableClaudeCodeCLI with vended credentials
 * Ensures that vended credentials are properly set in the environment
 */

import { RetryableClaudeCodeCLI } from '../claude-code-cli-retry.js';
import type { IssueContext, IssueAnalysis } from '../../../types/index.js';
import type { AIConfig } from '../../types.js';

describe('RetryableClaudeCodeCLI - Vended Credentials', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let mockCredentialManager: any;
  
  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_CODE_MAX_API_KEY;
    delete process.env.RSOLV_DEV_MODE;
    delete process.env.USE_CLAUDE_CODE_MAX;
    
    // Mock credential manager
    mockCredentialManager = {
      getCredential: jest.fn().mockReturnValue('vended-api-key-123')
    };
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });
  
  describe('Vended Credential Handling', () => {
    it('should set ANTHROPIC_API_KEY from vended credentials before executing CLI', async () => {
      const config: AIConfig = {
        provider: 'claude-code-cli',
        apiKey: '',
        timeout: 60000
      };
      
      const adapter = new RetryableClaudeCodeCLI(config, '/test/repo', mockCredentialManager);
      
      const issueContext: IssueContext = {
        title: 'Test vulnerability',
        body: 'Test description',
        issueNumber: 1,
        files: []
      };
      
      const analysis: IssueAnalysis = {
        issueType: 'security',
        vulnerabilityType: 'XSS',
        affectedFiles: [],
        suggestedFix: 'Fix XSS',
        complexity: 'low'
      };
      
      // Mock the executeCLI to capture the environment
      let capturedEnv: any;
      (adapter as any).executeCLI = jest.fn().mockImplementation((prompt: string, options: any) => {
        capturedEnv = options.env;
        return Promise.resolve({
          success: false,
          output: 'Mocked output'
        });
      });
      
      // Mock getModifiedFiles
      (adapter as any).getModifiedFiles = jest.fn().mockReturnValue([]);
      
      await adapter.generateSolution(issueContext, analysis);
      
      // Verify credential manager was called
      expect(mockCredentialManager.getCredential).toHaveBeenCalledWith('anthropic');
      
      // Verify process.env was set BEFORE CLI execution
      expect(process.env.ANTHROPIC_API_KEY).toBe('vended-api-key-123');
      
      // Verify the environment passed to executeCLI also has the key
      expect(capturedEnv.ANTHROPIC_API_KEY).toBe('vended-api-key-123');
    });
    
    it('should use vended credentials in production mode', async () => {
      const config: AIConfig = {
        provider: 'claude-code-cli',
        apiKey: '',
        timeout: 60000
      };
      
      const adapter = new RetryableClaudeCodeCLI(config, '/test/repo', mockCredentialManager);
      
      // Ensure not in dev mode
      process.env.RSOLV_DEV_MODE = 'false';
      
      const issueContext: IssueContext = {
        title: 'Test vulnerability',
        body: 'Test description',
        issueNumber: 1,
        files: []
      };
      
      const analysis: IssueAnalysis = {
        issueType: 'security',
        vulnerabilityType: 'XSS',
        affectedFiles: [],
        suggestedFix: 'Fix XSS',
        complexity: 'low'
      };
      
      // Mock the executeWithRetry method to check the environment
      let apiKeyUsed: string | undefined;
      (adapter as any).executeWithRetry = jest.fn().mockImplementation((prompt: string, options: any) => {
        apiKeyUsed = options.env.ANTHROPIC_API_KEY;
        return Promise.resolve({
          success: false,
          output: 'Mocked output'
        });
      });
      
      // Mock getModifiedFiles
      (adapter as any).getModifiedFiles = jest.fn().mockReturnValue([]);
      
      await adapter.generateSolution(issueContext, analysis);
      
      // Verify vended credentials were used
      expect(mockCredentialManager.getCredential).toHaveBeenCalledWith('anthropic');
      expect(apiKeyUsed).toBe('vended-api-key-123');
      expect(process.env.ANTHROPIC_API_KEY).toBe('vended-api-key-123');
    });
    
    it('should prefer environment variable over vended credentials when available', async () => {
      // Set environment variable
      process.env.ANTHROPIC_API_KEY = 'env-api-key-456';
      
      const config: AIConfig = {
        provider: 'claude-code-cli',
        apiKey: '',
        timeout: 60000
      };
      
      const adapter = new RetryableClaudeCodeCLI(config, '/test/repo', mockCredentialManager);
      
      const issueContext: IssueContext = {
        title: 'Test vulnerability',
        body: 'Test description',
        issueNumber: 1,
        files: []
      };
      
      const analysis: IssueAnalysis = {
        issueType: 'security',
        vulnerabilityType: 'XSS',
        affectedFiles: [],
        suggestedFix: 'Fix XSS',
        complexity: 'low'
      };
      
      // Mock the executeWithRetry method
      let apiKeyUsed: string | undefined;
      (adapter as any).executeWithRetry = jest.fn().mockImplementation((prompt: string, options: any) => {
        apiKeyUsed = options.env.ANTHROPIC_API_KEY;
        return Promise.resolve({
          success: false,
          output: 'Mocked output'
        });
      });
      
      // Mock getModifiedFiles
      (adapter as any).getModifiedFiles = jest.fn().mockReturnValue([]);
      
      await adapter.generateSolution(issueContext, analysis);
      
      // Should not call credential manager when env var is present
      expect(mockCredentialManager.getCredential).not.toHaveBeenCalled();
      
      // Should use environment variable
      expect(apiKeyUsed).toBe('env-api-key-456');
      expect(process.env.ANTHROPIC_API_KEY).toBe('env-api-key-456');
    });
  });
  
  describe('Error Handling', () => {
    it('should return error when no API key is available', async () => {
      // No environment variable and credential manager returns null
      mockCredentialManager.getCredential.mockReturnValue(null);
      
      const config: AIConfig = {
        provider: 'claude-code-cli',
        apiKey: '',
        timeout: 60000
      };
      
      const adapter = new RetryableClaudeCodeCLI(config, '/test/repo', mockCredentialManager);
      
      const issueContext: IssueContext = {
        title: 'Test vulnerability',
        body: 'Test description',
        issueNumber: 1,
        files: []
      };
      
      const analysis: IssueAnalysis = {
        issueType: 'security',
        vulnerabilityType: 'XSS',
        affectedFiles: [],
        suggestedFix: 'Fix XSS',
        complexity: 'low'
      };
      
      const result = await adapter.generateSolution(issueContext, analysis);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('No API key or vended credentials available');
    });
    
    it('should handle credential manager errors gracefully', async () => {
      // Credential manager throws an error
      mockCredentialManager.getCredential.mockImplementation(() => {
        throw new Error('Credential manager error');
      });
      
      const config: AIConfig = {
        provider: 'claude-code-cli',
        apiKey: '',
        timeout: 60000
      };
      
      const adapter = new RetryableClaudeCodeCLI(config, '/test/repo', mockCredentialManager);
      
      const issueContext: IssueContext = {
        title: 'Test vulnerability',
        body: 'Test description',
        issueNumber: 1,
        files: []
      };
      
      const analysis: IssueAnalysis = {
        issueType: 'security',
        vulnerabilityType: 'XSS',
        affectedFiles: [],
        suggestedFix: 'Fix XSS',
        complexity: 'low'
      };
      
      const result = await adapter.generateSolution(issueContext, analysis);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('No API key or vended credentials available');
    });
  });
});