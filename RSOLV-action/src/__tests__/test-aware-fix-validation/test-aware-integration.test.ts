/**
 * Phase 2 GREEN: Integration test for test-aware fix generation
 *
 * This test demonstrates that the complete test-aware system can prevent
 * the nodegoat validation failure by providing AI with behavioral contract
 * constraints before fix generation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GitBasedClaudeCodeAdapter } from '../../ai/adapters/claude-code-git.js';
import { TestAwareValidationPipeline } from '../../ai/test-discovery/test-aware-validation-pipeline.js';
import { AIConfig } from '../../ai/types.js';
import { IssueContext } from '../../types/index.js';
import { IssueAnalysis } from '../../ai/types.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

describe('Test-Aware Fix Generation Integration', () => {
  let mockConfig: AIConfig;
  let mockIssue: IssueContext;
  let mockAnalysis: IssueAnalysis;
  let tempDir: string;
  let mockRepoPath: string;

  beforeEach(async () => {
    // Create temporary directory for test repository
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-aware-integration-'));
    mockRepoPath = tempDir;

    mockConfig = {
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0.1,
      maxTokens: 4000,
      useVendedCredentials: false,
    };

    mockIssue = {
      id: 'test-aware-nodegoat',
      number: 456,
      title: 'Command Injection in Gruntfile.js db-reset task',
      body: 'Vulnerable code at line 165: exec(cmd + \"node artifacts/db-reset.js\")',
      labels: ['security', 'vulnerability'],
      assignees: [],
      repository: {
        owner: 'test-org',
        name: 'test-aware-demo',
        fullName: 'test-org/test-aware-demo',
        defaultBranch: 'main',
      },
      source: 'github',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {
        vulnerabilityType: 'command-injection',
        securitySeverity: 'high',
        location: 'Gruntfile.js:165',
      },
    };

    mockAnalysis = {
      summary: 'Command injection vulnerability in grunt db-reset task',
      complexity: 'medium',
      estimatedTime: 20,
      potentialFixes: [
        'Replace exec() with execFile() for safer command execution',
        'Add input validation and sanitization',
        'Use array-based arguments instead of string concatenation'
      ],
      recommendedApproach: 'Use execFile with preserved behavioral contracts',
      relatedFiles: ['Gruntfile.js'],
      requiredChanges: ['Fix command injection vulnerability while preserving functionality'],
    };
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error);
    }
  });

  describe('Phase 2 GREEN: Test-Aware System Working', () => {
    it('should provide behavioral contract constraints to AI before fix generation', async () => {
      // Create mock repository structure with vulnerable code and tests
      await setupMockRepository(mockRepoPath);

      const adapter = new GitBasedClaudeCodeAdapter(mockConfig, mockRepoPath);
      const validationPipeline = new TestAwareValidationPipeline();

      // Step 1: Analyze repository for test-aware context BEFORE fix generation
      const testAwareContext = await validationPipeline.analyzeForFixGeneration(
        mockIssue,
        mockAnalysis,
        {
          enabled: true,
          repoPath: mockRepoPath,
          timeout: 10000,
          verbose: true
        }
      );

      // Verify test-aware context was successfully created
      expect(testAwareContext).toBeDefined();
      expect(testAwareContext?.relatedTests.length).toBeGreaterThan(0);
      expect(testAwareContext?.behavioralContracts.length).toBeGreaterThan(0);

      // Step 2: Verify behavioral contracts are extracted correctly
      const behavioralContract = testAwareContext?.behavioralContracts[0];
      expect(behavioralContract?.functionSignature.name).toBe('db-reset');
      expect(behavioralContract?.functionSignature.parameters[0].name).toBe('arg');
      expect(behavioralContract?.functionSignature.callbackPattern?.expectedArgs).toEqual([]);

      // Step 3: Verify fix generation constraints are created
      expect(testAwareContext?.constraints.preserveRequired).toContain(
        'Function parameter name must remain "arg"'
      );
      expect(testAwareContext?.constraints.preserveRequired).toContain(
        'Callback must be called as done() with no arguments'
      );
      expect(testAwareContext?.constraints.forbiddenChanges).toContain(
        'Changing function signature (parameter names/count)'
      );

      // Step 4: Verify security requirements are included
      expect(testAwareContext?.constraints.securityRequirements).toContain(
        'Replace exec() with secure alternative'
      );
      expect(testAwareContext?.constraints.securityRequirements).toContain(
        'Prevent command injection in cmd variable'
      );
    });

    it('should generate test-aware prompt enhancement that prevents behavioral violations', async () => {
      await setupMockRepository(mockRepoPath);

      const adapter = new GitBasedClaudeCodeAdapter(mockConfig, mockRepoPath);
      const validationPipeline = new TestAwareValidationPipeline();

      // Get test-aware context
      const testAwareContext = await validationPipeline.analyzeForFixGeneration(
        mockIssue,
        mockAnalysis,
        {
          enabled: true,
          repoPath: mockRepoPath,
          verbose: false
        }
      );

      expect(testAwareContext).toBeDefined();

      // Generate prompt enhancement
      const promptEnhancement = adapter['testAwareEnhancement'].generatePromptEnhancement(testAwareContext!);

      // Verify the prompt includes critical behavioral constraints
      expect(promptEnhancement).toContain('TEST-AWARE FIX GENERATION');
      expect(promptEnhancement).toContain('BEHAVIORAL CONTRACTS TO PRESERVE');
      expect(promptEnhancement).toContain('Function parameter name must remain "arg"');
      expect(promptEnhancement).toContain('Callback must be called as done() with no arguments');
      expect(promptEnhancement).toContain('FORBIDDEN CHANGES');
      expect(promptEnhancement).toContain('Changing function signature');
      expect(promptEnhancement).toContain('Changing callback signature or behavior');
      expect(promptEnhancement).toContain('INCREMENTAL, not a comprehensive rewrite');

      // Verify security requirements are also included
      expect(promptEnhancement).toContain('SECURITY REQUIREMENTS');
      expect(promptEnhancement).toContain('Replace exec() with secure alternative');
    });

    it('should validate that fixes preserve behavioral contracts', async () => {
      await setupMockRepository(mockRepoPath);

      const validationPipeline = new TestAwareValidationPipeline();

      // Create a mock fixed file that preserves behavioral contracts
      const contractPreservingFix = `
        grunt.registerTask("db-reset", "(Re)init the database.", function(arg) {
          // PRESERVED: Original function signature with 'arg' parameter
          var finalEnv = process.env.NODE_ENV || arg || "development";
          // PRESERVED: Original environment precedence logic

          var done = this.async();
          // PRESERVED: Original async pattern

          var cmd = process.platform === "win32" ? "NODE_ENV=" + finalEnv + " & " : "NODE_ENV=" + finalEnv + " ";
          // PRESERVED: Original Windows platform support

          // SECURITY FIX: Use execFile instead of exec to prevent command injection
          const { execFile } = require('child_process');
          const env = Object.assign({}, process.env, { NODE_ENV: finalEnv });

          execFile(
            'node',
            ['artifacts/db-reset.js'],
            { env: env },
            function(err, stdout, stderr) {
              if (err) {
                grunt.log.error("db-reset:");
                grunt.log.error(err);
                grunt.log.error(stderr);
                // PRESERVED: Original error logging pattern
              } else {
                grunt.log.ok(stdout);
                // PRESERVED: Original success logging pattern
              }
              done();  // PRESERVED: Original callback behavior - no arguments
            }
          );
        });
      `;

      const fixedFilePath = path.join(mockRepoPath, 'Gruntfile-fixed.js');
      await fs.writeFile(fixedFilePath, contractPreservingFix);

      // Validate the fix
      const validationResult = await validationPipeline.validateFix(
        mockIssue,
        mockAnalysis,
        fixedFilePath,
        {
          enabled: true,
          repoPath: mockRepoPath,
          timeout: 10000,
          runTests: false,
          verbose: true
        }
      );

      // This fix should pass validation because it preserves behavioral contracts
      expect(validationResult.success).toBe(true);
      expect(validationResult.contractViolations).toHaveLength(0);
      expect(validationResult.message).toContain('No behavioral contract violations detected');
      expect(validationResult.recommendations[0]).toContain('Fix validation passed');
    });

    it('should detect violations when fixes break behavioral contracts', async () => {
      await setupMockRepository(mockRepoPath);

      const validationPipeline = new TestAwareValidationPipeline();

      // Create a mock fixed file that breaks behavioral contracts (like the original AI fix)
      const contractViolatingFix = `
        grunt.registerTask("db-reset", "(Re)init the database.", function(environment) {
          // VIOLATION: Parameter name changed from 'arg' to 'environment'
          const validEnvironments = ['development', 'test', 'staging', 'production'];
          const targetEnv = environment && validEnvironments.includes(environment)
            ? environment : 'development';
          // VIOLATION: Environment logic completely changed

          const done = this.async();
          const { execFile } = require('child_process');

          execFile('node', ['artifacts/db-reset.js'], { env: { NODE_ENV: targetEnv } }, (error, stdout, stderr) => {
            if (error) {
              grunt.log.error('Database reset failed:', error.message);
              return done(false);  // VIOLATION: done(false) instead of done()
            }
            grunt.log.ok('Database reset completed successfully');
            done(true);  // VIOLATION: done(true) instead of done()
          });
        });
      `;

      const fixedFilePath = path.join(mockRepoPath, 'Gruntfile-violating.js');
      await fs.writeFile(fixedFilePath, contractViolatingFix);

      // Validate the fix
      const validationResult = await validationPipeline.validateFix(
        mockIssue,
        mockAnalysis,
        fixedFilePath,
        {
          enabled: true,
          repoPath: mockRepoPath,
          timeout: 10000,
          runTests: false,
          verbose: true
        }
      );

      // This fix should fail validation because it violates behavioral contracts
      expect(validationResult.success).toBe(false);
      expect(validationResult.contractViolations.length).toBeGreaterThan(0);

      // Check for specific violations
      const signatureViolation = validationResult.contractViolations.find(
        v => v.type === 'function-signature'
      );
      expect(signatureViolation).toBeDefined();
      expect(signatureViolation?.description).toContain('parameter names changed');

      const callbackViolation = validationResult.contractViolations.find(
        v => v.type === 'callback-pattern'
      );
      expect(callbackViolation).toBeDefined();
      expect(callbackViolation?.description).toContain('Callback argument pattern changed');

      // Check recommendations
      expect(validationResult.recommendations).toContain(
        '🚨 CRITICAL: Fix has breaking changes that will cause runtime errors'
      );
      expect(validationResult.recommendations).toContain(
        '   → Revert changes and implement incremental fix preserving function signatures'
      );
    });

    it('should complete the full test-aware workflow end-to-end', async () => {
      await setupMockRepository(mockRepoPath);

      const adapter = new GitBasedClaudeCodeAdapter(mockConfig, mockRepoPath);
      const validationPipeline = new TestAwareValidationPipeline();

      // Step 1: Pre-analysis to get test-aware context
      const preAnalysisContext = await validationPipeline.analyzeForFixGeneration(
        mockIssue,
        mockAnalysis,
        {
          enabled: true,
          repoPath: mockRepoPath,
          timeout: 10000
        }
      );

      expect(preAnalysisContext).toBeDefined();
      expect(preAnalysisContext?.relatedTests.length).toBeGreaterThan(0);
      expect(preAnalysisContext?.behavioralContracts.length).toBeGreaterThan(0);

      // Step 2: Verify that the adapter would use test-aware enhancement
      // (We can't actually call the AI here, so we verify the integration points)

      // Mock the CLI adapter to simulate a test-aware fix being generated
      const mockTestAwareFix = `
        grunt.registerTask("db-reset", "(Re)init the database.", function(arg) {
          var finalEnv = process.env.NODE_ENV || arg || "development";
          var done = this.async();
          var cmd = process.platform === "win32" ? "NODE_ENV=" + finalEnv + " & " : "NODE_ENV=" + finalEnv + " ";

          // Security fix using execFile while preserving behavioral contracts
          const { execFile } = require('child_process');
          const env = Object.assign({}, process.env, { NODE_ENV: finalEnv });

          execFile('node', ['artifacts/db-reset.js'], { env: env }, function(err, stdout, stderr) {
            if (err) {
              grunt.log.error("db-reset:");
              grunt.log.error(err);
              grunt.log.error(stderr);
            } else {
              grunt.log.ok(stdout);
            }
            done();  // Preserved: no arguments to done()
          });
        });
      `;

      // Step 3: Validate the test-aware fix
      const fixedFilePath = path.join(mockRepoPath, 'Gruntfile-test-aware.js');
      await fs.writeFile(fixedFilePath, mockTestAwareFix);

      const validationResult = await validationPipeline.validateFix(
        mockIssue,
        mockAnalysis,
        fixedFilePath,
        {
          enabled: true,
          repoPath: mockRepoPath,
          timeout: 10000,
          runTests: false
        }
      );

      // Step 4: Verify the complete workflow succeeds
      expect(validationResult.success).toBe(true);
      expect(validationResult.contractViolations).toHaveLength(0);
      expect(validationResult.message).toContain('No behavioral contract violations detected');

      // Step 5: Verify performance metrics are tracked
      expect(validationResult.performance.discoveryTime).toBeGreaterThan(0);
      expect(validationResult.performance.totalTime).toBeGreaterThan(0);

      console.log('✅ Phase 2 GREEN: Test-aware fix generation system working correctly');
      console.log(`   - Discovered ${preAnalysisContext?.relatedTests.length} related tests`);
      console.log(`   - Extracted ${preAnalysisContext?.behavioralContracts.length} behavioral contracts`);
      console.log(`   - Generated ${preAnalysisContext?.constraints.preserveRequired.length} preservation constraints`);
      console.log(`   - Validation completed in ${validationResult.performance.totalTime}ms`);
    });
  });
});

/**
 * Setup a mock repository with vulnerable code and related tests
 */
