/**
 * Coverage Analyzer
 * 
 * Analyzes test coverage reports to identify gaps and guide
 * intelligent test generation for vulnerability fixes.
 */

export interface FunctionCoverage {
  name: string;
  line: number;
  hits: number;
}

export interface LineCoverage {
  total: number;
  covered: number;
  percentage: number;
  details?: Array<{ line: number; hits: number }>;
  uncoveredLines?: number[];
}

export interface FileCoverage {
  path: string;
  functions?: {
    total: number;
    covered: number;
    percentage?: number;
    details?: FunctionCoverage[];
  };
  lines: LineCoverage;
}

export interface CoverageReport {
  format: 'lcov' | 'coverage.py' | 'coverage.py-xml' | 'simplecov' | 'jacoco' | 'cobertura';
  files: FileCoverage[];
  summary?: {
    totalFiles: number;
    totalLines: number;
    coveredLines: number;
    linePercentage: number;
    totalFunctions?: number;
    coveredFunctions?: number;
    functionPercentage?: number;
  };
  error?: string;
}

export interface CoverageGap {
  file: string;
  type: 'uncovered-function' | 'uncovered-block' | 'low-coverage';
  name?: string;
  line?: number;
  lines?: number[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  coveragePercentage?: number;
}

export interface TestMapping {
  sourceFile: string;
  testFiles: string[];
  hasTests: boolean;
}

export interface TestRecommendation {
  priority: number;
  file: string;
  reason: string;
  suggestedTests: string[];
  coverageGap?: CoverageGap;
}

export interface TestGenerationContext {
  file: string;
  uncoveredFunctions: string[];
  uncoveredLines?: number[];
  coveragePercentage: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  suggestedTestTypes: string[];
}

export interface CoverageSummary {
  overallCoverage: number;
  filesCovered: number;
  linesOfCode: number;
  linesCovered: number;
  functionsCovered?: number;
  totalFunctions?: number;
  needsImprovement: string[];
  wellCovered: string[];
}

export class CoverageAnalyzer {
  /**
   * Parse LCOV format coverage data
   */
  async parseLcov(lcovData: string): Promise<CoverageReport> {
    try {
      const files: FileCoverage[] = [];
      const records = lcovData.split('end_of_record').filter(r => r.trim());
      
      for (const record of records) {
        const lines = record.split('\n').filter(l => l.trim());
        const file: Partial<FileCoverage> = {
          functions: {
            total: 0,
            covered: 0,
            details: []
          },
          lines: {
            total: 0,
            covered: 0,
            percentage: 0,
            details: []
          }
        };
        
        for (const line of lines) {
          const [tag, ...data] = line.split(':');
          const value = data.join(':');
          
          switch (tag) {
            case 'SF':
              file.path = value;
              break;
            case 'FN':
              const [fnLine, fnName] = value.split(',');
              file.functions!.details!.push({
                name: fnName,
                line: parseInt(fnLine),
                hits: 0
              });
              break;
            case 'FNF':
              file.functions!.total = parseInt(value);
              break;
            case 'FNH':
              file.functions!.covered = parseInt(value);
              break;
            case 'DA':
              const [daLine, daHits] = value.split(',');
              const lineNum = parseInt(daLine);
              const hits = parseInt(daHits);
              file.lines!.details!.push({ line: lineNum, hits });
              if (hits === 0 && !file.lines!.uncoveredLines) {
                file.lines!.uncoveredLines = [];
              }
              if (hits === 0) {
                file.lines!.uncoveredLines!.push(lineNum);
              }
              break;
            case 'LF':
              file.lines!.total = parseInt(value);
              break;
            case 'LH':
              file.lines!.covered = parseInt(value);
              break;
          }
        }
        
        // Calculate percentages
        if (file.lines!.total > 0) {
          file.lines!.percentage = parseFloat(
            ((file.lines!.covered / file.lines!.total) * 100).toFixed(2)
          );
        }
        
        // Update function hits based on line coverage
        if (file.functions?.details) {
          for (const fn of file.functions.details) {
            const fnLine = file.lines!.details!.find(l => l.line === fn.line);
            if (fnLine) {
              fn.hits = fnLine.hits;
            }
          }
          
          // Don't recalculate covered functions - use FNH value from LCOV
          if (file.functions.total > 0) {
            file.functions.percentage = parseFloat(
              ((file.functions.covered / file.functions.total) * 100).toFixed(2)
            );
          }
        }
        
        if (file.path) {
          files.push(file as FileCoverage);
        }
      }
      
      // Calculate summary
      const summary = this.calculateSummary(files);
      
      return {
        format: 'lcov',
        files,
        summary
      };
    } catch (error) {
      return {
        format: 'lcov',
        files: [],
        error: `Failed to parse LCOV data: ${error}`,
        summary: {
          totalFiles: 0,
          totalLines: 0,
          coveredLines: 0,
          linePercentage: 0
        }
      };
    }
  }

