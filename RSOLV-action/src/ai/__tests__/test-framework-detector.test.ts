/**
 * Test Framework Detector Tests
 * 
 * Phase 5A: Intelligent test framework detection
 * These tests follow TDD - RED phase (all should fail initially)
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { TestFrameworkDetector } from '../test-framework-detector.js';
import type { DetectionResult, FrameworkInfo } from '../test-framework-detector.js';

describe('TestFrameworkDetector (TDD - Red Phase)', () => {
  let detector: TestFrameworkDetector;
  
  beforeEach(() => {
    detector = new TestFrameworkDetector();
  });

  describe('JavaScript/TypeScript Framework Detection', () => {
    test('should detect Jest from package.json', async () => {
      const packageJson = {
        devDependencies: {
          'jest': '^29.5.0',
          '@types/jest': '^29.5.0'
        }
      };
      
      const result = await detector.detectFromPackageJson(packageJson);
      
      expect(result.detected).toBe(true);
      expect(result.frameworks[0]).toMatchObject({
        name: 'jest',
        version: '^29.5.0',
        type: 'unit',
        confidence: 1.0
      });
    });

    test('should detect Vitest from package.json', async () => {
      const packageJson = {
        devDependencies: {
          'vitest': '^1.2.0',
          '@vitest/ui': '^1.2.0'
        }
      };
      
      const result = await detector.detectFromPackageJson(packageJson);
      
      expect(result.detected).toBe(true);
      expect(result.frameworks[0]).toMatchObject({
        name: 'vitest',
        version: '^1.2.0',
        type: 'unit',
        confidence: 1.0
      });
    });

    test('should detect Mocha with Chai', async () => {
      const packageJson = {
        devDependencies: {
          'mocha': '^10.2.0',
          'chai': '^4.3.7',
          '@types/mocha': '^10.0.1'
        }
      };
      
      const result = await detector.detectFromPackageJson(packageJson);
      
      expect(result.detected).toBe(true);
      expect(result.frameworks[0]).toMatchObject({
        name: 'mocha',
        version: '^10.2.0',
        type: 'unit',
        confidence: 1.0,
        companions: ['chai']
      });
    });

    test('should detect Cypress for E2E testing', async () => {
      const packageJson = {
        devDependencies: {
          'cypress': '^13.6.0'
        }
      };
      
      const result = await detector.detectFromPackageJson(packageJson);
      
      expect(result.detected).toBe(true);
      expect(result.frameworks[0]).toMatchObject({
        name: 'cypress',
        version: '^13.6.0',
        type: 'e2e',
        confidence: 1.0
      });
    });

    test('should detect multiple frameworks in one project', async () => {
      const packageJson = {
        devDependencies: {
          'jest': '^29.5.0',
          'cypress': '^13.6.0',
          '@playwright/test': '^1.40.0'
        }
      };
      
      const result = await detector.detectFromPackageJson(packageJson);
      
      expect(result.detected).toBe(true);
      expect(result.frameworks).toHaveLength(3);
      expect(result.frameworks.map(f => f.name)).toContain('jest');
      expect(result.frameworks.map(f => f.name)).toContain('cypress');
      expect(result.frameworks.map(f => f.name)).toContain('playwright');
    });
  });

  describe('Python Framework Detection', () => {
    test('should detect pytest from requirements.txt', async () => {
      const requirementsTxt = `
pytest==7.4.3
pytest-cov==4.1.0
flask==3.0.0
      `.trim();
      
      const result = await detector.detectFromRequirements(requirementsTxt);
      
      expect(result.detected).toBe(true);
      expect(result.frameworks[0]).toMatchObject({
        name: 'pytest',
        version: '7.4.3',
        type: 'unit',
        confidence: 1.0,
        plugins: ['pytest-cov']
      });
    });

    test('should detect unittest from import statements', async () => {
      const pythonCode = `
import unittest
from myapp import Calculator

class TestCalculator(unittest.TestCase):
    def test_add(self):
        self.assertEqual(Calculator.add(1, 2), 3)
      `.trim();
      
      const result = await detector.detectFromSourceCode(pythonCode, 'python');
      
      expect(result.detected).toBe(true);
      expect(result.frameworks[0]).toMatchObject({
        name: 'unittest',
        version: 'builtin',
        type: 'unit',
        confidence: 0.9
      });
    });
  });

  describe('Ruby Framework Detection', () => {
    test('should detect RSpec from Gemfile', async () => {
      const gemfile = `
source 'https://rubygems.org'

gem 'rails', '~> 7.1.0'
group :test do
  gem 'rspec-rails', '~> 6.1.0'
  gem 'factory_bot_rails'
end
      `.trim();
      
      const result = await detector.detectFromGemfile(gemfile);
      
      expect(result.detected).toBe(true);
      expect(result.frameworks[0]).toMatchObject({
        name: 'rspec',
        version: '~> 6.1.0',
        type: 'unit',
        confidence: 1.0,
        variant: 'rspec-rails'
      });
    });

    test('should detect Minitest from Gemfile', async () => {
      const gemfile = `
gem 'minitest', '~> 5.20'
gem 'minitest-reporters'
      `.trim();
      
      const result = await detector.detectFromGemfile(gemfile);
      
      expect(result.detected).toBe(true);
      expect(result.frameworks[0]).toMatchObject({
        name: 'minitest',
        version: '~> 5.20',
        type: 'unit',
        confidence: 1.0
      });
    });
  });

  describe('Test File Pattern Detection', () => {
    test('should detect Jest from test file patterns', async () => {
      const files = [
        'src/components/__tests__/Button.test.tsx',
        'src/utils/validation.test.ts',
        'src/services/api.spec.js'
      ];
      
      const result = await detector.detectFromFilePatterns(files);
      
      expect(result.detected).toBe(true);
      expect(result.frameworks[0]).toMatchObject({
        name: 'jest',
        version: 'unknown',
        type: 'unit',
        confidence: 0.7,
        detectionMethod: 'file-pattern'
      });
    });

    test('should detect RSpec from spec directory structure', async () => {
      const files = [
        'spec/models/user_spec.rb',
        'spec/controllers/posts_controller_spec.rb',
        'spec/spec_helper.rb'
      ];
      
      const result = await detector.detectFromFilePatterns(files);
      
      expect(result.detected).toBe(true);
      expect(result.frameworks[0]).toMatchObject({
        name: 'rspec',
        version: 'unknown',
        type: 'unit',
        confidence: 0.8,
        detectionMethod: 'file-pattern'
      });
    });
  });

  describe('Configuration File Detection', () => {
    test('should detect from vi.config.js', async () => {
      const configFiles = ['vitest.config.js', 'package.json'];
      
      const result = await detector.detectFromConfigFiles(configFiles);
      
      expect(result.detected).toBe(true);
      expect(result.frameworks[0]).toMatchObject({
        name: 'vitest',
        version: 'unknown',
        type: 'unit',
        confidence: 0.95,
        configFile: 'vitest.config.js'
      });
    });

    test('should detect from vitest.config.ts', async () => {
      const configFiles = ['vitest.config.ts', 'vite.config.ts'];
      
      const result = await detector.detectFromConfigFiles(configFiles);
      
      expect(result.detected).toBe(true);
      expect(result.frameworks[0]).toMatchObject({
        name: 'vitest',
        version: 'unknown',
        type: 'unit',
        confidence: 0.95,
        configFile: 'vitest.config.ts'
      });
    });
  });

  describe('Comprehensive Detection', () => {
    test('should detect frameworks from repository path', async () => {
      // Use current directory which has bunfig.toml
      const repoPath = process.cwd();
      
      const result = await detector.detectFrameworks(repoPath);
      
      expect(result.detected).toBe(true);
      expect(result.primaryFramework).toBeDefined();
      expect(result.allFrameworks.length).toBeGreaterThan(0);
      expect(result.testFilePatterns).toBeDefined();
      expect(result.testDirectories).toBeDefined();
    });

    test('should handle missing configuration files gracefully', async () => {
      const packageJson = null;
      
      const result = await detector.detectFromPackageJson(packageJson);
      
      expect(result.detected).toBe(false);
      expect(result.frameworks).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    test('should assign confidence scores based on detection method', async () => {
      const repoPath = '/path/to/repo';
      
      const result = await detector.detectFrameworks(repoPath);
      
      result.allFrameworks.forEach(framework => {
        expect(framework.confidence).toBeGreaterThan(0);
        expect(framework.confidence).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Framework Version Detection', () => {
    test('should extract exact version from package.json', async () => {
      const packageJson = {
        devDependencies: {
          'jest': '29.5.0' // exact version
        }
      };
      
      const result = await detector.detectFromPackageJson(packageJson);
      
      expect(result.frameworks[0].version).toBe('29.5.0');
      expect(result.frameworks[0].versionType).toBe('exact');
    });

    test('should handle version ranges', async () => {
      const packageJson = {
        devDependencies: {
          'vitest': '^1.2.0',
          'mocha': '~10.2.0',
          'jest': '>=29.0.0 <30.0.0'
        }
      };
      
      const result = await detector.detectFromPackageJson(packageJson);
      
      const vitest = result.frameworks.find(f => f.name === 'vitest');
      expect(vitest?.versionType).toBe('caret');
      
      const mocha = result.frameworks.find(f => f.name === 'mocha');
      expect(mocha?.versionType).toBe('tilde');
      
      const jest = result.frameworks.find(f => f.name === 'jest');
      expect(jest?.versionType).toBe('range');
    });
  });
});

describe('TestFrameworkDetector Integration', () => {
  test('should integrate with test generator', async () => {
    const detector = new TestFrameworkDetector();
    const repoPath = process.cwd(); // Current RSOLV-action repo
    
    const result = await detector.detectFrameworks(repoPath);
    
    // Should detect Bun test in this project
    expect(result.detected).toBe(true);
    expect(result.allFrameworks.some(f => f.name === 'bun')).toBe(true);
  });
});