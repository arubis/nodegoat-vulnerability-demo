#!/usr/bin/env bun

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../src/utils/logger.js';

/**
 * Alternative Python framework detection methods
 */

interface PythonFrameworkIndicators {
  // Package management files
  requirementsTxt?: boolean;
  setupPy?: boolean;
  setupCfg?: boolean;
  pyprojectToml?: boolean;
  pipfileLock?: boolean;
  poetryLock?: boolean;
  condaYaml?: boolean;
  
  // Test directory patterns
  testDirs?: string[];
  
  // Import patterns in test files
  imports?: {
    pytest?: boolean;
    unittest?: boolean;
    nose?: boolean;
    doctest?: boolean;
    hypothesis?: boolean;
  };
  
  // Configuration files
  pytestIni?: boolean;
  toxIni?: boolean;
  noxfile?: boolean;
  
  // File naming patterns
  testFilePatterns?: string[];
}

async function detectPythonFrameworks(projectPath: string): Promise<PythonFrameworkIndicators> {
  const indicators: PythonFrameworkIndicators = {
    imports: {}
  };
  
  // Check package management files
  indicators.requirementsTxt = fs.existsSync(path.join(projectPath, 'requirements.txt'));
  indicators.setupPy = fs.existsSync(path.join(projectPath, 'setup.py'));
  indicators.setupCfg = fs.existsSync(path.join(projectPath, 'setup.cfg'));
  indicators.pyprojectToml = fs.existsSync(path.join(projectPath, 'pyproject.toml'));
  indicators.pipfileLock = fs.existsSync(path.join(projectPath, 'Pipfile.lock'));
  indicators.poetryLock = fs.existsSync(path.join(projectPath, 'poetry.lock'));
  indicators.condaYaml = fs.existsSync(path.join(projectPath, 'environment.yml'));
  
  // Check for test directories
  const testDirs: string[] = [];
  const possibleTestDirs = ['test', 'tests', 'testing', 'test_suite', '__tests__'];
  for (const dir of possibleTestDirs) {
    const testDir = path.join(projectPath, dir);
    if (fs.existsSync(testDir) && fs.statSync(testDir).isDirectory()) {
      testDirs.push(dir);
    }
  }
  indicators.testDirs = testDirs;
  
  // Check configuration files
  indicators.pytestIni = fs.existsSync(path.join(projectPath, 'pytest.ini'));
  indicators.toxIni = fs.existsSync(path.join(projectPath, 'tox.ini'));
  indicators.noxfile = fs.existsSync(path.join(projectPath, 'noxfile.py'));
  
  // Scan for test files and check imports
  const testFilePatterns: string[] = [];
  const pythonFiles: string[] = [];
  
  function findPythonFiles(dir: string) {
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !file.startsWith('.') && file !== '__pycache__' && file !== 'node_modules') {
          findPythonFiles(fullPath);
        } else if (file.endsWith('.py')) {
          pythonFiles.push(fullPath);
          
          // Check if it's a test file
          if (file.startsWith('test_') || file.endsWith('_test.py') || file.endsWith('_tests.py')) {
            const pattern = file.startsWith('test_') ? 'test_*.py' : '*_test.py';
            if (!testFilePatterns.includes(pattern)) {
              testFilePatterns.push(pattern);
            }
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }
  
  findPythonFiles(projectPath);
  indicators.testFilePatterns = testFilePatterns;
  
  // Analyze imports in Python files
  for (const file of pythonFiles.slice(0, 20)) { // Limit to first 20 files
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n').slice(0, 50); // Check first 50 lines
      
      for (const line of lines) {
        if (line.match(/^import pytest|^from pytest/)) {
          indicators.imports!.pytest = true;
        }
        if (line.match(/^import unittest|^from unittest/)) {
          indicators.imports!.unittest = true;
        }
        if (line.match(/^import nose|^from nose/)) {
          indicators.imports!.nose = true;
        }
        if (line.match(/^import doctest|^from doctest/)) {
          indicators.imports!.doctest = true;
        }
        if (line.match(/^import hypothesis|^from hypothesis/)) {
          indicators.imports!.hypothesis = true;
        }
      }
    } catch (error) {
      // Skip files we can't read
    }
  }
  
  return indicators;
}

