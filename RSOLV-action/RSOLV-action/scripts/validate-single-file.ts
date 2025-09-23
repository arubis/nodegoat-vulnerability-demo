#!/usr/bin/env bun

import { TestGeneratingSecurityAnalyzer } from '../src/ai/test-generating-security-analyzer.js';
import { SecurityDetectorV2 } from '../src/security/detector-v2.js';
import { ActionConfig, IssueContext } from '../src/types/index.js';
import { logger } from '../src/utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';

async function validateSingleFile() {
  const filePath = path.join(process.cwd(), 'vulnerable-apps/nodegoat/app/routes/contributions.js');
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // 1. Detect vulnerabilities
  const detector = new SecurityDetectorV2();
  const scanResult = await detector.detect(content, 'javascript', 'contributions.js');
  
  // Parse if it's a string
  const vulnerabilities = typeof scanResult === 'string' ? JSON.parse(scanResult) : scanResult?.vulnerabilities || scanResult;
  
  logger.info(`Scan result (${typeof scanResult}):`, JSON.stringify(vulnerabilities, null, 2));
  
  if (!vulnerabilities || vulnerabilities.length === 0) {
    logger.error('No vulnerabilities found!');
    return;
  }
  
  logger.info(`Found ${vulnerabilities.length} vulnerabilities`);
  
  // 2. Generate tests
  const analyzer = new TestGeneratingSecurityAnalyzer();
  
  const issueContext: IssueContext = {
    id: 'test-1',
    number: 1,
    title: 'Security vulnerabilities in contributions.js',
    body: `Found ${vulnerabilities.length} vulnerabilities including eval() usage`,
    labels: ['security'],
    assignees: [],
    repository: {
      owner: 'test',
      name: 'nodegoat',
      fullName: 'test/nodegoat',
      defaultBranch: 'main',
      language: 'javascript'
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
    containerConfig: {
      enabled: false
    },
    securitySettings: {},
    enableSecurityAnalysis: true
  };
  
  const codebaseFiles = new Map<string, string>();
  codebaseFiles.set('app/routes/contributions.js', content);
  
  // Add package.json if exists
  const packageJsonPath = path.join(process.cwd(), 'vulnerable-apps/nodegoat/package.json');
  if (fs.existsSync(packageJsonPath)) {
    codebaseFiles.set('package.json', fs.readFileSync(packageJsonPath, 'utf-8'));
  }
  
  // Use mock AI client for testing
  const mockAiClient = {
    async complete(prompt: string) {
      return `Based on the vulnerability analysis, I recommend using parseInt() instead of eval() to safely parse numeric values. The eval() function executes arbitrary code and poses a severe security risk when used with user input.`;
    }
  };
  
  try {
    const result = await analyzer.analyzeWithTestGeneration(
      issueContext,
      config,
      codebaseFiles,
      mockAiClient
    );
    
    logger.info('Analysis result:', JSON.stringify(result, null, 2));
    
    if (result.generatedTests?.success && result.generatedTests?.tests?.length > 0) {
      logger.info('✅ Test generation successful!');
      logger.info(`Generated ${result.generatedTests.tests.length} test(s)`);
      
      const firstTest = result.generatedTests.tests[0];
      logger.info(`Framework detected: ${firstTest.framework}`);
      logger.info('Generated test code:');
      logger.info(firstTest.testCode);
      
      // Save the test
      const testPath = path.join(process.cwd(), 'generated-test-contributions.test.js');
      fs.writeFileSync(testPath, firstTest.testCode);
      logger.info(`Test saved to: ${testPath}`);
    } else {
      logger.error('❌ Test generation failed:', result.generatedTests?.error || 'Unknown error');
    }
  } catch (error) {
    logger.error('Error:', error);
  }
}

validateSingleFile().catch(console.error);