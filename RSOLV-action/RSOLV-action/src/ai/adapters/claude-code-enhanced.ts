/**
 * Enhanced Claude Code adapter with deep context gathering capabilities
 * This adapter extends the base Claude Code adapter to provide comprehensive
 * repository understanding before generating solutions.
 */
import { ClaudeCodeAdapter } from './claude-code.js';
import { IssueContext } from '../../types/index.js';
import { PullRequestSolution, AIConfig } from '../types.js';
import { IssueAnalysis } from '../types.js';
import { logger } from '../../utils/logger.js';
import fs from 'fs';
import path from 'path';

/**
 * Options for deep context gathering
 */
export interface DeepContextOptions {
  enableUltraThink: boolean;
  maxExplorationTime: number; // milliseconds
  contextDepth: 'shallow' | 'medium' | 'deep' | 'ultra';
  includeArchitectureAnalysis: boolean;
  includeTestPatterns: boolean;
  includeStyleGuide: boolean;
  includeDependencyAnalysis: boolean;
}

/**
 * Repository context gathered from deep analysis
 */
export interface RepositoryContext {
  architecture: {
    patterns: string[];
    structure: string;
    mainComponents: string[];
  };
  codeConventions: {
    namingPatterns: string[];
    fileOrganization: string;
    importPatterns: string[];
  };
  testingPatterns: {
    framework: string;
    structure: string;
    conventions: string[];
  };
  dependencies: {
    runtime: string[];
    dev: string[];
    patterns: string[];
  };
  relatedComponents: {
    files: string[];
    modules: string[];
    interfaces: string[];
  };
  styleGuide: {
    formatting: string;
    documentation: string;
    errorHandling: string;
  };
}

/**
 * Enhanced Claude Code adapter with deep context capabilities
 */
export class EnhancedClaudeCodeAdapter extends ClaudeCodeAdapter {
  private contextCache: Map<string, RepositoryContext> = new Map();
  private cacheTimeout: number = 3600000; // 1 hour default
  
  constructor(config: AIConfig, repoPath: string = process.cwd(), credentialManager?: any) {
    super(config, repoPath, credentialManager);
    
    if (config.claudeCodeConfig?.contextCacheDuration) {
      this.cacheTimeout = config.claudeCodeConfig.contextCacheDuration;
    }
  }
  
  /**
   * Gather deep context about the repository
   */
  async gatherDeepContext(
    issueContext: IssueContext,
    options: DeepContextOptions
  ): Promise<RepositoryContext> {
    const cacheKey = `${issueContext.repository.fullName}-${options.contextDepth}`;
    
    // Check cache first
    if (this.contextCache.has(cacheKey)) {
      const cached = this.contextCache.get(cacheKey)!;
      logger.info('Using cached repository context');
      return cached;
    }
    
    logger.info(`Starting deep context gathering with depth: ${options.contextDepth}`);
    const startTime = Date.now();
    
    try {
      // Construct the context gathering prompt
      const contextPrompt = this.buildContextGatheringPrompt(issueContext, options);
      
      // Use the parent class's generateSolution method to gather context
      // Create a mock analysis for context gathering
      const contextAnalysis: IssueAnalysis = {
        summary: 'Analyzing issue for security vulnerabilities',
        complexity: 'medium' as const,
        estimatedTime: 60,
        potentialFixes: [],
        recommendedApproach: 'Generate solution using Claude Code SDK',
        relatedFiles: []
      };
      
      // Generate a solution that will include repository exploration
      const result = await this.generateSolution(
        issueContext,
        contextAnalysis,
        contextPrompt
      );
      
      // Extract context from the exploration
      const context = this.extractContextFromSolution(result);
      
      // Cache the result
      this.contextCache.set(cacheKey, context);
      
      const duration = Date.now() - startTime;
      logger.info(`Deep context gathering completed in ${duration}ms`);
      
      return context;
    } catch (error) {
      logger.error('Error gathering deep context', error as Error);
      
      // Return a minimal context on error
      return this.createMinimalContext();
    }
  }
  