// Analyze specific projects
async function analyzeProjects() {
  const projects = [
    { name: 'pygoat', path: path.join(process.cwd(), 'vulnerable-apps/pygoat') },
    { name: 'django-vulnerable', path: path.join(process.cwd(), 'vulnerable-apps/django-vulnerable') }
  ];
  
  for (const project of projects) {
    if (fs.existsSync(project.path)) {
      logger.info(`\nAnalyzing ${project.name}:`);
      const indicators = await detectPythonFrameworks(project.path);
      
      logger.info('Package files found:');
      if (indicators.requirementsTxt) logger.info('  - requirements.txt');
      if (indicators.setupPy) logger.info('  - setup.py');
      if (indicators.setupCfg) logger.info('  - setup.cfg');
      if (indicators.pyprojectToml) logger.info('  - pyproject.toml');
      if (indicators.pipfileLock) logger.info('  - Pipfile.lock');
      if (indicators.poetryLock) logger.info('  - poetry.lock');
      
      logger.info('Test directories:', indicators.testDirs);
      logger.info('Test file patterns:', indicators.testFilePatterns);
      logger.info('Framework imports detected:', indicators.imports);
      
      if (indicators.pytestIni) logger.info('  - pytest.ini found');
      if (indicators.toxIni) logger.info('  - tox.ini found');
      if (indicators.noxfile) logger.info('  - noxfile.py found');
      
      // Make an educated guess
      const likelyFramework = guessFramework(indicators);
      logger.info(`Likely framework: ${likelyFramework}`);
    }
  }
}

function guessFramework(indicators: PythonFrameworkIndicators): string {
  // Configuration files are strong indicators
  if (indicators.pytestIni || indicators.imports?.pytest) return 'pytest';
  
  // Import patterns
  if (indicators.imports?.unittest) return 'unittest';
  if (indicators.imports?.nose) return 'nose2';
  
  // File patterns
  if (indicators.testFilePatterns?.some(p => p.startsWith('test_'))) {
    // test_*.py is common for both pytest and unittest
    return 'pytest/unittest';
  }
  
  // Default for Python
  return 'unittest (builtin)';
}

// Concept: Using Claude Code SDK for universal detection
logger.info('='.repeat(60));
logger.info('Concept: Universal Framework Detection with Claude Code SDK');
logger.info('='.repeat(60));

const claudeCodePrompt = `
Analyze this codebase and determine:
1. What test framework(s) are being used (if any)
2. How to run the tests
3. Test file naming conventions
4. Test directory structure

Look for:
- Package management files (requirements.txt, package.json, Gemfile, pom.xml, etc.)
- Test configuration files (pytest.ini, jest.config.js, .rspec, etc.)
- Import statements in test files
- Test runner scripts in package.json or Makefile
- CI configuration files (.github/workflows, .travis.yml, etc.)

Return a structured response with:
{
  "detected": boolean,
  "primaryFramework": { "name": string, "version": string },
  "testCommand": string,
  "testFilePatterns": string[],
  "testDirectories": string[],
  "confidence": number
}
`;

logger.info('\nBenefits of Claude Code SDK approach:');
logger.info('1. Language agnostic - works for any language/framework');
logger.info('2. Handles edge cases and unusual setups');
logger.info('3. Can infer from context (CI files, documentation, etc.)');
logger.info('4. Understands framework variants and plugins');
logger.info('5. Can suggest test commands even without explicit config');
logger.info('\nDrawbacks:');
logger.info('1. Requires AI API calls (cost/latency)');
logger.info('2. May need rate limiting');
logger.info('3. Results may vary between calls');

analyzeProjects().catch(console.error);