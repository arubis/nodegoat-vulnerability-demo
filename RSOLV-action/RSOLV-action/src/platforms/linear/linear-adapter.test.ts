import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LinearAdapter } from './linear-adapter';
import { setupFetchMock } from '../../../test-helpers/simple-mocks';

describe.skip('LinearAdapter - DISABLED', () => {
  let adapter: LinearAdapter;
  let fetchMock: ReturnType<typeof setupFetchMock>;
  let originalFetch: typeof fetch;
  const mockApiKey = 'lin_api_test123';
  const mockTeamId = 'team_123';

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchMock = setupFetchMock();
    adapter = new LinearAdapter({
      apiKey: mockApiKey,
      teamId: mockTeamId,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    mock.restore();
  });

  describe('searchRsolvIssues', () => {
    it('should search for issues with autofix or rsolv labels', async () => {
      const mockIssues = {
        data: {
          issues: {
            nodes: [
              {
                id: 'issue_1',
                identifier: 'ENG-123',
                title: 'Fix memory leak',
                description: 'Memory leak in user service',
                state: { name: 'Todo', type: 'unstarted' },
                labels: { nodes: [{ name: 'autofix' }, { name: 'bug' }] },
                assignee: { name: 'John Doe', email: 'john@example.com' },
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-02T00:00:00Z',
                url: 'https://linear.app/team/issue/ENG-123',
              },
              {
                id: 'issue_2',
                identifier: 'ENG-124',
                title: 'Update dependencies',
                description: 'Update outdated npm packages',
                state: { name: 'In Progress', type: 'started' },
                labels: { nodes: [{ name: 'rsolv' }, { name: 'maintenance' }] },
                assignee: null,
                createdAt: '2024-01-03T00:00:00Z',
                updatedAt: '2024-01-04T00:00:00Z',
                url: 'https://linear.app/team/issue/ENG-124',
              },
            ],
          },
        },
      };

      fetchMock.mockResponseOnce({
        ok: true,
        json: async () => mockIssues,
      });

      const issues = await adapter.searchRsolvIssues();

      expect(fetchMock.mock.mock.calls.length).toBeGreaterThan(0);
      expect(fetchMock.mock.mock.calls[0][0]).toHaveBeenCalledWith(
        'https://api.linear.app/graphql',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': mockApiKey,
            'Content-Type': 'application/json',
          },
          body: expect.stringContaining('autofix'),
        })
      );

      expect(issues).toHaveLength(2);
      expect(issues[0]).toMatchObject({
        id: 'issue_1',
        platform: 'linear',
        key: 'ENG-123',
        title: 'Fix memory leak',
        labels: ['autofix', 'bug'],
        status: 'Todo',
        statusCategory: 'todo',
      });
    });

    it('should handle empty results', async () => {
      const mockResponse = {
        data: {
          issues: {
            nodes: [],
          },
        },
      };

      fetchMock.mockResponseOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const issues = await adapter.searchRsolvIssues();
      expect(issues).toHaveLength(0);
    });

    it('should handle API errors', async () => {
      fetchMock.mockResponseOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(adapter.searchRsolvIssues()).rejects.toThrow('Linear GraphQL request failed: HTTP 401: undefined');
    });
  });

  describe('getIssue', () => {
    it('should get a single issue by ID', async () => {
      const mockIssue = {
        data: {
          issue: {
            id: 'issue_1',
            identifier: 'ENG-123',
            title: 'Fix memory leak',
            description: 'Memory leak in user service',
            state: { name: 'Todo', type: 'unstarted' },
            labels: { nodes: [{ name: 'autofix' }] },
            assignee: { name: 'John Doe', email: 'john@example.com' },
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
            url: 'https://linear.app/team/issue/ENG-123',
          },
        },
      };

      fetchMock.mockResponseOnce({
        ok: true,
        json: async () => mockIssue,
      });

      const issue = await adapter.getIssue('issue_1');

      expect(issue).toMatchObject({
        id: 'issue_1',
        platform: 'linear',
        key: 'ENG-123',
        title: 'Fix memory leak',
      });
    });

    it('should return null for non-existent issue', async () => {
      const mockResponse = {
        data: {
          issue: null,
        },
      };

      fetchMock.mockResponseOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const issue = await adapter.getIssue('non_existent');
      expect(issue).toBeNull();
    });
  });

  describe('createComment', () => {
    it('should create a comment on an issue', async () => {
      const mockResponse = {
        data: {
          commentCreate: {
            success: true,
            comment: {
              id: 'comment_1',
              body: 'Test comment',
              user: { name: 'Bot User', email: 'bot@example.com' },
              createdAt: '2024-01-01T00:00:00Z',
            },
          },
        },
      };

      fetchMock.mockResponseOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const comment = await adapter.createComment('issue_1', 'Test comment');

      expect(comment).toMatchObject({
        id: 'comment_1',
        body: 'Test comment',
        author: 'Bot User',
      });
    });

    it('should handle comment creation failure', async () => {
      const mockResponse = {
        data: {
          commentCreate: {
            success: false,
            comment: null,
          },
        },
      };

      fetchMock.mockResponseOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const comment = await adapter.createComment('issue_1', 'Test comment');
      expect(comment).toBeNull();
    });
  });

  describe('updateIssueStatus', () => {
    it('should update issue status', async () => {
      // Mock state lookup
      const mockStateResponse = {
        data: {
          workflowStates: {
            nodes: [
              { id: 'state_1', name: 'In Progress', type: 'started' },
            ],
          },
        },
      };

      // Mock issue update
      const mockUpdateResponse = {
        data: {
          issueUpdate: {
            success: true,
          },
        },
      };

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockStateResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUpdateResponse,
        });

      const result = await adapter.updateIssueStatus('issue_1', 'In Progress');
      expect(result).toBe(true);
      expect(fetchMock.mock.mock.calls.length).toBeGreaterThan(0);
      expect(fetchMock.mock.mock.calls[0][0]).toHaveBeenCalledTimes(2);
    });

    it('should handle non-existent status', async () => {
      const mockStateResponse = {
        data: {
          workflowStates: {
            nodes: [],
          },
        },
      };

      fetchMock.mockResponseOnce({
        ok: true,
        json: async () => mockStateResponse,
      });

      const result = await adapter.updateIssueStatus('issue_1', 'NonExistent');
      expect(result).toBe(false);
    });
  });

  describe('addLabel', () => {
    it('should add an existing label to an issue', async () => {
      // Mock label lookup
      const mockLabelResponse = {
        data: {
          issueLabels: {
            nodes: [
              { id: 'label_1', name: 'bug' },
            ],
          },
        },
      };

      // Mock label addition
      const mockAddResponse = {
        data: {
          issueAddLabel: {
            success: true,
          },
        },
      };

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockLabelResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockAddResponse,
        });

      const result = await adapter.addLabel('issue_1', 'bug');
      expect(result).toBe(true);
    });

    it('should create and add a new label if it doesn\'t exist', async () => {
      // Mock label lookup (empty)
      const mockLabelResponse = {
        data: {
          issueLabels: {
            nodes: [],
          },
        },
      };

      // Mock label creation
      const mockCreateResponse = {
        data: {
          issueLabelCreate: {
            success: true,
            issueLabel: { id: 'label_new' },
          },
        },
      };

      // Mock label addition
      const mockAddResponse = {
        data: {
          issueAddLabel: {
            success: true,
          },
        },
      };

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockLabelResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockCreateResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockAddResponse,
        });

      const result = await adapter.addLabel('issue_1', 'new-label');
      expect(result).toBe(true);
      expect(fetchMock.mock.mock.calls.length).toBeGreaterThan(0);
      expect(fetchMock.mock.mock.calls[0][0]).toHaveBeenCalledTimes(3);
    });
  });

  describe('addLink', () => {
    it('should add a link as a comment', async () => {
      const mockResponse = {
        data: {
          commentCreate: {
            success: true,
            comment: {
              id: 'comment_1',
              body: '🔗 Related: [Pull Request](https://github.com/org/repo/pull/123)',
              user: { name: 'Bot User', email: 'bot@example.com' },
              createdAt: '2024-01-01T00:00:00Z',
            },
          },
        },
      };

      fetchMock.mockResponseOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const link = await adapter.addLink(
        'issue_1',
        'https://github.com/org/repo/pull/123',
        'Pull Request'
      );

      expect(link).toMatchObject({
        id: 'comment_1',
        url: 'https://github.com/org/repo/pull/123',
        title: 'Pull Request',
        type: 'external',
      });
    });
  });

  describe('linearIssueToUnified', () => {
    it('should correctly map Linear state types', async () => {
      const mockIssues = {
        data: {
          issues: {
            nodes: [
              {
                id: '1',
                identifier: 'ENG-1',
                title: 'Backlog item',
                state: { name: 'Backlog', type: 'backlog' },
                labels: { nodes: [] },
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
                url: 'https://linear.app/team/issue/ENG-1',
              },
              {
                id: '2',
                identifier: 'ENG-2',
                title: 'In progress item',
                state: { name: 'In Progress', type: 'started' },
                labels: { nodes: [] },
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
                url: 'https://linear.app/team/issue/ENG-2',
              },
              {
                id: '3',
                identifier: 'ENG-3',
                title: 'Completed item',
                state: { name: 'Done', type: 'completed' },
                labels: { nodes: [] },
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
                url: 'https://linear.app/team/issue/ENG-3',
              },
            ],
          },
        },
      };

      fetchMock.mockResponseOnce({
        ok: true,
        json: async () => mockIssues,
      });

      const issues = await adapter.searchRsolvIssues();

      expect(issues[0].statusCategory).toBe('todo');
      expect(issues[1].statusCategory).toBe('in_progress');
      expect(issues[2].statusCategory).toBe('done');
    });
  });
});