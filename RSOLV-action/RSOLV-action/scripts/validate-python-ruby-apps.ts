#!/usr/bin/env bun

/**
 * Phase 6B: Validate test generation with Python and Ruby vulnerable apps
 * 
 * This script:
 * 1. Clones vulnerable Python/Ruby apps
 * 2. Detects their test frameworks
 * 3. Finds vulnerabilities
 * 4. Generates tests
 * 5. Attempts to run the generated tests
 */

import { TestFrameworkDetector } from '../src/ai/test-framework-detector.js';
import { TestGeneratingSecurityAnalyzer } from '../src/ai/test-generating-security-analyzer.js';
import { SecurityDetectorV2 } from '../src/security/detector-v2.js';
import { ActionConfig, IssueContext } from '../src/types/index.js';
import { logger } from '../src/utils/logger.js';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface VulnerableApp {
  name: string;
  repo: string;
  language: 'python' | 'ruby';
  expectedFramework: string;
  vulnerableFiles?: string[];
}

const VULNERABLE_APPS: VulnerableApp[] = [
  {
    name: 'django-vulnerable',
    repo: 'https://github.com/anxolerd/dvpwa',  // Damn Vulnerable Python Web App
    language: 'python',
    expectedFramework: 'pytest',
    vulnerableFiles: ['sqli/views.py', 'xss/views.py']
  },
  {
    name: 'railsgoat',
    repo: 'https://github.com/OWASP/railsgoat',
    language: 'ruby',
    expectedFramework: 'rspec',
    vulnerableFiles: ['app/controllers/users_controller.rb']
  },
  {
    name: 'pygoat',
    repo: 'https://github.com/adeyosemanputra/pygoat',
    language: 'python',
    expectedFramework: 'unittest',
    vulnerableFiles: ['introduction/views.py']
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
    return;
  }
  
  const primaryFramework = frameworkResult.primaryFramework || frameworkResult.allFrameworks[0];
  logger.info(`✓ Detected framework: ${primaryFramework.name} v${primaryFramework.version}`);
  
  // 3. Find vulnerabilities
  const securityDetector = new SecurityDetectorV2();
  const vulnerabilities: any[] = [];
  
  if (app.vulnerableFiles) {
    for (const file of app.vulnerableFiles) {
      const filePath = path.join(appPath, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const extension = path.extname(file).slice(1);
        // Map file extension to language name for pattern matching
        const languageMap: Record<string, string> = {
          'py': 'python',
          'rb': 'ruby',
          'js': 'javascript',
          'ts': 'typescript',
          'java': 'java',
          'php': 'php',
          'ex': 'elixir',
          'exs': 'elixir'
        };
        const language = languageMap[extension] || extension;
        logger.info(`Analyzing file: ${file} (language: ${language})`);
        logger.info(`File exists: ${fs.existsSync(filePath)}, size: ${content.length} bytes`);
        const result = await securityDetector.detect(content, language, file);
        
        // The detect method returns an array of vulnerabilities directly
        if (result && Array.isArray(result)) {
          logger.info(`Found ${result.length} vulnerabilities in ${file}`);
          vulnerabilities.push(...result);
        }
      } else {
        logger.warn(`File not found: ${filePath}`);
      }
    }
  } else {
    // If no specific vulnerable files provided, scan all source files
    logger.info('No specific vulnerable files provided, scanning all source files...');
    const extensions = app.language === 'python' ? ['.py'] : ['.rb'];
    const sourceFiles: string[] = [];
    
    function findFiles(dir: string) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
          findFiles(fullPath);
        } else if (extensions.some(ext => file.endsWith(ext))) {
          sourceFiles.push(fullPath);
        }
      }
    }
    
    findFiles(appPath);
    logger.info(`Found ${sourceFiles.length} ${app.language} files to scan`);
    
    for (const filePath of sourceFiles.slice(0, 10)) { // Limit to first 10 files for testing
      const content = fs.readFileSync(filePath, 'utf-8');
      const relativePath = path.relative(appPath, filePath);
      const result = await securityDetector.detect(content, app.language, relativePath);
      if (result && Array.isArray(result)) {
        logger.info(`Found ${result.length} vulnerabilities in ${relativePath}`);
        vulnerabilities.push(...result);
      }
    }
  }
  
  logger.info(`Found ${vulnerabilities.length} vulnerabilities`);
  
  if (vulnerabilities.length === 0) {
    logger.warn('No vulnerabilities found to test');
    return;
  }
  
  // 4. Generate tests
  const testAnalyzer = new TestGeneratingSecurityAnalyzer();
  const issue: IssueContext = {
    id: 'test-1',
    number: 1,
    title: `Security vulnerabilities in ${app.name}`,
    body: `Found ${vulnerabilities.length} vulnerabilities`,
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
  
  // Add package files for framework detection
  const packageFiles = ['package.json', 'requirements.txt', 'Pipfile', 'Gemfile', 'setup.py'];
  for (const pkgFile of packageFiles) {
    const pkgPath = path.join(appPath, pkgFile);
    if (fs.existsSync(pkgPath)) {
      codebaseFiles.set(pkgFile, fs.readFileSync(pkgPath, 'utf-8'));
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
  
  const result = await testAnalyzer.analyzeWithTestGeneration(
    issue,
    config,
    codebaseFiles,
    mockAiClient
  );
  
  if (result.generatedTests?.success && result.generatedTests.tests.length > 0) {
    logger.info('✓ Test generation successful!');
    const firstTest = result.generatedTests.tests[0];
    logger.info(`Generated ${firstTest.framework} test`);
    
    // 5. Try to run the test (in a safe way)
    const testFileName = `test_${app.name}_security.${app.language === 'python' ? 'py' : 'rb'}`;
    const testPath = path.join(process.cwd(), 'generated-tests', testFileName);
    
    // Create directory if needed
    fs.mkdirSync(path.dirname(testPath), { recursive: true });
    fs.writeFileSync(testPath, firstTest.testCode);
    
    logger.info(`Test saved to: ${testPath}`);
    
    // Show test command (but don't run automatically for safety)
    const testCommand = getTestCommand(primaryFramework.name, testPath, app.language);
    logger.info(`\nTo run the test:`);
    logger.info(`  cd ${appPath}`);
    logger.info(`  ${testCommand}`);
    
  } else {
    logger.error('✗ Test generation failed');
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
  logger.info('Phase 6B: Python/Ruby Vulnerable App Validation');
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
}

main().catch(console.error);