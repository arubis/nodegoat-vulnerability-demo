#!/usr/bin/env bun

/**
 * Test railsgoat only to debug framework-specific test generation
 */

import { logger } from '../src/utils/logger.js';
import { TestFrameworkDetector } from '../src/ai/test-framework-detector.js';
import { TestGeneratingSecurityAnalyzer } from '../src/ai/test-generating-security-analyzer.js';
import { SecurityDetectorV2 } from '../src/security/detector-v2.js';
import type { IssueContext, ActionConfig } from '../src/types.js';
import type { SecurityAnalysisResultV2 } from '../src/security/types.js';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const appPath = path.join(process.cwd(), 'vulnerable-apps', 'railsgoat');
  
  if (!fs.existsSync(appPath)) {
    logger.error('Railsgoat not found. Please run validate-python-ruby-apps-v2.ts first');
    process.exit(1);
  }
  
  // 1. Detect framework
  const detector = new TestFrameworkDetector();
  const frameworkResult = await detector.detectFrameworks(appPath);
  logger.info('Framework detection:', JSON.stringify(frameworkResult, null, 2));
  
  // 2. Detect vulnerabilities
  const securityDetector = new SecurityDetectorV2();
  const vulnerabilities: any[] = [];
  
  const file = 'app/controllers/users_controller.rb';
  const filePath = path.join(appPath, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  
  const fileVulns = await securityDetector.detect(content, 'ruby', file);
  logger.info(`Found ${fileVulns.length} vulnerabilities`);
  vulnerabilities.push(...fileVulns.map(v => ({ ...v, file })));
  
  if (vulnerabilities.length === 0) {
    logger.error('No vulnerabilities found');
    return;
  }
  
  // 3. Build codebase map WITH Gemfile
  const codebaseFiles = new Map<string, string>();
  
  // CRITICAL: Add Gemfile for framework detection
  const gemfilePath = path.join(appPath, 'Gemfile');
  if (fs.existsSync(gemfilePath)) {
    const gemfileContent = fs.readFileSync(gemfilePath, 'utf-8');
    codebaseFiles.set('Gemfile', gemfileContent);
    logger.info('✓ Added Gemfile to codebase map');
    logger.info('Gemfile content preview:', gemfileContent.split('\n').slice(0, 10).join('\n'));
  } else {
    logger.error('Gemfile not found!');
  }
  
  // Add vulnerable file
  codebaseFiles.set(file, content);
  
  logger.info(`Codebase map contains ${codebaseFiles.size} files: ${Array.from(codebaseFiles.keys()).join(', ')}`);
  
  // 4. Generate tests
  const testAnalyzer = new TestGeneratingSecurityAnalyzer();
  
  const securityAnalysis: SecurityAnalysisResultV2 = {
    hasVulnerabilities: true,
    criticalCount: 0,
    highCount: 1,
    mediumCount: 0,
    lowCount: 0,
    vulnerabilities: vulnerabilities.map((v, idx) => ({
      id: `vuln-${idx + 1}`,
      type: v.type,
      severity: v.severity,
      description: v.message,
      file: v.file,
      line: v.line,
      confidence: v.confidence || 'medium',
      details: {
        pattern: v.description,
        context: `Line ${v.line}: ${v.message}`,
        remediation: v.remediation
      }
    })),
    scanDuration: 1000,
    filesScanned: 1,
    timestamp: new Date().toISOString()
  };
  
  const issue: IssueContext = {
    id: 'test-1',
    number: 1,
    title: 'SQL injection in railsgoat',
    body: 'Test issue',
    labels: ['security'],
    assignees: [],
    repository: {
      owner: 'test',
      name: 'railsgoat',
      fullName: 'test/railsgoat',
      defaultBranch: 'main',
      language: 'ruby'
    },
    source: 'test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  const config: ActionConfig = {
    apiKey: '',
    configPath: '',
    issueLabel: 'security',
    aiProvider: {
      provider: 'openai',
      model: 'gpt-4'
    },
    containerConfig: { enabled: false },
    securitySettings: {},
    enableSecurityAnalysis: true
  };
  
  const mockAiClient = {
    async complete(prompt: string) {
      return 'Use Rails strong parameters and ActiveRecord query interface to prevent injection attacks.';
    }
  };
  
  const result = await testAnalyzer.analyzeWithTestGeneration(
    issue,
    config,
    codebaseFiles,
    mockAiClient,
    securityAnalysis
  );
  
  if (result.generatedTests?.success && result.generatedTests.tests.length > 0) {
    const firstTest = result.generatedTests.tests[0];
    logger.info(`✓ Generated ${firstTest.framework} test`);
    logger.info('\nGenerated test code:');
    logger.info(firstTest.testCode);
  } else {
    logger.error('✗ Test generation failed');
    if (result.generatedTests?.error) {
      logger.error('Error:', result.generatedTests.error);
    }
  }
}

main().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});