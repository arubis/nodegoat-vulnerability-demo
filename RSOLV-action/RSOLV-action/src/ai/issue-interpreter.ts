/**
 * Issue Interpreter
 * 
 * Extracts vulnerability context from issue descriptions using
 * natural language processing and pattern matching.
 */

export interface AffectedLocation {
  file: string;
  lines?: number[];
  function?: string;
  endpoint?: string;
}

export interface CodeSnippet {
  language: string;
  code: string;
  vulnerableLines?: number[];
  startLine?: number;
}

export interface TestFrameworkHint {
  name: string;
  context?: string;
  suggested?: boolean;
  existing?: boolean;
}

export interface VulnerabilityPattern {
  type: string;
  description: string;
  confidence: number;
}

export interface FixExample {
  code: string;
  language?: string;
  description?: string;
}

export interface References {
  issues: string[];
  pullRequests: string[];
  urls: string[];
}

export interface VulnerabilityContext {
  type: string;
  file?: string;
  description?: string;
}

export interface InterpretedIssue {
  // Core vulnerability information
  vulnerabilityType: string;
  confidence: number;
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
  urgency?: 'immediate' | 'urgent' | 'planned' | 'backlog';
  
  // Affected locations
  affectedFiles: string[];
  affectedFunctions: string[];
  affectedLines: number[];
  affectedLocations: AffectedLocation[];
  
  // Additional context
  keywords: string[];
  category?: string;
  isSecurityIssue?: boolean;
  issueType?: string;
  needsMoreInfo?: boolean;
  
  // Vulnerability details
  multipleVulnerabilities?: VulnerabilityContext[];
  owaspCategory?: string;
  cweId?: string;
  cveId?: string;
  cvssScore?: number;
  
  // Code analysis
  codeSnippets: CodeSnippet[];
  testFrameworks: TestFrameworkHint[];
  testFiles: string[];
  suggestedTestStrategy?: string;
  
  // Fix information
  fixSuggestions: string[];
  fixExample?: FixExample;
  suggestedPatterns?: VulnerabilityPattern[];
  
  // Metadata
  reportedBy?: string;
  package?: string;
  vulnerableVersions?: string;
  patchedVersion?: string;
  impact?: string[];
  proofOfConcept?: string;
  testingInstructions?: string[];
  todoItems?: string[];
  references?: References;
}

interface IssueInput {
  title: string;
  body: string;
  labels?: string[];
}