async function setupMockRepository(repoPath: string): Promise<void> {
  // Create vulnerable Gruntfile.js
  const vulnerableGruntfile = `
    grunt.registerTask("db-reset", "(Re)init the database.", function(arg) {
      var finalEnv = process.env.NODE_ENV || arg || "development";
      var done = this.async();
      var cmd = process.platform === "win32" ? "NODE_ENV=" + finalEnv + " & " : "NODE_ENV=" + finalEnv + " ";

      exec(
        cmd + "node artifacts/db-reset.js",  // VULNERABLE LINE
        function(err, stdout, stderr) {
          if (err) {
            grunt.log.error("db-reset:");
            grunt.log.error(err);
            grunt.log.error(stderr);
          } else {
            grunt.log.ok(stdout);
          }
          done();  // IMPORTANT: No arguments passed to done()
        }
      );
    });
  `;

  await fs.writeFile(path.join(repoPath, 'Gruntfile.js'), vulnerableGruntfile);

  // Create related test file
  const testDir = path.join(repoPath, 'test');
  await fs.mkdir(testDir, { recursive: true });

  const gruntTest = `
    describe('Grunt db-reset task', function() {
      it('should accept environment as first argument', function() {
        // This test expects the original behavior: grunt.run.task('db-reset', 'test')
        // Parameter name must remain 'arg'
        expect(true).toBe(true);
      });

      it('should default to development environment when no arg provided', function() {
        // This test expects: process.env.NODE_ENV || arg || "development"
        expect(true).toBe(true);
      });

      it('should handle Windows platform command prefix correctly', function() {
        // This test expects: "NODE_ENV=" + finalEnv + " & "
        expect(true).toBe(true);
      });

      it('should call done() callback with no arguments on success', function() {
        // This test expects: done() with no arguments
        expect(true).toBe(true);
      });
    });
  `;

  await fs.writeFile(path.join(testDir, 'grunt-db-reset.test.js'), gruntTest);

  // Create package.json for test framework detection
  const packageJson = {
    name: 'test-aware-demo',
    scripts: {
      test: 'npm test'
    },
    devDependencies: {
      vitest: '^1.0.0'
    }
  };

  await fs.writeFile(path.join(repoPath, 'package.json'), JSON.stringify(packageJson, null, 2));
}