  /**
   * Parse coverage.py JSON format
   */
  async parseCoveragePy(jsonData: string): Promise<CoverageReport> {
    try {
      const data = JSON.parse(jsonData);
      const files: FileCoverage[] = [];
      
      for (const [filePath, fileData] of Object.entries(data.files)) {
        const coverage = fileData as any;
        files.push({
          path: filePath,
          lines: {
            total: coverage.summary.num_statements,
            covered: coverage.summary.covered_lines,
            percentage: coverage.summary.percent_covered,
            uncoveredLines: coverage.missing_lines
          }
        });
      }
      
      return {
        format: 'coverage.py',
        files,
        summary: {
          totalFiles: files.length,
          totalLines: data.totals.num_statements,
          coveredLines: data.totals.covered_lines,
          linePercentage: data.totals.percent_covered
        }
      };
    } catch (error) {
      return {
        format: 'coverage.py',
        files: [],
        error: `Failed to parse coverage.py data: ${error}`
      };
    }
  }

  /**
   * Parse coverage.py XML format
   */
  async parseCoveragePyXml(xmlData: string): Promise<CoverageReport> {
    try {
      const files: FileCoverage[] = [];
      
      // Simple XML parsing for demonstration
      const fileMatches = xmlData.matchAll(/<class filename="([^"]+)"[^>]*>([\s\S]*?)<\/class>/g);
      
      for (const match of fileMatches) {
        const filePath = match[1];
        const classContent = match[2];
        const lineMatches = classContent.matchAll(/<line number="(\d+)" hits="(\d+)"/g);
        
        const lines: Array<{ line: number; hits: number }> = [];
        const uncoveredLines: number[] = [];
        
        for (const lineMatch of lineMatches) {
          const lineNum = parseInt(lineMatch[1]);
          const hits = parseInt(lineMatch[2]);
          lines.push({ line: lineNum, hits });
          if (hits === 0) {
            uncoveredLines.push(lineNum);
          }
        }
        
        const covered = lines.filter(l => l.hits > 0).length;
        const total = lines.length;
        
        files.push({
          path: filePath,
          lines: {
            total,
            covered,
            percentage: total > 0 ? parseFloat(((covered / total) * 100).toFixed(2)) : 0,
            details: lines,
            uncoveredLines
          }
        });
      }
      
      return {
        format: 'coverage.py-xml',
        files,
        summary: this.calculateSummary(files)
      };
    } catch (error) {
      return {
        format: 'coverage.py-xml',
        files: [],
        error: `Failed to parse coverage.py XML: ${error}`
      };
    }
  }

  /**
   * Parse SimpleCov JSON format
   */
  async parseSimpleCov(jsonData: string): Promise<CoverageReport> {
    try {
      const data = JSON.parse(jsonData);
      const files: FileCoverage[] = [];
      
      // SimpleCov structure: { "TestSuiteName": { coverage: { ... }, timestamp: ... } }
      const suiteData = Object.values(data)[0] as any;
      const coverage = suiteData.coverage;
      
      if (!coverage) {
        throw new Error('Invalid SimpleCov format: missing coverage data');
      }
      
      for (const [filePath, fileData] of Object.entries(coverage)) {
        const lineData = fileData as any;
        const lines = lineData.lines || lineData; // Handle both formats
        const linesArray = Array.isArray(lines) ? lines : [];
        const relevantLines = linesArray
          .map((hits, index) => ({ line: index + 1, hits }))
          .filter(l => l.hits !== null);
        
        const coveredLines = relevantLines.filter(l => l.hits! > 0);
        const uncoveredLines = relevantLines
          .filter(l => l.hits === 0)
          .map(l => l.line);
        
        files.push({
          path: filePath,
          lines: {
            total: relevantLines.length,
            covered: coveredLines.length,
            percentage: relevantLines.length > 0 
              ? parseFloat(((coveredLines.length / relevantLines.length) * 100).toFixed(2))
              : 0,
            uncoveredLines
          }
        });
      }
      
      return {
        format: 'simplecov',
        files,
        summary: this.calculateSummary(files)
      };
    } catch (error) {
      return {
        format: 'simplecov',
        files: [],
        error: `Failed to parse SimpleCov data: ${error}`
      };
    }
  }