export class IssueInterpreter {
  // Vulnerability type patterns
  private readonly vulnerabilityPatterns = {
    'sql-injection': [
      /sql\s*injection/i,
      /sqli\b/i,
      /concatenat\w*\s+.*\s*(sql|query)/i,
      /string\s+concatenation.*query/i,
      /unsanitized.*sql/i,
      /parameterized\s+quer/i,
    ],
    'xss': [
      /cross[\s-]*site[\s-]*scripting/i,
      /\bxss\b/i,
      /unescaped\s+(html|user|data|input)/i,
      /html\s+entit/i,
      /script\s+injection/i,
      /<%=.*%>/,
    ],
    'path-traversal': [
      /path\s+traversal/i,
      /directory\s+traversal/i,
      /\.\.\/|\.\.\\+/g,
      /file\s+path.*validation/i,
    ],
    'command-injection': [
      /command\s+injection/i,
      /shell\s+injection/i,
      /os\s+command/i,
      /exec\(/i,
      /system\(/i,
    ],
    'injection': [
      /injection/i,
      /A03:2021/,
    ],
    'rce': [
      /remote\s+code\s+execution/i,
      /\brce\b/i,
      /arbitrary\s+code/i,
    ],
  };

  // Severity indicators
  private readonly severityIndicators = {
    critical: [
      /critical/i,
      /severe/i,
      /emergency/i,
      /immediate/i,
      /cvss.*[89]\.\d/i,
      /remote\s+code\s+execution/i,
    ],
    high: [
      /high/i,
      /important/i,
      /major/i,
      /urgent/i,
      /cvss.*[67]\.\d/i,
    ],
    medium: [
      /medium/i,
      /moderate/i,
      /cvss.*[45]\.\d/i,
    ],
    low: [
      /low/i,
      /minor/i,
      /informational/i,
      /cvss.*[0-3]\.\d/i,
    ],
  };

  // Test framework patterns
  private readonly testFrameworkPatterns = {
    jest: /\bjest\b/i,
    mocha: /\bmocha\b/i,
    jasmine: /\bjasmine\b/i,
    cypress: /\bcypress\b/i,
    playwright: /\bplaywright\b/i,
    vitest: /\bvitest\b/i,
    pytest: /\bpytest\b/i,
    unittest: /\bunittest\b/i,
    rspec: /\brspec\b/i,
    minitest: /\bminitest\b/i,
    phpunit: /\bphpunit\b/i,
    junit: /\bjunit\b/i,
    exunit: /\bexunit\b/i,
  };

  /**
   * Interpret an issue with metadata
   */
  async interpretIssue(issue: IssueInput): Promise<InterpretedIssue> {
    // Start with body interpretation
    const result = await this.interpret(issue.body);
    
    // Enhance with title information
    const titleInfo = this.extractFromTitle(issue.title);
    if (titleInfo.vulnerabilityType && !result.vulnerabilityType) {
      result.vulnerabilityType = titleInfo.vulnerabilityType;
    }
    if (titleInfo.severity) {
      result.severity = titleInfo.severity;
    }
    
    // Enhance with labels
    if (issue.labels) {
      for (const label of issue.labels) {
        if (label.toLowerCase() === 'security') {
          result.category = 'security';
          result.isSecurityIssue = true;
        }
        if (this.severityIndicators.critical.some(p => p.test(label))) {
          result.severity = 'critical';
        }
        if (label.includes('sql-injection')) {
          result.vulnerabilityType = 'sql-injection';
          result.confidence = Math.max(result.confidence, 0.95);
        }
      }
    }
    
    return result;
  }

  /**
   * Interpret an issue body
   */
  async interpret(issueBody: string): Promise<InterpretedIssue> {
    if (!issueBody || issueBody.trim() === '') {
      return this.createEmptyResult();
    }
    
    const result: InterpretedIssue = {
      vulnerabilityType: 'unknown',
      confidence: 0,
      affectedFiles: [],
      affectedFunctions: [],
      affectedLines: [],
      affectedLocations: [],
      keywords: [],
      codeSnippets: [],
      testFrameworks: [],
      testFiles: [],
      fixSuggestions: [],
    };
    
    // Check if it's a security issue
    const securityCheck = this.checkIfSecurityIssue(issueBody);
    result.isSecurityIssue = securityCheck.isSecurity;
    result.issueType = securityCheck.issueType;
    
    // Extract vulnerability type (even for non-security issues, we might find something)
    const vulnType = this.extractVulnerabilityType(issueBody);
    result.vulnerabilityType = vulnType.type;
    result.confidence = vulnType.confidence;
    result.keywords = vulnType.keywords;
    result.multipleVulnerabilities = vulnType.multiple;
    
    // Extract severity
    result.severity = this.extractSeverity(issueBody);
    result.urgency = this.mapSeverityToUrgency(result.severity);
    
    // Extract affected locations
    const locations = this.extractAffectedLocations(issueBody);
    result.affectedFiles = locations.files;
    result.affectedFunctions = locations.functions;
    result.affectedLines = locations.lines;
    result.affectedLocations = locations.locations;
    
    // Extract code snippets
    result.codeSnippets = this.extractCodeSnippets(issueBody);
    
    // Extract additional functions from code
    const functionsFromCode = this.extractFunctionsFromCode(result.codeSnippets);
    result.affectedFunctions = [...new Set([...result.affectedFunctions, ...functionsFromCode])];
    
    // Extract test information
    const testInfo = this.extractTestInformation(issueBody);
    result.testFrameworks = testInfo.frameworks;
    result.testFiles = testInfo.files;
    result.suggestedTestStrategy = testInfo.strategy;
    
    // Extract fix suggestions
    const fixInfo = this.extractFixInformation(issueBody);
    result.fixSuggestions = fixInfo.suggestions;
    result.fixExample = fixInfo.example;
    
    // Extract patterns
    result.suggestedPatterns = this.suggestPatterns(result.vulnerabilityType, issueBody);
    
    // Extract metadata
    const metadata = this.extractMetadata(issueBody);
    Object.assign(result, metadata);
    
    // Extract references
    result.references = this.extractReferences(issueBody);
    
    // Extract todos
    result.todoItems = this.extractTodoItems(issueBody);
    
    return result;
  }

  private createEmptyResult(): InterpretedIssue {
    return {
      vulnerabilityType: 'unknown',
      confidence: 0,
      needsMoreInfo: true,
      affectedFiles: [],
      affectedFunctions: [],
      affectedLines: [],
      affectedLocations: [],
      keywords: [],
      codeSnippets: [],
      testFrameworks: [],
      testFiles: [],
      fixSuggestions: [],
    };
  }

  private checkIfSecurityIssue(text: string): { isSecurity: boolean; issueType?: string } {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('feature request') || lowerText.includes('enhancement')) {
      return { isSecurity: false, issueType: 'feature-request' };
    }
    
    if (lowerText.includes('documentation') || lowerText.includes('docs')) {
      return { isSecurity: false, issueType: 'documentation' };
    }
    
    const securityKeywords = [
      'security', 'vulnerability', 'exploit', 'injection', 'xss', 'csrf',
      'authentication', 'authorization', 'encryption', 'attack', 'malicious',
      'cve-', 'cwe-', 'owasp', 'sensitive', 'logs', 'debug'
    ];
    
    const hasSecurityKeyword = securityKeywords.some(kw => lowerText.includes(kw));
    
    return { isSecurity: hasSecurityKeyword, issueType: hasSecurityKeyword ? 'security' : 'other' };
  }

  private extractVulnerabilityType(text: string): {
    type: string;
    confidence: number;
    keywords: string[];
    multiple?: VulnerabilityContext[];
  } {
    const foundTypes: Array<{ type: string; confidence: number; keywords: string[] }> = [];
    
    // Check each vulnerability type
    for (const [type, patterns] of Object.entries(this.vulnerabilityPatterns)) {
      let matches = 0;
      const keywords: string[] = [];
      
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          matches++;
          keywords.push(match[0]);
        }
      }
      
      if (matches > 0) {
        foundTypes.push({
          type,
          confidence: Math.min(0.5 + (matches * 0.25), 1.0),
          keywords
        });
      }
    }
    
