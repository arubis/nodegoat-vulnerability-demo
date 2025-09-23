#!/usr/bin/env bun

/**
 * Phase 6B: Validate test generation with Python/Ruby vulnerable apps
 * Using SecurityDetectorV2 for proper vulnerability detection
 */

import { logger } from '../src/utils/logger.js';
import { TestFrameworkDetector } from '../src/ai/test-framework-detector.js';
import { TestGeneratingSecurityAnalyzer } from '../src/ai/test-generating-security-analyzer.js';
import { SecurityDetectorV2 } from '../src/security/detector-v2.js';
import type { IssueContext, ActionConfig } from '../src/types.js';
import type { SecurityAnalysisResultV2 } from '../src/security/types.js';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface VulnerableApp {
  name: string;
  repo: string;
  language: string;
  vulnerableFiles: string[];
  expectedVulnerabilities: {
    file: string;
    type: string;
    line?: number;
  }[];
}

const VULNERABLE_APPS: VulnerableApp[] = [
  {
    name: 'django-vulnerable',
    repo: 'https://github.com/anxolerd/dvpwa',
    language: 'python',
    vulnerableFiles: [
      'students/views.py',
      'taskManager/views.py'
    ],
    expectedVulnerabilities: [
      { file: 'students/views.py', type: 'sql_injection' },
      { file: 'taskManager/views.py', type: 'command_injection' }
    ]
  },
  {
    name: 'railsgoat',
    repo: 'https://github.com/OWASP/railsgoat',
    language: 'ruby',
    vulnerableFiles: [
      'app/controllers/users_controller.rb',
      'app/models/user.rb'
    ],
    expectedVulnerabilities: [
      { file: 'app/controllers/users_controller.rb', type: 'sql_injection', line: 29 }
    ]
  },
  {
    name: 'pygoat',
    repo: 'https://github.com/adeyosemanputra/pygoat',
    language: 'python',
    vulnerableFiles: [
      'introduction/views.py',
      'lab/views.py'
    ],
    expectedVulnerabilities: [
      { file: 'introduction/views.py', type: 'sql_injection' },
      { file: 'lab/views.py', type: 'xss' }
    ]
  }
];

