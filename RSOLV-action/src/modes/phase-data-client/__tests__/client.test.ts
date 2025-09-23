/**
 * TDD tests for PhaseDataClient
 * Following RFC-041 specification for phase data storage
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { PhaseDataClient, StoreResult, PhaseData } from '../index.js';

// Use vi.hoisted to make mock functions available during mock factory
const { mockWriteFile, mockMkdir, mockReadFile, mockAccess, mockReaddir } = vi.hoisted(() => ({
  mockWriteFile: vi.fn().mockResolvedValue(undefined),
  mockMkdir: vi.fn().mockResolvedValue(undefined),
  mockReadFile: vi.fn().mockResolvedValue('{}'),
  mockAccess: vi.fn().mockRejectedValue(new Error('File not found')),
  mockReaddir: vi.fn().mockResolvedValue([])
}));

// Mock fs/promises at module level
vi.mock('fs/promises', () => ({
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
  readFile: mockReadFile,
  access: mockAccess,
  readdir: mockReaddir
}));

// Mock child_process at module level
vi.mock('child_process', () => ({
  execSync: vi.fn().mockReturnValue('abc123\n')
}));

describe('PhaseDataClient', () => {
  let client: PhaseDataClient;
  const mockApiKey = 'test-api-key';
  const mockBaseUrl = 'https://test.api.rsolv.dev';

  beforeEach(() => {
    // Reset fetch mock
    global.fetch = vi.fn(async () => new Response());
  });

  describe('storePhaseResults', () => {
    test('should store phase results successfully', async () => {
      // RED: This test will fail because PhaseDataClient doesn't exist yet
      
      // Arrange
      client = new PhaseDataClient(mockApiKey, mockBaseUrl);
      
      const mockResponse = {
        success: true,
        id: 'phase-123',
        message: 'Phase data stored successfully'
      };
      
      global.fetch = vi.fn(async () => 
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const phaseData: PhaseData = {
        scan: {
          vulnerabilities: [
            { type: 'sql-injection', file: 'user.js', line: 42 }
          ],
          timestamp: '2025-08-06T10:00:00Z',
          commitHash: 'abc123'
        }
      };

      // Act
      const result = await client.storePhaseResults(
        'scan',
        phaseData,
        {
          repo: 'test-owner/test-repo',
          issueNumber: 123,
          commitSha: 'abc123'
        }
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.id).toBe('phase-123');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.api.rsolv.dev/api/v1/phases/store',
        expect.objectContaining({
          method: 'POST',
          headers: expect.any(Headers),
          body: expect.stringContaining('scan')
        })
      );
    });

    test('should include API key in headers', async () => {
      // Arrange
      client = new PhaseDataClient(mockApiKey);
      
      global.fetch = vi.fn(async (url: string, options?: RequestInit) => {
        // Capture the headers for verification
        const headers = options?.headers as Headers;
        expect(headers.get('X-API-Key')).toBe(mockApiKey);
        expect(headers.get('Content-Type')).toBe('application/json');
        
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      });

      // Act
      await client.storePhaseResults('scan', {}, {
        repo: 'test/repo',
        commitSha: 'abc123'
      });

      // Assert
      expect(global.fetch).toHaveBeenCalled();
    });

    test('should fall back to local storage on API failure', async () => {
      // Arrange
      client = new PhaseDataClient(mockApiKey);
      
      // Mock fetch to fail
      global.fetch = vi.fn(async () => {
        throw new Error('Network error');
      });

      // File system is mocked at module level

      // Act
      const result = await client.storePhaseResults('scan', {}, {
        repo: 'test/repo',
        commitSha: 'abc123'
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.storage).toBe('local');
      expect(result.warning).toContain('Platform unavailable');
    });
  });

  describe('retrievePhaseResults', () => {
    test('should retrieve phase results successfully', async () => {
      // Arrange
      client = new PhaseDataClient(mockApiKey, mockBaseUrl);
      
      const mockData: PhaseData = {
        scan: {
          vulnerabilities: [{ type: 'xss', file: 'view.js', line: 10 }],
          timestamp: '2025-08-06T11:00:00Z',
          commitHash: 'def456'
        }
      };
      
      global.fetch = vi.fn(async () => 
        new Response(JSON.stringify(mockData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      // Act
      const result = await client.retrievePhaseResults(
        'test/repo',
        123,
        'def456'
      );

      // Assert
      expect(result).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/phases/retrieve'),
        expect.objectContaining({
          headers: expect.any(Headers)
        })
      );
    });

    test('should return null for 404 responses', async () => {
      // Arrange
      client = new PhaseDataClient(mockApiKey);
      
      global.fetch = vi.fn(async () => 
        new Response('Not found', { status: 404 })
      );

      // Act
      const result = await client.retrievePhaseResults('test/repo', 123, 'abc');

      // Assert
      expect(result).toBe(null);
    });

    test('should fall back to local storage on API error', async () => {
      // Arrange
      client = new PhaseDataClient(mockApiKey);
      
      // Mock fetch to fail with non-404 error
      global.fetch = vi.fn(async () => 
        new Response('Server error', { status: 500 })
      );

      // Setup file system mocks for local retrieval
      mockReaddir.mockResolvedValueOnce(['test-repo-123-scan.json']);
      mockReadFile.mockResolvedValueOnce(JSON.stringify({
        phase: 'scan',
        data: { scan: { vulnerabilities: [] } },
        metadata: { commitSha: 'abc123' }
      }));

      // Act
      const result = await client.retrievePhaseResults('test-repo', 123, 'abc123');

      // Assert
      expect(result).toBeDefined();
      expect(result?.scan).toBeDefined();
    });
  });

  describe('validatePhaseTransition', () => {
    test('should validate allowed phase transitions', async () => {
      // Arrange
      client = new PhaseDataClient(mockApiKey);

      // Mock git command to return current commit
      // Mock child_process is already at module level, just change its return value
      const childProcess = await import('child_process');
      vi.mocked(childProcess.execSync).mockReturnValue('abc123\n' as any);

      // Act & Assert
      expect(await client.validatePhaseTransition('scan', 'validate', 'abc123')).toBe(true);
      expect(await client.validatePhaseTransition('validate', 'mitigate', 'abc123')).toBe(true);
      expect(await client.validatePhaseTransition('mitigate', 'scan', 'abc123')).toBe(false);
    });

    test('should reject transition if commit has changed', async () => {
      // Arrange
      client = new PhaseDataClient(mockApiKey);

      // Mock git to return different commit
      // Mock child_process is already at module level, just change its return value
      const childProcess = await import('child_process');
      vi.mocked(childProcess.execSync).mockReturnValue('different-commit\n' as any);

      // Act
      const result = await client.validatePhaseTransition('scan', 'validate', 'abc123');

      // Assert
      expect(result).toBe(false);
    });

    test('should use GITHUB_SHA when git is not available (act/Docker scenario)', async () => {
      // Arrange - This test demonstrates the fix for act Docker-in-Docker issue
      process.env.GITHUB_SHA = 'github-sha-123';
      client = new PhaseDataClient(mockApiKey);

      // Mock git command to fail (as it does in act Docker containers)
      const childProcess = await import('child_process');
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        throw new Error('fatal: not a git repository (or any of the parent directories): .git');
      });

      // Act
      const result = await client.validatePhaseTransition('scan', 'validate', 'github-sha-123');

      // Assert - Should still work using GITHUB_SHA
      expect(result).toBe(true);

      // Clean up
      delete process.env.GITHUB_SHA;
    });

    test('should fallback to dummy SHA when neither git nor GITHUB_SHA available', async () => {
      // Arrange
      delete process.env.GITHUB_SHA;
      client = new PhaseDataClient(mockApiKey);

      // Mock git command to fail
      const childProcess = await import('child_process');
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        throw new Error('fatal: not a git repository');
      });

      // Act - Should not throw, but use a fallback
      const result = await client.validatePhaseTransition('scan', 'validate', 'no-git-available');

      // Assert - Should work with the fallback value
      expect(result).toBe(true);
    });
  });
});