    // Check for multiple vulnerabilities - but only if explicitly stated
    const multipleMatch = text.match(/multiple\s+(security\s+)?issues/i);
    if (multipleMatch) {
      const multiple = this.extractMultipleVulnerabilities(text);
      if (multiple.length > 1) {
        return {
          type: 'multiple',
          confidence: 0.9,
          keywords: foundTypes.flatMap(f => f.keywords),
          multiple
        };
      }
    }
    
    // Return the highest confidence match
    if (foundTypes.length > 0) {
      foundTypes.sort((a, b) => b.confidence - a.confidence);
      return foundTypes[0];
    }
    
    return {
      type: 'unknown',
      confidence: 0,
      keywords: []
    };
  }

  private extractMultipleVulnerabilities(text: string): VulnerabilityContext[] {
    const vulnerabilities: VulnerabilityContext[] = [];
    
    // Split by numbered items
    const items = text.split(/\d+\./g).slice(1); // Skip first empty element
    
    for (const item of items) {
      const lines = item.trim().split('\n').filter(l => l.trim());
      if (lines.length === 0) continue;
      
      // Extract vulnerability type from first line
      const firstLine = lines[0];
      const inMatch = firstLine.match(/(.+?)\s+in\s+(.+)/);
      
      let vulnType = '';
      let location = '';
      
      if (inMatch) {
        vulnType = this.normalizeVulnerabilityType(inMatch[1]);
        location = inMatch[2].trim();
      } else {
        vulnType = this.normalizeVulnerabilityType(firstLine);
      }
      
      // Look for file and description in subsequent lines
      let file = location;
      let description = '';
      
      for (const line of lines.slice(1)) {
        const trimmedLine = line.trim();
        if (trimmedLine.includes('File:')) {
          file = trimmedLine.replace(/^-\s*File:\s*/, '').trim();
        } else if (trimmedLine.startsWith('-') && !trimmedLine.includes('File:')) {
          description = trimmedLine.replace(/^-\s*/, '').trim();
        }
      }
      
      vulnerabilities.push({
        type: vulnType,
        file: file || undefined,
        description: description || undefined
      });
    }
    
    return vulnerabilities;
  }

  private normalizeVulnerabilityType(text: string): string {
    const normalized = text.toLowerCase().trim();
    
    if (normalized.includes('sql injection')) return 'sql-injection';
    if (normalized.includes('xss') || normalized.includes('cross-site scripting')) return 'xss';
    if (normalized.includes('path traversal')) return 'path-traversal';
    if (normalized.includes('command injection')) return 'command-injection';
    
    return normalized.replace(/\s+/g, '-');
  }

  private extractSeverity(text: string): InterpretedIssue['severity'] {
    // Check CVSS scores
    const cvssMatch = text.match(/cvss\s*(?:score)?[:\s]+(\d+\.?\d*)/i);
    if (cvssMatch) {
      const score = parseFloat(cvssMatch[1]);
      if (score >= 9.0) return 'critical';
      if (score >= 7.0) return 'high';
      if (score >= 4.0) return 'medium';
      return 'low';
    }
    
    // Check severity indicators
    for (const [severity, patterns] of Object.entries(this.severityIndicators)) {
      if (patterns.some(p => p.test(text))) {
        return severity as InterpretedIssue['severity'];
      }
    }
    
    return undefined;
  }

  private mapSeverityToUrgency(severity?: InterpretedIssue['severity']): InterpretedIssue['urgency'] {
    switch (severity) {
      case 'critical': return 'immediate';
      case 'high': return 'urgent';
      case 'medium': return 'planned';
      case 'low': return 'planned';
      case 'info': return 'backlog';
      default: return undefined;
    }
  }

  private extractAffectedLocations(text: string): {
    files: string[];
    functions: string[];
    lines: number[];
    locations: AffectedLocation[];
  } {
    const files: string[] = [];
    const functions: string[] = [];
    const lines: number[] = [];
    const locations: AffectedLocation[] = [];
    
    // Process text line by line for better ordering
    const textLines = text.split('\n');
    
    for (const line of textLines) {
      // Skip empty lines
      if (!line.trim()) continue;
      
      // Pattern 1: "- path/file.ext (line X-Y)"
      const dashLineMatch = line.match(/^\s*-\s+([^\s(]+\.[a-zA-Z]+)\s*\(line\s+(\d+)\s*-\s*(\d+)\s*\)/i);
      if (dashLineMatch) {
        const file = dashLineMatch[1];
        if (!files.includes(file)) {
          files.push(file);
          const location: AffectedLocation = {
            file,
            lines: []
          };
          const start = parseInt(dashLineMatch[2]);
          const end = parseInt(dashLineMatch[3]);
          for (let i = start; i <= end; i++) {
            location.lines!.push(i);
          }
          locations.push(location);
        }
        continue;
      }
      
      // Pattern 2: "- path/file.ext:linenum"
      const dashColonMatch = line.match(/^\s*-\s+([^\s:]+\.[a-zA-Z]+):(\d+)/i);
      if (dashColonMatch) {
        const file = dashColonMatch[1];
        if (!files.includes(file)) {
          files.push(file);
          locations.push({
            file,
            lines: [parseInt(dashColonMatch[2])]
          });
        }
        continue;
      }
      
      // Pattern 3: "File: path/file.ext, Function: funcName()" or "**File**: path/file.ext"
      const fileColonMatch = line.match(/(?:\*\*File\*\*|\bFile):\s*([^\s,]+\.[a-zA-Z]+)(?:,?\s*(?:\*\*Function\*\*|Function):\s*(\w+))?/i);
      if (fileColonMatch) {
        const file = fileColonMatch[1];
        if (!files.includes(file)) {
          files.push(file);
          const location: AffectedLocation = { file };
          if (fileColonMatch[2]) {
            location.function = fileColonMatch[2];
          }
          locations.push(location);
        }
        continue;
      }
      
      // Pattern 4: "- `path/file.ext` - funcName function"
      const backtickMatch = line.match(/^\s*-\s*`([^`]+\.[a-zA-Z]+)`\s*-\s*(\w+)\s+function/i);
      if (backtickMatch) {
        const file = backtickMatch[1];
        if (!files.includes(file)) {
          files.push(file);
          locations.push({
            file,
            function: backtickMatch[2]
          });
        }
        continue;
      }
      
      // Pattern 5: Simple "- path/file.ext"
      const simpleDashMatch = line.match(/^\s*-\s+([^\s]+\.[a-zA-Z]+)\s*$/i);
      if (simpleDashMatch) {
        const file = simpleDashMatch[1];
        if (!files.includes(file)) {
          files.push(file);
          locations.push({ file });
        }
        continue;
      }
      
      // Pattern 6: Bold markdown files "**file.ext**"
      const boldMatch = line.match(/\*\*([^\*]+\.[a-zA-Z]+)\*\*/i);
      if (boldMatch) {
        const file = boldMatch[1];
        if (!files.includes(file)) {
          files.push(file);
          locations.push({ file });
        }
      }
      
      // Pattern 7: "- **Function**: funcName (lines X-Y)"
      const functionLineMatch = line.match(/^\s*-\s*\*\*Function\*\*:\s*(\w+)\s*\(lines?\s+(\d+)\s*-\s*(\d+)\s*\)/i);
      if (functionLineMatch && locations.length > 0) {
        const lastLocation = locations[locations.length - 1];
        lastLocation.function = functionLineMatch[1];
        lastLocation.lines = [];
        const start = parseInt(functionLineMatch[2]);
        const end = parseInt(functionLineMatch[3]);
        for (let i = start; i <= end; i++) {
          lastLocation.lines.push(i);
        }
        if (!functions.includes(functionLineMatch[1])) {
          functions.push(functionLineMatch[1]);
        }
      }
      
      // Pattern 8: "- **Endpoint**: POST /api/path"
      const endpointMatch = line.match(/^\s*-\s*\*\*Endpoint\*\*:\s*(.+)$/i);
      if (endpointMatch && locations.length > 0) {
        const lastLocation = locations[locations.length - 1];
        lastLocation.endpoint = endpointMatch[1].trim();
      }
    }
    
    // Extract standalone line numbers that weren't associated with files
    const linePatterns = [
      /\bline[s]?[:\s]+(\d+)(?:\s*-\s*(\d+))?/gi,
      /:(\d+)\b/g,
      /\(line[s]?\s+(\d+)(?:\s*-\s*(\d+))?\)/gi,
    ];
    
    for (const pattern of linePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const start = parseInt(match[1]);
        if (!lines.includes(start)) {
          lines.push(start);
        }
        
        if (match[2]) {
          const end = parseInt(match[2]);
          for (let i = start + 1; i <= end; i++) {
            if (!lines.includes(i)) {
              lines.push(i);
            }
          }
        }
      }
    }
    
    // Extract standalone functions
    const functionPatterns = [
      /(?:Function|function):\s*(\w+)/g,
      /\bfunction\s+(\w+)/g,
      /\bdef\s+(\w+)/g,
      /`(\w+)\(\)`/g,  // Backtick functions like `processPayment()`
      /\bThe\s+`(\w+)\(\)`\s+function/gi,  // "The `check()` function"
    ];
    
    for (const pattern of functionPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const func = match[1];
        if (!functions.includes(func) && func.length > 2 && !this.isCommonWord(func)) {
          functions.push(func);
        }
      }
    }
    
    // Extract endpoint information
    const endpointMatch = text.match(/(?:endpoint|route|api):\s*([^\n]+)/i);
    if (endpointMatch && locations.length > 0) {
      locations[0].endpoint = endpointMatch[1].trim();
    }
    
    return {
      files: [...new Set(files)],
      functions: [...new Set(functions)],
      lines: [...new Set(lines)].sort((a, b) => a - b),
      locations
    };
  }

  private isCommonWord(word: string): boolean {
    const common = ['the', 'and', 'for', 'with', 'from', 'this', 'that', 'where', 'when'];
    return common.includes(word.toLowerCase());
  }

  private extractCodeSnippets(text: string): CodeSnippet[] {
    const snippets: CodeSnippet[] = [];
    
    // Extract fenced code blocks
    const codeBlockPattern = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    
    while ((match = codeBlockPattern.exec(text)) !== null) {
      const language = match[1] || 'unknown';
      const code = match[2].trim();
      
      snippets.push({
        language,
        code,
        vulnerableLines: this.identifyVulnerableLines(code, language)
      });
    }
    
    return snippets;
  }

  private identifyVulnerableLines(code: string, language: string): number[] {
    const vulnerableLines: number[] = [];
    const lines = code.split('\n');
    
    lines.forEach((line, index) => {
      // SQL injection patterns
      if (line.match(/["'`].*\+.*["'`].*(?:SELECT|INSERT|UPDATE|DELETE)/i)) {
        vulnerableLines.push(index + 1);
      }
      
      // XSS patterns
      if (line.match(/<%=/) || line.match(/innerHTML\s*=/) || line.match(/v-html/)) {
        vulnerableLines.push(index + 1);
      }
      
      // Command injection
      if (line.match(/exec\(|system\(|eval\(/)) {
        vulnerableLines.push(index + 1);
      }
    });
    
    return vulnerableLines;
  }

  private extractFunctionsFromCode(snippets: CodeSnippet[]): string[] {
    const functions: string[] = [];
    
    for (const snippet of snippets) {
      const patterns = [
        /function\s+(\w+)/g,
        /(\w+)\s*:\s*(?:async\s+)?function/g,
        /(\w+)\s*=\s*(?:async\s+)?function/g,
        /(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g,
        /def\s+(\w+)/g,
        /public\s+function\s+(\w+)/g,
      ];
      
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(snippet.code)) !== null) {
          if (!functions.includes(match[1])) {
            functions.push(match[1]);
          }
        }
      }
    }
    
    return functions;
  }

  private extractTestInformation(text: string): {
    frameworks: TestFrameworkHint[];
    files: string[];
    strategy?: string;
  } {
    const frameworks: TestFrameworkHint[] = [];
    const files: string[] = [];
    
    // Extract test frameworks
    for (const [name, pattern] of Object.entries(this.testFrameworkPatterns)) {
      const match = text.match(new RegExp(`([^.!?\n]*${pattern.source}[^.!?\n]*)`, 'gi'));
      if (match) {
        const context = match[0].trim();
        const hint: TestFrameworkHint = { name };
        
        // Clean up context - remove list numbers
        const cleanContext = context.replace(/^\d+\.\s*/, '').trim();
        
        if (context.match(/add.*test|create.*test|new.*test/i)) {
          hint.suggested = true;
          // Extract just the relevant part after the framework name
          const frameworkIndex = cleanContext.toLowerCase().indexOf(name.toLowerCase());
          if (frameworkIndex >= 0) {
            const afterFramework = cleanContext.substring(frameworkIndex + name.length).trim();
            // Remove leading "to" if present
            hint.context = afterFramework.replace(/^to\s+/i, '');
          } else {
            hint.context = cleanContext;
          }
        }
        
        if (context.match(/existing|should.*pass|ensure.*pass/i)) {
          hint.existing = true;
          // Remove "The" from the beginning if present
          hint.context = cleanContext.replace(/^The\s+/i, '');
        }
        
        frameworks.push(hint);
      }
    }
    
    // Extract test files - simpler approach
    const testFilePattern = /[\w\/\\.-]+(?:__tests__\/[\w\.-]+|[\w\.-]*\.(?:test|spec)|_(?:test|spec))\.[a-zA-Z]+/gi;
    let match;
    while ((match = testFilePattern.exec(text)) !== null) {
      const file = match[0];
      if (!files.includes(file)) {
        files.push(file);
      }
    }
    
    // Also check for test directories
    const testDirPattern = /(?:test|spec|tests|specs)\/[\w\/\\.-]+\.[a-zA-Z]+/gi;
    while ((match = testDirPattern.exec(text)) !== null) {
      const file = match[0];
      if (!files.includes(file)) {
        files.push(file);
      }
    }
    
    // Extract test strategy
    let strategy;
    if (text.match(/test.*strategy|testing.*approach/i)) {
      const strategyMatch = text.match(/(?:test.*strategy|testing.*approach)[:\s]+([^\n]+)/i);
      if (strategyMatch) {
        strategy = strategyMatch[1].trim();
      }
    }
    
    // Generate a default strategy if test files are mentioned but no explicit strategy
    if (!strategy && files.length > 0) {
      strategy = 'Update existing test files to cover the vulnerability fix';
    }
    
    return { frameworks, files, strategy };
  }

  private extractFixInformation(text: string): {
    suggestions: string[];
    example?: FixExample;
  } {
    const suggestions: string[] = [];
    
    // Extract fix recommendations
    const fixPatterns = [
      /(?:fix|solution|recommendation|remediation):\s*([^\n]+)/gi,
      /(?:should|must|need to)\s+([^\n.!?]+)/gi,
      /-\s+((?:use|add|replace|implement|sanitize|validate|escape)\s+[^\n]+)/gi,
      /-\s+([A-Z][^\n]+)/g, // Bullet points starting with capital letter
    ];
    
    // Also check for remediation section
    const remediationSection = text.match(/##\s*remediation\s*\n+([^#\n][^#]*?)(?=\n##|\n###|$)/i);
    if (remediationSection) {
      const remediation = remediationSection[1].trim();
      // Remove trailing period for consistency
      const cleanRemediation = remediation.replace(/\.$/, '');
      if (cleanRemediation && !suggestions.includes(cleanRemediation)) {
        suggestions.push(cleanRemediation);
      }
    }
    
    for (const pattern of fixPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const suggestion = match[1].trim();
        // Skip code block markers and short suggestions
        if (suggestion.length > 10 && 
            !suggestions.includes(suggestion) && 
            !suggestion.startsWith('```')) {
          suggestions.push(suggestion.charAt(0).toUpperCase() + suggestion.slice(1));
        }
      }
    }
    
    // Extract fix example
    let example: FixExample | undefined;
    const exampleMatch = text.match(/example\s+fix:?\s*\n```(\w+)?\n([\s\S]*?)```/i);
    if (exampleMatch) {
      example = {
        code: exampleMatch[2].trim(),
        language: exampleMatch[1] || 'javascript'
      };
    }
    
    return { suggestions, example };
  }

  private suggestPatterns(vulnerabilityType: string, text: string): VulnerabilityPattern[] {
    const patterns: VulnerabilityPattern[] = [];
    
    // Check for SQL injection patterns
    if (vulnerabilityType === 'sql-injection' || text.match(/sql.*injection|string\s+concatenation.*(?:sql|query)/i)) {
      if (text.match(/string\s+concatenation/i) || text.match(/concatenat/i)) {
        patterns.push({
          type: 'sql-injection',
          description: 'String concatenation in SQL queries',
          confidence: 0.9
        });
      }
      if (text.match(/user\s+input.*query/i)) {
        patterns.push({
          type: 'sql-injection',
          description: 'User input in SQL queries',
          confidence: 0.85
        });
      }
    }
    
    // Check for XSS patterns
    if (vulnerabilityType === 'xss' || text.match(/cross[\s-]*site[\s-]*scripting|\bxss\b/i)) {
      if (text.match(/unescaped|without\s+escaping/i)) {
        patterns.push({
          type: 'xss',
          description: 'Unescaped user input in HTML',
          confidence: 0.9
        });
      }
    }
    
    // Check for path traversal patterns
    if (vulnerabilityType === 'path-traversal' || text.match(/path\s+traversal|directory\s+traversal/i)) {
      if (text.match(/file\s+path.*validation/i) || text.match(/\.\.\/|\.\.\\/i)) {
        patterns.push({
          type: 'path-traversal',
          description: 'File path without validation',
          confidence: 0.85
        });
      }
    }
    
    // If no patterns found but vulnerability type is known, add generic pattern
    if (patterns.length === 0 && vulnerabilityType !== 'unknown') {
      patterns.push({
        type: vulnerabilityType,
        description: `Generic ${vulnerabilityType} pattern`,
        confidence: 0.7
      });
    }
    
    return patterns;
  }

  private extractMetadata(text: string): Partial<InterpretedIssue> {
    const metadata: Partial<InterpretedIssue> = {};
    
    // Extract CVSS score
    const cvssMatch = text.match(/cvss\s*(?:score)?[:\s]+(\d+\.?\d*)/i);
    if (cvssMatch) {
      metadata.cvssScore = parseFloat(cvssMatch[1]);
    }
    
    // Extract CWE
    const cweMatch = text.match(/cwe-(\d+)/i);
    if (cweMatch) {
      metadata.cweId = `CWE-${cweMatch[1]}`;
    }
    
    // Extract CVE
    const cveMatch = text.match(/cve-(\d{4}-\d+)/i);
    if (cveMatch) {
      metadata.cveId = cveMatch[0].toUpperCase();
    }
    
    // Extract OWASP category
    const owaspMatch = text.match(/(A\d{2}:\d{4})/);
    if (owaspMatch) {
      metadata.owaspCategory = owaspMatch[1];
    }
    
    // Extract reporter
    const reporterMatch = text.match(/\*\*reported\s+by\*\*[:\s]*([^\n]+)|reported\s+by[:\s]+([^\n]+)/i);
    if (reporterMatch) {
      const reporter = (reporterMatch[1] || reporterMatch[2]).trim();
      metadata.reportedBy = reporter.replace(/\*\*/g, '');
    }
    
    // Extract package info
    const packageMatch = text.match(/\*\*package\*\*[:\s]*([^\n]+)|package[:\s]+([^\n]+)/i);
    if (packageMatch) {
      const pkg = (packageMatch[1] || packageMatch[2]).trim();
      // Remove any remaining markdown
      metadata.package = pkg.replace(/\*\*/g, '');
    }
    
    // Extract versions
    const vulnerableMatch = text.match(/\*\*vulnerable\s+versions?\*\*[:\s]*([^\n]+)|vulnerable\s+versions?[:\s]+([^\n]+)/i);
    if (vulnerableMatch) {
      const version = (vulnerableMatch[1] || vulnerableMatch[2]).trim();
      metadata.vulnerableVersions = version.replace(/\*\*/g, '');
    }
    
    const patchedMatch = text.match(/\*\*patched\s+versions?\*\*[:\s]*([^\n]+)|patched\s+versions?[:\s]+([^\n]+)/i);
    if (patchedMatch) {
      const version = (patchedMatch[1] || patchedMatch[2]).trim();
      metadata.patchedVersion = version.replace(/\*\*/g, '');
    }
    
    // Extract impact
    const impactSection = text.match(/impact[:\s]+([\s\S]*?)(?=\n##|\n###|$)/i);
    if (impactSection) {
      const impacts = impactSection[1]
        .split(/\n\d+\.|\n-/)
        .map(i => i.trim())
        .filter(i => i.length > 10);
      if (impacts.length > 0) {
        metadata.impact = impacts;
      }
    }
    
    // Extract PoC
    const pocMatch = text.match(/(?:proof\s+of\s+concept|poc)[:\s]+([\s\S]*?)(?=\n##|\n###|$)/i);
    if (pocMatch) {
      metadata.proofOfConcept = pocMatch[1].trim();
    }
    
    // Extract testing instructions
    const testingMatch = text.match(/testing\s+instructions?[:\s]+([\s\S]*?)(?=\n##|\n###|$)/i);
    if (testingMatch) {
      const instructions = testingMatch[1]
        .split(/\n\d+\.|\n-/)
        .map(i => i.trim())
        .filter(i => i.length > 5);
      if (instructions.length > 0) {
        metadata.testingInstructions = instructions;
      }
    }
    
    return metadata;
  }

  private extractReferences(text: string): References {
    const references: References = {
      issues: [],
      pullRequests: [],
      urls: []
    };
    
    // Extract issue references (exclude PR references)
    const issuePattern = /(?<!PR\s)#(\d+)/g;
    let match;
    while ((match = issuePattern.exec(text)) !== null) {
      const ref = match[0];
      if (!references.issues.includes(ref)) {
        references.issues.push(ref);
      }
    }
    
    // Extract PR references
    const prPattern = /PR\s+#(\d+)/gi;
    while ((match = prPattern.exec(text)) !== null) {
      const ref = `#${match[1]}`;
      if (!references.pullRequests.includes(ref)) {
        references.pullRequests.push(ref);
      }
    }
    
    // Extract pull URL references
    const pullUrlPattern = /pull\/(\d+)/gi;
    while ((match = pullUrlPattern.exec(text)) !== null) {
      const num = match[1];
      // This will be handled in URL extraction
    }
    
    // Extract URLs
    const urlPattern = /https?:\/\/[^\s<>]+/g;
    while ((match = urlPattern.exec(text)) !== null) {
      const url = match[0];
      if (url.includes('/pull/')) {
        if (!references.pullRequests.includes(url)) {
          references.pullRequests.push(url);
        }
      } else if (!references.urls.includes(url)) {
        references.urls.push(url);
      }
    }
    
    return references;
  }

  private extractTodoItems(text: string): string[] {
    const todos: string[] = [];
    
    // Extract checkbox todos
    const todoPattern = /-\s*\[\s*\]\s+([^\n]+)/g;
    let match;
    while ((match = todoPattern.exec(text)) !== null) {
      todos.push(match[1].trim());
    }
    
    return todos;
  }

  private extractFromTitle(title: string): {
    vulnerabilityType?: string;
    severity?: InterpretedIssue['severity'];
  } {
    const result: ReturnType<typeof this.extractFromTitle> = {};
    
    // Check for vulnerability type
    for (const [type, patterns] of Object.entries(this.vulnerabilityPatterns)) {
      if (patterns.some(p => p.test(title))) {
        result.vulnerabilityType = type;
        break;
      }
    }
    
    // Check for severity
    for (const [severity, patterns] of Object.entries(this.severityIndicators)) {
      if (patterns.some(p => p.test(title))) {
        result.severity = severity as InterpretedIssue['severity'];
        break;
      }
    }
    
    return result;
  }
}