  /**
   * Find coverage gaps in a report
   */
  async findCoverageGaps(report: CoverageReport): Promise<CoverageGap[]> {
    const gaps: CoverageGap[] = [];
    
    for (const file of report.files) {
      // Check for uncovered functions
      if (file.functions?.details) {
        for (const fn of file.functions.details) {
          if (fn.hits === 0) {
            gaps.push({
              file: file.path,
              type: 'uncovered-function',
              name: fn.name,
              line: fn.line,
              priority: this.getPriority(file.path, 'function')
            });
          }
        }
      }
      
      // Check for uncovered blocks
      if (file.lines.uncoveredLines && file.lines.uncoveredLines.length > 0) {
        const blocks = this.findUncoveredBlocks(file.lines.uncoveredLines);
        for (const block of blocks) {
          gaps.push({
            file: file.path,
            type: 'uncovered-block',
            lines: block,
            priority: this.getPriority(file.path, 'block', block.length)
          });
        }
        
        // Also check if there's a significant uncovered block in security files
        if (file.lines.uncoveredLines.length >= 5 && this.isSecurityFile(file.path)) {
          gaps.push({
            file: file.path,
            type: 'uncovered-block',
            lines: file.lines.uncoveredLines.slice(0, 5),
            priority: 'critical'
          });
        }
      }
      
      // Check for low coverage files
      if (file.lines.percentage < 50) {
        gaps.push({
          file: file.path,
          type: 'low-coverage',
          coveragePercentage: file.lines.percentage,
          priority: this.getPriority(file.path, 'file', undefined, file.lines.percentage)
        });
      }
    }
    
    return gaps;
  }

  /**
   * Find test files for a source file
   */
  async findTestsForFile(sourceFile: string, testFiles: string[]): Promise<TestMapping> {
    const baseName = this.getBaseName(sourceFile);
    const foundTests = testFiles.filter(testFile => {
      const testBaseName = this.getBaseName(testFile);
      return testBaseName.includes(baseName) || 
             testFile.includes(sourceFile.replace(/\.[^.]+$/, ''));
    });
    
    return {
      sourceFile,
      testFiles: foundTests,
      hasTests: foundTests.length > 0
    };
  }

  /**
   * Map all test files to source files
   */
  async mapTestsToSource(
    sourceFiles: string[], 
    testFiles: string[]
  ): Promise<Record<string, TestMapping>> {
    const mappings: Record<string, TestMapping> = {};
    
    for (const sourceFile of sourceFiles) {
      mappings[sourceFile] = await this.findTestsForFile(sourceFile, testFiles);
    }
    
    return mappings;
  }

  /**
   * Generate coverage summary
   */
  async generateSummary(report: CoverageReport): Promise<CoverageSummary> {
    const needsImprovement = report.files
      .filter(f => f.lines.percentage < 80)
      .map(f => f.path);
    
    const wellCovered = report.files
      .filter(f => f.lines.percentage >= 80)
      .map(f => f.path);
    
    return {
      overallCoverage: report.summary?.linePercentage || 0,
      filesCovered: report.files.length,
      linesOfCode: report.summary?.totalLines || 0,
      linesCovered: report.summary?.coveredLines || 0,
      functionsCovered: report.summary?.coveredFunctions,
      totalFunctions: report.summary?.totalFunctions,
      needsImprovement,
      wellCovered
    };
  }

  /**
   * Recommend test priorities based on coverage gaps
   */
  async recommendTestPriorities(gaps: CoverageGap[]): Promise<TestRecommendation[]> {
    const recommendations: TestRecommendation[] = [];
    
    // Sort gaps by priority
    const sortedGaps = [...gaps].sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
    
    let priority = 1;
    for (const gap of sortedGaps) {
      const reason = this.getRecommendationReason(gap);
      const suggestedTests = this.getSuggestedTests(gap);
      
      recommendations.push({
        priority: priority++,
        file: gap.file,
        reason,
        suggestedTests,
        coverageGap: gap
      });
    }
    
    return recommendations;
  }

  /**
   * Get test generation context for a file
   */
  async getTestGenerationContext(
    report: CoverageReport, 
    targetFile: string
  ): Promise<TestGenerationContext> {
    const file = report.files.find(f => f.path === targetFile);
    if (!file) {
      throw new Error(`File ${targetFile} not found in coverage report`);
    }
    
    const uncoveredFunctions = file.functions?.details
      ?.filter(f => f.hits === 0)
      .map(f => f.name) || [];
    
    const priority = this.getPriority(targetFile, 'file', undefined, file.lines.percentage);
    
    return {
      file: targetFile,
      uncoveredFunctions,
      uncoveredLines: file.lines.uncoveredLines || [],
      coveragePercentage: file.lines.percentage,
      priority,
      suggestedTestTypes: this.getSuggestedTestTypes(file, priority)
    };
  }

