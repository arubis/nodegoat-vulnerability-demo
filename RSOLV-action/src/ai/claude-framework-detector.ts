/**
 * Universal Test Framework Detector using Claude Code SDK
 * 
 * This detector uses AI to intelligently identify test frameworks
 * across any language and project structure.
 */

import type { FrameworkInfo, DetectionResult } from './test-framework-detector.js';

export interface ClaudeDetectionResult extends DetectionResult {
  primaryFramework?: FrameworkInfo;
  reasoning?: string;
  suggestedTestCommand?: string;
  setupInstructions?: string[];
}

export interface ClaudeFrameworkDetectorOptions {
  apiKey?: string;
  model?: string;
  maxFilesToAnalyze?: number;
}

export class ClaudeFrameworkDetector {
  private options: ClaudeFrameworkDetectorOptions;
  
  constructor(options: ClaudeFrameworkDetectorOptions = {}) {
    this.options = {
      maxFilesToAnalyze: 20,
      model: 'claude-3-sonnet',
      ...options
    };
  }
  
  /**
   * Detect test frameworks using Claude's understanding of code patterns
   */
  async detectFrameworks(repoPath: string): Promise<ClaudeDetectionResult> {
    // Gather context files
    const contextFiles = await this.gatherContextFiles(repoPath);
    
    // Build the prompt
    const prompt = this.buildDetectionPrompt(contextFiles);
    
    // In a real implementation, this would call Claude API
    // For now, we'll return a mock response showing the concept
    const mockResponse = await this.mockClaudeResponse(contextFiles);
    
    return this.parseClaudeResponse(mockResponse);
  }
  
  private async gatherContextFiles(repoPath: string): Promise<Map<string, string>> {
    const contextFiles = new Map<string, string>();
    
    // Priority files to check
    const priorityFiles = [
      // Package management
      'package.json',
      'requirements.txt',
      'setup.py',
      'pyproject.toml',
      'Pipfile',
      'Gemfile',
      'pom.xml',
      'build.gradle',
      'Cargo.toml',
      'go.mod',
      
      // Test configuration
      'pytest.ini',
      'jest.config.js',
      '.rspec',
      'karma.conf.js',
      'phpunit.xml',
      
      // CI/CD files
      '.github/workflows/test.yml',
      '.github/workflows/ci.yml',
      '.travis.yml',
      '.circleci/config.yml',
      
      // Documentation
      'README.md',
      'CONTRIBUTING.md',
      
      // Makefiles and scripts
      'Makefile',
      'package.json', // for scripts section
    ];
    
    // Gather priority files
    for (const file of priorityFiles) {
      try {
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(repoPath, file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          // Limit file size to avoid huge prompts
          contextFiles.set(file, content.slice(0, 5000));
        }
      } catch (error) {
        // Skip files we can't read
      }
    }
    
    // Sample a few test files
    const testFilePatterns = [
      '**/test_*.py',
      '**/*_test.py',
      '**/*.test.js',
      '**/*.spec.js',
      '**/*_spec.rb',
      '**/*Test.java',
      '**/*_test.go'
    ];
    
    // In real implementation, would use glob to find test files
    // For now, just note that we'd include a sample
    
    return contextFiles;
  }
  
  private buildDetectionPrompt(contextFiles: Map<string, string>): string {
    let prompt = `Analyze this codebase to detect test frameworks and testing setup.

Context files:
`;
    
    for (const [filename, content] of contextFiles) {
      prompt += `\n--- ${filename} ---\n${content.slice(0, 1000)}\n`;
    }
    
    prompt += `
Please analyze the above files and determine:

1. What test framework(s) are being used (be specific about versions if possible)
2. The primary test framework if multiple are present
3. How to run the tests (exact command)
4. Common test file patterns in this project
5. Test directory structure
6. Any special setup required before running tests
7. Confidence level in your detection (0-1)

Consider:
- Package dependencies (in package.json, requirements.txt, etc.)
- Import statements in test files
- Configuration files
- CI/CD setup
- Documentation and comments
- Common conventions for the detected language/framework

Return a JSON response in this exact format:
{
  "detected": true/false,
  "primaryFramework": {
    "name": "framework name",
    "version": "version or 'unknown'",
    "type": "unit|integration|e2e|bdd",
    "confidence": 0.95
  },
  "allFrameworks": [...],
  "testCommand": "exact command to run tests",
  "testFilePatterns": ["*.test.js", "test_*.py"],
  "testDirectories": ["tests", "spec"],
  "setupInstructions": ["pip install -r requirements.txt", "..."],
  "reasoning": "Brief explanation of how you determined this"
}`;
    
    return prompt;
  }
  
