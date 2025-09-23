import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RetryableClaudeCodeCLI } from '../claude-code-cli-retry';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock logger
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

describe('Claude Code CLI Vended Credentials', () => {
  let originalEnv: NodeJS.ProcessEnv;
  
  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
    
    // Clear any existing API keys
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_CODE_MAX_API_KEY;
    delete process.env.RSOLV_DEV_MODE;
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });

  describe('TDD: Vended credential handling', () => {
    it('should pass vended credentials to Claude CLI as ANTHROPIC_API_KEY', async () => {
      // GIVEN: A credential manager with vended credentials
      const mockCredentialManager = {
        getCredential: vi.fn().mockReturnValue('vended-api-key-123')
      };

      // AND: Claude CLI will be spawned
      const mockChildProcess = new EventEmitter() as any;
      mockChildProcess.stdin = { write: vi.fn(), end: vi.fn() };
      mockChildProcess.stdout = new EventEmitter();
      mockChildProcess.stderr = new EventEmitter();
      
      (spawn as any).mockReturnValue(mockChildProcess);

      // WHEN: generateSolution is called with vended credentials
      const adapter = new RetryableClaudeCodeCLI(
        { 
          apiKey: '', // No direct API key
          model: 'claude-3-sonnet-20240229',
          baseUrl: 'https://api.anthropic.com'
        },
        '/test/repo',
        mockCredentialManager
      );

      const resultPromise = adapter.generateSolution(
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

      // Simulate successful CLI execution
      setTimeout(() => {
        mockChildProcess.stdout.emit('data', Buffer.from('Solution generated'));
        mockChildProcess.emit('close', 0);
      }, 10);

      await resultPromise;

      // THEN: spawn should be called with ANTHROPIC_API_KEY set to vended credential
      expect(spawn).toHaveBeenCalledWith(
        'claude',
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            ANTHROPIC_API_KEY: 'vended-api-key-123'
          })
        })
      );
    });

    it('should fail gracefully when no credentials available', async () => {
      // GIVEN: No credentials available
      const mockCredentialManager = {
        getCredential: vi.fn().mockReturnValue(null)
      };

      // WHEN: generateSolution is called without any credentials
      const adapter = new RetryableClaudeCodeCLI(
        { 
          apiKey: '', // No direct API key
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

      // THEN: Should return error without calling spawn
      expect(result.success).toBe(false);
      expect(result.error).toContain('No API key or vended credentials available');
      expect(spawn).not.toHaveBeenCalled();
    });

    it('should use environment ANTHROPIC_API_KEY when no vended credentials', async () => {
      // GIVEN: ANTHROPIC_API_KEY is set in environment
      process.env.ANTHROPIC_API_KEY = 'env-api-key-456';
      
      // AND: No credential manager
      const mockChildProcess = new EventEmitter() as any;
      mockChildProcess.stdin = { write: vi.fn(), end: vi.fn() };
      mockChildProcess.stdout = new EventEmitter();
      mockChildProcess.stderr = new EventEmitter();
      
      (spawn as any).mockReturnValue(mockChildProcess);

      // WHEN: generateSolution is called
      const adapter = new RetryableClaudeCodeCLI(
        { 
          apiKey: '', // No direct API key
          model: 'claude-3-sonnet-20240229',
          baseUrl: 'https://api.anthropic.com'
        },
        '/test/repo'
        // No credential manager
      );

      const resultPromise = adapter.generateSolution(
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

      // Simulate successful CLI execution
      setTimeout(() => {
        mockChildProcess.stdout.emit('data', Buffer.from('Solution generated'));
        mockChildProcess.emit('close', 0);
      }, 10);

      await resultPromise;

      // THEN: spawn should use the environment API key
      expect(spawn).toHaveBeenCalledWith(
        'claude',
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            ANTHROPIC_API_KEY: 'env-api-key-456'
          })
        })
      );
    });

    it('should handle "Invalid API key" error from Claude CLI', async () => {
      // GIVEN: A credential manager with vended credentials
      const mockCredentialManager = {
        getCredential: vi.fn().mockReturnValue('vended-api-key-123')
      };

      // AND: Claude CLI will fail with invalid API key error
      const mockChildProcess = new EventEmitter() as any;
      mockChildProcess.stdin = { write: vi.fn(), end: vi.fn() };
      mockChildProcess.stdout = new EventEmitter();
      mockChildProcess.stderr = new EventEmitter();
      
      (spawn as any).mockReturnValue(mockChildProcess);

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

      const resultPromise = adapter.generateSolution(
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

      // Simulate CLI failure with "Invalid API key" message
      setTimeout(() => {
        mockChildProcess.stdout.emit('data', Buffer.from('Invalid API key · Fix external API key'));
        mockChildProcess.emit('close', 1);
      }, 10);

      const result = await resultPromise;

      // THEN: Should return error indicating API key issue
      expect(result.success).toBe(false);
      expect(result.error).toContain('Claude CLI exited with code 1');
      
      // AND: Should have attempted with the vended credential
      expect(spawn).toHaveBeenCalledWith(
        'claude',
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            ANTHROPIC_API_KEY: 'vended-api-key-123'
          })
        })
      );
    });
  });

  describe('Regression: Ensure vended credentials are used', () => {
    it('should not fail when vended credentials are properly configured', async () => {
      // This test ensures the issue we found doesn't regress
      // The problem was that vended credentials were obtained but not passed to Claude CLI
      
      // GIVEN: Platform vends valid credentials
      const mockCredentialManager = {
        getCredential: vi.fn().mockReturnValue('valid-vended-key')
      };

      // AND: Claude CLI mock that succeeds
      const mockChildProcess = new EventEmitter() as any;
      mockChildProcess.stdin = { write: vi.fn(), end: vi.fn() };
      mockChildProcess.stdout = new EventEmitter();
      mockChildProcess.stderr = new EventEmitter();
      
      (spawn as any).mockReturnValue(mockChildProcess);

      // WHEN: The action runs in GitHub with vended credentials
      const adapter = new RetryableClaudeCodeCLI(
        { 
          apiKey: '', // GitHub Action doesn't have direct key
          model: 'claude-3-sonnet-20240229',
          baseUrl: 'https://api.anthropic.com'
        },
        '/github/workspace', // GitHub workspace
        mockCredentialManager
      );

      const resultPromise = adapter.generateSolution(
        { 
          owner: 'RSOLV-dev', 
          repo: 'nodegoat-vulnerability-demo',
          issue_number: 517,
          title: 'NoSQL injection vulnerability',
          body: 'Fix the NoSQL injection'
        },
        {
          severity: 'critical',
          category: 'injection',
          recommendation: 'Use parameterized queries',
          educationalContent: 'NoSQL injection allows attackers...'
        }
      );

      // Simulate successful fix
      setTimeout(() => {
        mockChildProcess.stdout.emit('data', Buffer.from('Fixed vulnerability'));
        mockChildProcess.emit('close', 0);
      }, 10);

      const result = await resultPromise;

      // THEN: Fix should succeed
      expect(result.success).toBe(true);
      
      // AND: Vended credential should be passed to Claude CLI
      expect(mockCredentialManager.getCredential).toHaveBeenCalledWith('anthropic');
      expect(spawn).toHaveBeenCalledWith(
        'claude',
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            ANTHROPIC_API_KEY: 'valid-vended-key'
          })
        })
      );
    });
  });
});