import { ValidationMode } from '../validation-mode';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('child_process');
jest.mock('fs');

describe('ValidationMode - Test Commit in Test Mode', () => {
  let validationMode: ValidationMode;
  const mockRepoPath = '/test/repo';
  const mockIssue = {
    number: 123,
    title: 'SQL Injection vulnerability',
    body: 'Test vulnerability'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RSOLV_TESTING_MODE = 'true';
    validationMode = new ValidationMode({
      github: {} as any,
      context: {
        repo: { owner: 'test', repo: 'repo' },
        payload: {}
      } as any,
      repoPath: mockRepoPath,
      clientMode: 'validate'
    });
  });

  afterEach(() => {
    delete process.env.RSOLV_TESTING_MODE;
  });

  describe('in test mode', () => {
    it('should always attempt to commit tests even if branch creation initially fails', async () => {
      const testContent = {
        red: { testName: 'SQL injection test', testCode: 'test code' }
      };

      // Mock branch creation to fail initially
      const execSyncMock = execSync as jest.MockedFunction<typeof execSync>;
      execSyncMock.mockImplementation((cmd: string) => {
        if (cmd.includes('git checkout -b')) {
          throw new Error('Branch already exists');
        }
        return Buffer.from('');
      });

      // Mock fs operations
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);

      // Call the method
      await validationMode.commitTestsToBranch(testContent, 'rsolv/validate/issue-123');

      // Verify test file was written
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('validation.test.js'),
        expect.any(String),
        'utf8'
      );

      // Verify commit was attempted
      expect(execSyncMock).toHaveBeenCalledWith(
        expect.stringMatching(/git commit/),
        expect.any(Object)
      );
    });

    it('should force commit tests in test mode even if tests are imperfect', async () => {
      const imperfectTestContent = {
        incomplete: 'This is an incomplete test'
      };

      const execSyncMock = execSync as jest.MockedFunction<typeof execSync>;
      execSyncMock.mockReturnValue(Buffer.from(''));

      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);

      // Should not throw even with imperfect content
      await expect(
        validationMode.commitTestsToBranch(imperfectTestContent, 'rsolv/validate/issue-123')
      ).resolves.not.toThrow();

      // Verify file was written with serialized content
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"incomplete"'),
        'utf8'
      );
    });

    it('should handle test commit even when git push fails', async () => {
      const testContent = { test: 'content' };

      const execSyncMock = execSync as jest.MockedFunction<typeof execSync>;
      execSyncMock.mockImplementation((cmd: string) => {
        if (cmd.includes('git push')) {
          throw new Error('Authentication failed');
        }
        return Buffer.from('');
      });

      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);

      // Should not throw even if push fails
      await expect(
        validationMode.commitTestsToBranch(testContent, 'rsolv/validate/issue-123')
      ).resolves.not.toThrow();

      // Verify test was still written and committed locally
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(execSyncMock).toHaveBeenCalledWith(
        expect.stringMatching(/git commit/),
        expect.any(Object)
      );
    });
  });

  describe('validateIssue in test mode', () => {
    it('should ensure test commits happen in test mode regardless of test quality', async () => {
      process.env.RSOLV_TESTING_MODE = 'true';

      // Mock the necessary methods
      const createBranchSpy = jest.spyOn(validationMode as any, 'createValidationBranch')
        .mockResolvedValue('rsolv/validate/issue-123');

      const commitTestsSpy = jest.spyOn(validationMode as any, 'commitTestsToBranch')
        .mockResolvedValue(undefined);

      const generateTestsSpy = jest.spyOn(validationMode as any, 'generateRedTests')
        .mockResolvedValue({
          generatedTests: {
            testSuite: { red: { testCode: 'test' } }
          }
        });

      // Mock other required methods
      jest.spyOn(validationMode as any, 'analyzeCodebase').mockResolvedValue({});
      jest.spyOn(validationMode as any, 'storeValidationResultWithBranch').mockResolvedValue(undefined);

      // Mock the test validator
      const GitBasedTestValidator = jest.fn().mockImplementation(() => ({
        validateFixWithTests: jest.fn().mockResolvedValue({ success: true })
      }));
      (validationMode as any).GitBasedTestValidator = GitBasedTestValidator;

      // Call validateIssue
      await validationMode.validateIssue(mockIssue as any);

      // Verify test commit was attempted even in test mode
      expect(createBranchSpy).toHaveBeenCalled();
      expect(commitTestsSpy).toHaveBeenCalled();
    });
  });
});