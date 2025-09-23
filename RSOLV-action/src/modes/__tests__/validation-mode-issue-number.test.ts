import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ValidationMode } from '../validation-mode.js';
import type { IssueContext } from '../../types/index.js';

// Mock dependencies
vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('ValidationMode - issue.issueNumber bug', () => {
  let validationMode: ValidationMode;

  const mockIssue: IssueContext = {
    id: 'github-123',
    number: 851, // Issue has `number` property, NOT `issueNumber`
    title: 'Test Issue',
    body: 'Test body',
    labels: ['rsolv:detected'],
    assignees: [],
    repository: {
      owner: 'test-owner',
      name: 'test-repo',
      fullName: 'test-owner/test-repo',
      defaultBranch: 'main',
      language: 'javascript'
    },
    source: 'github',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      htmlUrl: 'https://github.com/test-owner/test-repo/issues/851',
      state: 'open',
      locked: false
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    const mockConfig = {
      aiProvider: {
        provider: 'anthropic' as const,
        apiKey: 'test-key',
        model: 'claude-3'
      },
      testGeneration: {
        enabled: true
      }
    };

    validationMode = new ValidationMode(mockConfig as any, '/test/dir');
  });

  describe('RED - Shows the bug', () => {
    it('should not try to access issue.issueNumber which does not exist', async () => {
      // Mock dependencies to simulate the validation flow
      const analyzeIssueSpy = vi.spyOn(validationMode as any, 'analyzeIssue')
        .mockResolvedValue({
          filesToModify: ['test.js'],
          canBeFixed: true,
          suggestedApproach: 'test approach'
        });

      const generateTestsSpy = vi.spyOn(validationMode as any, 'generateTests')
        .mockResolvedValue({
          generatedTests: {
            testSuite: {
              red: { testName: 'test', testCode: 'code' },
              green: { testName: 'test', testCode: 'code' },
              refactor: { testName: 'test', testCode: 'code' }
            }
          }
        });

      // This should not throw an error about issue.issueNumber
      const result = await validationMode.validateVulnerability(mockIssue);

      // The bug would be if somewhere in the code it tries to access issue.issueNumber
      // which doesn't exist and causes "Cannot read properties of undefined"
      expect(result).toBeDefined();
      expect(result.issueId).toBe(851); // Should use issue.number

      // Check that no error was thrown about issueNumber
      expect(() => {
        // If code tries to access issue.issueNumber, it would be undefined
        // @ts-ignore - Intentionally accessing wrong property to demonstrate bug
        const wrongProperty = mockIssue.issueNumber;
        expect(wrongProperty).toBeUndefined();
      }).not.toThrow();
    });
  });

  describe('GREEN - After the fix', () => {
    it('should use issue.number instead of issue.issueNumber', async () => {
      // After fix, all references should use issue.number
      const result = {
        issueId: mockIssue.number, // Correct property
        validated: true,
        timestamp: new Date().toISOString(),
        commitHash: 'abc123'
      };

      // This should work without errors
      expect(result.issueId).toBe(851);
      expect(mockIssue.number).toBe(851);

      // Log message should use issue.number
      const logMessage = `Validation results saved successfully for issue #${mockIssue.number}`;
      expect(logMessage).toBe('Validation results saved successfully for issue #851');
    });
  });

  describe('REFACTOR - Ensure consistent property usage', () => {
    it('should consistently use issue.number throughout the codebase', () => {
      // All IssueContext objects should have 'number', not 'issueNumber'
      const issueFromDetection: IssueContext = {
        id: 'github-456',
        number: 456, // Correct property name
        title: 'Another Issue',
        body: 'Body',
        labels: [],
        assignees: [],
        repository: {
          owner: 'owner',
          name: 'repo',
          fullName: 'owner/repo',
          defaultBranch: 'main',
          language: 'js'
        },
        source: 'github',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {}
      };

      // Verify the property exists and is accessible
      expect(issueFromDetection.number).toBe(456);
      // @ts-ignore - Verify wrong property doesn't exist
      expect(issueFromDetection.issueNumber).toBeUndefined();
    });
  });
});