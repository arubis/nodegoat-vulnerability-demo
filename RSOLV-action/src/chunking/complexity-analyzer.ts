/**
 * RFC-046: Complexity Analysis for Vulnerability Fixes
 */

import { 
  MultiFileVulnerability, 
  FixComplexity,
  ComplexityFactors
} from './types.js';

export { FixComplexity } from './types.js';

export class ComplexityAnalyzer {
  analyze(vulnerability: any): FixComplexity {
    const factors = this.calculateFactors(vulnerability);
    return this.determineComplexity(factors);
  }
  
  private calculateFactors(vulnerability: any): ComplexityFactors {
    return {
      fileCount: vulnerability.files?.length || 1,
      requiresConfigChange: vulnerability.requiresConfigChange || false,
      requiresNewDependencies: vulnerability.requiresNewDependencies || false,
      crossFileReferences: this.countCrossReferences(vulnerability),
      testImpact: this.assessTestImpact(vulnerability)
    };
  }
  
  private determineComplexity(factors: ComplexityFactors): FixComplexity {
    // Complex: Many files or requires config/dependency changes
    if (factors.fileCount >= 10 || 
        (factors.requiresConfigChange && factors.requiresNewDependencies)) {
      return FixComplexity.COMPLEX;
    }
    
    // Manual: Requires both config changes and has many cross-references
    if (factors.requiresConfigChange && factors.crossFileReferences > 5) {
      return FixComplexity.MANUAL;
    }
    
    // Moderate: Multiple files but manageable
    if (factors.fileCount >= 3 && factors.fileCount < 10) {
      return FixComplexity.MODERATE;
    }
    
    // Simple: Single or few files, no special requirements
    return FixComplexity.SIMPLE;
  }
  
  private countCrossReferences(vulnerability: any): number {
    // Simplified: count based on file relationships
    if (!vulnerability.files) return 0;
    
    let references = 0;
    for (const file of vulnerability.files) {
      if (file.imports) {
        references += file.imports.length;
      }
    }
    return references;
  }
  
  private assessTestImpact(vulnerability: any): number {
    // Simplified: check if test files are involved
    if (!vulnerability.files) return 0;
    
    const testFiles = vulnerability.files.filter((f: any) => 
      f.path.includes('test') || 
      f.path.includes('spec')
    );
    
    return testFiles.length;
  }
}

export class ComplexityRouter {
  private analyzer = new ComplexityAnalyzer();
  
  async route(vulnerability: any): Promise<any> {
    const complexity = this.analyzer.analyze(vulnerability);
    
    if (complexity === FixComplexity.COMPLEX || complexity === FixComplexity.MANUAL) {
      return {
        approach: 'manual_guide',
        guide: await this.generateManualGuide(vulnerability, complexity)
      };
    }
    
    return {
      approach: 'automated',
      complexity
    };
  }
  
  private async generateManualGuide(vulnerability: any, complexity: FixComplexity): Promise<any> {
    const steps: string[] = [];
    
    // Add steps based on vulnerability characteristics
    if (vulnerability.requiresConfigChange) {
      steps.push('1. Update configuration files');
      steps.push('2. Set environment variables');
    }
    
    if (vulnerability.requiresNewDependencies) {
      steps.push('3. Install required dependencies');
      steps.push('4. Update package.json');
    }
    
    steps.push('5. Review and test changes');
    steps.push('6. Validate security improvements');
    
    return {
      steps: steps.length,
      content: steps.join('\n'),
      complexity,
      reason: `This ${vulnerability.type} vulnerability requires manual intervention due to its complexity`
    };
  }
}