/**
 * TDD test for Claude Code CLI credential format validation
 * Addresses the "invalid x-api-key" authentication error discovered in workflow 17873531908
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RetryableClaudeCodeCLI } from '../claude-code-cli-retry';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock logger to capture debug output
vi.mock('../../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

describe('Claude Code CLI Credential Format Validation', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let mockLogger: any;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_CODE_MAX_API_KEY;
    delete process.env.RSOLV_DEV_MODE;

    // Get the mocked logger
    const loggerModule = await import('../../../utils/logger.js');
    mockLogger = loggerModule.logger;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('RED - Failing tests (TDD)', () => {
    it('should validate credential format before passing to Claude CLI', async () => {
      // GIVEN: A vended credential that might be malformed
      const mockCredentialManager = {
        getCredential: vi.fn().mockReturnValue('malformed-key-without-proper-format')
      };

      // WHEN: generateSolution is called
      const adapter = new RetryableClaudeCodeCLI(
        {
          apiKey: '',
          model: 'claude-3-sonnet-20240229',
          baseUrl: 'https://api.anthropic.com'
        },
        '/test/repo',
        mockCredentialManager
      );

      const result = await adapter.generateSolution(
        {
          owner: 'test',
          repo: 'repo',
          issue_number: 1,
          title: 'Test issue',
          body: 'Test body'
        },
        {
          severity: 'high',
          category: 'security',
          recommendation: 'Fix it',
          educationalContent: 'Learn about security'
        }
      );

      // THEN: Should validate credential format and log details
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Credential format validation')
      );

      // AND: Should log credential metadata (but not the actual key)
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('API key length:')
      );

      // AND: Should log credential prefix for debugging
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('API key prefix:')
      );

      // This test will fail initially because we haven't implemented the validation yet
    });

    it('should detect Anthropic API key format requirements', async () => {
      // GIVEN: Different credential formats
      const testCases = [
        { credential: 'sk-ant-api03-12345', isValid: true, description: 'Valid Anthropic format' },
        { credential: 'rsolv_temp_12345', isValid: false, description: 'RSOLV vended format (may need conversion)' },
        { credential: 'invalid-key', isValid: false, description: 'Invalid format' },
        { credential: '', isValid: false, description: 'Empty key' },
        { credential: null, isValid: false, description: 'Null key' }
      ];

      for (const testCase of testCases) {
        const mockCredentialManager = {
          getCredential: vi.fn().mockReturnValue(testCase.credential)
        };

        const adapter = new RetryableClaudeCodeCLI(
          {
            apiKey: '',
            model: 'claude-3-sonnet-20240229',
            baseUrl: 'https://api.anthropic.com'
          },
          '/test/repo',
          mockCredentialManager
        );

        const result = await adapter.generateSolution(
          {
            owner: 'test',
            repo: 'repo',
            issue_number: 1,
            title: 'Test issue',
            body: 'Test body'
          },
          {
            severity: 'high',
            category: 'security',
            recommendation: 'Fix it',
            educationalContent: 'Learn about security'
          }
        );

        // THEN: Should log credential validation result
        if (testCase.isValid) {
          expect(mockLogger.debug).toHaveBeenCalledWith(
            'Credential format validation: PASSED - Valid Anthropic API key format detected'
          );
        } else {
          expect(mockLogger.warn).toHaveBeenCalledWith(
            'Credential format validation: FAILED - credential format may be incompatible with Claude CLI'
          );
        }

        if (!testCase.isValid) {
          // Should warn about potentially incompatible format
          expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining('credential format may be incompatible')
          );
        }
      }

      // This test will fail initially because validation is not implemented
    });

    it('should log detailed debugging info when authentication fails', async () => {
      // GIVEN: A credential that causes authentication failure
      const mockCredentialManager = {
        getCredential: vi.fn().mockReturnValue('some-credential-123')
      };

      const adapter = new RetryableClaudeCodeCLI(
        {
          apiKey: '',
          model: 'claude-3-sonnet-20240229',
          baseUrl: 'https://api.anthropic.com'
        },
        '/test/repo',
        mockCredentialManager
      );

      // Mock the CLI execution to return authentication error
      vi.spyOn(adapter as any, 'executeCLI').mockResolvedValue({
        success: false,
        error: '[ERROR] Error streaming, falling back to non-streaming mode: 401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'
      });

      const result = await adapter.generateSolution(
        {
          owner: 'test',
          repo: 'repo',
          issue_number: 1,
          title: 'Test issue',
          body: 'Test body'
        },
        {
          severity: 'high',
          category: 'security',
          recommendation: 'Fix it',
          educationalContent: 'Learn about security'
        }
      );

      // THEN: Should log comprehensive debugging information
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Authentication failed - credential debugging info:'
      );

      // AND: Should log credential source
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Credential source: vended'
      );

      // AND: Should log environment variable confirmation
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('ANTHROPIC_API_KEY environment variable set:')
      );
    });
  });

  describe('GREEN - Passing tests (after implementation)', () => {
    it('should pass valid Anthropic credentials through successfully', async () => {
      // GIVEN: A properly formatted Anthropic API key
      const mockCredentialManager = {
        getCredential: vi.fn().mockReturnValue('sk-ant-api03-valid-key-12345')
      };

      const adapter = new RetryableClaudeCodeCLI(
        {
          apiKey: '',
          model: 'claude-3-sonnet-20240229',
          baseUrl: 'https://api.anthropic.com'
        },
        '/test/repo',
        mockCredentialManager
      );

      // Mock successful CLI execution
      vi.spyOn(adapter as any, 'executeCLI').mockResolvedValue({
        success: true,
        output: 'Fix applied successfully'
      });

      // Mock file modification detection
      vi.spyOn(adapter as any, 'getModifiedFiles').mockReturnValue(['file.js']);

      const result = await adapter.generateSolution(
        {
          owner: 'test',
          repo: 'repo',
          issue_number: 1,
          title: 'Test issue',
          body: 'Test body'
        },
        {
          severity: 'high',
          category: 'security',
          recommendation: 'Fix it',
          educationalContent: 'Learn about security'
        }
      );

      // THEN: Should succeed
      expect(result.success).toBe(true);

      // AND: Should log validation success
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Credential format validation starting...'
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Credential format validation: PASSED - Valid Anthropic API key format detected'
      );
    });
  });

  describe('Integration test - Real-world scenario', () => {
    it('should handle the exact scenario from workflow 17873531908', async () => {
      // GIVEN: RSOLV platform vends a credential (format from real logs)
      const mockCredentialManager = {
        getCredential: vi.fn().mockReturnValue('rsolv_-1U3...') // Real prefix from logs
      };

      const adapter = new RetryableClaudeCodeCLI(
        {
          apiKey: '',
          model: 'claude-sonnet-4-20250514', // Real model from logs
          baseUrl: 'https://api.anthropic.com'
        },
        '/github/workspace', // GitHub Actions workspace
        mockCredentialManager
      );

      // Mock CLI execution with authentication failure
      vi.spyOn(adapter as any, 'executeCLI').mockResolvedValue({
        success: false,
        error: 'Error streaming, falling back to non-streaming mode: 401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'
      });

      const result = await adapter.generateSolution(
        {
          owner: 'RSOLV-dev',
          repo: 'nodegoat-vulnerability-demo',
          issue_number: 517, // From real workflow
          title: 'NoSQL injection vulnerability',
          body: 'Vulnerability detected by RSOLV scanning'
        },
        {
          severity: 'critical',
          category: 'injection',
          recommendation: 'Fix NoSQL injection',
          educationalContent: 'NoSQL injection explanation'
        }
      );

      // THEN: Should log warning about credential format incompatibility
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Credential format validation: FAILED - credential format may be incompatible with Claude CLI'
      );

      // AND: Should log authentication failure debugging
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Authentication failed - credential debugging info:'
      );
    });
  });
});