  private async mockClaudeResponse(contextFiles: Map<string, string>): Promise<string> {
    // Mock different responses based on what files we found
    
    if (contextFiles.has('pytest.ini') || contextFiles.get('requirements.txt')?.includes('pytest')) {
      return JSON.stringify({
        detected: true,
        primaryFramework: {
          name: 'pytest',
          version: 'unknown',
          type: 'unit',
          confidence: 0.95
        },
        allFrameworks: [
          { name: 'pytest', version: 'unknown', type: 'unit', confidence: 0.95 }
        ],
        testCommand: 'pytest',
        testFilePatterns: ['test_*.py', '*_test.py'],
        testDirectories: ['tests'],
        setupInstructions: ['pip install -r requirements.txt'],
        reasoning: 'Found pytest.ini configuration file and pytest in requirements.txt'
      });
    }
    
    if (contextFiles.has('package.json')) {
      const packageJson = contextFiles.get('package.json');
      if (packageJson?.includes('jest')) {
        return JSON.stringify({
          detected: true,
          primaryFramework: {
            name: 'jest',
            version: 'unknown',
            type: 'unit',
            confidence: 0.9
          },
          allFrameworks: [
            { name: 'jest', version: 'unknown', type: 'unit', confidence: 0.9 }
          ],
          testCommand: 'npm test',
          testFilePatterns: ['*.test.js', '*.spec.js'],
          testDirectories: ['__tests__', 'tests'],
          setupInstructions: ['npm install'],
          reasoning: 'Found jest in package.json dependencies'
        });
      }
    }
    
    if (contextFiles.has('Gemfile')) {
      const gemfile = contextFiles.get('Gemfile');
      if (gemfile?.includes('rspec')) {
        return JSON.stringify({
          detected: true,
          primaryFramework: {
            name: 'rspec',
            version: 'unknown',
            type: 'unit',
            confidence: 0.9
          },
          allFrameworks: [
            { name: 'rspec', version: 'unknown', type: 'unit', confidence: 0.9 }
          ],
          testCommand: 'bundle exec rspec',
          testFilePatterns: ['*_spec.rb'],
          testDirectories: ['spec'],
          setupInstructions: ['bundle install'],
          reasoning: 'Found rspec in Gemfile'
        });
      }
    }
    
    // Default response for Python projects
    if (contextFiles.has('requirements.txt') || contextFiles.has('setup.py')) {
      return JSON.stringify({
        detected: true,
        primaryFramework: {
          name: 'unittest',
          version: 'builtin',
          type: 'unit',
          confidence: 0.7
        },
        allFrameworks: [
          { name: 'unittest', version: 'builtin', type: 'unit', confidence: 0.7 }
        ],
        testCommand: 'python -m unittest discover',
        testFilePatterns: ['test_*.py', '*_test.py'],
        testDirectories: ['tests', 'test'],
        setupInstructions: [],
        reasoning: 'Python project without explicit test framework, defaulting to builtin unittest'
      });
    }
    
    return JSON.stringify({
      detected: false,
      allFrameworks: [],
      testFilePatterns: [],
      testDirectories: [],
      reasoning: 'No test framework indicators found'
    });
  }
  
  private parseClaudeResponse(response: string): ClaudeDetectionResult {
    try {
      const parsed = JSON.parse(response);
      
      // Ensure the response matches our expected structure
      return {
        detected: parsed.detected || false,
        frameworks: parsed.frameworks || parsed.allFrameworks || [],
        suggestedTestCommand: parsed.testCommand,
        setupInstructions: parsed.setupInstructions,
        reasoning: parsed.reasoning
      };
    } catch (error) {
      // If parsing fails, return a not-detected result
      return {
        detected: false,
        frameworks: [],
        reasoning: 'Failed to parse AI response'
      };
    }
  }
}

// Example usage showing how this would integrate
export async function demonstrateUniversalDetection() {
  const detector = new ClaudeFrameworkDetector({
    apiKey: process.env.ANTHROPIC_API_KEY
  });
  
  // This would work for ANY language/framework
  const result = await detector.detectFrameworks('/path/to/repo');
  
  if (result.detected && result.primaryFramework) {
    console.log(`Detected: ${result.primaryFramework.name}`);
    console.log(`Run tests with: ${result.suggestedTestCommand}`);
    
    if (result.setupInstructions?.length) {
      console.log('Setup required:');
      result.setupInstructions.forEach(step => console.log(`  - ${step}`));
    }
  }
}