  /**
   * Generate an enhanced solution using deep context
   */
  async generateEnhancedSolution(
    issueContext: IssueContext,
    analysis: IssueAnalysis,
    enhancedPrompt?: string
  ): Promise<PullRequestSolution> {
    logger.info('Generating enhanced solution with deep context');
    
    // First, gather deep context
    const deepContext = await this.gatherDeepContext(issueContext, {
      enableUltraThink: true,
      maxExplorationTime: (this as any).config.claudeCodeConfig?.contextGatheringTimeout || 300000,
      contextDepth: (this as any).config.claudeCodeConfig?.contextDepth || 'deep',
      includeArchitectureAnalysis: true,
      includeTestPatterns: true,
      includeStyleGuide: true,
      includeDependencyAnalysis: true
    });
    
    // Build solution prompt with deep context
    const solutionPrompt = this.buildEnhancedSolutionPrompt(
      issueContext,
      analysis,
      deepContext,
      enhancedPrompt
    );
    
    // Generate solution using the enhanced prompt
    const result = await this.generateSolution(issueContext, analysis, solutionPrompt);
    
    // Convert Solution to PullRequestSolution
    if (!result.success || !result.changes) {
      throw new Error(result.error || 'Failed to generate solution');
    }
    
    return {
      title: `Fix ${issueContext.title}`,
      description: `This PR fixes the security issue: ${issueContext.body}\n\nGenerated using enhanced Claude Code SDK with deep context analysis.`,
      files: Object.entries(result.changes).map(([path, changes]) => ({
        path,
        changes
      }))
    };
  }
  
  /**
   * Build the prompt for deep context gathering
   */
  private buildContextGatheringPrompt(
    issueContext: IssueContext,
    options: DeepContextOptions
  ): string {
    const ultraThinkPrefix = options.enableUltraThink ? 'ultrathink\n\n' : '';
    
    return `${ultraThinkPrefix}I need you to perform a comprehensive analysis of this repository to gather deep context for solving an issue.

Issue Context:
Title: ${issueContext.title}
Description: ${issueContext.body}

Repository: ${issueContext.repository.fullName}
Language: ${issueContext.repository.language || 'Unknown'}

Exploration Depth: ${options.contextDepth}

Please analyze the repository and provide detailed information about:

1. Architecture and Design Patterns
   - Overall architecture style
   - Main design patterns used
   - Component organization
   - Module structure

2. Code Conventions and Style
   - Naming conventions for files, functions, variables
   - Import/export patterns
   - Comment and documentation style
   - Error handling patterns

3. Testing Framework and Patterns
   - Test framework(s) used
   - Test file organization
   - Test naming conventions
   - Mocking strategies

4. Dependencies and External Libraries
   - Runtime dependencies and their usage
   - Development dependencies
   - Build tools and configurations
   - External API integrations

5. Related Components
   - Files likely to be affected by this issue
   - Related modules and interfaces
   - Shared utilities or helpers
   - Configuration files

${options.includeStyleGuide ? '6. Style Guide and Best Practices\n   - Code formatting rules\n   - Documentation requirements\n   - Security practices\n   - Performance considerations\n' : ''}

Explore the repository comprehensively, examining:
- Configuration files (package.json, tsconfig.json, etc.)
- README and documentation
- Build and CI/CD configurations
- Test suites and examples
- Similar implementations to the requested feature

Take your time to understand the codebase deeply. Look for patterns, conventions, and architectural decisions that should be followed when implementing the solution.

Format your response as a JSON object with the structure defined in the RepositoryContext interface.`;
  }
  
