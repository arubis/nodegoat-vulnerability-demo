/**
 * Behavioral Contract Extractor
 *
 * Extracts implicit behavioral contracts from existing code and test patterns.
 * This addresses the core issue: AI needs to understand what behaviors must be
 * preserved when generating security fixes.
 */

import { TestFile, BehavioralExpectation, TestCase } from './test-discovery.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface FunctionSignature {
  name: string;
  parameters: Parameter[];
  returnType: string;
  callbackPattern?: CallbackPattern;
}

export interface Parameter {
  name: string;
  type: string;
  optional: boolean;
  defaultValue?: any;
  validation?: string[];
}

export interface CallbackPattern {
  name: string;
  signature: string;
  expectedArgs: string[];
  behavior: string;
}

export interface BehavioralContract {
  functionSignature: FunctionSignature;
  environmentHandling: EnvironmentContract;
  platformCompatibility: PlatformContract;
  errorHandling: ErrorContract;
  loggingBehavior: LoggingContract;
  integrationPoints: IntegrationPoint[];
}

export interface EnvironmentContract {
  defaultEnvironment: string;
  environmentSources: string[];
  precedenceOrder: string[];
  validationLogic: string;
}

export interface PlatformContract {
  windowsSupport: boolean;
  platformSpecificLogic: string;
  commandPrefixPattern: string;
}

export interface ErrorContract {
  errorTypes: string[];
  errorHandlingPattern: string;
  callbackBehavior: string;
}

export interface LoggingContract {
  successPattern: string;
  errorPattern: string;
  logMethods: string[];
}

export interface IntegrationPoint {
  type: string;
  description: string;
  requirement: string;
}

export interface FixGenerationConstraints {
  preserveRequired: string[];
  securityRequirements: string[];
  allowedChanges: string[];
  forbiddenChanges: string[];
}

export class BehavioralContractExtractor {
  /**
   * Extract behavioral contracts from a vulnerable code file
   */
  async extractFromVulnerableCode(filePath: string, vulnerableContent: string): Promise<BehavioralContract> {
    // For grunt tasks specifically, but can be extended for other patterns
    if (filePath.includes('Gruntfile') || vulnerableContent.includes('grunt.registerTask')) {
      return this.extractGruntTaskContract(vulnerableContent);
    }

    // General function contract extraction
    return this.extractGeneralContract(vulnerableContent);
  }

  /**
   * Extract behavioral contracts from test files
   */
  extractFromTests(testFiles: TestFile[]): BehavioralContract[] {
    const contracts: BehavioralContract[] = [];

    for (const testFile of testFiles) {
      for (const testCase of testFile.testCases) {
        const contract = this.buildContractFromTestCase(testCase, testFile.content);
        if (contract) {
          contracts.push(contract);
        }
      }
    }

    return contracts;
  }

  /**
   * Extract grunt task behavioral contracts
   */
  private extractGruntTaskContract(content: string): BehavioralContract {
    // Extract grunt task registration pattern
    const gruntTaskMatch = content.match(/grunt\.registerTask\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*,\s*function\s*\(\s*([^)]*)\s*\)/);

    let functionSignature: FunctionSignature = {
      name: 'unknown-task',
      parameters: [],
      returnType: 'void'
    };

    if (gruntTaskMatch) {
      const taskName = gruntTaskMatch[1];
      const parameters = gruntTaskMatch[3].split(',').map(p => p.trim()).filter(p => p.length > 0);

      functionSignature = {
        name: taskName,
        parameters: parameters.map(param => ({
          name: param,
          type: 'string | undefined',
          optional: true,
          validation: ['Can be any string', 'Used as parameter override']
        })),
        returnType: 'void',
        callbackPattern: this.extractCallbackPattern(content)
      };
    }

