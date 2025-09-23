# Enhanced Context Gathering with Claude Code

## Overview

This proposal enhances RSOLV's issue analysis and solution generation by:

1. Using Claude Code to perform deep repository exploration before generating solutions
2. Implementing the "ultrathink" approach for more thorough analysis
3. Gathering comprehensive context across the entire codebase

## Implementation Plan

### 1. Enhanced Context Gathering Phase

**File: `src/ai/adapters/claude-code-enhanced.ts`**

```typescript
interface DeepContextOptions {
  enableUltraThink: boolean;
  maxExplorationTime: number; // milliseconds
  contextDepth: 'shallow' | 'medium' | 'deep' | 'ultra';
  includeArchitectureAnalysis: boolean;
  includeTestPatterns: boolean;
  includeStyleGuide: boolean;
}

class EnhancedClaudeCodeAdapter extends ClaudeCodeAdapter {
  async gatherDeepContext(
    issueContext: IssueContext,
    options: DeepContextOptions
  ): Promise<RepositoryContext> {
    const contextPrompt = `
    ${options.enableUltraThink ? 'ultrathink' : ''}
    
    I need you to perform a comprehensive analysis of this repository to understand:
    
    1. Overall architecture and design patterns
    2. Code conventions and style guides
    3. Testing patterns and frameworks used
    4. Dependencies and their usage patterns
    5. Related code that might be affected by fixing this issue:
       ${issueContext.title}
       ${issueContext.body}
    
    Explore the repository comprehensively, looking at:
    - Configuration files (package.json, tsconfig.json, etc.)
    - README and documentation
    - Test structures and patterns
    - Similar implementations in the codebase
    - API patterns and interfaces
    - Error handling patterns
    - Logging conventions
    
    Take your time to understand the codebase deeply before proceeding.
    `;
    
    // Execute Claude Code with extended context gathering
    const contextResult = await this.executeClaudeCode(
      contextPrompt,
      { timeout: options.maxExplorationTime }
    );
    
    return this.parseContextResult(contextResult);
  }
}
```

### 2. Enhanced Solution Generation

```typescript
async generateEnhancedSolution(
  issueContext: IssueContext,
  analysis: IssueAnalysis,
  enhancedPrompt?: string
): Promise<PullRequestSolution> {
  // First, gather deep context
  const deepContext = await this.gatherDeepContext(issueContext, {
    enableUltraThink: true,
    maxExplorationTime: 300000, // 5 minutes
    contextDepth: 'ultra',
    includeArchitectureAnalysis: true,
    includeTestPatterns: true,
    includeStyleGuide: true
  });
  
  // Build solution prompt with deep context
  const solutionPrompt = `
  ultrathink
  
  Using the comprehensive repository context I've gathered, generate a solution for:
  
  Issue: ${issueContext.title}
  Description: ${issueContext.body}
  
  Repository Context:
  - Architecture: ${deepContext.architecture}
  - Conventions: ${deepContext.codeConventions}
  - Testing Patterns: ${deepContext.testingPatterns}
  - Related Code: ${deepContext.relatedComponents}
  
  Generate a solution that:
  1. Follows existing code patterns and conventions exactly
  2. Includes comprehensive tests matching the project's test style
  3. Handles edge cases observed in similar code
  4. Maintains architectural consistency
  5. Updates documentation if needed
  
  Take time to think through all implications and create a production-ready solution.
  `;
  
  const solution = await this.executeClaudeCode(solutionPrompt);
  return this.parseSolution(solution);
}
```

### 3. Integration with RSOLV Workflow

**File: `src/ai/processor.ts`**

```typescript
export async function processIssueWithEnhancedContext(
  issueContext: IssueContext,
  config: AIConfig
): Promise<ProcessingResult> {
  const adapter = new EnhancedClaudeCodeAdapter(config, issueContext.repository.path);
  
  // Phase 1: Initial analysis with standard Claude Code
  const analysis = await adapter.analyzeIssue(issueContext);
  
  // Phase 2: Deep context gathering with ultrathink
  logger.info('Starting deep context analysis with ultrathink...');
  const startTime = Date.now();
  
  const deepContext = await adapter.gatherDeepContext(issueContext, {
    enableUltraThink: true,
    maxExplorationTime: config.contextGatheringTimeout || 300000,
    contextDepth: 'ultra',
    includeArchitectureAnalysis: true,
    includeTestPatterns: true,
    includeStyleGuide: true
  });
  
  const contextTime = Date.now() - startTime;
  logger.info(`Deep context gathering completed in ${contextTime}ms`);
  
  // Phase 3: Generate solution with full context
  const solution = await adapter.generateEnhancedSolution(
    issueContext,
    analysis,
    deepContext
  );
  
  return {
    analysis,
    deepContext,
    solution,
    metrics: {
      contextGatheringTime: contextTime,
      totalProcessingTime: Date.now() - startTime
    }
  };
}
```

### 4. Configuration Options

**Update `src/ai/types.ts`:**

```typescript
export interface ClaudeCodeConfig {
  // ... existing fields ...
  
  // Enhanced context options
  enableDeepContext?: boolean;
  enableUltraThink?: boolean;
  contextGatheringTimeout?: number;
  contextDepth?: 'shallow' | 'medium' | 'deep' | 'ultra';
  
  // Context analysis options
  analyzeArchitecture?: boolean;
  analyzeTestPatterns?: boolean;
  analyzeStyleGuide?: boolean;
  analyzeDependencies?: boolean;
  
  // Performance options
  maxParallelExplorations?: number;
  cacheContextResults?: boolean;
  contextCacheDuration?: number;
}
```

### 5. Usage in Action Configuration

```yaml
- name: Run RSOLV with Enhanced Context
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    RSOLV_AI_PROVIDER: 'claude-code'
    RSOLV_CLAUDE_CODE_CONFIG: |
      {
        "enableDeepContext": true,
        "enableUltraThink": true,
        "contextDepth": "ultra",
        "contextGatheringTimeout": 300000,
        "analyzeArchitecture": true,
        "analyzeTestPatterns": true
      }
```

## Benefits

1. **Better Code Quality**: Solutions follow existing patterns precisely
2. **Fewer Revisions**: Deep understanding reduces need for PR feedback
3. **Architectural Consistency**: Maintains project structure and patterns
4. **Comprehensive Testing**: Tests match existing test patterns
5. **Reduced Errors**: Better understanding of edge cases and dependencies

## Performance Considerations

1. **Caching**: Cache context results for similar issues
2. **Parallel Processing**: Explore multiple paths simultaneously
3. **Progressive Enhancement**: Start with basic solution while gathering context
4. **Timeout Handling**: Graceful fallback if context gathering takes too long

## Next Steps

1. Implement `EnhancedClaudeCodeAdapter` class
2. Add ultrathink keyword support to prompts
3. Create context caching mechanism
4. Add configuration options to action.yml
5. Update documentation with usage examples
6. Test with various repository sizes and complexities