  /**
   * Build an enhanced solution prompt with deep context
   */
  private buildEnhancedSolutionPrompt(
    issueContext: IssueContext,
    analysis: IssueAnalysis,
    deepContext: RepositoryContext,
    existingPrompt?: string
  ): string {
    if (existingPrompt) {
      // Enhance existing prompt with context
      return `ultrathink

${existingPrompt}

Additional Repository Context:
${JSON.stringify(deepContext, null, 2)}

Use this deep understanding of the repository to ensure your solution:
- Follows all established patterns and conventions
- Integrates seamlessly with existing architecture
- Includes tests that match the project's testing style
- Handles errors consistently with the rest of the codebase`;
    }
    
    return `ultrathink

Using the comprehensive repository context I've gathered, generate a solution for:

Issue: ${issueContext.title}
Description: ${issueContext.body}

Repository Context Summary:
- Architecture: ${deepContext.architecture.patterns.join(', ')}
- Main Components: ${deepContext.architecture.mainComponents.join(', ')}
- Testing Framework: ${deepContext.testingPatterns.framework}
- Code Style: ${deepContext.codeConventions.namingPatterns.join(', ')}
- Error Handling: ${deepContext.styleGuide.errorHandling}

Related Components that may need updates:
${deepContext.relatedComponents.files.join('\n')}

Generate a solution that:
1. Follows the exact patterns found in: ${deepContext.codeConventions.fileOrganization}
2. Uses the same naming conventions as existing code
3. Includes comprehensive tests matching the style in the test directory
4. Handles errors using the pattern: ${deepContext.styleGuide.errorHandling}
5. Updates all related components identified above
6. Maintains architectural consistency with the ${deepContext.architecture.structure} structure
7. Uses appropriate dependencies from: ${deepContext.dependencies.runtime.join(', ')}

Take time to think through all implications and create a production-ready solution that feels native to this codebase.

Format your response as a JSON object with title, description, files, and tests.`;
  }
  
  /**
   * Extract context from solution result
   */
  private extractContextFromSolution(result: any): RepositoryContext {
    // For now, return a minimal context based on the exploration
    // In a full implementation, we could parse the Claude Code messages
    // to extract architectural insights
    return this.createMinimalContext();
  }
  
  /**
   * Parse the context gathering result
   */
  private async parseContextResult(result: string): Promise<RepositoryContext> {
    try {
      // Handle both direct JSON and streamed responses
      let parsed;
      if (result.includes('\n')) {
        // Streamed JSON format - extract the last complete JSON object
        const lines = result.split('\n').filter(line => line.trim());
        const lastLine = lines[lines.length - 1];
        parsed = JSON.parse(lastLine);
      } else {
        parsed = JSON.parse(result);
      }
      
      // Ensure all required fields are present
      return {
        architecture: parsed.architecture || this.createMinimalContext().architecture,
        codeConventions: parsed.codeConventions || this.createMinimalContext().codeConventions,
        testingPatterns: parsed.testingPatterns || this.createMinimalContext().testingPatterns,
        dependencies: parsed.dependencies || this.createMinimalContext().dependencies,
        relatedComponents: parsed.relatedComponents || this.createMinimalContext().relatedComponents,
        styleGuide: parsed.styleGuide || this.createMinimalContext().styleGuide
      };
    } catch (error) {
      logger.error('Error parsing context result', error as Error);
      return this.createMinimalContext();
    }
  }
  
  /**
   * Create a minimal context for fallback
   */
  private createMinimalContext(): RepositoryContext {
    return {
      architecture: {
        patterns: ['Unknown'],
        structure: 'Standard',
        mainComponents: []
      },
      codeConventions: {
        namingPatterns: ['camelCase'],
        fileOrganization: 'Standard',
        importPatterns: []
      },
      testingPatterns: {
        framework: 'Unknown',
        structure: 'Standard',
        conventions: []
      },
      dependencies: {
        runtime: [],
        dev: [],
        patterns: []
      },
      relatedComponents: {
        files: [],
        modules: [],
        interfaces: []
      },
      styleGuide: {
        formatting: 'Standard',
        documentation: 'JSDoc',
        errorHandling: 'try-catch'
      }
    };
  }
  
  /**
   * Clean up temporary files
   */
  private cleanupTempFiles(files: string[]): void {
    for (const file of files) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (error) {
        logger.warn(`Failed to clean up temp file: ${file}`, error as Error);
      }
    }
  }
  
  /**
   * Clear the context cache
   */
  clearContextCache(): void {
    this.contextCache.clear();
    logger.info('Context cache cleared');
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.contextCache.size,
      keys: Array.from(this.contextCache.keys())
    };
  }
}