import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IssueCreator } from '../issue-creator.js';
import { getGitHubClient } from '../../github/api.js';
import type { VulnerabilityGroup, ScanConfig } from '../types.js';

vi.mock('../../github/api.js');
vi.mock('../../utils/logger.js');

describe('IssueCreator - Duplicate Detection', () => {
  let issueCreator: IssueCreator;
  let mockGitHub: any;

  beforeEach(() => {
    mockGitHub = {
      issues: {
        create: vi.fn(),
        update: vi.fn(),
        createComment: vi.fn(),
        listForRepo: vi.fn()
      }
    };

    vi.mocked(getGitHubClient).mockReturnValue(mockGitHub);
    issueCreator = new IssueCreator();
  });

  describe('findExistingIssue', () => {
    it('should find existing issue with matching vulnerability type label', async () => {
      const existingIssue = {
        number: 123,
        title: '🔒 Cross-Site Scripting (XSS) vulnerabilities found in 2 files',
        labels: [
          { name: 'rsolv:detected' },
          { name: 'rsolv:vuln-xss' },
          { name: 'security' }
        ],
        state: 'open'
      };

      mockGitHub.issues.listForRepo.mockResolvedValue({
        data: [existingIssue]
      });

      const group: VulnerabilityGroup = {
        type: 'xss',
        severity: 'high',
        count: 3,
        files: ['file1.js', 'file2.js', 'file3.js'],
        vulnerabilities: []
      };

      const config: ScanConfig = {
        repository: { owner: 'test', name: 'repo' },
        branch: 'main',
        createIssues: true
      };

      // @ts-ignore - accessing private method for testing
      const result = await issueCreator.findExistingIssue(group, config);

      expect(result).toBeDefined();
      expect(result.number).toBe(123);
      expect(mockGitHub.issues.listForRepo).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        labels: 'rsolv:vuln-xss',
        state: 'open'
      });
    });

    it('should return null when no existing issue found', async () => {
      mockGitHub.issues.listForRepo.mockResolvedValue({
        data: []
      });

      const group: VulnerabilityGroup = {
        type: 'sql-injection',
        severity: 'critical',
        count: 1,
        files: ['db.js'],
        vulnerabilities: []
      };

      const config: ScanConfig = {
        repository: { owner: 'test', name: 'repo' },
        branch: 'main',
        createIssues: true
      };

      // @ts-ignore - accessing private method for testing
      const result = await issueCreator.findExistingIssue(group, config);

      expect(result).toBeNull();
    });
  });

  describe('updateExistingIssue', () => {
    it('should update existing issue with new scan results', async () => {
      const existingIssue = {
        number: 123,
        title: '🔒 Cross-Site Scripting (XSS) vulnerabilities found in 2 files',
        body: 'Old body content'
      };

      const group: VulnerabilityGroup = {
        type: 'xss',
        severity: 'high',
        count: 3,
        files: ['file1.js', 'file2.js', 'file3.js'],
        vulnerabilities: [{
          type: 'xss',
          severity: 'high',
          filePath: 'file3.js',
          line: 42,
          description: 'New XSS vulnerability',
          snippet: 'innerHTML = userInput'
        }]
      };

      const config: ScanConfig = {
        repository: { owner: 'test', name: 'repo' },
        branch: 'main',
        createIssues: true
      };

      mockGitHub.issues.update.mockResolvedValue({ data: { ...existingIssue } });
      mockGitHub.issues.createComment.mockResolvedValue({ data: {} });

      // @ts-ignore - accessing private method for testing
      const result = await issueCreator.updateExistingIssue(existingIssue, group, config);

      expect(result).toBeDefined();
      expect(mockGitHub.issues.update).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        issue_number: 123,
        title: '🔒 Cross-Site Scripting (XSS) vulnerabilities found in 3 files',
        body: expect.stringContaining('Total Instances: 3')
      });

      expect(mockGitHub.issues.createComment).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        issue_number: 123,
        body: expect.stringContaining('📊 Scan Update')
      });
    });
  });

  describe('createIssuesFromGroups with duplicate detection', () => {
    it('should update existing issue instead of creating new one', async () => {
      const existingIssue = {
        number: 123,
        title: '🔒 Cross-Site Scripting (XSS) vulnerabilities found in 1 file',
        labels: [
          { name: 'rsolv:detected' },
          { name: 'rsolv:vuln-xss' }
        ],
        html_url: 'https://github.com/test/repo/issues/123'
      };

      mockGitHub.issues.listForRepo.mockResolvedValue({
        data: [existingIssue]
      });
      mockGitHub.issues.update.mockResolvedValue({
        data: { ...existingIssue, title: '🔒 Cross-Site Scripting (XSS) vulnerabilities found in 2 files' }
      });
      mockGitHub.issues.createComment.mockResolvedValue({ data: {} });

      const group: VulnerabilityGroup = {
        type: 'xss',
        severity: 'high',
        count: 2,
        files: ['file1.js', 'file2.js'],
        vulnerabilities: []
      };

      const config: ScanConfig = {
        repository: { owner: 'test', name: 'repo' },
        branch: 'main',
        createIssues: true,
        updateExisting: true  // New config option
      };

      const result = await issueCreator.createIssuesFromGroups([group], config);

      expect(result).toHaveLength(1);
      expect(result[0].number).toBe(123);
      expect(mockGitHub.issues.create).not.toHaveBeenCalled();
      expect(mockGitHub.issues.update).toHaveBeenCalled();
    });

    it('should create new issue when no duplicate exists', async () => {
      mockGitHub.issues.listForRepo.mockResolvedValue({
        data: []
      });
      mockGitHub.issues.create.mockResolvedValue({
        data: {
          number: 456,
          title: '🔒 SQL Injection vulnerabilities found in 1 file',
          html_url: 'https://github.com/test/repo/issues/456'
        }
      });

      const group: VulnerabilityGroup = {
        type: 'sql-injection',
        severity: 'critical',
        count: 1,
        files: ['db.js'],
        vulnerabilities: []
      };

      const config: ScanConfig = {
        repository: { owner: 'test', name: 'repo' },
        branch: 'main',
        createIssues: true,
        updateExisting: true
      };

      const result = await issueCreator.createIssuesFromGroups([group], config);

      expect(result).toHaveLength(1);
      expect(result[0].number).toBe(456);
      expect(mockGitHub.issues.create).toHaveBeenCalled();
      expect(mockGitHub.issues.update).not.toHaveBeenCalled();
    });
  });
});