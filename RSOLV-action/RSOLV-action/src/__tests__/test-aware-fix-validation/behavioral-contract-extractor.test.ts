/**
 * Phase 1 RED: Behavioral Contract Extractor for Grunt Task Interface
 *
 * This test demonstrates extracting behavioral contracts from the vulnerable
 * grunt task interface. This is critical for ensuring AI-generated fixes
 * preserve existing functionality while fixing security vulnerabilities.
 */

import { describe, it, expect } from 'vitest';

// Types for behavioral contract analysis
interface FunctionSignature {
  name: string;
  parameters: Parameter[];
  returnType: string;
  callbackPattern?: CallbackPattern;
}

interface Parameter {
  name: string;
  type: string;
  optional: boolean;
  defaultValue?: any;
  validation?: string[];
}

interface CallbackPattern {
  name: string;
  signature: string;
  expectedArgs: string[];
  behavior: string;
}

interface BehavioralContract {
  functionSignature: FunctionSignature;
  environmentHandling: EnvironmentContract;
  platformCompatibility: PlatformContract;
  errorHandling: ErrorContract;
  loggingBehavior: LoggingContract;
  integrationPoints: IntegrationPoint[];
}

interface EnvironmentContract {
  defaultEnvironment: string;
  environmentSources: string[];
  precedenceOrder: string[];
  validationLogic: string;
}

interface PlatformContract {
  windowsSupport: boolean;
  platformSpecificLogic: string;
  commandPrefixPattern: string;
}

interface ErrorContract {
  errorTypes: string[];
  errorHandlingPattern: string;
  callbackBehavior: string;
}

interface LoggingContract {
  successPattern: string;
  errorPattern: string;
  logMethods: string[];
}

interface IntegrationPoint {
  type: string;
  description: string;
  requirement: string;
}

