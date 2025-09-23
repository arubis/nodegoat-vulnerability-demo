#!/usr/bin/env bun

import { TestFrameworkDetector } from '../src/ai/test-framework-detector.js';
import { logger } from '../src/utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';

const pythonPatterns = [
  {
    regex: /\.raw\s*\(/gi,
    name: 'Python SQL Injection (raw)'
  },
  {
    regex: /pickle\.loads?\s*\(/gi,
    name: 'Pickle Deserialization'
  }
];

async function validatePygoat() {
  const appPath = path.join(process.cwd(), 'vulnerable-apps', 'pygoat');
  const viewsPath = path.join(appPath, 'introduction', 'views.py');
  
  if (!fs.existsSync(viewsPath)) {
    logger.error('views.py not found');
    return;
  }
  
  const content = fs.readFileSync(viewsPath, 'utf-8');
  const lines = content.split('\n');
  
  logger.info(`Analyzing ${viewsPath}`);
  logger.info(`File size: ${content.length} bytes, ${lines.length} lines`);
  
  for (const pattern of pythonPatterns) {
    logger.info(`\nTesting pattern: ${pattern.name}`);
    pattern.regex.lastIndex = 0;
    let match;
    let count = 0;
    
    while ((match = pattern.regex.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      const line = lines[lineNumber - 1]?.trim() || '';
      logger.info(`  Line ${lineNumber}: ${line}`);
      count++;
      
      if (!pattern.regex.global) break;
    }
    
    logger.info(`  Total matches: ${count}`);
  }
  
  // Check if we need to create a requirements.txt for detection
  const requirementsPath = path.join(appPath, 'requirements.txt');
  if (!fs.existsSync(requirementsPath)) {
    logger.info('\nNo requirements.txt found, checking for setup.py or Pipfile');
    const setupPath = path.join(appPath, 'setup.py');
    const pipfilePath = path.join(appPath, 'Pipfile');
    
    if (fs.existsSync(setupPath)) {
      logger.info('Found setup.py');
    }
    if (fs.existsSync(pipfilePath)) {
      logger.info('Found Pipfile');
    }
  }
  
  // Try framework detection
  const detector = new TestFrameworkDetector();
  const frameworkResult = await detector.detectFrameworks(appPath);
  logger.info('\nFramework detection:', JSON.stringify(frameworkResult, null, 2));
}

validatePygoat().catch(console.error);