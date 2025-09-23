import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScanOrchestrator } from '../scan-orchestrator.js';
import { logger } from '../../utils/logger.js';
import type { ScanConfig, VulnerabilityGroup } from '../types.js';

// Mock dependencies
vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));
vi.mock('../../github/api.js', () => ({
  getGitHubClient: vi.fn(() => ({
    issues: {
      create: vi.fn().mockResolvedValue({
        data: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test/test/issues/123'
        }
      })
    }
  }))
}));

describe('ScanOrchestrator - max_issues bug', () => {
  let orchestrator: ScanOrchestrator;
  const mockLogger = logger as any;

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator = new ScanOrchestrator();
  });

  describe('RED - Shows the bug existed before fix', () => {
    it.skip('BEFORE FIX: would pass all groups to createIssuesFromGroups ignoring max_issues', async () => {
      const config: ScanConfig = {
        repository: {
          owner: 'test',
          name: 'repo',
          defaultBranch: 'main'
        },
        createIssues: true,
        maxIssues: 2, // Limit to 2 issues
        scanDirectory: '.',
        excludePaths: []
      };

      // Create 8 vulnerability groups (like in the real scenario)
      const groups: VulnerabilityGroup[] = Array.from({ length: 8 }, (_, i) => ({
        type: `vuln-type-${i}`,
        severity: 'high',
        count: 1,
        files: [`file${i}.js`],
        vulnerabilities: [{
          type: `vuln-type-${i}`,
          severity: 'high',
          confidence: 'high',
          message: `Vulnerability ${i}`,
          filePath: `file${i}.js`,
          line: 10,
          column: 5,
          snippet: 'vulnerable code',
          description: `Description ${i}`
        }]
      }));

      // Mock the scanner to return 8 groups
      orchestrator['scanner'].scan = vi.fn().mockResolvedValue({
        vulnerabilities: groups.flatMap(g => g.vulnerabilities),
        groupedVulnerabilities: groups,
        stats: {
          totalFiles: 8,
          scannedFiles: 8,
          vulnerabilities: 8
        }
      });

      // Spy on createIssuesFromGroups to see what it's called with
      const createIssuesSpy = vi.spyOn(orchestrator['issueCreator'], 'createIssuesFromGroups')
        .mockResolvedValue([
          { number: 1, title: 'Issue 1', url: 'url1' },
          { number: 2, title: 'Issue 2', url: 'url2' }
        ]);

      await orchestrator.performScan(config);

      // BUG: createIssuesFromGroups is called with ALL 8 groups, not just 2
      expect(createIssuesSpy).toHaveBeenCalledWith(
        expect.anything(), // This will be all 8 groups - BUG!
        config
      );

      // This test PASSES showing the bug - it gets all 8 groups
      const passedGroups = createIssuesSpy.mock.calls[0][0];
      expect(passedGroups).toHaveLength(8); // Bug: should be 2!
    });
  });

  describe('GREEN - After the fix', () => {
    it('should only pass limited groups to createIssuesFromGroups', async () => {
      const config: ScanConfig = {
        repository: {
          owner: 'test',
          name: 'repo',
          defaultBranch: 'main'
        },
        createIssues: true,
        maxIssues: 2,
        scanDirectory: '.',
        excludePaths: []
      };

      // Create 8 vulnerability groups
      const groups: VulnerabilityGroup[] = Array.from({ length: 8 }, (_, i) => ({
        type: `vuln-type-${i}`,
        severity: 'high',
        count: 1,
        files: [`file${i}.js`],
        vulnerabilities: [{
          type: `vuln-type-${i}`,
          severity: 'high',
          confidence: 'high',
          message: `Vulnerability ${i}`,
          filePath: `file${i}.js`,
          line: 10,
          column: 5,
          snippet: 'vulnerable code',
          description: `Description ${i}`
        }]
      }));

      orchestrator['scanner'].scan = vi.fn().mockResolvedValue({
        vulnerabilities: groups.flatMap(g => g.vulnerabilities),
        groupedVulnerabilities: groups,
        stats: {
          totalFiles: 8,
          scannedFiles: 8,
          vulnerabilities: 8
        }
      });

      // Spy on createIssuesFromGroups to verify it's called with limited groups
      const createIssuesSpy = vi.spyOn(orchestrator['issueCreator'], 'createIssuesFromGroups')
        .mockResolvedValue([
          { number: 1, title: 'Issue 1', url: 'url1' },
          { number: 2, title: 'Issue 2', url: 'url2' }
        ]);

      await orchestrator.performScan(config);

      // After fix: createIssuesFromGroups should only get 2 groups
      expect(createIssuesSpy).toHaveBeenCalledTimes(1);
      const passedGroups = createIssuesSpy.mock.calls[0][0];
      expect(passedGroups).toHaveLength(2); // Should only get 2 groups!

      // Verify the first 2 groups were passed (not random ones)
      expect(passedGroups[0].type).toBe('vuln-type-0');
      expect(passedGroups[1].type).toBe('vuln-type-1');
    });

    it('should only create number of issues specified by max_issues', async () => {
      const config: ScanConfig = {
        repository: {
          owner: 'test',
          name: 'repo',
          defaultBranch: 'main'
        },
        createIssues: true,
        maxIssues: 2,
        scanDirectory: '.',
        excludePaths: []
      };

      const groups: VulnerabilityGroup[] = Array.from({ length: 8 }, (_, i) => ({
        type: `vuln-type-${i}`,
        severity: 'high',
        count: 1,
        files: [`file${i}.js`],
        vulnerabilities: [{
          type: `vuln-type-${i}`,
          severity: 'high',
          confidence: 'high',
          message: `Vulnerability ${i}`,
          filePath: `file${i}.js`,
          line: 10,
          column: 5,
          snippet: 'vulnerable code',
          description: `Description ${i}`
        }]
      }));

      orchestrator['scanner'].scan = vi.fn().mockResolvedValue({
        vulnerabilities: groups.flatMap(g => g.vulnerabilities),
        groupedVulnerabilities: groups,
        stats: {
          totalFiles: 8,
          scannedFiles: 8,
          vulnerabilities: 8
        },
        createdIssues: []
      });

      const result = await orchestrator.performScan(config);

      // Should only create 2 issues despite having 8 groups
      expect(result.createdIssues).toHaveLength(2);
    });
  });

  describe('REFACTOR - Maintain functionality', () => {
    it('should still create all issues when no max_issues limit', async () => {
      const config: ScanConfig = {
        repository: {
          owner: 'test',
          name: 'repo',
          defaultBranch: 'main'
        },
        createIssues: true,
        // No maxIssues set
        scanDirectory: '.',
        excludePaths: []
      };

      const groups: VulnerabilityGroup[] = Array.from({ length: 5 }, (_, i) => ({
        type: `vuln-type-${i}`,
        severity: 'high',
        count: 1,
        files: [`file${i}.js`],
        vulnerabilities: [{
          type: `vuln-type-${i}`,
          severity: 'high',
          confidence: 'high',
          message: `Vulnerability ${i}`,
          filePath: `file${i}.js`,
          line: 10,
          column: 5,
          snippet: 'vulnerable code',
          description: `Description ${i}`
        }]
      }));

      orchestrator['scanner'].scan = vi.fn().mockResolvedValue({
        vulnerabilities: groups.flatMap(g => g.vulnerabilities),
        groupedVulnerabilities: groups,
        stats: {
          totalFiles: 5,
          scannedFiles: 5,
          vulnerabilities: 5
        },
        createdIssues: []
      });

      const result = await orchestrator.performScan(config);

      // Should create all 5 issues when no limit
      expect(result.createdIssues).toHaveLength(5);
    });

    it('should handle edge cases correctly', async () => {
      const config: ScanConfig = {
        repository: {
          owner: 'test',
          name: 'repo',
          defaultBranch: 'main'
        },
        createIssues: true,
        maxIssues: 10, // Limit higher than actual groups
        scanDirectory: '.',
        excludePaths: []
      };

      const groups: VulnerabilityGroup[] = Array.from({ length: 3 }, (_, i) => ({
        type: `vuln-type-${i}`,
        severity: 'high',
        count: 1,
        files: [`file${i}.js`],
        vulnerabilities: [{
          type: `vuln-type-${i}`,
          severity: 'high',
          confidence: 'high',
          message: `Vulnerability ${i}`,
          filePath: `file${i}.js`,
          line: 10,
          column: 5,
          snippet: 'vulnerable code',
          description: `Description ${i}`
        }]
      }));

      orchestrator['scanner'].scan = vi.fn().mockResolvedValue({
        vulnerabilities: groups.flatMap(g => g.vulnerabilities),
        groupedVulnerabilities: groups,
        stats: {
          totalFiles: 3,
          scannedFiles: 3,
          vulnerabilities: 3
        },
        createdIssues: []
      });

      const result = await orchestrator.performScan(config);

      // Should create all 3 issues when limit is higher
      expect(result.createdIssues).toHaveLength(3);
    });
  });
});