async function validateApp(app: VulnerableApp): Promise<void> {
  logger.info(`\n${'='.repeat(60)}`);
  logger.info(`Validating ${app.name} (${app.language})`);
  logger.info(`${'='.repeat(60)}\n`);
  
  const appPath = path.join(process.cwd(), 'vulnerable-apps', app.name);
  
  // 1. Clone if needed
  if (!fs.existsSync(appPath)) {
    logger.info(`Cloning ${app.repo}...`);
    execSync(`git clone ${app.repo} ${appPath}`, { stdio: 'inherit' });
  }
  
  // 2. Detect test framework
  const detector = new TestFrameworkDetector();
  const frameworkResult = await detector.detectFrameworks(appPath);
  
  logger.info('Framework detection result:', JSON.stringify(frameworkResult, null, 2));
  
  if (!frameworkResult.detected) {
    logger.warn(`No test framework detected in ${app.name}`);
    // Continue anyway - we can still generate tests
  }
  
  const primaryFramework = frameworkResult.primaryFramework || frameworkResult.allFrameworks[0];
  if (primaryFramework) {
    logger.info(`✓ Detected framework: ${primaryFramework.name} v${primaryFramework.version}`);
  }
  
  // 3. Find vulnerabilities using SecurityDetectorV2
  const securityDetector = new SecurityDetectorV2();
  const vulnerabilities: any[] = [];
  
  if (app.vulnerableFiles) {
    for (const file of app.vulnerableFiles) {
      const filePath = path.join(appPath, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        logger.info(`Analyzing file: ${file}`);
        
        const fileVulns = await securityDetector.detect(content, app.language, file);
        logger.info(`Found ${fileVulns.length} vulnerabilities in ${file}`);
        vulnerabilities.push(...fileVulns.map(v => ({
          ...v,
          file
        })));
      } else {
        logger.warn(`File not found: ${filePath}`);
      }
    }
  }
  
  logger.info(`Total vulnerabilities found: ${vulnerabilities.length}`);
  
  if (vulnerabilities.length === 0) {
    logger.warn('No vulnerabilities found to test');
    return;
  }
  
  // 4. Generate tests using TestGeneratingSecurityAnalyzer
  const testAnalyzer = new TestGeneratingSecurityAnalyzer();
  
  // Build a proper SecurityAnalysisResultV2
  const securityAnalysis: SecurityAnalysisResultV2 = {
    hasVulnerabilities: true,
    criticalCount: vulnerabilities.filter(v => v.severity === 'critical').length,
    highCount: vulnerabilities.filter(v => v.severity === 'high').length,
    mediumCount: vulnerabilities.filter(v => v.severity === 'medium').length,
    lowCount: vulnerabilities.filter(v => v.severity === 'low').length,
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
    filesScanned: app.vulnerableFiles.length,
    timestamp: new Date().toISOString()
  };
  
  const issue: IssueContext = {
    id: 'test-1',
    number: 1,
    title: `Security vulnerabilities in ${app.name}`,
    body: `Found ${vulnerabilities.length} vulnerabilities:\n${vulnerabilities.map(v => `- ${v.message} at ${v.file}:${v.line}`).join('\n')}`,
    labels: ['security'],
    assignees: [],
    repository: {
      owner: 'test',
      name: app.name,
      fullName: `test/${app.name}`,
      defaultBranch: 'main',
      language: app.language
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
  
  // Build codebase map
  const codebaseFiles = new Map<string, string>();
  
  // Add package files for framework detection - IMPORTANT: must match adaptive test generator's expectations
  const packageFiles = ['package.json', 'requirements.txt', 'Pipfile', 'Gemfile', 'setup.py', 'composer.json', 'mix.exs'];
  for (const pkgFile of packageFiles) {
    const pkgPath = path.join(appPath, pkgFile);
    if (fs.existsSync(pkgPath)) {
      codebaseFiles.set(pkgFile, fs.readFileSync(pkgPath, 'utf-8'));
      logger.info(`Added ${pkgFile} to codebase map for framework detection`);
    }
  }
  
  // Add vulnerable files
  if (app.vulnerableFiles) {
    for (const file of app.vulnerableFiles) {
      const filePath = path.join(appPath, file);
      if (fs.existsSync(filePath)) {
        codebaseFiles.set(file, fs.readFileSync(filePath, 'utf-8'));
      }
    }
  }
  
  const mockAiClient = {
    async complete(prompt: string) {
      // Mock response for testing
      if (app.language === 'python') {
        return 'Use parameterized queries instead of string concatenation to prevent SQL injection.';
      } else {
        return 'Use Rails strong parameters and ActiveRecord query interface to prevent injection attacks.';
      }
    }
  };
  
  // Pass the security analysis result
  logger.info(`Codebase map contains ${codebaseFiles.size} files`);
  logger.info(`Files in map: ${Array.from(codebaseFiles.keys()).join(', ')}`);
  
  const result = await testAnalyzer.analyzeWithTestGeneration(
    issue,
    config,
    codebaseFiles,
    mockAiClient,
    securityAnalysis
  );
  
  if (result.generatedTests?.success && result.generatedTests.tests.length > 0) {
    logger.info('✓ Test generation successful!');
    const firstTest = result.generatedTests.tests[0];
    logger.info(`Generated ${firstTest.framework} test`);
    
    // 5. Save the test
    const testFileName = `test_${app.name}_security.${app.language === 'python' ? 'py' : 'rb'}`;
    const testPath = path.join(process.cwd(), 'generated-tests', testFileName);
    
    // Create directory if needed
    fs.mkdirSync(path.dirname(testPath), { recursive: true });
    fs.writeFileSync(testPath, firstTest.testCode);
    
    logger.info(`Test saved to: ${testPath}`);
    
    // Show test command (but don't run automatically for safety)
    const framework = firstTest.framework || primaryFramework?.name;
    if (framework) {
      const testCommand = getTestCommand(framework, testPath, app.language);
      logger.info(`\nTo run the test:`);
      logger.info(`  cd ${appPath}`);
      logger.info(`  ${testCommand}`);
    }
    
    // Show the generated test
    logger.info('\nGenerated test preview:');
    logger.info(firstTest.testCode.split('\n').slice(0, 20).join('\n'));
    if (firstTest.testCode.split('\n').length > 20) {
      logger.info('... (truncated)');
    }
  } else {
    logger.error('✗ Test generation failed');
    if (result.generatedTests?.error) {
      logger.error('Error:', result.generatedTests.error);
    }
  }
}

function getTestCommand(framework: string, testPath: string, language: string): string {
  switch (framework.toLowerCase()) {
    case 'pytest':
      return `pytest ${testPath}`;
    case 'unittest':
      return `python -m unittest ${testPath}`;
    case 'rspec':
      return `rspec ${testPath}`;
    case 'minitest':
      return `ruby ${testPath}`;
    default:
      return `# Unknown test command for ${framework}`;
  }
}

async function main() {
  logger.info('Phase 6B: Python/Ruby Vulnerable App Validation (V2)');
  logger.info('=' .repeat(60));
  
  // Ensure vulnerable-apps directory exists
  fs.mkdirSync(path.join(process.cwd(), 'vulnerable-apps'), { recursive: true });
  
  for (const app of VULNERABLE_APPS) {
    try {
      await validateApp(app);
    } catch (error) {
      logger.error(`Failed to validate ${app.name}:`, error);
    }
  }
  
  logger.info('\n\nValidation Summary');
  logger.info('=' .repeat(60));
  logger.info('Check generated-tests/ directory for generated test files');
  logger.info('Each test is designed to run in its respective framework');
  logger.info('\nPhase 6B Complete! ✓');
}

main().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});