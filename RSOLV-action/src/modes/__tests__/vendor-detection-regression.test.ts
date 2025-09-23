/**
 * Regression tests for RFC-047 vendor detection bug
 * Tests that the fix correctly handles both 'file' and 'files' properties
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import type { ActionConfig, IssueContext } from '../../types/index.js';
import { PhaseExecutor } from '../phase-executor/index.js';

// Use vi.hoisted for shared test data
const { capturedFiles, mockGetIssue, mockIsVendorFile, mockProcessVulnerability } = vi.hoisted(() => {
  const files: string[] = [];
  return {
    capturedFiles: files,
    mockGetIssue: vi.fn(),
    mockIsVendorFile: vi.fn(),
    mockProcessVulnerability: vi.fn()
  };
});

// Mock all dependencies at module level
vi.mock('../../github/api.js', () => ({
  getIssue: mockGetIssue,
  getGitHubClient: vi.fn(() => ({}))
}));

vi.mock('../../vendor/index.js', () => ({
  VendorDetectionIntegration: class {
    async isVendorFile(file: string) {
      return mockIsVendorFile(file);
    }
    async processVulnerability(vuln: unknown) {
      return mockProcessVulnerability(vuln);
    }
  }
}));

vi.mock('../phase-data-client/index.js', () => ({
  PhaseDataClient: vi.fn(() => ({
    retrievePhaseResults: vi.fn().mockImplementation((_repo, issueNumber) => {
      // Return different validation data based on issue number
      const issueKey = `issue-${issueNumber}`;
      const validationData: any = {
        validate: {}
      };
      
      if (issueNumber === 1) {
        validationData.validate[issueKey] = {
          vulnerabilities: [
            { file: 'unknown.js', line: 42, type: 'UNKNOWN' },
            { file: 'unknown.js', line: 100, type: 'UNKNOWN' }
          ],
          validated: true
        };
      } else if (issueNumber === 2) {
        validationData.validate[issueKey] = {
          vulnerabilities: [
            { file: 'unknown.js', line: 1, type: 'UNKNOWN' },
            { file: 'unknown.js', line: 2, type: 'UNKNOWN' }  // Different line number
          ],
          validated: true
        };
      } else {
        validationData.validate[issueKey] = {
          vulnerabilities: [
            { file: 'unknown.js', line: 42, type: 'UNKNOWN' },
            { file: 'unknown.js', line: 100, type: 'UNKNOWN' },
            { file: 'unknown.js', line: 101, type: 'UNKNOWN' }  // Different line number
          ],
          validated: true
        };
      }
      
      return Promise.resolve(validationData);
    }),
    storePhaseResults: vi.fn().mockResolvedValue({ success: true })
  }))
}));

vi.mock('../../ai/adapters/claude-code-git.js', () => ({
  GitBasedClaudeCodeAdapter: vi.fn(() => ({
    generateSolutionWithGit: vi.fn().mockResolvedValue({
      success: true,
      pullRequestUrl: 'https://github.com/test/repo/pull/1',
      pullRequestNumber: 1,
      commitHash: 'abc123',
      filesModified: ['test.js']
    })
  }))
}));

vi.mock('../../ai/git-based-test-validator.js', () => ({
  GitBasedTestValidator: vi.fn(() => ({
    validateFixWithTests: vi.fn().mockResolvedValue({ isValidFix: true })
  }))
}));

vi.mock('child_process', () => ({
  execSync: vi.fn((cmd: string) => {
    if (cmd.includes('git status --porcelain')) return '';
    if (cmd.includes('git rev-parse HEAD')) return 'abc123def456';
    return '';
  })
}));

interface Vulnerability {
  type: string;
  file?: string;
  files?: string[];
  line: number;
}

describe('Vendor Detection Regression Tests (RFC-047)', () => {
  let mockConfig: ActionConfig;
  let executor: PhaseExecutor;

  beforeEach(() => {
    // Clear mock state
    vi.clearAllMocks();
    capturedFiles.length = 0; // Clear array contents
    
    mockConfig = {
      githubToken: 'test-token',
      apiKey: 'test-api-key',
      aiProvider: {
        provider: 'anthropic',
        apiKey: 'test-anthropic-key',
        model: 'claude-3-sonnet'
      }
    } as ActionConfig;

    // Setup mock implementations
    mockGetIssue.mockImplementation(async (_owner: string, _repo: string, issueNumber: number) => {
      // Return different data based on issue number for different tests
      if (issueNumber === 1) {
        return {
          title: 'Security Vulnerability: weak_cryptography',
          body: `## Security Vulnerability Report

**Type**: Weak_cryptography
**Severity**: MEDIUM

### Affected Files

#### \`app/assets/vendor/jquery.min.js\`

- **Line 42**: Use of Math.random() for cryptographic purposes

#### \`app/models/user.rb\`

- **Line 100**: SQL injection vulnerability`,
          labels: ['rsolv:automate']
        };
      } else if (issueNumber === 2) {
        return {
          title: 'Security Vulnerability: information_disclosure',
          body: `## Security Vulnerability Report

**Type**: Information_disclosure
**Severity**: HIGH

### Affected Files

#### \`config/secrets.yml\`

- **Line 1**: Sensitive data exposure

#### \`app/config/database.yml\`

- **Line 2**: Database credentials exposed`,
          labels: ['rsolv:automate']
        };
      } else {
        return {
          title: 'Multiple vulnerabilities found',
          body: `## Security Vulnerability Report

**Type**: Multiple
**Severity**: HIGH

### Affected Files

#### \`vendor/jquery.min.js\`

- **Line 42**: Weak cryptography

#### \`app/models/user.rb\`

- **Line 100**: SQL injection

#### \`app/models/admin.rb\`

- **Line 101**: SQL injection`,
          labels: ['rsolv:automate']
        };
      }
    });

    mockIsVendorFile.mockImplementation(async (file: string) => {
      capturedFiles.push(file);
      return file.includes('vendor') || file.includes('.min.');
    });

    mockProcessVulnerability.mockResolvedValue({ 
      action: 'issue_created', 
      type: 'vendor_update' 
    });

    executor = new PhaseExecutor(mockConfig);
  });

  test('should handle vulnerabilities with singular "file" property', async () => {
    const mockIssue: Partial<IssueContext> = {
      number: 1,
      repository: {
        owner: 'test-owner',
        name: 'test-repo',
        fullName: 'test-owner/test-repo',
        defaultBranch: 'main',
        language: 'JavaScript'
      }
    };

    // Execute with proper method name - mitigate expects issueNumber and repository
    await executor.execute('mitigate', {
      issueNumber: mockIssue.number,
      repository: mockIssue.repository
    });

    // Verify that files were extracted correctly from singular 'file' property
    expect(capturedFiles).toContain('app/assets/vendor/jquery.min.js');
    expect(capturedFiles).toContain('app/models/user.rb');
  });

  test('should handle vulnerabilities with plural "files" property', async () => {
    const mockIssue: Partial<IssueContext> = {
      number: 2,
      repository: {
        owner: 'test-owner',
        name: 'test-repo',
        fullName: 'test-owner/test-repo',
        defaultBranch: 'main',
        language: 'JavaScript'
      }
    };

    // Execute with proper method name - mitigate expects issueNumber and repository
    await executor.execute('mitigate', {
      issueNumber: mockIssue.number,
      repository: mockIssue.repository
    });

    // Verify that files were extracted correctly from plural 'files' property
    expect(capturedFiles).toContain('config/secrets.yml');
    expect(capturedFiles).toContain('app/config/database.yml');
  });

  test('should handle mixed vulnerabilities with both file and files properties', async () => {
    const mockIssue: Partial<IssueContext> = {
      number: 3,
      repository: {
        owner: 'test-owner',
        name: 'test-repo',
        fullName: 'test-owner/test-repo',
        defaultBranch: 'main',
        language: 'JavaScript'
      }
    };

    // Execute with proper method name - mitigate expects issueNumber and repository
    await executor.execute('mitigate', {
      issueNumber: mockIssue.number,
      repository: mockIssue.repository
    });

    // Verify that all files were extracted correctly
    expect(capturedFiles).toContain('vendor/jquery.min.js'); // from 'file'
    expect(capturedFiles).toContain('app/models/user.rb');   // from 'files'
    expect(capturedFiles).toContain('app/models/admin.rb');  // from 'files'
    expect(capturedFiles.length).toBe(3); // No spurious entries from the XSS vuln
  });
});