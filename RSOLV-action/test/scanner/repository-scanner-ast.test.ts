import { describe, it, expect, beforeEach, vi, vi } from 'vitest';
import { RepositoryScanner } from '../../src/scanner/repository-scanner.js';
import { ASTValidator } from '../../src/scanner/ast-validator.js';
import type { ScanConfig, FileToScan } from '../../src/scanner/types.js';
import type { Vulnerability } from '../../src/security/types.js';
import { VulnerabilityType } from '../../src/security/types.js';

// Mock dependencies
vi.mock('../../src/github/api.js', () => ({
  getGitHubClient: () => ({
    git: {
      getTree: mock(() => ({ data: { tree: [] } })),
      getBlob: vi.fn()
    }
  })
}));

vi.mock('../../src/security/detector-v2.js', () => ({
  SecurityDetectorV2: mock(() => ({
    detect: mock(() => [])
  }))
}));

vi.mock('../../src/scanner/ast-validator.js', () => ({
  ASTValidator: vi.fn()
}));

describe('RepositoryScanner with AST Validation', () => {
  let scanner: RepositoryScanner;
  let mockValidator: any;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.restoreAllMocks();
    
    // Re-mock the modules
    vi.mock('../../src/github/api.js', () => ({
      getGitHubClient: () => ({
        git: {
          getTree: vi.fn(() => ({ data: { tree: [] } })),
          getBlob: vi.fn()
        }
      })
    }));

    vi.mock('../../src/security/detector-v2.js', () => ({
      SecurityDetectorV2: vi.fn(() => ({
        detect: vi.fn(() => [])
      }))
    }));

    vi.mock('../../src/scanner/ast-validator.js', () => ({
      ASTValidator: vi.fn()
    }));
    
    scanner = new RepositoryScanner();
    mockValidator = {
      validateVulnerabilities: vi.fn()
    };
    (ASTValidator as any).mockImplementation(() => mockValidator);
  });

  it('should use AST validation when enabled and API key is provided', async () => {
    const config: ScanConfig = {
      repository: {
        owner: 'test',
        name: 'repo',
        defaultBranch: 'main'
      },
      enableASTValidation: true,
      rsolvApiKey: 'test-api-key',
      createIssues: false,
      issueLabel: 'security'
    };

    // Mock detector to return vulnerabilities
    const mockVulnerabilities: Vulnerability[] = [
      {
        type: VulnerabilityType.COMMAND_INJECTION,
        severity: 'critical' as const,
        description: 'Eval injection detected',
        message: 'Using eval() with user input can lead to code injection',
        line: 10,
        column: 5,
        filePath: 'test.js',
        snippet: 'eval(x);',
        confidence: 90,
        cweId: 'CWE-95',
        owaspCategory: 'A03:2021',
        remediation: 'Do not use eval with user input'
      }
    ];

    // Mock the scanner's detector
    const mockDetector = (scanner as any).detector;
    mockDetector.detect.mockResolvedValue(mockVulnerabilities);

    // Mock GitHub API to return a file
    const mockGitHub = (scanner as any).github;
    mockGitHub.git.getTree.mockResolvedValue({
      data: {
        tree: [
          { type: 'blob', path: 'test.js', sha: 'abc123', size: 100 }
        ]
      }
    });
    mockGitHub.git.getBlob.mockResolvedValue({
      data: {
        content: Buffer.from('eval(x);').toString('base64'),
        encoding: 'base64'
      }
    });

    // Mock validator to filter out the vulnerability
    mockValidator.validateVulnerabilities.mockResolvedValue([]);

    const result = await scanner.scan(config);

    // Verify AST validator was called
    expect(ASTValidator).toHaveBeenCalledWith('test-api-key');
    expect(mockValidator.validateVulnerabilities).toHaveBeenCalledWith(
      mockVulnerabilities,
      expect.any(Map)
    );

    // Result should have no vulnerabilities (filtered by AST)
    expect(result.vulnerabilities).toHaveLength(0);
    expect(result.groupedVulnerabilities).toHaveLength(0);
  });

  it('should skip AST validation when disabled', async () => {
    const config: ScanConfig = {
      repository: {
        owner: 'test',
        name: 'repo',
        defaultBranch: 'main'
      },
      enableASTValidation: false, // Disabled
      rsolvApiKey: 'test-api-key',
      createIssues: false,
      issueLabel: 'security'
    };

    const mockVulnerabilities: Vulnerability[] = [
      {
        type: VulnerabilityType.COMMAND_INJECTION,
        severity: 'critical' as const,
        description: 'Eval injection detected',
        message: 'Using eval() with user input can lead to code injection',
        line: 10,
        column: 5,
        filePath: 'test.js',
        snippet: 'eval(x);',
        confidence: 90,
        cweId: 'CWE-95',
        owaspCategory: 'A03:2021',
        remediation: 'Do not use eval with user input'
      }
    ];

    const mockDetector = (scanner as any).detector;
    mockDetector.detect.mockResolvedValue(mockVulnerabilities);

    const mockGitHub = (scanner as any).github;
    mockGitHub.git.getTree.mockResolvedValue({
      data: { tree: [{ type: 'blob', path: 'test.js', sha: 'abc123', size: 100 }] }
    });
    mockGitHub.git.getBlob.mockResolvedValue({
      data: { content: Buffer.from('eval(x);').toString('base64') }
    });

    const result = await scanner.scan(config);

    // AST validator should not be called
    expect(mockValidator.validateVulnerabilities).not.toHaveBeenCalled();

    // Result should have all vulnerabilities
    expect(result.vulnerabilities).toHaveLength(1);
  });

  it('should skip AST validation when no API key is provided', async () => {
    const config: ScanConfig = {
      repository: {
        owner: 'test',
        name: 'repo',
        defaultBranch: 'main'
      },
      enableASTValidation: true,
      rsolvApiKey: undefined, // No API key
      createIssues: false,
      issueLabel: 'security'
    };

    const mockVulnerabilities: Vulnerability[] = [
      {
        type: VulnerabilityType.COMMAND_INJECTION,
        severity: 'critical' as const,
        description: 'Eval injection detected',
        message: 'Using eval() with user input can lead to code injection',
        line: 10,
        column: 5,
        filePath: 'test.js',
        snippet: 'eval(x);',
        confidence: 90,
        cweId: 'CWE-95',
        owaspCategory: 'A03:2021',
        remediation: 'Do not use eval with user input'
      }
    ];

    const mockDetector = (scanner as any).detector;
    mockDetector.detect.mockResolvedValue(mockVulnerabilities);

    const mockGitHub = (scanner as any).github;
    mockGitHub.git.getTree.mockResolvedValue({
      data: { tree: [{ type: 'blob', path: 'test.js', sha: 'abc123', size: 100 }] }
    });
    mockGitHub.git.getBlob.mockResolvedValue({
      data: { content: Buffer.from('eval(x);').toString('base64') }
    });

    const result = await scanner.scan(config);

    // AST validator should not be instantiated
    expect(ASTValidator).not.toHaveBeenCalled();

    // Result should have all vulnerabilities
    expect(result.vulnerabilities).toHaveLength(1);
  });

  it('should provide file contents to AST validator', async () => {
    const config: ScanConfig = {
      repository: {
        owner: 'test',
        name: 'repo',
        defaultBranch: 'main'
      },
      enableASTValidation: true,
      rsolvApiKey: 'test-api-key',
      createIssues: false,
      issueLabel: 'security'
    };

    const fileContent = 'const x = eval(userInput); // dangerous';
    
    const mockVulnerabilities: Vulnerability[] = [
      {
        type: VulnerabilityType.COMMAND_INJECTION,
        severity: 'critical' as const,
        description: 'Eval injection detected',
        message: 'Using eval() with user input can lead to code injection',
        line: 1,
        column: 11,
        filePath: 'app.js',
        snippet: 'const x = eval(userInput);',
        confidence: 90,
        cweId: 'CWE-95',
        owaspCategory: 'A03:2021',
        remediation: 'Do not use eval with user input'
      }
    ];

    const mockDetector = (scanner as any).detector;
    mockDetector.detect.mockResolvedValue(mockVulnerabilities);

    const mockGitHub = (scanner as any).github;
    mockGitHub.git.getTree.mockResolvedValue({
      data: {
        tree: [
          { type: 'blob', path: 'app.js', sha: 'abc123', size: fileContent.length }
        ]
      }
    });
    mockGitHub.git.getBlob.mockResolvedValue({
      data: {
        content: Buffer.from(fileContent).toString('base64')
      }
    });

    mockValidator.validateVulnerabilities.mockResolvedValue(mockVulnerabilities);

    await scanner.scan(config);

    // Verify file contents were passed to validator
    expect(mockValidator.validateVulnerabilities).toHaveBeenCalledWith(
      mockVulnerabilities,
      new Map([['app.js', fileContent]])
    );
  });
});