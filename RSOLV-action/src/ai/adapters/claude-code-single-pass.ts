/**
 * Single-pass Claude Code adapter for optimized token usage
 * Combines context gathering and solution generation into one query
 */
import { ClaudeCodeAdapter } from './claude-code.js';
import { IssueContext } from '../../types/index.js';
import { IssueAnalysis, AIConfig } from '../types.js';
import { logger } from '../../utils/logger.js';
import { SolutionResult } from '../solution.js';

/**
 * Single-pass Claude Code adapter that combines context gathering and solution generation
 */
export class SinglePassClaudeCodeAdapter extends ClaudeCodeAdapter {
  /**
   * Generate solution with integrated context gathering
   * This method combines what was previously done in two phases:
   * 1. Deep context gathering (gatherDeepContext)
   * 2. Solution generation (generateSolution)
   */
  async generateSolutionWithContext(
    issueContext: IssueContext,
    analysis: IssueAnalysis,
    enhancedPrompt?: string,
    securityAnalysis?: any
  ): Promise<SolutionResult> {
    logger.info('Starting single-pass solution generation with integrated context');
    
    // Construct a comprehensive prompt that asks Claude to:
    // 1. Explore and understand the codebase
    // 2. Generate a solution based on that understanding
    const prompt = this.constructSinglePassPrompt(issueContext, analysis, securityAnalysis);
    
    if (enhancedPrompt) {
      // Append any additional instructions
      const fullPrompt = `${prompt}\n\n## Additional Instructions:\n${enhancedPrompt}`;
      return this.generateSolution(issueContext, analysis, fullPrompt);
    }
    
    return this.generateSolution(issueContext, analysis, prompt);
  }
  
  /**
   * Construct a prompt that combines context gathering and solution generation
   */
  private constructSinglePassPrompt(
    issueContext: IssueContext,
    analysis: IssueAnalysis,
    securityAnalysis?: any
  ): string {
    const basePrompt = this.constructPrompt(issueContext, analysis);
    
    // Add explicit instructions for single-pass processing
    const singlePassInstructions = `
## Single-Pass Processing Instructions

You need to both understand the codebase AND generate a solution in this single conversation.

### Phase 1: Quick Context Gathering (Limit to 5-10 tool calls)
1. Read the main files mentioned in the issue
2. Check the project structure and dependencies if needed
3. Look for related code patterns and conventions
4. Identify test frameworks and existing tests

### Phase 2: Solution Generation
Based on your understanding from Phase 1, immediately generate a solution.

**IMPORTANT**: 
- Do NOT spend excessive time exploring the codebase
- Focus on the specific issue and files mentioned
- Generate the solution as soon as you have enough context
- Aim to complete everything within 5-7 minutes total

### Expected Output Format
After your exploration, provide the solution in this exact JSON format:

\`\`\`json
{
  "summary": "Brief description of what you're fixing",
  "files": [
    {
      "path": "relative/path/to/file.js",
      "changes": "The complete updated file content"
    }
  ],
  "testingInstructions": [
    "How to verify the fix works"
  ],
  "breakingChanges": false,
  "additionalNotes": "Any important context"
}
\`\`\``;

    // Add security context if available
    let securityContext = '';
    if (securityAnalysis) {
      securityContext = `
## Security Analysis Context
${JSON.stringify(securityAnalysis, null, 2)}

Make sure your fix addresses all security concerns identified above.`;
    }

    return `${basePrompt}${singlePassInstructions}${securityContext}`;
  }
}