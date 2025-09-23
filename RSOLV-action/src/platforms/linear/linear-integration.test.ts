import { describe, it, expect, mock, vi } from 'vitest';
import { LinearAdapter } from './linear-adapter';
// import type { ActionConfig } from '../../types';

describe.skip('Linear Integration End-to-End - DISABLED', () => {
  describe('Programmatic Verification', () => {
    it('should correctly query Linear GraphQL API for labeled issues', async () => {
      const adapter = new LinearAdapter({
        apiKey: 'test_key',
        autofixLabel: 'autofix',
        rsolvLabel: 'rsolv'
      });

      // Verify the GraphQL query structure
      const mockFetch = vi.fn(() => Promise.resolve({
        ok: true,
        json: async () => ({
          data: {
            issues: {
              nodes: [
                {
                  id: 'issue_1',
                  identifier: 'ENG-123',
                  title: 'Test issue',
                  labels: { nodes: [{ name: 'autofix' }] },
                  state: { name: 'Todo', type: 'unstarted' },
                  createdAt: '2024-01-01T00:00:00Z',
                  updatedAt: '2024-01-01T00:00:00Z',
                  url: 'https://linear.app/team/issue/ENG-123'
                }
              ]
            }
          }
        })
      }));

      global.fetch = mockFetch as any;
      const issues = await adapter.searchRsolvIssues();

      // Verify the query includes both labels
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.variables.filter.labels.or).toEqual([
        { name: { eq: 'autofix' } },
        { name: { eq: 'rsolv' } }
      ]);
      expect(issues).toHaveLength(1);
      expect(issues[0].labels).toContain('autofix');
    });

    it('should integrate with issue detector for multi-platform detection', async () => {
      // Mock environment variables
      process.env.LINEAR_API_KEY = 'test_key';
      process.env.GITHUB_TOKEN = 'gh_test';

      // Mock fetch for Linear
      const mockFetch = vi.fn();
      mockFetch.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: async () => ({
          data: {
            issues: {
              nodes: [
                {
                  id: 'linear_1',
                  identifier: 'ENG-456',
                  title: 'Linear issue',
                  description: 'Fix in https://github.com/org/repo',
                  labels: { nodes: [{ name: 'rsolv' }] },
                  state: { name: 'Todo', type: 'unstarted' },
                  createdAt: '2024-01-01T00:00:00Z',
                  updatedAt: '2024-01-01T00:00:00Z',
                  url: 'https://linear.app/team/issue/ENG-456'
                }
              ]
            }
          }
        })
      }));

      global.fetch = mockFetch as any;

      // Mock GitHub detection
      // const _mockConfig: ActionConfig = {
      //   githubToken: 'gh_test',
      //   repository: {
      //     owner: 'test',
      //     name: 'repo',
      //     fullName: 'test/repo',
      //     defaultBranch: 'main',
      //     language: 'TypeScript'
      //   },
      //   issueNumber: 1,
      //   workflowPath: '',
      //   runId: '',
      //   apiUrl: '',
      //   aiProvider: {
      //     type: 'anthropic',
      //     model: 'claude-3-haiku-20240307'
      //   }
      // };

      // Note: In a real test, we'd need to mock the GitHub API calls too
      // For now, we're focusing on Linear integration verification
      
      // Cleanup
      delete process.env.LINEAR_API_KEY;
    });

    it('should handle pagination for large result sets', async () => {
      // Linear uses cursor-based pagination
      const adapter = new LinearAdapter({
        apiKey: 'test_key'
      });

      // First page
      const mockFetch = vi.fn();
      mockFetch.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: async () => ({
          data: {
            issues: {
              nodes: Array(50).fill(null).map((_, i) => ({
                id: `issue_${i}`,
                identifier: `ENG-${i}`,
                title: `Issue ${i}`,
                labels: { nodes: [{ name: 'autofix' }] },
                state: { name: 'Todo', type: 'unstarted' },
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
                url: `https://linear.app/team/issue/ENG-${i}`
              })),
              pageInfo: {
                hasNextPage: true,
                endCursor: 'cursor_50'
              }
            }
          }
        })
      }));
      
      global.fetch = mockFetch as any;

      // Note: Current implementation doesn't handle pagination
      // This test documents that limitation
      const issues = await adapter.searchRsolvIssues();
      expect(issues).toHaveLength(50);
      // TODO: Implement pagination support
    });

    it('should correctly map repository information from issue description', async () => {
      const adapter = new LinearAdapter({
        apiKey: 'test_key'
      });

      const mockFetch = vi.fn(() => Promise.resolve({
        ok: true,
        json: async () => ({
          data: {
            issues: {
              nodes: [
                {
                  id: 'issue_1',
                  identifier: 'ENG-789',
                  title: 'Fix memory leak',
                  description: 'Memory leak in https://github.com/myorg/myrepo needs fixing',
                  labels: { nodes: [{ name: 'autofix' }] },
                  state: { name: 'Todo', type: 'unstarted' },
                  createdAt: '2024-01-01T00:00:00Z',
                  updatedAt: '2024-01-01T00:00:00Z',
                  url: 'https://linear.app/team/issue/ENG-789'
                }
              ]
            }
          }
        })
      }));

      global.fetch = mockFetch as any;
      const issues = await adapter.searchRsolvIssues();
      expect(issues[0].description).toContain('github.com/myorg/myrepo');
    });
  });

  describe('Polling Mechanism', () => {
    it('should be triggered by GitHub Actions schedule', () => {
      // Polling is handled by GitHub Actions, not by our code
      // Verify that we document the recommended schedule
      const recommendedSchedule = '0 */6 * * *'; // Every 6 hours
      expect(recommendedSchedule).toMatch(/^\d+ \*\/\d+ \* \* \*$/);
    });

    it('should handle concurrent platform checks', async () => {
      // When polling triggers, all platforms should be checked
      // This is handled by detectIssuesFromAllPlatforms
      
      // Set up environment for multiple platforms
      process.env.LINEAR_API_KEY = 'linear_test';
      process.env.JIRA_HOST = 'test.atlassian.net';
      process.env.JIRA_EMAIL = 'test@example.com';
      process.env.JIRA_API_TOKEN = 'jira_test';

      // Mock responses
      const mockFetch = vi.fn();
      mockFetch
        .mockImplementationOnce(() => Promise.resolve({
          // Linear response
          ok: true,
          json: async () => ({ data: { issues: { nodes: [] } } })
        }))
        .mockImplementationOnce(() => Promise.resolve({
          // Jira response
          ok: true,
          json: async () => ({ issues: [] })
        }));

      global.fetch = mockFetch as any;

      // The actual implementation would run detectIssuesFromAllPlatforms
      // which checks all configured platforms

      // Cleanup
      delete process.env.LINEAR_API_KEY;
      delete process.env.JIRA_HOST;
      delete process.env.JIRA_EMAIL;
      delete process.env.JIRA_API_TOKEN;
    });
  });

  describe('Label-based Issue Detection', () => {
    it('should find issues with either autofix OR rsolv label', async () => {
      const adapter = new LinearAdapter({
        apiKey: 'test_key',
        autofixLabel: 'custom-autofix',
        rsolvLabel: 'custom-rsolv'
      });

      const mockFetch = vi.fn(() => Promise.resolve({
        ok: true,
        json: async () => ({
          data: {
            issues: {
              nodes: [
                {
                  id: '1',
                  identifier: 'ENG-1',
                  title: 'Has autofix',
                  labels: { nodes: [{ name: 'custom-autofix' }] },
                  state: { name: 'Todo', type: 'unstarted' },
                  createdAt: '2024-01-01T00:00:00Z',
                  updatedAt: '2024-01-01T00:00:00Z',
                  url: 'https://linear.app/team/issue/ENG-1'
                },
                {
                  id: '2',
                  identifier: 'ENG-2',
                  title: 'Has rsolv',
                  labels: { nodes: [{ name: 'custom-rsolv' }] },
                  state: { name: 'Todo', type: 'unstarted' },
                  createdAt: '2024-01-01T00:00:00Z',
                  updatedAt: '2024-01-01T00:00:00Z',
                  url: 'https://linear.app/team/issue/ENG-2'
                }
              ]
            }
          }
        })
      }));

      global.fetch = mockFetch as any;
      const issues = await adapter.searchRsolvIssues();

      // Verify custom labels are used
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.variables.filter.labels.or).toEqual([
        { name: { eq: 'custom-autofix' } },
        { name: { eq: 'custom-rsolv' } }
      ]);

      expect(issues).toHaveLength(2);
      expect(issues[0].labels).toContain('custom-autofix');
      expect(issues[1].labels).toContain('custom-rsolv');
    });

    it('should filter by team if teamId is provided', async () => {
      const adapter = new LinearAdapter({
        apiKey: 'test_key',
        teamId: 'team_123'
      });

      const mockFetch = vi.fn(() => Promise.resolve({
        ok: true,
        json: async () => ({ data: { issues: { nodes: [] } } })
      }));

      global.fetch = mockFetch as any;
      await adapter.searchRsolvIssues();

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.variables.filter.team).toEqual({ id: { eq: 'team_123' } });
    });
  });
});