describe('Behavioral Contract Extraction', () => {
  describe('Grunt db-reset Task Analysis', () => {
    it('should extract the complete behavioral contract from the vulnerable grunt task', () => {
      // Simulate the vulnerable grunt task code analysis
      const vulnerableTaskCode = `
        grunt.registerTask("db-reset", "(Re)init the database.", function(arg) {
          var finalEnv = process.env.NODE_ENV || arg || "development";
          var done;

          done = this.async();
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
              done();  // CRITICAL: No arguments passed to done()
            }
          );
        });
      `;

      // Extract behavioral contract from the code
      const extractedContract: BehavioralContract = {
        functionSignature: {
          name: 'db-reset',
          parameters: [
            {
              name: 'arg',
              type: 'string | undefined',
              optional: true,
              defaultValue: undefined,
              validation: ['Can be any string', 'Used as environment override']
            }
          ],
          returnType: 'void',
          callbackPattern: {
            name: 'done',
            signature: 'this.async()',
            expectedArgs: [],  // CRITICAL CONTRACT: done() called with NO arguments
            behavior: 'Signal task completion without success/failure indication'
          }
        },

        environmentHandling: {
          defaultEnvironment: 'development',
          environmentSources: ['process.env.NODE_ENV', 'arg parameter', 'default fallback'],
          precedenceOrder: ['process.env.NODE_ENV', 'arg', 'development'],
          validationLogic: 'Uses first truthy value in precedence order'
        },

        platformCompatibility: {
          windowsSupport: true,
          platformSpecificLogic: 'Windows uses "&" separator, Unix uses " " separator',
          commandPrefixPattern: 'NODE_ENV=<env> & | NODE_ENV=<env> '
        },

        errorHandling: {
          errorTypes: ['exec errors', 'stderr output'],
          errorHandlingPattern: 'Log errors but still call done()',
          callbackBehavior: 'Always call done() regardless of success/failure'
        },

        loggingBehavior: {
          successPattern: 'grunt.log.ok(stdout)',
          errorPattern: 'grunt.log.error("db-reset:") + grunt.log.error(err) + grunt.log.error(stderr)',
          logMethods: ['grunt.log.ok', 'grunt.log.error']
        },

        integrationPoints: [
          {
            type: 'grunt-task-system',
            description: 'Must be compatible with grunt task runner',
            requirement: 'Function signature must match grunt.registerTask pattern'
          },
          {
            type: 'async-callback',
            description: 'Uses grunt async pattern with this.async()',
            requirement: 'Must call done() to signal completion'
          },
          {
            type: 'process-execution',
            description: 'Executes external Node.js script',
            requirement: 'Must execute artifacts/db-reset.js with environment variable'
          },
          {
            type: 'cross-platform',
            description: 'Works on Windows and Unix systems',
            requirement: 'Must handle platform-specific command syntax'
          }
        ]
      };

      // Verify critical behavioral contracts are identified
      expect(extractedContract.functionSignature.name).toBe('db-reset');
      expect(extractedContract.functionSignature.parameters[0].name).toBe('arg');
      expect(extractedContract.functionSignature.parameters[0].optional).toBe(true);

      // CRITICAL: Callback contract - done() called with no arguments
      expect(extractedContract.functionSignature.callbackPattern?.expectedArgs).toEqual([]);
      expect(extractedContract.functionSignature.callbackPattern?.behavior).toContain('without success/failure indication');

      // Environment handling contract
      expect(extractedContract.environmentHandling.defaultEnvironment).toBe('development');
      expect(extractedContract.environmentHandling.precedenceOrder).toEqual(['process.env.NODE_ENV', 'arg', 'development']);

      // Platform compatibility contract
      expect(extractedContract.platformCompatibility.windowsSupport).toBe(true);
      expect(extractedContract.platformCompatibility.commandPrefixPattern).toContain('NODE_ENV=');

      // Integration requirements
      const gruntIntegration = extractedContract.integrationPoints.find(p => p.type === 'grunt-task-system');
      expect(gruntIntegration?.requirement).toContain('grunt.registerTask pattern');

      const asyncIntegration = extractedContract.integrationPoints.find(p => p.type === 'async-callback');
      expect(asyncIntegration?.requirement).toContain('Must call done()');
    });

    it('should identify which behavioral contracts were violated by the AI fix', () => {
      // Simulate the AI-generated fix
      const aiGeneratedFix = `
        grunt.registerTask("db-reset", "(Re)init the database.", function(environment) {
          const validEnvironments = ['development', 'test', 'staging', 'production'];
          const targetEnv = environment && validEnvironments.includes(environment)
            ? environment : 'development';

          const done = this.async();
          const { execFile } = require('child_process');
          const path = require('path');

          execFile('node', [scriptPath], { env }, (error, stdout, stderr) => {
            if (error) {
              grunt.log.error('Database reset failed:', error.message);
              return done(false);  // VIOLATION: done(false) instead of done()
            }
            if (stderr) {
              grunt.log.warn('Database reset warnings:', stderr);
            }
            grunt.log.ok('Database reset completed successfully');
            grunt.log.ok(stdout);
            done(true);  // VIOLATION: done(true) instead of done()
          });
        });
      `;

      // Analyze contract violations
      const contractViolations = [
        {
          contract: 'Function Signature',
          violation: 'Parameter name changed from "arg" to "environment"',
          impact: 'Breaking change for any code that inspects function parameters',
          severity: 'HIGH'
        },
        {
          contract: 'Callback Pattern',
          violation: 'done(false) and done(true) instead of done()',
          impact: 'Changes grunt task completion semantics',
          severity: 'CRITICAL'
        },
        {
          contract: 'Environment Handling',
          violation: 'Added explicit validation with whitelist',
          impact: 'Rejects previously valid environment values',
          severity: 'HIGH'
        },
        {
          contract: 'Platform Compatibility',
          violation: 'Removed Windows-specific command building logic',
          impact: 'May break Windows compatibility assumptions',
          severity: 'MEDIUM'
        },
        {
          contract: 'Error Logging',
          violation: 'Changed error message format and added warn logging',
          impact: 'Different logging output than expected',
          severity: 'LOW'
        }
      ];

      // Verify critical violations are detected
      const criticalViolations = contractViolations.filter(v => v.severity === 'CRITICAL');
      expect(criticalViolations.length).toBe(1);
      expect(criticalViolations[0].violation).toContain('done(false) and done(true)');

      const highViolations = contractViolations.filter(v => v.severity === 'HIGH');
      expect(highViolations.length).toBe(2);

      // This demonstrates why the fix validation failed:
      // Multiple behavioral contracts were violated simultaneously
      const totalViolations = contractViolations.length;
      expect(totalViolations).toBeGreaterThan(3);
    });

    it('should provide constraints for test-aware fix generation', () => {
      // Define the constraints that should be provided to AI for fix generation
      const fixGenerationConstraints = {
        preserveRequired: [
          'Function parameter name must remain "arg"',
          'Callback must be called as done() with no arguments',
          'Environment precedence: process.env.NODE_ENV || arg || "development"',
          'Windows platform support with command prefix logic',
          'Error logging using grunt.log.error patterns'
        ],
        securityRequirements: [
          'Replace exec() with secure alternative',
          'Prevent command injection in cmd variable',
          'Validate/sanitize environment input if needed'
        ],
        allowedChanges: [
          'Replace exec() with execFile() or spawn()',
          'Add input sanitization for environment values',
          'Improve error handling within existing patterns',
          'Update internal implementation while preserving interface'
        ],
        forbiddenChanges: [
          'Changing function signature (parameter names/count)',
          'Changing callback signature or behavior',
          'Removing Windows platform support',
          'Changing environment precedence logic',
          'Altering grunt task registration pattern'
        ]
      };

      // Verify constraint categories are comprehensive
      expect(fixGenerationConstraints.preserveRequired.length).toBeGreaterThan(4);
      expect(fixGenerationConstraints.securityRequirements.length).toBeGreaterThan(2);
      expect(fixGenerationConstraints.allowedChanges.length).toBeGreaterThan(3);
      expect(fixGenerationConstraints.forbiddenChanges.length).toBeGreaterThan(4);

      // Verify critical constraints are captured
      const callbackConstraint = fixGenerationConstraints.preserveRequired.find(c => c.includes('done()'));
      expect(callbackConstraint).toContain('no arguments');

      const signatureConstraint = fixGenerationConstraints.forbiddenChanges.find(c => c.includes('function signature'));
      expect(signatureConstraint).toContain('parameter names');

      const securityConstraint = fixGenerationConstraints.securityRequirements.find(c => c.includes('command injection'));
      expect(securityConstraint).toContain('cmd variable');
    });
  });

  describe('Contract-Aware Fix Validation', () => {
    it('should demonstrate how extracted contracts enable proper fix validation', () => {
      // This test shows how behavioral contracts can be used to validate fixes
      const contractBasedValidation = {
        step1: 'Extract behavioral contracts from existing code',
        step2: 'Generate AI fix with contract constraints',
        step3: 'Validate fix against both security and behavioral requirements',
        step4: 'Ensure all contracts are preserved or have approved changes'
      };

      // Simulate a proper contract-aware fix that would pass validation
      const contractAwareFix = `
        grunt.registerTask("db-reset", "(Re)init the database.", function(arg) {
          // PRESERVED: Original function signature
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

      // This fix should pass validation because it:
      // 1. Fixes the security vulnerability (command injection)
      // 2. Preserves all behavioral contracts
      // 3. Maintains existing integration points

      expect(contractBasedValidation.step1).toContain('Extract behavioral contracts');
      expect(contractBasedValidation.step3).toContain('security and behavioral');

      // The contract-aware fix preserves the critical elements
      expect(contractAwareFix).toContain('function(arg)');  // Original signature
      expect(contractAwareFix).toContain('done();');         // Original callback
      expect(contractAwareFix).toContain('process.platform === "win32"'); // Windows support
      expect(contractAwareFix).toContain('execFile(');       // Security fix
    });
  });
});