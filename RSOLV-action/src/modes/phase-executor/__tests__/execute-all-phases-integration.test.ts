/**
 * Integration test for executeAllPhases orchestration
 * Tests that the three phases are properly connected:
 * SCAN (creates issues) -> VALIDATE (tests them) -> MITIGATE (fixes them)
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { PhaseExecutor } from '../index.js';
import type { ActionConfig, IssueContext } from '../../../types/index.js';

// Mock GitHub API
vi.mock('../../../github/api.js', () => ({
  getIssue: vi.fn(),
  getIssues: vi.fn(),
  addLabels: vi.fn(),
  removeLabel: vi.fn()
}));

// Mock scanner
vi.mock('../../../scanner/index.js', () => ({
  ScanOrchestrator: vi.fn().mockImplementation(() => ({
    performScan: vi.fn()
  }))
}));

describe('PhaseExecutor - executeAllPhases Integration', () => {
  let executor: PhaseExecutor;
  let mockConfig: ActionConfig;
  let mockGetIssue: any;
  let mockScanOrchestrator: any;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Set test mode
    process.env.RSOLV_TESTING_MODE = 'true';

    // Import mocked modules
    const githubApi = await import('../../../github/api.js');
    mockGetIssue = githubApi.getIssue as any;

    const { ScanOrchestrator } = await import('../../../scanner/index.js');
    mockScanOrchestrator = new (ScanOrchestrator as any)();

    // Setup config
    mockConfig = {
      githubToken: 'test-token',
      repository: {
        owner: 'RSOLV-dev',
        name: 'nodegoat-vulnerability-demo'
      },
      issueLabel: 'rsolv:detected',
      rsolvApiKey: 'test-api-key',
      maxIssues: 2, // Limit to 2 issues as requested
      aiProvider: {
        name: 'claude-code',
        useVendedCredentials: true
      },
      fixValidation: {
        enabled: false // Disable for faster testing
      }
    } as ActionConfig;

    executor = new PhaseExecutor(mockConfig);
  });

  afterEach(() => {
    delete process.env.RSOLV_TESTING_MODE;
  });

  test('should orchestrate all three phases with issue limiting', async () => {
    // Arrange: Mock scan creating 4 issues but limited to 2
    const mockCreatedIssues = [
      { number: 101, url: 'https://github.com/RSOLV-dev/nodegoat/issues/101' },
      { number: 102, url: 'https://github.com/RSOLV-dev/nodegoat/issues/102' }
    ];

    mockScanOrchestrator.performScan.mockResolvedValue({
      vulnerabilities: [
        { file: 'app.js', line: 10, type: 'xss' },
        { file: 'db.js', line: 20, type: 'sql_injection' },
        { file: 'auth.js', line: 30, type: 'weak_crypto' },
        { file: 'upload.js', line: 40, type: 'path_traversal' }
      ],
      createdIssues: mockCreatedIssues, // Only 2 created due to maxIssues
      totalFilesScanned: 53,
      summary: '4 vulnerabilities found, 2 issues created (limited by max_issues)'
    });

    // Mock getIssue to return full issue details
    const mockIssues: IssueContext[] = [
      {
        number: 101,
        title: '🔒 XSS vulnerabilities found',
        body: 'Found XSS in app.js',
        labels: ['rsolv:detected', 'security'],
        repository: mockConfig.repository,
        url: mockCreatedIssues[0].url
      },
      {
        number: 102,
        title: '🔒 SQL Injection vulnerabilities found',
        body: 'Found SQL injection in db.js',
        labels: ['rsolv:detected', 'security'],
        repository: mockConfig.repository,
        url: mockCreatedIssues[1].url
      }
    ];

    mockGetIssue
      .mockResolvedValueOnce(mockIssues[0])
      .mockResolvedValueOnce(mockIssues[1]);

    // Mock validation phase
    const mockValidateVulnerability = vi.fn()
      .mockResolvedValueOnce({
        issueId: 101,
        validated: true,
        testResults: { success: true },
        timestamp: new Date().toISOString()
      })
      .mockResolvedValueOnce({
        issueId: 102,
        validated: true,
        testResults: { success: true },
        timestamp: new Date().toISOString()
      });

    // Mock mitigation phase
    const mockExecuteMitigate = vi.fn()
      .mockResolvedValueOnce({
        success: true,
        phase: 'mitigate',
        data: {
          mitigation: {
            'issue-101': {
              fixed: true,
              prUrl: 'https://github.com/RSOLV-dev/nodegoat/pull/201'
            }
          }
        }
      })
      .mockResolvedValueOnce({
        success: true,
        phase: 'mitigate',
        data: {
          mitigation: {
            'issue-102': {
              fixed: true,
              prUrl: 'https://github.com/RSOLV-dev/nodegoat/pull/202'
            }
          }
        }
      });

    // Inject mocks for validation and mitigation
    executor['getScanner'] = () => mockScanOrchestrator;
    executor['validationMode'] = { validateVulnerability: mockValidateVulnerability };
    executor.executeMitigate = mockExecuteMitigate;

    // Act: Execute all phases
    const result = await executor.executeAllPhases({
      repository: mockConfig.repository
    });

    // Assert: Verify the orchestration
    expect(result.success).toBe(true);
    expect(result.phase).toBe('full');

    // Verify scan was called
    expect(mockScanOrchestrator.performScan).toHaveBeenCalledWith(
      expect.objectContaining({
        maxIssues: 2 // Respect the limit
      })
    );

    // Verify issues were fetched after scan
    expect(mockGetIssue).toHaveBeenCalledTimes(2);
    expect(mockGetIssue).toHaveBeenCalledWith(
      'RSOLV-dev',
      'nodegoat-vulnerability-demo',
      101
    );
    expect(mockGetIssue).toHaveBeenCalledWith(
      'RSOLV-dev',
      'nodegoat-vulnerability-demo',
      102
    );

    // Verify validation was called for each issue
    expect(mockValidateVulnerability).toHaveBeenCalledTimes(2);
    expect(mockValidateVulnerability).toHaveBeenCalledWith(mockIssues[0]);
    expect(mockValidateVulnerability).toHaveBeenCalledWith(mockIssues[1]);

    // Verify mitigation was called for validated issues
    expect(mockExecuteMitigate).toHaveBeenCalledTimes(2);
    expect(mockExecuteMitigate).toHaveBeenCalledWith(
      expect.objectContaining({
        issues: [mockIssues[0]]
      })
    );
    expect(mockExecuteMitigate).toHaveBeenCalledWith(
      expect.objectContaining({
        issues: [mockIssues[1]]
      })
    );

    // Verify the summary message
    expect(result.message).toContain('2 issues processed');
    expect(result.message).toContain('2 validated');
    expect(result.message).toContain('2 mitigated');
  });

  test('should handle partial success (some issues fail validation)', async () => {
    // Arrange: Create 2 issues, 1 validates, 1 doesn't
    const mockCreatedIssues = [
      { number: 201, url: 'https://github.com/RSOLV-dev/nodegoat/issues/201' },
      { number: 202, url: 'https://github.com/RSOLV-dev/nodegoat/issues/202' }
    ];

    mockScanOrchestrator.performScan.mockResolvedValue({
      vulnerabilities: [
        { file: 'app.js', line: 10, type: 'xss' },
        { file: 'false-positive.js', line: 20, type: 'not_real' }
      ],
      createdIssues: mockCreatedIssues
    });

    const mockIssues: IssueContext[] = [
      {
        number: 201,
        title: '🔒 XSS vulnerabilities found',
        body: 'Real vulnerability',
        labels: ['rsolv:detected'],
        repository: mockConfig.repository,
        url: mockCreatedIssues[0].url
      },
      {
        number: 202,
        title: '🔒 False positive',
        body: 'Not a real issue',
        labels: ['rsolv:detected'],
        repository: mockConfig.repository,
        url: mockCreatedIssues[1].url
      }
    ];

    mockGetIssue
      .mockResolvedValueOnce(mockIssues[0])
      .mockResolvedValueOnce(mockIssues[1]);

    const mockValidateVulnerability = vi.fn()
      .mockResolvedValueOnce({
        issueId: 201,
        validated: true,
        testResults: { success: true }
      })
      .mockResolvedValueOnce({
        issueId: 202,
        validated: false,
        falsePositiveReason: 'No actual vulnerability found'
      });

    const mockExecuteMitigate = vi.fn()
      .mockResolvedValueOnce({
        success: true,
        phase: 'mitigate',
        data: { mitigation: { 'issue-201': { fixed: true } } }
      });

    executor['getScanner'] = () => mockScanOrchestrator;
    executor['validationMode'] = { validateVulnerability: mockValidateVulnerability };
    executor.executeMitigate = mockExecuteMitigate;

    // Act
    const result = await executor.executeAllPhases({
      repository: mockConfig.repository
    });

    // Assert
    expect(result.success).toBe(true);
    expect(mockValidateVulnerability).toHaveBeenCalledTimes(2);
    expect(mockExecuteMitigate).toHaveBeenCalledTimes(1); // Only called for validated issue
    expect(result.message).toContain('2 issues processed');
    expect(result.message).toContain('1 validated');
    expect(result.message).toContain('1 mitigated');
  });

  test('should respect maxIssues configuration', async () => {
    // Arrange: Scanner finds 10 vulnerabilities but maxIssues is 2
    mockConfig.maxIssues = 2;
    executor = new PhaseExecutor(mockConfig);

    mockScanOrchestrator.performScan.mockResolvedValue({
      vulnerabilities: Array(10).fill({ file: 'test.js', line: 1, type: 'xss' }),
      createdIssues: [
        { number: 301, url: 'https://github.com/RSOLV-dev/nodegoat/issues/301' },
        { number: 302, url: 'https://github.com/RSOLV-dev/nodegoat/issues/302' }
      ],
      summary: '10 vulnerabilities found, 2 issues created (limited by max_issues)'
    });

    executor['getScanner'] = () => mockScanOrchestrator;

    // Act
    await executor.executeAllPhases({
      repository: mockConfig.repository
    });

    // Assert
    expect(mockScanOrchestrator.performScan).toHaveBeenCalledWith(
      expect.objectContaining({
        maxIssues: 2
      })
    );
    // Only 2 issues should be fetched
    expect(mockGetIssue).toHaveBeenCalledTimes(2);
  });

  test('should handle scan phase failure gracefully', async () => {
    // Arrange
    mockScanOrchestrator.performScan.mockRejectedValue(new Error('Scan failed'));
    executor['getScanner'] = () => mockScanOrchestrator;

    // Act
    const result = await executor.executeAllPhases({
      repository: mockConfig.repository
    });

    // Assert
    expect(result.success).toBe(false);
    expect(result.phase).toBe('scan');
    expect(result.error).toContain('Scan failed');
    expect(mockGetIssue).not.toHaveBeenCalled();
  });
});