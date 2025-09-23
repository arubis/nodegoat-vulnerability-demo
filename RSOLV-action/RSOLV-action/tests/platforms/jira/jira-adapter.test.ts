import { describe, test, expect, beforeEach, vi, vi } from 'vitest';
import { JiraAdapter } from '../../../src/platforms/jira/jira-adapter';
import type { PlatformConfig, UnifiedIssue } from '../../../src/platforms/types';

describe('JiraAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  let adapter: JiraAdapter;
  let fetchSpy: any;
  
  const mockConfig: PlatformConfig = {
    jira: {
      host: 'test.atlassian.net',
      email: 'test@example.com',
      apiToken: 'test-token',
      autofixLabel: 'autofix'
    }
  };

  beforeEach(() => {
    // Use spyOn instead of replacing global.fetch
    fetchSpy = vi.spyOn(global, 'fetch');
    adapter = new JiraAdapter(mockConfig.jira!);
  });

  describe('authenticate', () => {
    test('should authenticate successfully with valid credentials', async () => {
      
      fetchSpy.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: async () => ({ accountId: '123', emailAddress: 'test@example.com' })
      } as Response));

      await adapter.authenticate();

      expect(fetchSpy).toHaveBeenCalled();
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://test.atlassian.net/rest/api/3/myself');
      expect(options.headers['Authorization']).toBe(`Basic ${Buffer.from('test@example.com:test-token').toString('base64')}`);
      expect(options.headers['Accept']).toBe('application/json');
    });

    test('should throw error on authentication failure', async () => {
      
      fetchSpy.mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      } as Response));

      await expect(adapter.authenticate()).rejects.toThrow('Jira authentication failed: HTTP 401: Unauthorized');
    });
  });

  describe('searchIssues', () => {
    test('should search issues with autofix label', async () => {
      
      const mockJiraIssues = {
        issues: [
          {
            id: '10001',
            key: 'PROJ-123',
            fields: {
              summary: 'Fix deprecated API usage',
              description: 'Need to update deprecated API calls',
              labels: ['autofix', 'technical-debt'],
              status: { name: 'To Do' },
              created: '2025-05-23T10:00:00.000Z',
              updated: '2025-05-23T12:00:00.000Z',
              assignee: {
                accountId: '456',
                displayName: 'John Doe',
                emailAddress: 'john@example.com'
              },
              reporter: {
                accountId: '789',
                displayName: 'Jane Smith',
                emailAddress: 'jane@example.com'
              }
            }
          }
        ]
      };

      fetchSpy.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: async () => mockJiraIssues
      } as Response));

      const issues = await adapter.searchIssues('labels = "autofix"');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://test.atlassian.net/rest/api/3/search',
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${Buffer.from('test@example.com:test-token').toString('base64')}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            jql: 'labels = "autofix"',
            fields: ['summary', 'description', 'labels', 'status', 'created', 'updated', 'assignee', 'reporter']
          })
        }
      );

      expect(issues).toHaveLength(1);
      const issue = issues[0];
      expect(issue).toMatchObject({
        id: '10001',
        platform: 'jira',
        key: 'PROJ-123',
        title: 'Fix deprecated API usage',
        description: 'Need to update deprecated API calls',
        labels: ['autofix', 'technical-debt'],
        status: 'To Do',
        url: 'https://test.atlassian.net/browse/PROJ-123'
      });
    });

    test('should handle empty search results', async () => {
      
      fetchSpy.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: async () => ({ issues: [] })
      } as Response));

      const issues = await adapter.searchIssues('labels = "autofix"');
      expect(issues).toHaveLength(0);
    });
  });

  describe('createComment', () => {
    test('should add comment to issue', async () => {
      
      fetchSpy.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: async () => ({ id: '123' })
      } as Response));

      await adapter.createComment('PROJ-123', 'RSOLV has created a pull request for this issue');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://test.atlassian.net/rest/api/3/issue/PROJ-123/comment',
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${Buffer.from('test@example.com:test-token').toString('base64')}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            body: {
              type: 'doc',
              version: 1,
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'RSOLV has created a pull request for this issue'
                    }
                  ]
                }
              ]
            }
          })
        }
      );
    });
  });

  describe('addLink', () => {
    test('should create remote link to GitHub PR', async () => {
      
      fetchSpy.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: async () => ({ id: '456' })
      } as Response));

      await adapter.addLink(
        'PROJ-123',
        'https://github.com/owner/repo/pull/42',
        'Fix: Update deprecated API calls'
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://test.atlassian.net/rest/api/3/issue/PROJ-123/remotelink',
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${Buffer.from('test@example.com:test-token').toString('base64')}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            object: {
              url: 'https://github.com/owner/repo/pull/42',
              title: 'Fix: Update deprecated API calls',
              icon: {
                url16x16: 'https://github.com/favicon.ico',
                title: 'GitHub Pull Request'
              }
            }
          })
        }
      );
    });
  });

  describe('updateIssueStatus', () => {
    test('should update issue status', async () => {
      // First, get available transitions
      
      fetchSpy.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: async () => ({
          transitions: [
            { id: '21', name: 'In Progress' },
            { id: '31', name: 'Done' }
          ]
        })
      } as Response));

      // Then update status
      fetchSpy.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: async () => ({})
      } as Response));

      await adapter.updateIssueStatus('PROJ-123', 'In Progress');

      // Verify getting transitions
      expect(fetchSpy).toHaveBeenNthCalledWith(
        1,
        'https://test.atlassian.net/rest/api/3/issue/PROJ-123/transitions',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Basic ${Buffer.from('test@example.com:test-token').toString('base64')}`
          })
        })
      );

      // Verify updating status
      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        'https://test.atlassian.net/rest/api/3/issue/PROJ-123/transitions',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            transition: { id: '21' }
          })
        })
      );
    });
  });
});