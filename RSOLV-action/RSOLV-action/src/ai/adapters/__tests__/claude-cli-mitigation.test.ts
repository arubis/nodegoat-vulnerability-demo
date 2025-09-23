/**
 * Test to verify that mitigation phase uses Claude CLI when vended credentials are enabled
 * This addresses the issue where the system was falling back to SDK API calls with invalid model IDs
 */

import { GitBasedClaudeCodeAdapter } from '../claude-code-git.js';
import { AIConfig } from '../../types.js';
import { IssueContext } from '../../../types/index.js';
import { IssueAnalysis } from '../../types.js';

describe('Claude CLI Usage in Mitigation', () => {
  const mockConfig: AIConfig = {
    provider: 'anthropic',
    apiKey: 'test-key',
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.1,
    maxTokens: 4000,
    useVendedCredentials: true, // This should force CLI usage
  };

  const mockIssue: IssueContext = {
    id: 'test-issue',
    number: 123,
    title: 'Test Security Issue',
    body: 'Test issue body',
    labels: [],
    assignees: [],
    repository: {
      owner: 'test-owner',
      name: 'test-repo',
      fullName: 'test-owner/test-repo',
      defaultBranch: 'main',
    },
    source: 'github',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {},
  };

  const mockAnalysis: IssueAnalysis = {
    summary: 'Test vulnerability analysis',
    complexity: 'medium',
    estimatedTime: 30,
    potentialFixes: ['Fix approach'],
    recommendedApproach: 'Apply security fix',
    relatedFiles: ['test.js'],
  };

  it('should use Claude CLI when vended credentials are enabled', async () => {
    // Create adapter with vended credentials enabled
    const adapter = new GitBasedClaudeCodeAdapter(mockConfig, process.cwd());

    // Create spy on the CLI adapter's generateSolution method
    const cliGenerateSolutionSpy = jest.spyOn(
      adapter.cliAdapter,
      'generateSolution'
    );

    // Mock the CLI adapter to return a successful result
    cliGenerateSolutionSpy.mockResolvedValue({
      success: true,
      message: 'Mock CLI solution generated',
      changes: { 'test.js': 'fixed code' },
    });

    // Create spy on the parent (SDK) generateSolution method
    const sdkGenerateSolutionSpy = jest.spyOn(
      GitBasedClaudeCodeAdapter.prototype,
      'generateSolution'
    );

    try {
      // Call generateSolutionWithGit
      await adapter.generateSolutionWithGit(mockIssue, mockAnalysis);

      // Verify that CLI adapter was called
      expect(cliGenerateSolutionSpy).toHaveBeenCalledTimes(1);
      expect(cliGenerateSolutionSpy).toHaveBeenCalledWith(
        mockIssue,
        mockAnalysis,
        expect.any(String)
      );

      // Verify that SDK adapter was NOT called (since CLI should succeed)
      expect(sdkGenerateSolutionSpy).not.toHaveBeenCalled();
    } finally {
      // Clean up spies
      cliGenerateSolutionSpy.mockRestore();
      sdkGenerateSolutionSpy.mockRestore();
    }
  });

  it('should use Claude CLI when RSOLV_USE_CLI is true', async () => {
    // Set environment variable
    process.env.RSOLV_USE_CLI = 'true';

    const configWithoutVendedCreds: AIConfig = {
      ...mockConfig,
      useVendedCredentials: false,
    };

    const adapter = new GitBasedClaudeCodeAdapter(
      configWithoutVendedCreds,
      process.cwd()
    );

    const cliGenerateSolutionSpy = jest.spyOn(
      adapter.cliAdapter,
      'generateSolution'
    );

    cliGenerateSolutionSpy.mockResolvedValue({
      success: true,
      message: 'Mock CLI solution generated',
      changes: { 'test.js': 'fixed code' },
    });

    try {
      await adapter.generateSolutionWithGit(mockIssue, mockAnalysis);

      expect(cliGenerateSolutionSpy).toHaveBeenCalledTimes(1);
    } finally {
      cliGenerateSolutionSpy.mockRestore();
      delete process.env.RSOLV_USE_CLI;
    }
  });

  it('should use Claude CLI when structured phases are enabled', async () => {
    const configWithStructuredPhases: AIConfig = {
      ...mockConfig,
      useVendedCredentials: false,
      claudeCodeConfig: {
        useStructuredPhases: true,
      },
    };

    const adapter = new GitBasedClaudeCodeAdapter(
      configWithStructuredPhases,
      process.cwd()
    );

    const cliGenerateSolutionSpy = jest.spyOn(
      adapter.cliAdapter,
      'generateSolution'
    );

    cliGenerateSolutionSpy.mockResolvedValue({
      success: true,
      message: 'Mock CLI solution generated',
      changes: { 'test.js': 'fixed code' },
    });

    try {
      await adapter.generateSolutionWithGit(mockIssue, mockAnalysis);

      expect(cliGenerateSolutionSpy).toHaveBeenCalledTimes(1);
    } finally {
      cliGenerateSolutionSpy.mockRestore();
    }
  });

  it('should NOT fall back to SDK when vended credentials are enabled and CLI fails', async () => {
    const adapter = new GitBasedClaudeCodeAdapter(mockConfig, process.cwd());

    const cliGenerateSolutionSpy = jest.spyOn(
      adapter.cliAdapter,
      'generateSolution'
    );

    // Mock CLI adapter to fail
    cliGenerateSolutionSpy.mockRejectedValue(
      new Error('Claude CLI not available')
    );

    const sdkGenerateSolutionSpy = jest.spyOn(
      GitBasedClaudeCodeAdapter.prototype,
      'generateSolution'
    );

    try {
      // This should throw since CLI fails and we shouldn't fall back to SDK with vended creds
      await expect(
        adapter.generateSolutionWithGit(mockIssue, mockAnalysis)
      ).rejects.toThrow();

      // Verify CLI was attempted
      expect(cliGenerateSolutionSpy).toHaveBeenCalledTimes(1);

      // Verify SDK was NOT called as fallback
      expect(sdkGenerateSolutionSpy).not.toHaveBeenCalled();
    } finally {
      cliGenerateSolutionSpy.mockRestore();
      sdkGenerateSolutionSpy.mockRestore();
    }
  });
});