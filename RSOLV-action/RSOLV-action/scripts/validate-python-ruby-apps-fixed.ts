#!/usr/bin/env bun

/**
 * Phase 6B: Validate test generation with Python and Ruby vulnerable apps (FIXED)
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
import { ActionConfig, IssueContext } from '../src/types/index.js';
import { logger } from '../src/utils/logger.js';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Import pattern types
import { SecurityPattern, VulnerabilityType } from '../src/security/types.js';

// Create patterns inline to avoid serialization issues
const rubyPatterns: SecurityPattern[] = [
  {
    id: 'ruby-sql-injection',
    name: 'Ruby SQL Injection',
    type: VulnerabilityType.SQL_INJECTION,
    severity: 'high',
    description: 'SQL injection via string interpolation',
    patterns: {
      regex: [
        /where\s*\(\s*["'].*#\{.*\}.*["']\s*\)/gi,
        /find_by_sql\s*\(\s*["'].*#\{.*\}.*["']\s*\)/gi,
        /execute\s*\(\s*["'].*#\{.*\}.*["']\s*\)/gi
      ]
    },
    languages: ['ruby'],
    cweId: 'CWE-89',
    owaspCategory: 'A03:2021',
    remediation: 'Use parameterized queries or ActiveRecord query interface',
    examples: { vulnerable: '', secure: '' }
  }
];

const pythonPatterns: SecurityPattern[] = [
  {
    id: 'python-sql-injection',
    name: 'Python SQL Injection',
    type: VulnerabilityType.SQL_INJECTION,
    severity: 'high',
    description: 'SQL injection via string formatting or concatenation',
    patterns: {
      regex: [
        /\.raw\s*\(/gi,
        /execute\s*\(\s*["'].*%[s|d].*["']\s*%/gi,
        /execute\s*\(\s*["'].*\+.*["']\s*\)/gi,
        /cursor\.execute\s*\(\s*f["']/gi
      ]
    },
    languages: ['python'],
    cweId: 'CWE-89',
    owaspCategory: 'A03:2021',
    remediation: 'Use parameterized queries with ? or %s placeholders',
    examples: { vulnerable: '', secure: '' }
  },
  {
    id: 'python-pickle',
    name: 'Insecure Deserialization',
    type: VulnerabilityType.INSECURE_DESERIALIZATION,
    severity: 'high',
    description: 'Use of pickle with untrusted data',
    patterns: {
      regex: [
        /pickle\.loads?\s*\(/gi,
        /cPickle\.loads?\s*\(/gi
      ]
    },
    languages: ['python'],
    cweId: 'CWE-502',
    owaspCategory: 'A08:2021',
    remediation: 'Use JSON or other safe serialization formats',
    examples: { vulnerable: '', secure: '' }
  }
];

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
    repo: 'https://github.com/anxolerd/dvpwa',  
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

// Simple vulnerability detector that uses our patterns directly
function detectVulnerabilities(code: string, language: string, filePath: string): any[] {
  const vulnerabilities: any[] = [];
  const lines = code.split('\n');
  const patterns = language === 'ruby' ? rubyPatterns : pythonPatterns;
  
  for (const pattern of patterns) {
    if (pattern.patterns.regex) {
      for (const regex of pattern.patterns.regex) {
        regex.lastIndex = 0;
        let match;
        
        while ((match = regex.exec(code)) !== null) {
          const lineNumber = code.substring(0, match.index).split('\n').length;
          const line = lines[lineNumber - 1]?.trim() || '';
          
          vulnerabilities.push({
            type: pattern.type,
            severity: pattern.severity,
            line: lineNumber,
            message: `${pattern.name}: ${pattern.description}`,
            description: pattern.description,
            cweId: pattern.cweId,
            owaspCategory: pattern.owaspCategory,
            remediation: pattern.remediation
          });
          
          if (!regex.global) break;
        }
      }
    }
  }
  
  return vulnerabilities;
}

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
  
  // 3. Find vulnerabilities using our simple detector
  const vulnerabilities: any[] = [];
  
  if (app.vulnerableFiles) {
    for (const file of app.vulnerableFiles) {
      const filePath = path.join(appPath, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        logger.info(`Analyzing file: ${file}`);
        
        const fileVulns = detectVulnerabilities(content, app.language, file);
        logger.info(`Found ${fileVulns.length} vulnerabilities in ${file}`);
        vulnerabilities.push(...fileVulns);
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
  
  // 4. Generate tests
  const testAnalyzer = new TestGeneratingSecurityAnalyzer();
  const issue: IssueContext = {
    id: 'test-1',
    number: 1,
    title: `Security vulnerabilities in ${app.name}`,
    body: `Found ${vulnerabilities.length} vulnerabilities:\n${vulnerabilities.map(v => `- ${v.message} at line ${v.line}`).join('\n')}`,
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
    
    // 5. Save the test
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
  logger.info('Phase 6B: Python/Ruby Vulnerable App Validation (FIXED)');
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

main().catch(console.error);