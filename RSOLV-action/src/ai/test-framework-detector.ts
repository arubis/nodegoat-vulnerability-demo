/**
 * Test Framework Detector
 * 
 * Intelligently detects test frameworks used in a repository
 * by analyzing package files, configuration, and file patterns.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface FrameworkInfo {
  name: string;
  version: string;
  type: 'unit' | 'integration' | 'e2e' | 'bdd';
  confidence: number; // 0-1 score indicating detection confidence
  detectionMethod?: 'package' | 'config' | 'file-pattern' | 'import' | 'dependency';
  configFile?: string;
  variant?: string; // e.g., 'rspec-rails' for RSpec
  companions?: string[]; // e.g., ['chai'] for Mocha
  plugins?: string[]; // e.g., ['pytest-cov'] for pytest
  versionType?: 'exact' | 'caret' | 'tilde' | 'range';
}

export interface DetectionResult {
  detected: boolean;
  frameworks: FrameworkInfo[];
  error?: string;
}

export interface ComprehensiveDetectionResult {
  detected: boolean;
  primaryFramework?: FrameworkInfo;
  allFrameworks: FrameworkInfo[];
  testFilePatterns: string[];
  testDirectories: string[];
}

// Framework detection patterns
const JS_FRAMEWORKS = {
  jest: { type: 'unit' as const, patterns: ['jest'] },
  vitest: { type: 'unit' as const, patterns: ['vitest', '@vitest/'] },
  mocha: { type: 'unit' as const, patterns: ['mocha'], companions: ['chai', 'sinon'] },
  jasmine: { type: 'unit' as const, patterns: ['jasmine'] },
  cypress: { type: 'e2e' as const, patterns: ['cypress'] },
  playwright: { type: 'e2e' as const, patterns: ['@playwright/test', 'playwright'] },
  ava: { type: 'unit' as const, patterns: ['ava'] },
  tape: { type: 'unit' as const, patterns: ['tape'] },
  qunit: { type: 'unit' as const, patterns: ['qunit'] },
  bun: { type: 'unit' as const, patterns: ['bun:test'] },
  karma: { type: 'unit' as const, patterns: ['karma'] },
  'testing-library': { type: 'unit' as const, patterns: ['@testing-library/'] },
};

const PYTHON_FRAMEWORKS = {
  pytest: { type: 'unit' as const, patterns: ['pytest'], plugins: ['pytest-cov', 'pytest-mock'] },
  unittest: { type: 'unit' as const, builtin: true },
  nose2: { type: 'unit' as const, patterns: ['nose2'] },
  doctest: { type: 'unit' as const, builtin: true },
  hypothesis: { type: 'unit' as const, patterns: ['hypothesis'] },
};

const RUBY_FRAMEWORKS = {
  rspec: { type: 'unit' as const, patterns: ['rspec'], variants: ['rspec-rails'] },
  minitest: { type: 'unit' as const, patterns: ['minitest'] },
  'test-unit': { type: 'unit' as const, patterns: ['test-unit'] },
  cucumber: { type: 'bdd' as const, patterns: ['cucumber'] },
  capybara: { type: 'e2e' as const, patterns: ['capybara'] },
};

const PHP_FRAMEWORKS = {
  phpunit: { type: 'unit' as const, patterns: ['phpunit'] },
  pest: { type: 'unit' as const, patterns: ['pestphp/pest'] },
  codeception: { type: 'integration' as const, patterns: ['codeception'] },
  phpspec: { type: 'unit' as const, patterns: ['phpspec'] },
  behat: { type: 'bdd' as const, patterns: ['behat'] },
};

const JAVA_FRAMEWORKS = {
  junit: { type: 'unit' as const, patterns: ['junit'] },
  testng: { type: 'unit' as const, patterns: ['testng'] },
  mockito: { type: 'unit' as const, patterns: ['mockito'] },
  spock: { type: 'unit' as const, patterns: ['spock'] },
};

const GO_FRAMEWORKS = {
  testing: { type: 'unit' as const, builtin: true },
  testify: { type: 'unit' as const, patterns: ['testify'] },
  ginkgo: { type: 'bdd' as const, patterns: ['ginkgo'] },
  gomega: { type: 'unit' as const, patterns: ['gomega'] },
};

const ELIXIR_FRAMEWORKS = {
  exunit: { type: 'unit' as const, builtin: true },
  espec: { type: 'unit' as const, patterns: ['espec'] },
};

export class TestFrameworkDetector {
  async detectFromPackageJson(packageJson: any): Promise<DetectionResult> {
    if (!packageJson) {
      return { detected: false, frameworks: [] };
    }

    const frameworks: FrameworkInfo[] = [];
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    // Check for JavaScript/TypeScript frameworks
    for (const [framework, config] of Object.entries(JS_FRAMEWORKS)) {
      for (const pattern of config.patterns) {
        const found = Object.keys(deps).find(dep => dep.includes(pattern));
        if (found) {
          const version = deps[found];
          const versionType = this.detectVersionType(version);
          
          const frameworkInfo: FrameworkInfo = {
            name: framework,
            version,
            type: config.type,
            confidence: 1.0,
            detectionMethod: 'package',
            versionType,
          };

          // Check for companions (e.g., Chai with Mocha)
          if ('companions' in config && config.companions) {
            const foundCompanions = config.companions.filter(c => 
              Object.keys(deps).some(dep => dep.includes(c))
            );
            if (foundCompanions.length > 0) {
              frameworkInfo.companions = foundCompanions;
            }
          }

          frameworks.push(frameworkInfo);
          break; // Only add once per framework
        }
      }
    }

    return {
      detected: frameworks.length > 0,
      frameworks,
    };
  }

  async detectFromRequirements(requirementsTxt: string): Promise<DetectionResult> {
    if (!requirementsTxt) {
      return { detected: false, frameworks: [] };
    }

    const frameworks: FrameworkInfo[] = [];
    const lines = requirementsTxt.split('\n');

    for (const [framework, config] of Object.entries(PYTHON_FRAMEWORKS)) {
      if ('patterns' in config && config.patterns) {
        for (const pattern of config.patterns) {
          const line = lines.find(l => l.startsWith(pattern));
          if (line) {
            const version = line.includes('==') 
              ? line.split('==')[1].trim()
              : 'unknown';
            
            const frameworkInfo: FrameworkInfo = {
              name: framework,
              version,
              type: config.type,
              confidence: 1.0,
              detectionMethod: 'package',
            };

            // Check for plugins
            if ('plugins' in config && config.plugins) {
              const foundPlugins = config.plugins.filter(p =>
                lines.some(l => l.startsWith(p))
              );
              if (foundPlugins.length > 0) {
                frameworkInfo.plugins = foundPlugins;
              }
            }

            frameworks.push(frameworkInfo);
            break;
          }
        }
      }
    }

    return {
      detected: frameworks.length > 0,
      frameworks,
    };
  }

  async detectFromGemfile(gemfile: string): Promise<DetectionResult> {
    if (!gemfile) {
      return { detected: false, frameworks: [] };
    }

    const frameworks: FrameworkInfo[] = [];
    const lines = gemfile.split('\n');

    for (const [framework, config] of Object.entries(RUBY_FRAMEWORKS)) {
      for (const pattern of config.patterns) {
        const line = lines.find(l => l.includes(`gem '${pattern}`) || l.includes(`gem "${pattern}`));
        if (line) {
          // Extract version
          const versionMatch = line.match(/['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/);
          const version = versionMatch ? versionMatch[2] : 'unknown';
          
          const frameworkInfo: FrameworkInfo = {
            name: framework,
            version,
            type: config.type,
            confidence: 1.0,
            detectionMethod: 'package',
          };

          // Check for variants (e.g., rspec-rails)
          if ('variants' in config && config.variants) {
            const variant = config.variants.find((v: string) => 
              lines.some(l => l.includes(`gem '${v}'`) || l.includes(`gem "${v}"`))
            );
            if (variant) {
              frameworkInfo.variant = variant;
            }
          }

          frameworks.push(frameworkInfo);
          break;
        }
      }
    }

    return {
      detected: frameworks.length > 0,
      frameworks,
    };
  }

  async detectFromSourceCode(code: string, language: string): Promise<DetectionResult> {
    const frameworks: FrameworkInfo[] = [];

    if (language === 'python') {
      // Check for unittest imports
      if (code.includes('import unittest') || code.includes('from unittest')) {
        frameworks.push({
          name: 'unittest',
          version: 'builtin',
          type: 'unit',
          confidence: 0.9,
          detectionMethod: 'import',
        });
      }
    }

    return {
      detected: frameworks.length > 0,
      frameworks,
    };
  }

  async detectFromFilePatterns(files: string[]): Promise<DetectionResult> {
    const frameworks: FrameworkInfo[] = [];
    
    // Jest/Vitest patterns
    const hasJestPatterns = files.some(f => 
      f.includes('.test.') || f.includes('.spec.') || f.includes('__tests__')
    );
    
    if (hasJestPatterns) {
      frameworks.push({
        name: 'jest',
        version: 'unknown',
        type: 'unit',
        confidence: 0.7,
        detectionMethod: 'file-pattern',
      });
    }

    // RSpec patterns
    const hasRSpecPatterns = files.some(f => 
      f.includes('_spec.rb') || f.includes('spec_helper.rb') || f.includes('/spec/')
    );
    
    if (hasRSpecPatterns) {
      frameworks.push({
        name: 'rspec',
        version: 'unknown',
        type: 'unit',
        confidence: 0.8,
        detectionMethod: 'file-pattern',
      });
    }

    return {
      detected: frameworks.length > 0,
      frameworks,
    };
  }

  async detectFromConfigFiles(configFiles: string[]): Promise<DetectionResult> {
    const frameworks: FrameworkInfo[] = [];

    for (const file of configFiles) {
      if (file.includes('jest.config')) {
        frameworks.push({
          name: 'jest',
          version: 'unknown',
          type: 'unit',
          confidence: 0.95,
          configFile: file,
          detectionMethod: 'config',
        });
      } else if (file.includes('vitest.config')) {
        frameworks.push({
          name: 'vitest',
          version: 'unknown',
          type: 'unit',
          confidence: 0.95,
          configFile: file,
          detectionMethod: 'config',
        });
      }
    }

    return {
      detected: frameworks.length > 0,
      frameworks,
    };
  }

  async detectFrameworks(repoPath: string): Promise<ComprehensiveDetectionResult> {
    const allFrameworks: FrameworkInfo[] = [];
    const testFilePatterns: string[] = [];
    const testDirectories: string[] = [];

    try {
      // Check package.json
      const packageJsonPath = path.join(repoPath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const result = await this.detectFromPackageJson(packageJson);
        allFrameworks.push(...result.frameworks);
      }

      // Check requirements.txt (Python)
      const requirementsPath = path.join(repoPath, 'requirements.txt');
      if (fs.existsSync(requirementsPath)) {
        const requirements = fs.readFileSync(requirementsPath, 'utf-8');
        const result = await this.detectFromRequirements(requirements);
        allFrameworks.push(...result.frameworks);
      }

      // Check Gemfile (Ruby)
      const gemfilePath = path.join(repoPath, 'Gemfile');
      if (fs.existsSync(gemfilePath)) {
        const gemfile = fs.readFileSync(gemfilePath, 'utf-8');
        const result = await this.detectFromGemfile(gemfile);
        allFrameworks.push(...result.frameworks);
      }

      // Check for test directories
      const possibleTestDirs = ['test', 'tests', '__tests__', 'spec', 'specs'];
      for (const dir of possibleTestDirs) {
        const testDir = path.join(repoPath, dir);
        if (fs.existsSync(testDir) && fs.statSync(testDir).isDirectory()) {
          testDirectories.push(dir);
        }
      }

      // Common test file patterns
      testFilePatterns.push(
        '*.test.js', '*.test.ts', '*.spec.js', '*.spec.ts',
        '*_test.py', 'test_*.py', '*_spec.rb', '*.test.go'
      );

      // Check for Bun test specifically in this repo
      const bunfigPath = path.join(repoPath, 'bunfig.toml');
      if (fs.existsSync(bunfigPath)) {
        allFrameworks.push({
          name: 'bun',
          version: 'builtin',
          type: 'unit',
          confidence: 1.0,
          detectionMethod: 'config',
          configFile: 'bunfig.toml',
        });
      }

    } catch (error) {
      // Continue with partial results
    }

    // Determine primary framework (highest confidence)
    const primaryFramework = allFrameworks.reduce((prev, curr) => 
      (!prev || curr.confidence > prev.confidence) ? curr : prev
    , null as FrameworkInfo | null) || undefined;

    return {
      detected: allFrameworks.length > 0,
      primaryFramework,
      allFrameworks,
      testFilePatterns,
      testDirectories,
    };
  }

  private detectVersionType(version: string): 'exact' | 'caret' | 'tilde' | 'range' {
    if (version.startsWith('^')) return 'caret';
    if (version.startsWith('~')) return 'tilde';
    if (version.includes('>') || version.includes('<') || version.includes(' ')) return 'range';
    return 'exact';
  }
}