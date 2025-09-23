/**
 * TDD Phase 1 RED: Tests for branch creation and test persistence in validation phase
 *
 * These tests define the behavior we want:
 * 1. Validation phase creates a feature branch
 * 2. Generated red tests are committed to the branch
 * 3. Branch information is stored for mitigation phase
 * 4. Mitigation phase checks out the validation branch
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ValidationMode } from '../../modes/validation-mode.js';
import { MitigationMode } from '../../modes/mitigation-mode.js';
import { IssueContext } from '../../types/index.js';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

describe('Validation Branch Persistence', () => {
  let validationMode: ValidationMode;
  let mitigationMode: MitigationMode;
  let mockIssue: IssueContext;
  let testRepoPath: string;

  beforeEach(() => {
    // Create a temporary test repository
    testRepoPath = '/tmp/test-repo-' + Date.now();
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
      id: 'test-123',
      number: 123,
      title: 'Test vulnerability',
      body: 'Test issue body',
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

    validationMode = new ValidationMode({
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'claude-3-5-sonnet-20241022',
      useVendedCredentials: false
    }, testRepoPath);

    mitigationMode = new MitigationMode({
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'claude-3-5-sonnet-20241022',
      useVendedCredentials: false
    }, testRepoPath);
  });

  afterEach(() => {
    // Clean up
    fs.rmSync(testRepoPath, { recursive: true, force: true });
  });

  describe('Phase 1 RED: Define expected behavior', () => {
    it('should create a feature branch during validation', async () => {
      // This test will fail until we implement branch creation
      const branchName = `rsolv/validate/issue-${mockIssue.number}`;

      // Run validation (mocked for now)
      await validationMode.createValidationBranch(mockIssue);

      // Check that branch was created
      const branches = execSync('git branch --list', { cwd: testRepoPath })
        .toString()
        .split('\n')
        .map(b => b.trim().replace('* ', ''));

      expect(branches).toContain(branchName);
    });

    it('should commit generated red tests to the validation branch', async () => {
      const branchName = `rsolv/validate/issue-${mockIssue.number}`;
      const testContent = `
        describe('Vulnerability Test', () => {
          it('should detect command injection', () => {
            // Red test that proves vulnerability exists
            expect(vulnerableFunction).toBeVulnerable();
          });
        });
      `;

      // Run validation with test generation
      await validationMode.createValidationBranch(mockIssue);
      await validationMode.commitTestsToBranch(testContent, branchName);

      // Switch to branch and check files
      execSync(`git checkout ${branchName}`, { cwd: testRepoPath });

      // Check that test file exists
      const testFilePath = path.join(testRepoPath, '.rsolv', 'tests', 'validation.test.js');
      expect(fs.existsSync(testFilePath)).toBe(true);

      // Check that test content is correct
      const committedContent = fs.readFileSync(testFilePath, 'utf-8');
      expect(committedContent).toContain('should detect command injection');
    });

    it('should store branch name in validation results', async () => {
      const branchName = `rsolv/validate/issue-${mockIssue.number}`;

      // Run validation
      await validationMode.createValidationBranch(mockIssue);
      const validationResult = await validationMode.storeValidationResultWithBranch(
        mockIssue,
        { testsPassed: false },
        { validated: true },
        branchName
      );

      // Check stored result includes branch name
      const storagePath = path.join(testRepoPath, '.rsolv', 'validation', `issue-${mockIssue.number}.json`);
      const storedData = JSON.parse(fs.readFileSync(storagePath, 'utf-8'));

      expect(storedData.branchName).toBe(branchName);
      expect(storedData.issueId).toBe(mockIssue.number);
    });

    it('should checkout validation branch in mitigation phase', async () => {
      const branchName = `rsolv/validate/issue-${mockIssue.number}`;

      // Setup: Create branch and validation result
      execSync(`git checkout -b ${branchName}`, { cwd: testRepoPath });

      // Create test file in branch
      const testDir = path.join(testRepoPath, '.rsolv', 'tests');
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(
        path.join(testDir, 'validation.test.js'),
        'console.log("Red test");'
      );
      execSync('git add .', { cwd: testRepoPath });
      execSync('git commit -m "Add validation tests"', { cwd: testRepoPath });

      // Switch back to main
      execSync('git checkout main', { cwd: testRepoPath });

      // Store validation result with branch name
      const validationData = {
        issueId: mockIssue.number,
        branchName: branchName,
        validated: true,
        timestamp: new Date().toISOString()
      };
      const storageDir = path.join(testRepoPath, '.rsolv', 'validation');
      fs.mkdirSync(storageDir, { recursive: true });
      fs.writeFileSync(
        path.join(storageDir, `issue-${mockIssue.number}.json`),
        JSON.stringify(validationData, null, 2)
      );

      // Run mitigation - should checkout validation branch
      await mitigationMode.checkoutValidationBranch(mockIssue);

      // Verify we're on the validation branch
      const currentBranch = execSync('git branch --show-current', { cwd: testRepoPath })
        .toString()
        .trim();

      expect(currentBranch).toBe(branchName);

      // Verify test file is available
      expect(fs.existsSync(path.join(testDir, 'validation.test.js'))).toBe(true);
    });

    it('should handle missing validation branch gracefully', async () => {
      // Don't create any branch, just validation result without branch
      const validationData = {
        issueId: mockIssue.number,
        validated: true,
        timestamp: new Date().toISOString()
        // No branchName field
      };

      const storageDir = path.join(testRepoPath, '.rsolv', 'validation');
      fs.mkdirSync(storageDir, { recursive: true });
      fs.writeFileSync(
        path.join(storageDir, `issue-${mockIssue.number}.json`),
        JSON.stringify(validationData, null, 2)
      );

      // Should not throw, should stay on current branch
      await expect(mitigationMode.checkoutValidationBranch(mockIssue)).resolves.not.toThrow();

      // Should still be on main branch
      const currentBranch = execSync('git branch --show-current', { cwd: testRepoPath })
        .toString()
        .trim();

      expect(currentBranch).toBe('main');
    });

    it('should preserve test files between validation and mitigation phases', async () => {
      // Full workflow test
      const branchName = `rsolv/validate/issue-${mockIssue.number}`;
      const testContent = `
        describe('Security Test', () => {
          it('should fail on vulnerable code', () => {
            expect(isVulnerable()).toBe(true);
          });
        });
      `;

      // Validation phase: create branch and commit tests
      await validationMode.createValidationBranch(mockIssue);
      await validationMode.commitTestsToBranch(testContent, branchName);
      await validationMode.storeValidationResultWithBranch(
        mockIssue,
        { testsPassed: false },
        { validated: true },
        branchName
      );

      // Switch back to main to simulate phase transition
      execSync('git checkout main', { cwd: testRepoPath });

      // Mitigation phase: checkout branch and verify tests exist
      await mitigationMode.checkoutValidationBranch(mockIssue);

      // Tests should be available
      const testPath = path.join(testRepoPath, '.rsolv', 'tests', 'validation.test.js');
      expect(fs.existsSync(testPath)).toBe(true);

      const retrievedContent = fs.readFileSync(testPath, 'utf-8');
      expect(retrievedContent).toContain('should fail on vulnerable code');
    });
  });
});