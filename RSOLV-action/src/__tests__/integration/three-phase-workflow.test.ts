/**
 * Integration test for RFC-058 three-phase workflow with validation branch persistence
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ValidationMode } from '../../modes/validation-mode.js';
import { MitigationMode } from '../../modes/mitigation-mode.js';
import { IssueContext } from '../../types/index.js';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

describe('Three-Phase Workflow Integration', () => {
  let testRepoPath: string;
  let mockIssue: IssueContext;

  beforeEach(() => {
    // Create a temporary test repository
    testRepoPath = '/tmp/integration-test-' + Date.now();
    fs.mkdirSync(testRepoPath, { recursive: true });

    // Initialize git repo
    execSync('git init', { cwd: testRepoPath });
    execSync('git config user.email "test@example.com"', { cwd: testRepoPath });
    execSync('git config user.name "Test User"', { cwd: testRepoPath });

    // Create initial commit
    fs.writeFileSync(path.join(testRepoPath, 'README.md'), '# Test Repo');
    execSync('git add .', { cwd: testRepoPath });
    execSync('git commit -m "Initial commit"', { cwd: testRepoPath });

    mockIssue = {
      id: 'test-integration-123',
      number: 123,
      title: 'SQL Injection vulnerability',
      body: 'User input not properly sanitized',
      labels: ['security'],
      assignees: [],
      repository: {
        owner: 'test-org',
        name: 'test-repo',
        fullName: 'test-org/test-repo',
        defaultBranch: 'main'
      },
      source: 'github',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  });

  afterEach(() => {
    // Clean up
    fs.rmSync(testRepoPath, { recursive: true, force: true });
  });

  it('should complete full workflow: validation branch → test persistence → mitigation checkout', async () => {
    const validationMode = new ValidationMode({
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'claude-3-5-sonnet-20241022',
      useVendedCredentials: false
    }, testRepoPath);

    const mitigationMode = new MitigationMode({
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'claude-3-5-sonnet-20241022',
      useVendedCredentials: false
    }, testRepoPath);

    // Phase 1: Validation creates branch and commits tests
    const branchName = await validationMode.createValidationBranch(mockIssue);
    expect(branchName).toBe('rsolv/validate/issue-123');

    const testContent = `
      describe('SQL Injection Test', () => {
        it('should prevent SQL injection', () => {
          expect(vulnerableQuery("'; DROP TABLE users; --")).toThrow();
        });
      });
    `;

    await validationMode.commitTestsToBranch(testContent, branchName);
    await validationMode.storeValidationResultWithBranch(
      mockIssue,
      { testsPassed: false },
      { validated: true },
      branchName
    );

    // Verify validation branch exists and has tests
    const branches = execSync('git branch --list', { cwd: testRepoPath })
      .toString()
      .split('\n')
      .map(b => b.trim().replace('* ', ''));
    expect(branches).toContain(branchName);

    // Switch to main to simulate phase transition
    execSync('git checkout main', { cwd: testRepoPath });

    // Phase 2: Mitigation checks out validation branch
    const branchCheckedOut = await mitigationMode.checkoutValidationBranch(mockIssue);
    expect(branchCheckedOut).toBe(true);

    // Verify we're on validation branch
    const currentBranch = execSync('git branch --show-current', { cwd: testRepoPath })
      .toString()
      .trim();
    expect(currentBranch).toBe(branchName);

    // Phase 3: Mitigation generates test-aware fix
    const mitigationResult = await mitigationMode.generateTestAwareFix(mockIssue);
    expect(mitigationResult.branchCheckedOut).toBe(true);
    expect(mitigationResult.testFilesFound).toBe(1);
    expect(mitigationResult.enhancedPrompt).toContain('VALIDATION TESTS AVAILABLE');
    expect(mitigationResult.enhancedPrompt).toContain('should prevent SQL injection');

    // Phase 4: PR preparation
    const prResult = await mitigationMode.createPRFromValidationBranch(mockIssue);
    expect(prResult.success).toBe(true);
    expect(prResult.branch).toBe(branchName);
    expect(prResult.hasTests).toBe(true);
    expect(prResult.title).toContain('Fix security vulnerability');
  });

  it('should handle missing validation branch gracefully', async () => {
    const mitigationMode = new MitigationMode({
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'claude-3-5-sonnet-20241022',
      useVendedCredentials: false
    }, testRepoPath);

    // Try to checkout non-existent validation branch
    const branchCheckedOut = await mitigationMode.checkoutValidationBranch(mockIssue);
    expect(branchCheckedOut).toBe(false);

    // Should stay on main branch
    const currentBranch = execSync('git branch --show-current', { cwd: testRepoPath })
      .toString()
      .trim();
    expect(currentBranch).toBe('main');

    // Should still work but without test enhancement
    const mitigationResult = await mitigationMode.generateTestAwareFix(mockIssue);
    expect(mitigationResult.branchCheckedOut).toBe(false);
    expect(mitigationResult.testFilesFound).toBe(0);
    expect(mitigationResult.enhancedPrompt).not.toContain('VALIDATION TESTS AVAILABLE');
  });
});