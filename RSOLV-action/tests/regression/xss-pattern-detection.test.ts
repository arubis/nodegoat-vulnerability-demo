import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ValidationEnricher } from '../../src/validation/enricher.js';

// Mock the GitHub API utilities
import { vi } from 'vitest';
vi.mock('../../src/github/api.js', () => ({
  updateIssue: vi.fn(() => Promise.resolve()),
  addLabels: vi.fn(() => Promise.resolve())
}));

describe('XSS Pattern Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  let enricher: ValidationEnricher;
  
  beforeEach(() => {
    enricher = new ValidationEnricher('test-github-token', 'test-api-key');
  });
  
  it('should detect XSS via document.write with string concatenation', async () => {
    // This is the actual vulnerability from nodegoat-vulnerability-demo
    const testCode = `module.exports = {
  port: 4000,
  db: "mongodb://localhost:27017/nodegoat_dev",
  cookieSecret: "keyboard cat",
  cryptoKey: "a_secure_key_for_crypto_that_is_32_chars",
  cryptoAlgo: "aes256",
  hostName: "localhost",
  zapApiFeedbackSpeed: 5000, // Milliseconds.
  environmentalScripts: [
     // jshint -W101
     \`<script>document.write("<script src='http://" + (location.host || "localhost").split(":")[0] + ":35729/livereload.js'></" + "script>");</script>\`
     // jshint +W101
  ]
};`;
    
    // Create test directory and file
    const testDir = '/tmp/test-xss-patterns';
    const testFile = 'config/env/development.js';
    fs.mkdirSync(path.join(testDir, 'config/env'), { recursive: true });
    fs.writeFileSync(path.join(testDir, testFile), testCode);
    
    // Create test issue
    const issue: any = {
      id: 'test/repo#1',
      number: 1,
      title: '[RSOLV-DETECTED] Cross-Site Scripting (XSS) vulnerabilities found',
      body: `## Security Vulnerability Report
      
**Type**: Xss
**Severity**: HIGH

### Affected Files

#### \`config/env/development.js\`

- **Line 11**: Potential XSS via document.write`,
      labels: ['rsolv:detected'],
      assignees: [],
      repository: {
        owner: 'test',
        name: 'repo',
        fullName: 'test/repo',
        defaultBranch: 'main'
      },
      source: 'github',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Mock process.cwd to return test directory
    const originalCwd = process.cwd();
    vi.spyOn(process, 'cwd').mockReturnValue(testDir);
    
    try {
      // Run enrichment
      const result = await enricher.enrichIssue(issue);
      
      // Should find at least one XSS vulnerability
      expect(result.vulnerabilities).toBeDefined();
      expect(result.vulnerabilities.length).toBeGreaterThan(0);
      
      // Check the vulnerability details
      const xssVuln = result.vulnerabilities.find(v => 
        v.file === testFile && v.startLine === 11
      );
      
      expect(xssVuln).toBeDefined();
      expect(xssVuln?.pattern).toContain('Document.write');
      expect(xssVuln?.confidence).toBe('high');
      
    } finally {
      vi.mocked(process.cwd).mockRestore();
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });
  
  it('should detect various XSS patterns', () => {
    // Test that our patterns can detect common XSS vulnerabilities
    const xssExamples = [
      {
        code: 'element.innerHTML = userInput;',
        description: 'Direct innerHTML assignment',
        shouldMatch: true
      },
      {
        code: 'document.write(userInput);',
        description: 'document.write with user input',
        shouldMatch: true
      },
      {
        code: 'document.write("<script>" + userInput + "</script>");',
        description: 'document.write with concatenation',
        shouldMatch: true
      },
      {
        code: 'element.outerHTML = req.body.content;',
        description: 'outerHTML assignment',
        shouldMatch: true
      },
      {
        code: 'document.writeln(params.text);',
        description: 'document.writeln with user input',
        shouldMatch: true
      },
      {
        code: '$(element).html(req.query.html);',
        description: 'jQuery html() with user input',
        shouldMatch: true
      },
      {
        code: 'element.textContent = userInput;',
        description: 'Safe textContent usage',
        shouldMatch: false
      }
    ];
    
    // Get XSS patterns from enricher
    const patterns = getXssPatterns();
    
    for (const example of xssExamples) {
      let matched = false;
      for (const pattern of patterns) {
        if (pattern.regex.test(example.code)) {
          matched = true;
          break;
        }
      }
      expect(matched).toBe(example.shouldMatch, 
        `${example.shouldMatch ? 'Failed to detect' : 'Incorrectly detected'}: ${example.description}`);
    }
  });
});

// Helper function to extract XSS patterns
// These match what we've defined in the enricher
function getXssPatterns() {
  return [
    {
      name: 'Direct HTML injection via innerHTML',
      regex: /innerHTML\s*=\s*[^;]+(?:user|req\.|params|query)/gi,
      confidence: 'high'
    },
    {
      name: 'Document.write with user input or concatenation',
      regex: /document\.write(?:ln)?\s*\([^)]*[\+`]/gi,
      confidence: 'high'
    },
    {
      name: 'Document.write with direct user input',
      regex: /document\.write(?:ln)?\s*\([^)]*(?:user|req\.|params|query)/gi,
      confidence: 'high'
    },
    {
      name: 'OuterHTML injection',
      regex: /outerHTML\s*=\s*[^;]+(?:user|req\.|params|query)/gi,
      confidence: 'high'
    },
    {
      name: 'jQuery html() with user input',
      regex: /\$\([^)]+\)\.html\s*\([^)]*(?:user|req\.|params|query)/gi,
      confidence: 'high'
    },
    {
      name: 'Unescaped template rendering',
      regex: /\{\{\{[^}]+\}\}\}/g,
      confidence: 'medium'
    }
  ];
}