    return {
      functionSignature,
      environmentHandling: this.extractEnvironmentHandling(content),
      platformCompatibility: this.extractPlatformCompatibility(content),
      errorHandling: this.extractErrorHandling(content),
      loggingBehavior: this.extractLoggingBehavior(content),
      integrationPoints: this.extractIntegrationPoints(content, 'grunt-task')
    };
  }

  /**
   * Extract general function behavioral contracts
   */
  private extractGeneralContract(content: string): BehavioralContract {
    const functionSignature = this.extractFunctionSignature(content);

    return {
      functionSignature,
      environmentHandling: this.extractEnvironmentHandling(content),
      platformCompatibility: this.extractPlatformCompatibility(content),
      errorHandling: this.extractErrorHandling(content),
      loggingBehavior: this.extractLoggingBehavior(content),
      integrationPoints: this.extractIntegrationPoints(content, 'general')
    };
  }

  /**
   * Extract function signature from code
   */
  private extractFunctionSignature(content: string): FunctionSignature {
    // Try to find function declarations
    const patterns = [
      /function\s+(\w+)\s*\(\s*([^)]*)\s*\)/,
      /const\s+(\w+)\s*=\s*\(\s*([^)]*)\s*\)\s*=>/,
      /(\w+)\s*:\s*\(\s*([^)]*)\s*\)\s*=>/
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const name = match[1];
        const params = match[2].split(',').map(p => p.trim()).filter(p => p.length > 0);

        return {
          name,
          parameters: params.map(param => ({
            name: param.split(':')[0].trim(),
            type: param.includes(':') ? param.split(':')[1].trim() : 'any',
            optional: param.includes('?') || param.includes('=')
          })),
          returnType: this.inferReturnType(content),
          callbackPattern: this.extractCallbackPattern(content)
        };
      }
    }

    return {
      name: 'unknown-function',
      parameters: [],
      returnType: 'void'
    };
  }

  /**
   * Extract callback patterns from code
   */
  private extractCallbackPattern(content: string): CallbackPattern | undefined {
    // Look for async callback patterns
    if (content.includes('this.async()')) {
      const doneCallMatch = content.match(/done\s*\(\s*([^)]*)\s*\)/g);
      const expectedArgs = doneCallMatch ?
        (doneCallMatch[0].match(/done\s*\(\s*([^)]*)\s*\)/)?.[1].split(',').map(a => a.trim()).filter(a => a.length > 0) || []) :
        [];

      return {
        name: 'done',
        signature: 'this.async()',
        expectedArgs,
        behavior: expectedArgs.length === 0 ?
          'Signal task completion without success/failure indication' :
          'Signal task completion with result parameters'
      };
    }

    // Look for other callback patterns
    const callbackMatch = content.match(/(\w+)\s*\(\s*([^)]*)\s*\).*callback/);
    if (callbackMatch) {
      return {
        name: callbackMatch[1],
        signature: callbackMatch[0],
        expectedArgs: callbackMatch[2].split(',').map(a => a.trim()).filter(a => a.length > 0),
        behavior: 'Standard callback pattern'
      };
    }

    return undefined;
  }

  /**
   * Extract environment handling patterns
   */
  private extractEnvironmentHandling(content: string): EnvironmentContract {
    const envSources: string[] = [];
    const precedenceOrder: string[] = [];
    let defaultEnv = 'development';
    let validationLogic = 'No explicit validation';

    // Look for process.env usage
    if (content.includes('process.env.NODE_ENV')) {
      envSources.push('process.env.NODE_ENV');
      precedenceOrder.push('process.env.NODE_ENV');
    }

    // Look for parameter usage as environment
    const envPattern = /(?:var|let|const)\s+\w+\s*=\s*([^;]+);/g;
    let match;
    while ((match = envPattern.exec(content)) !== null) {
      const assignment = match[1];
      if (assignment.includes('||')) {
        const parts = assignment.split('||').map(p => p.trim());
        parts.forEach(part => {
          if (part.includes('process.env')) {
            if (!envSources.includes(part)) envSources.push(part);
            if (!precedenceOrder.includes(part)) precedenceOrder.push(part);
          } else if (part.includes('arg') || part.includes('environment')) {
            if (!envSources.includes('arg parameter')) envSources.push('arg parameter');
            if (!precedenceOrder.includes('arg')) precedenceOrder.push('arg');
          } else if (part.includes('"') || part.includes("'")) {
            defaultEnv = part.replace(/["']/g, '');
            if (!precedenceOrder.includes(defaultEnv)) precedenceOrder.push(defaultEnv);
          }
        });
        validationLogic = 'Uses first truthy value in precedence order';
      }
    }

    return {
      defaultEnvironment: defaultEnv,
      environmentSources: envSources,
      precedenceOrder,
      validationLogic
    };
  }

  /**
   * Extract platform compatibility patterns
   */
  private extractPlatformCompatibility(content: string): PlatformContract {
    const windowsSupport = content.includes('process.platform') && content.includes('win32');

    let platformSpecificLogic = 'No platform-specific logic detected';
    let commandPrefixPattern = '';

    if (windowsSupport) {
      const platformMatch = content.match(/process\.platform\s*===\s*["']win32["']\s*\?\s*([^:]+)\s*:\s*([^;]+)/);
      if (platformMatch) {
        const windowsCmd = platformMatch[1].trim();
        const unixCmd = platformMatch[2].trim();
        platformSpecificLogic = `Windows uses ${windowsCmd}, Unix uses ${unixCmd}`;

        // Extract command prefix pattern
        const prefixMatch = windowsCmd.match(/["']([^"']*NODE_ENV[^"']*)["']/);
        if (prefixMatch) {
          commandPrefixPattern = prefixMatch[1];
        }
      }
    }

    return {
      windowsSupport,
      platformSpecificLogic,
      commandPrefixPattern
    };
  }

  /**
   * Extract error handling patterns
   */
  private extractErrorHandling(content: string): ErrorContract {
    const errorTypes: string[] = [];
    let errorHandlingPattern = 'No explicit error handling';
    let callbackBehavior = 'Unknown callback behavior';

    // Check for try/catch
    if (content.includes('try {') && content.includes('catch')) {
      errorTypes.push('try-catch exceptions');
      errorHandlingPattern = 'Uses try-catch for error handling';
    }

    // Check for callback error handling
    if (content.includes('function(err') || content.includes('(error,')) {
      errorTypes.push('callback errors');

      // Analyze what happens with errors
      if (content.includes('if (err)') || content.includes('if (error)')) {
        if (content.includes('done()')) {
          callbackBehavior = 'Always call done() regardless of success/failure';
          errorHandlingPattern = 'Log errors but still call done()';
        } else {
          errorHandlingPattern = 'Handle errors in callback';
        }
      }
    }

    // Check for stderr handling
    if (content.includes('stderr')) {
      errorTypes.push('stderr output');
    }

    return {
      errorTypes,
      errorHandlingPattern,
      callbackBehavior
    };
  }

  /**
   * Extract logging behavior patterns
   */
  private extractLoggingBehavior(content: string): LoggingContract {
    const logMethods: string[] = [];
    let successPattern = 'No explicit success logging';
    let errorPattern = 'No explicit error logging';

    // Check for console logging
    if (content.includes('console.log')) {
      logMethods.push('console.log');
    }

    // Check for grunt logging
    if (content.includes('grunt.log')) {
      if (content.includes('grunt.log.ok')) {
        logMethods.push('grunt.log.ok');
        const okMatch = content.match(/grunt\.log\.ok\s*\(\s*([^)]+)\s*\)/);
        if (okMatch) {
          successPattern = `grunt.log.ok(${okMatch[1]})`;
        }
      }

      if (content.includes('grunt.log.error')) {
        logMethods.push('grunt.log.error');
        const errorMatches = content.match(/grunt\.log\.error\s*\(\s*([^)]+)\s*\)/g);
        if (errorMatches) {
          errorPattern = errorMatches.join(' + ');
        }
      }
    }

    return {
      successPattern,
      errorPattern,
      logMethods
    };
  }

  /**
   * Extract integration points
   */
  private extractIntegrationPoints(content: string, type: string): IntegrationPoint[] {
    const points: IntegrationPoint[] = [];

    if (type === 'grunt-task') {
      points.push({
        type: 'grunt-task-system',
        description: 'Must be compatible with grunt task runner',
        requirement: 'Function signature must match grunt.registerTask pattern'
      });

      if (content.includes('this.async()')) {
        points.push({
          type: 'async-callback',
          description: 'Uses grunt async pattern with this.async()',
          requirement: 'Must call done() to signal completion'
        });
      }

      if (content.includes('exec(') || content.includes('execFile(')) {
        points.push({
          type: 'process-execution',
          description: 'Executes external processes',
          requirement: 'Must execute external commands with proper arguments'
        });
      }

      if (content.includes('process.platform')) {
        points.push({
          type: 'cross-platform',
          description: 'Works on Windows and Unix systems',
          requirement: 'Must handle platform-specific command syntax'
        });
      }
    }

    return points;
  }

  /**
   * Build contract from test case
   */
  private buildContractFromTestCase(testCase: TestCase, testContent: string): BehavioralContract | null {
    if (!testCase.functionUnderTest) {
      return null;
    }

    // Extract function patterns from test content around this test case
    const functionSignature: FunctionSignature = {
      name: testCase.functionUnderTest,
      parameters: this.inferParametersFromTest(testCase, testContent),
      returnType: this.inferReturnTypeFromTest(testCase, testContent),
      callbackPattern: this.extractCallbackPatternFromTest(testCase, testContent)
    };

    return {
      functionSignature,
      environmentHandling: {
        defaultEnvironment: 'development',
        environmentSources: [],
        precedenceOrder: [],
        validationLogic: 'Inferred from test patterns'
      },
      platformCompatibility: {
        windowsSupport: false,
        platformSpecificLogic: 'Unknown from test',
        commandPrefixPattern: ''
      },
      errorHandling: {
        errorTypes: [],
        errorHandlingPattern: 'Unknown from test',
        callbackBehavior: 'Unknown from test'
      },
      loggingBehavior: {
        successPattern: 'Unknown from test',
        errorPattern: 'Unknown from test',
        logMethods: []
      },
      integrationPoints: []
    };
  }

  /**
   * Generate fix constraints from behavioral contracts
   */
  generateFixConstraints(contracts: BehavioralContract[]): FixGenerationConstraints {
    const preserveRequired: string[] = [];
    const securityRequirements: string[] = [];
    const allowedChanges: string[] = [];
    const forbiddenChanges: string[] = [];

    for (const contract of contracts) {
      // Function signature preservation
      preserveRequired.push(`Function parameter names must remain "${contract.functionSignature.parameters.map(p => p.name).join(', ')}"`);

      if (contract.functionSignature.callbackPattern) {
        preserveRequired.push(`Callback must be called as ${contract.functionSignature.callbackPattern.name}(${contract.functionSignature.callbackPattern.expectedArgs.join(', ')})`);
      }

      // Environment handling
      if (contract.environmentHandling.precedenceOrder.length > 0) {
        preserveRequired.push(`Environment precedence: ${contract.environmentHandling.precedenceOrder.join(' || ')}`);
      }

      // Platform compatibility
      if (contract.platformCompatibility.windowsSupport) {
        preserveRequired.push('Windows platform support with command prefix logic');
      }

      // Error handling
      if (contract.errorHandling.callbackBehavior.includes('done()')) {
        preserveRequired.push('Error logging using existing patterns');
      }

      // Security requirements (always added)
      securityRequirements.push('Replace vulnerable functions with secure alternatives');
      securityRequirements.push('Prevent injection attacks through input validation');
      securityRequirements.push('Validate/sanitize user input if needed');

      // Allowed changes
      allowedChanges.push('Replace insecure functions with secure equivalents');
      allowedChanges.push('Add input sanitization within existing patterns');
      allowedChanges.push('Improve error handling while preserving interface');
      allowedChanges.push('Update internal implementation while preserving external behavior');

      // Forbidden changes
      forbiddenChanges.push('Changing function signature (parameter names/count)');
      forbiddenChanges.push('Changing callback signature or behavior');
      if (contract.platformCompatibility.windowsSupport) {
        forbiddenChanges.push('Removing Windows platform support');
      }
      forbiddenChanges.push('Changing environment precedence logic');
      forbiddenChanges.push('Altering integration patterns');
    }

    return {
      preserveRequired: [...new Set(preserveRequired)],
      securityRequirements: [...new Set(securityRequirements)],
      allowedChanges: [...new Set(allowedChanges)],
      forbiddenChanges: [...new Set(forbiddenChanges)]
    };
  }

  // Helper methods for test-based inference
  private inferParametersFromTest(testCase: TestCase, testContent: string): Parameter[] {
    // Basic parameter inference from test patterns
    return [];
  }

  private inferReturnTypeFromTest(testCase: TestCase, testContent: string): string {
    // Basic return type inference
    return 'void';
  }

  private extractCallbackPatternFromTest(testCase: TestCase, testContent: string): CallbackPattern | undefined {
    // Basic callback pattern inference
    return undefined;
  }

  private inferReturnType(content: string): string {
    if (content.includes('return ')) {
      return 'unknown';
    }
    return 'void';
  }
}