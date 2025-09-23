# Two-Phase Conversation Approach for Claude Code SDK

## Problem Statement
Claude Code SDK successfully explores repositories and identifies vulnerabilities but often generates JSON solutions without actually editing files first. This is because our single prompt asks for both actions simultaneously.

## Solution: Two-Phase Conversation
Leverage the Claude Code SDK's multi-turn conversation capability (`maxTurns: 30`) to separate the file editing and JSON generation into distinct phases.

## Implementation Plan (RED-GREEN-REFACTOR)

### RED Phase: Define the Failure
1. **Current Behavior Test**
   - Test that single-phase approach fails (files not modified)
   - Document the current failure mode
   - Establish baseline metrics

2. **Expected Behavior Test**
   - Test that files should be modified in Phase 1
   - Test that JSON should be generated in Phase 2
   - Test that conversation context is maintained

### GREEN Phase: Make It Work
1. **Phase 1: File Editing**
   ```typescript
   // First prompt - focused only on editing
   const phase1Prompt = `
   You are a security expert. Your ONLY task right now is to:
   1. Find the vulnerability: ${issue.title}
   2. Use the Edit or MultiEdit tools to fix it
   3. Confirm the files were modified
   
   DO NOT provide any JSON or summary yet. Just edit the files.
   `;
   ```

2. **Phase 2: JSON Generation**
   ```typescript
   // Second prompt - after files are edited
   const phase2Prompt = `
   Great! Now that you've edited the files, please provide a JSON summary:
   
   \`\`\`json
   {
     "title": "Brief title for the PR",
     "description": "What was fixed and why",
     "files": [
       {
         "path": "path/to/file.js",
         "changes": "Complete content after your edits"
       }
     ],
     "tests": ["Test descriptions"]
   }
   \`\`\`
   `;
   ```

3. **Implementation Structure**
   ```typescript
   class GitBasedClaudeCodeAdapter {
     async generateSolutionWithTwoPhases(
       issueContext: IssueContext,
       analysis: IssueAnalysis
     ): Promise<GitSolutionResult> {
       // Phase 1: Edit files
       const phase1Result = await this.executePhaseOne(issueContext, analysis);
       
       if (!phase1Result.filesModified) {
         return { success: false, error: 'Phase 1 failed: No files modified' };
       }
       
       // Phase 2: Get JSON summary
       const phase2Result = await this.executePhaseTwo(phase1Result);
       
       return this.combineResults(phase1Result, phase2Result);
     }
     
     private async executePhaseOne(
       issueContext: IssueContext,
       analysis: IssueAnalysis
     ): Promise<Phase1Result> {
       // Send first prompt
       // Track modified files
       // Return result
     }
     
     private async executePhaseTwo(
       phase1Result: Phase1Result
     ): Promise<Phase2Result> {
       // Send follow-up prompt
       // Extract JSON solution
       // Return result
     }
   }
   ```

### REFACTOR Phase: Make It Right
1. **Clean Architecture**
   - Separate concerns clearly
   - Make phases independently testable
   - Add proper error handling

2. **Optimize Performance**
   - Reuse conversation context
   - Minimize token usage
   - Add timeout handling

3. **Improve Reliability**
   - Add retry logic for each phase
   - Validate phase transitions
   - Add comprehensive logging

## Technical Details

### Conversation Continuity
The Claude Code SDK maintains conversation state between messages:
```typescript
for await (const message of query({
  prompt: initialPrompt,
  options: { maxTurns: 30, ... }
})) {
  // Process messages
  // Can send follow-up prompts within same conversation
}
```

### Success Criteria
1. **Phase 1 Success**:
   - Files are actually modified (git diff shows changes)
   - No JSON is generated prematurely
   - Claude confirms edits were made

2. **Phase 2 Success**:
   - Valid JSON solution is provided
   - JSON references the actual files that were edited
   - Solution includes all required fields

3. **Overall Success**:
   - Both phases complete successfully
   - Git commit is created with changes
   - PR can be generated from the result

## Testing Strategy

### Unit Tests
1. Test Phase 1 independently
2. Test Phase 2 independently
3. Test phase transition logic
4. Test error handling

### Integration Tests
1. Test full two-phase flow
2. Test with real Claude Code SDK
3. Test with various vulnerability types
4. Test conversation timeout handling

### E2E Tests
1. Test in GitHub Action environment
2. Test PR creation from results
3. Test with real repositories

## Rollout Plan

### Version 2.2.0-beta
1. Implement two-phase approach
2. Add feature flag for gradual rollout
3. Test on staging environment

### Version 2.2.0
1. Enable by default
2. Remove single-phase code path
3. Update documentation

## Metrics to Track
- Phase 1 success rate
- Phase 2 success rate
- Overall success rate
- Time per phase
- Token usage per phase
- Files modified count

## Fallback Strategy
If two-phase approach fails:
1. Log detailed error information
2. Fall back to single-phase (current) approach
3. Alert monitoring system
4. Collect data for debugging

## Configuration
```yaml
claudeCodeConfig:
  useTwoPhaseApproach: true  # Feature flag
  phase1Timeout: 180000       # 3 minutes for editing
  phase2Timeout: 60000        # 1 minute for JSON
  maxRetries: 2               # Per phase
```

## Expected Outcomes
1. **Higher Success Rate**: 80%+ files actually modified (vs current ~0%)
2. **Better PR Quality**: Solutions based on actual edits, not theoretical
3. **Improved Reliability**: Clear separation of concerns
4. **Better Debugging**: Can identify which phase fails