  // Private helper methods
  
  private calculateSummary(files: FileCoverage[]): CoverageReport['summary'] {
    let totalLines = 0;
    let coveredLines = 0;
    let totalFunctions = 0;
    let coveredFunctions = 0;
    
    for (const file of files) {
      totalLines += file.lines.total;
      coveredLines += file.lines.covered;
      
      if (file.functions) {
        totalFunctions += file.functions.total;
        coveredFunctions += file.functions.covered;
      }
    }
    
    return {
      totalFiles: files.length,
      totalLines,
      coveredLines,
      linePercentage: totalLines > 0 
        ? parseFloat(((coveredLines / totalLines) * 100).toFixed(2))
        : 0,
      totalFunctions: totalFunctions || undefined,
      coveredFunctions: coveredFunctions || undefined,
      functionPercentage: totalFunctions > 0
        ? parseFloat(((coveredFunctions / totalFunctions) * 100).toFixed(2))
        : undefined
    };
  }

  private findUncoveredBlocks(uncoveredLines: number[]): number[][] {
    if (uncoveredLines.length === 0) return [];
    
    const blocks: number[][] = [];
    let currentBlock: number[] = [uncoveredLines[0]];
    
    for (let i = 1; i < uncoveredLines.length; i++) {
      if (uncoveredLines[i] === uncoveredLines[i - 1] + 1) {
        currentBlock.push(uncoveredLines[i]);
      } else {
        if (currentBlock.length >= 1) {  // Changed from 3 to 1 to catch all blocks
          blocks.push([...currentBlock]);
        }
        currentBlock = [uncoveredLines[i]];
      }
    }
    
    if (currentBlock.length >= 1) {  // Changed from 3 to 1 to catch all blocks
      blocks.push(currentBlock);
    }
    
    return blocks;
  }

  private getPriority(
    filePath: string, 
    type: 'function' | 'block' | 'file',
    blockSize?: number,
    coveragePercentage?: number
  ): CoverageGap['priority'] {
    const isSecurityFile = this.isSecurityFile(filePath);
    
    if (isSecurityFile) {
      if (type === 'file') return 'critical';
      if (type === 'function' && coveragePercentage === 0) return 'critical';
      return type === 'function' || (type === 'block' && blockSize && blockSize >= 3) 
        ? 'critical' 
        : 'high';
    }
    
    if (type === 'function') return 'high';
    if (type === 'block' && blockSize && blockSize > 10) return 'high';
    if (type === 'file' && coveragePercentage !== undefined && coveragePercentage < 30) return 'high';
    
    return 'medium';
  }
  
  private isSecurityFile(filePath: string): boolean {
    const securityPaths = ['auth', 'crypto', 'security', 'password', 'token', 'session', 'validat'];
    return securityPaths.some(path => filePath.toLowerCase().includes(path));
  }

  private getBaseName(filePath: string): string {
    const parts = filePath.split('/');
    const fileName = parts[parts.length - 1];
    return fileName.replace(/\.(test|spec|tests?)\..*$/, '').replace(/\.[^.]+$/, '');
  }

  private getRecommendationReason(gap: CoverageGap): string {
    switch (gap.type) {
      case 'uncovered-function':
        return gap.priority === 'critical' 
          ? 'Critical security function lacks coverage'
          : `Function ${gap.name} has no test coverage`;
      case 'uncovered-block':
        return `Code block (${gap.lines?.length} lines) lacks coverage`;
      case 'low-coverage':
        return `File has only ${gap.coveragePercentage}% coverage`;
      default:
        return 'Insufficient test coverage';
    }
  }

  private getSuggestedTests(gap: CoverageGap): string[] {
    const tests: string[] = [];
    
    switch (gap.type) {
      case 'uncovered-function':
        tests.push('Unit test for function behavior');
        tests.push('Edge case tests');
        if (gap.priority === 'critical') {
          tests.push('Security validation tests');
          tests.push('Error handling tests');
        }
        break;
      case 'uncovered-block':
        tests.push('Branch coverage tests');
        tests.push('Conditional logic tests');
        break;
      case 'low-coverage':
        tests.push('Comprehensive unit tests');
        tests.push('Integration tests');
        break;
    }
    
    return tests;
  }

  private getSuggestedTestTypes(file: FileCoverage, priority: CoverageGap['priority']): string[] {
    const types: string[] = ['unit'];
    
    if (file.path.includes('valid')) {
      types.push('validation', 'edge-cases');
    }
    
    if (priority === 'critical') {
      types.push('security', 'error-handling');
    }
    
    if (file.lines.percentage === 0) {
      types.unshift('basic-functionality');
    }
    
    return types;
  }
}