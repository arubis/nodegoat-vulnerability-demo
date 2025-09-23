import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processIssueWithGit } from '../git-based-processor.js';

// Mock child_process at module level
vi.mock('child_process', () => ({
  execSync: vi.fn(() => '')  // Default to empty string
}));

describe('Git Status - .rsolv Directory Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('should ignore .rsolv/ directory in git status check', async () => {
    // Mock git status to return only .rsolv files
    const { execSync } = await import('child_process');
    (execSync as any).mockImplementation((cmd: string) => {
      if (cmd === 'git status --porcelain') {
        return '?? .rsolv/phase-data/test-123.json\n?? .rsolv/cache/data.json';
      }
      if (cmd.includes('git branch')) {
        return '* main';
      }
      if (cmd.includes('git config')) {
        return 'test@example.com';
      }
      // Default return empty for other commands
      return '';
    });
    
    const issue = {
      id: 'test-123',
      number: 123,
      title: 'Test Issue',
      body: 'Test vulnerability',
      labels: [],
      repository: {
        owner: 'test',
        name: 'repo',
        fullName: 'test/repo'
      }
    };
    
    const config = {
      aiProvider: { provider: 'test' },
      repository: { owner: 'test', name: 'repo' },
      rsolvApiKey: 'test-key'
    } as any;
    
    // This should not fail due to .rsolv files
    // The actual processing will fail for other reasons in test, 
    // but not because of "uncommitted changes"
    const result = await processIssueWithGit(issue, config);
    
    // Should not have the "uncommitted changes" error
    expect(result.error).not.toContain('Uncommitted changes');
  });
  
  it('should still detect real uncommitted changes', async () => {
    // Mock git status to return real changes plus .rsolv files
    const { execSync } = await import('child_process');
    (execSync as any).mockImplementation((cmd: string) => {
      if (cmd === 'git status --porcelain') {
        return ' M src/index.js\n?? .rsolv/phase-data/test.json\n M package.json';
      }
      if (cmd.includes('git branch')) {
        return '* main';
      }
      if (cmd.includes('git config')) {
        return 'test@example.com';
      }
      return '';
    });
    
    const issue = {
      id: 'test-456',
      number: 456,
      title: 'Test Issue',
      body: 'Test vulnerability',
      labels: [],
      repository: {
        owner: 'test',
        name: 'repo',
        fullName: 'test/repo'
      }
    };
    
    const config = {
      aiProvider: { provider: 'test' },
      repository: { owner: 'test', name: 'repo' },
      rsolvApiKey: 'test-key'
    } as any;
    
    const result = await processIssueWithGit(issue, config);
    
    // Should detect the real changes
    expect(result.success).toBe(false);
    expect(result.message).toBe('Repository has uncommitted changes');
    expect(result.error).toContain('src/index.js');
    expect(result.error).toContain('package.json');
    // Should NOT include .rsolv files in the error
    expect(result.error).not.toContain('.rsolv');
  });
});