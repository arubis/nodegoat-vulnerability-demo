/**
 * TDD Test for max_issues functionality in IssueCreator
 * RED-GREEN-REFACTOR approach
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IssueCreator } from '../issue-creator.js';
import type { VulnerabilityGroup, ScanConfig } from '../types.js';

// Mock the GitHub API client
vi.mock('../../github/api.js', () => ({
  getGitHubClient: () => ({
    issues: {
      create: vi.fn().mockImplementation(({ title }) =>
        Promise.resolve({
          data: {
            number: Math.floor(Math.random() * 1000),
            title,
            html_url: 'https://github.com/test/repo/issues/1'
          }
        })
      )
    }
  })
}));

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('IssueCreator - max_issues limit', () => {
  let issueCreator: IssueCreator;
  let mockConfig: ScanConfig;
  let mockGroups: VulnerabilityGroup[];

  beforeEach(() => {
    vi.clearAllMocks();
    issueCreator = new IssueCreator();

    mockConfig = {
      repository: {
        owner: 'test',
        name: 'repo',
        defaultBranch: 'main'
      },
      createIssues: true,
      issueLabel: 'security',
      batchSimilar: true
    };

    // Create mock vulnerability groups
    mockGroups = [
      {
        type: 'sql-injection',
        severity: 'high',
        count: 3,
        files: ['file1.js', 'file2.js'],
        vulnerabilities: []
      },
      {
        type: 'xss',
        severity: 'medium',
        count: 2,
        files: ['file3.js'],
        vulnerabilities: []
      },
      {
        type: 'command-injection',
        severity: 'critical',
        count: 1,
        files: ['file4.js'],
        vulnerabilities: []
      },
      {
        type: 'path-traversal',
        severity: 'high',
        count: 2,
        files: ['file5.js', 'file6.js'],
        vulnerabilities: []
      },
      {
        type: 'weak-crypto',
        severity: 'medium',
        count: 1,
        files: ['file7.js'],
        vulnerabilities: []
      }
    ];
  });

  describe('RED Tests - Prove the problem exists', () => {
    it('should create all issues when max_issues is not specified', async () => {
      // This test should PASS - proving unlimited issue creation works
      const result = await issueCreator.createIssuesFromGroups(mockGroups, mockConfig);

      expect(result).toHaveLength(5);
      expect(result.every(issue => issue.number > 0)).toBe(true);
    });

    it('should fail to limit issues when max_issues is set but not implemented', async () => {
      // This test should initially FAIL - proving we need the feature
      // After implementation, it should PASS
      mockConfig.maxIssues = 2;

      const result = await issueCreator.createIssuesFromGroups(mockGroups, mockConfig);

      // This assertion proves the feature works
      expect(result).toHaveLength(2);
      expect(result[0].vulnerabilityType).toBe('sql-injection');
      expect(result[1].vulnerabilityType).toBe('xss');
    });
  });

  describe('GREEN Tests - Verify the fix works', () => {
    it('should respect max_issues limit when set to 3', async () => {
      mockConfig.maxIssues = 3;

      const result = await issueCreator.createIssuesFromGroups(mockGroups, mockConfig);

      expect(result).toHaveLength(3);
      expect(result[0].vulnerabilityType).toBe('sql-injection');
      expect(result[1].vulnerabilityType).toBe('xss');
      expect(result[2].vulnerabilityType).toBe('command-injection');
    });

    it('should respect max_issues limit when set to 1', async () => {
      mockConfig.maxIssues = 1;

      const result = await issueCreator.createIssuesFromGroups(mockGroups, mockConfig);

      expect(result).toHaveLength(1);
      expect(result[0].vulnerabilityType).toBe('sql-injection');
    });

    it('should handle max_issues of 0 by creating no issues', async () => {
      mockConfig.maxIssues = 0;

      const result = await issueCreator.createIssuesFromGroups(mockGroups, mockConfig);

      expect(result).toHaveLength(0);
    });

    it('should handle max_issues larger than available groups', async () => {
      mockConfig.maxIssues = 10;

      const result = await issueCreator.createIssuesFromGroups(mockGroups, mockConfig);

      // Should create all 5 groups, not more
      expect(result).toHaveLength(5);
    });
  });

  describe('REFACTOR Tests - Ensure functionality is preserved', () => {
    it('should still respect createIssues flag when false', async () => {
      mockConfig.createIssues = false;
      mockConfig.maxIssues = 3;

      const result = await issueCreator.createIssuesFromGroups(mockGroups, mockConfig);

      expect(result).toHaveLength(0);
    });

    it('should maintain issue creation order (highest severity first)', async () => {
      // Reorder groups by severity for this test
      const orderedGroups = [
        mockGroups[2], // critical
        mockGroups[0], // high
        mockGroups[3], // high
        mockGroups[1], // medium
        mockGroups[4]  // medium
      ];

      mockConfig.maxIssues = 3;

      const result = await issueCreator.createIssuesFromGroups(orderedGroups, mockConfig);

      expect(result).toHaveLength(3);
      expect(result[0].vulnerabilityType).toBe('command-injection'); // critical
      expect(result[1].vulnerabilityType).toBe('sql-injection'); // high
      expect(result[2].vulnerabilityType).toBe('path-traversal'); // high
    });

    it('should log appropriate messages when limiting issues', async () => {
      const { logger } = await import('../../utils/logger.js');
      mockConfig.maxIssues = 2;

      await issueCreator.createIssuesFromGroups(mockGroups, mockConfig);

      // Verify logging behavior
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('limited by max_issues: 2')
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('3 vulnerability groups will be skipped')
      );
    });

    it('should handle empty vulnerability groups array', async () => {
      mockConfig.maxIssues = 5;

      const result = await issueCreator.createIssuesFromGroups([], mockConfig);

      expect(result).toHaveLength(0);
    });

    it('should continue creating issues even if one fails', async () => {
      const github = (await import('../../github/api.js')).getGitHubClient();
      const createMock = github.issues.create as any;

      // Make the second issue creation fail
      createMock.mockImplementationOnce(() => Promise.resolve({
        data: { number: 1, title: 'Issue 1', html_url: 'url1' }
      }))
      .mockImplementationOnce(() => Promise.reject(new Error('API Error')))
      .mockImplementationOnce(() => Promise.resolve({
        data: { number: 3, title: 'Issue 3', html_url: 'url3' }
      }));

      mockConfig.maxIssues = 3;

      const result = await issueCreator.createIssuesFromGroups(mockGroups.slice(0, 3), mockConfig);

      // Should have created 2 issues (1st and 3rd), skipping the failed 2nd
      expect(result).toHaveLength(2);
      expect(result[0].vulnerabilityType).toBe('sql-injection');
      expect(result[1].vulnerabilityType).toBe('command-injection');
    });
  });
});