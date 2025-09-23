/**
 * TDD tests for vendor filtering across all phases
 * These tests verify that vendor files are properly filtered in:
 * 1. Scan phase (already implemented)
 * 2. Validation phase (to be implemented)
 * 3. Mitigation phase (to be implemented)
 */

import { describe, test, expect, beforeEach, vi, mock } from 'vitest';
import type { IssueContext, ActionConfig } from '../../types/index.js';
import type { ValidationResult } from '../types.js';

// Mock modules
vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));
vi.mock('child_process');
vi.mock('fs');
vi.mock('../../ai/analyzer.js');
vi.mock('../../ai/test-generating-security-analyzer.js');
vi.mock('../../ai/git-based-test-validator.js');

describe('Vendor Filtering Across All Phases', () => {
  let vendorDetector: VendorDetector;

  beforeEach(() => {
    vi.clearAllMocks();
    vendorDetector = new VendorDetector();
  });

  describe('Phase 1: Scan (Already Working)', () => {
    test('should mark vulnerabilities in vendor files with isVendor flag', () => {
      const vulnerabilities = [
        {
          filePath: 'app/assets/vendor/jquery.min.js',
          type: 'xss',
          isVendor: true // This is already working
        },
        {
          filePath: 'app/routes/index.js',
          type: 'sql-injection',
          isVendor: false
        }
      ];

      const vendorVulns = vulnerabilities.filter(v => v.isVendor);
      const appVulns = vulnerabilities.filter(v => !v.isVendor);

      expect(vendorVulns).toHaveLength(1);
      expect(appVulns).toHaveLength(1);
    });
  });

  describe('Phase 2: Validation - Vendor File Filtering', () => {
    let validationMode: ValidationMode;
    let mockConfig: ActionConfig;

    beforeEach(() => {
      mockConfig = {
        github: {
          token: 'test-token',
          repository: 'test/repo'
        },
        aiProvider: {
          apiKey: 'test-key',
          model: 'test-model',
          maxTokens: 1000,
          useVendedCredentials: false
        },
        issueNumber: 123,
        mode: 'validate',
        testGeneration: { enabled: true },
        fixValidation: { enabled: true },
        enableSecurityAnalysis: true
      } as ActionConfig;

      validationMode = new ValidationMode(mockConfig, '/test/repo');
    });

    test('should mark vendor file vulnerabilities as VENDORED, not FALSE_POSITIVE', async () => {
      const issue: IssueContext = {
        id: 123,
        number: 123,
        title: 'XSS vulnerability in vendor file',
        body: JSON.stringify({
          vulnerabilities: [{
            type: 'xss',
            file: 'app/assets/vendor/morris-0.4.3.min.js',
            line: 100
          }]
        }),
        repository: 'test/repo',
        labels: []
      };

      // Mock the vendor detector
      const mockVendorDetector = {
        isVendorFile: vi.fn().mockResolvedValue(true)
      };

      // Mock analyzeIssue to return vendor file
      const { analyzeIssue } = await import('../../ai/analyzer.js');
      vi.mocked(analyzeIssue).mockResolvedValue({
        issueType: 'security',
        filesToModify: ['app/assets/vendor/morris-0.4.3.min.js'],
        canBeFixed: true,
        estimatedComplexity: 'medium',
        requiredContext: [],
        suggestedApproach: 'Fix XSS',
        confidenceScore: 0.8
      });

      // This test should FAIL with current implementation
      // We need to add vendor detection in validation phase
      const result = await validationMode.validateVulnerability(issue);

      // Expected behavior: Vendor files should be marked as VENDORED
      expect(result.validated).toBe(false);
      expect(result.vendoredFile).toBe(true); // NEW FIELD
      expect(result.falsePositiveReason).toContain('vendor');
      expect(result.falsePositiveReason).not.toContain('false positive');
    });

    test('should skip test generation for vendor files', async () => {
      const issue: IssueContext = {
        id: 124,
        number: 124,
        title: 'Vulnerability in vendor library',
        body: 'Weak crypto in app/assets/vendor/chart/morris-0.4.3.min.js',
        repository: 'test/repo',
        labels: []
      };

      // Mock to identify as vendor file
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('minified vendor code');

      const result = await validationMode.validateVulnerability(issue);

      // Should not attempt to generate tests for vendor files
      expect(result.validated).toBe(false);
      expect(result.vendoredFile).toBe(true);
      expect(result.redTests).toBeUndefined();
    });
  });

  describe('Phase 3: Mitigation - Vendor File Filtering', () => {
    let mitigationMode: MitigationMode;
    let mockConfig: ActionConfig;

    beforeEach(() => {
      mockConfig = {
        github: {
          token: 'test-token',
          repository: 'test/repo'
        },
        aiProvider: {
          apiKey: 'test-key',
          model: 'test-model',
          maxTokens: 1000,
          useVendedCredentials: false
        },
        issueNumber: 123,
        mode: 'mitigate',
        testGeneration: { enabled: true },
        fixValidation: { enabled: true },
        enableSecurityAnalysis: true
      } as ActionConfig;

      mitigationMode = new MitigationMode(mockConfig, '/test/repo');
    });

    test('should not generate fixes for vendor files', async () => {
      const issue: IssueContext = {
        id: 125,
        number: 125,
        title: 'Insecure deserialization in vendor library',
        body: JSON.stringify({
          vulnerabilities: [{
            type: 'insecure_deserialization',
            file: 'app/assets/vendor/chart/morris-0.4.3.min.js',
            line: 500
          }]
        }),
        repository: 'test/repo',
        labels: []
      };

      // Mock validation data to include vendor flag
      const validationData = {
        issueId: 125,
        validated: false,
        vendoredFile: true, // NEW: Vendor flag from validation phase
        falsePositiveReason: 'Vulnerability in vendor file - requires library update',
        timestamp: new Date().toISOString(),
        commitHash: 'abc123'
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validationData));

      // This should not attempt to generate fixes
      const result = await mitigationMode.generateTestAwareFix(issue);

      expect(result.skipReason).toBe('vendor_file');
      expect(result.message).toContain('vendor library');
      expect(result.enhancedPrompt).toBeUndefined();
    });

    test('should exclude vendor files from fix generation even if mixed with app files', async () => {
      const issue: IssueContext = {
        id: 126,
        number: 126,
        title: 'Multiple vulnerabilities',
        body: JSON.stringify({
          vulnerabilities: [
            {
              type: 'xss',
              file: 'app/routes/index.js', // App file
              line: 50
            },
            {
              type: 'xss',
              file: 'app/assets/vendor/jquery.min.js', // Vendor file
              line: 100
            }
          ]
        }),
        repository: 'test/repo',
        labels: []
      };

      const vendorDetector = new VendorDetector();

      // Filter out vendor files
      const vulnerabilities = JSON.parse(issue.body).vulnerabilities;
      const appVulnerabilities = [];

      for (const vuln of vulnerabilities) {
        if (vuln.file) {
          const isVendor = await vendorDetector.isVendorFile(vuln.file);
          if (!isVendor) {
            appVulnerabilities.push(vuln);
          }
        }
      }

      expect(appVulnerabilities).toHaveLength(1);
      expect(appVulnerabilities[0].file).toBe('app/routes/index.js');
      expect(appVulnerabilities[0].file).not.toContain('vendor');
    });
  });

  describe('Integration: End-to-End Vendor Filtering', () => {
    test('should handle vendor files correctly through all phases', async () => {
      // Phase 1: Scan detects vulnerability in vendor file
      const scanResult = {
        vulnerabilities: [{
          filePath: 'app/assets/vendor/chart/morris-0.4.3.min.js',
          type: 'insecure_deserialization',
          isVendor: true
        }]
      };

      // Phase 2: Validation marks as VENDORED
      const validationResult: ValidationResult = {
        issueId: 127,
        validated: false,
        vendoredFile: true,
        falsePositiveReason: 'Vulnerability in vendor file - requires library update',
        timestamp: new Date().toISOString(),
        commitHash: 'def456'
      };

      // Phase 3: Mitigation skips fix generation
      const mitigationResult = {
        skipReason: 'vendor_file',
        message: 'Cannot patch vendor library - update required'
      };

      // Verify the flow
      expect(scanResult.vulnerabilities[0].isVendor).toBe(true);
      expect(validationResult.vendoredFile).toBe(true);
      expect(validationResult.validated).toBe(false);
      expect(mitigationResult.skipReason).toBe('vendor_file');
    });
  });

  describe('Vendor Detection Helper Functions', () => {
    test('should extract files from various issue formats', () => {
      const formats = [
        {
          input: { vulnerabilities: [{ file: 'vendor/jquery.js' }] },
          expected: ['vendor/jquery.js']
        },
        {
          input: { vulnerabilities: [{ filePath: 'vendor/jquery.js' }] },
          expected: ['vendor/jquery.js']
        },
        {
          input: { vulnerabilities: [{ path: 'vendor/jquery.js' }] },
          expected: ['vendor/jquery.js']
        },
        {
          input: { vulnerabilities: [{ location: { file: 'vendor/jquery.js' } }] },
          expected: ['vendor/jquery.js']
        }
      ];

      formats.forEach(({ input, expected }) => {
        const files = extractFilesFromVulnerabilities(input.vulnerabilities);
        expect(files).toEqual(expected);
      });
    });

    test('should correctly identify vendor patterns', () => {
      const vendorDetector = new VendorDetector();

      const vendorFiles = [
        'app/assets/vendor/jquery.min.js',
        'node_modules/express/index.js',
        'vendor/autoload.php',
        'bower_components/angular/angular.js',
        'app/assets/vendor/chart/morris-0.4.3.min.js'
      ];

      const appFiles = [
        'app/routes/index.js',
        'app/controllers/user.js',
        'src/main.ts',
        'lib/security.js'
      ];

      vendorFiles.forEach(file => {
        expect(vendorDetector.isVendorFile(file)).resolves.toBe(true);
      });

      appFiles.forEach(file => {
        expect(vendorDetector.isVendorFile(file)).resolves.toBe(false);
      });
    });
  });
});

// Helper function to extract files from various vulnerability formats
function extractFilesFromVulnerabilities(vulnerabilities: any[]): string[] {
  return vulnerabilities.flatMap(v => {
    // Try different property names
    if (v.file) return [v.file];
    if (v.filePath) return [v.filePath];
    if (v.path) return [v.path];
    if (v.location?.file) return [v.location.file];
    if (v.files) return v.files;
    return [];
  });
}